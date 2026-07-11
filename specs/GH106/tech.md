# GH106 技术规格：窗口感知扫描与精确 Weekly 聚合

## 当前链路与根因

`WeeklyReviewService.snapshotAsync()` 当前调用无参数 `AgentSourceAggregator.scanAsync({})`，使 Claude 与 Codex scanner 遍历并解析全部历史。冷缓存时，scanner 对每个文件同时调用 session parser 与 usage parser；两个 parser 都整文件读取。

#110 在 `BurnService.collectEvents()` 中按 `lastActiveAt` 跳过窗口外 usage，但该判断发生在 scanner 已完成全历史冷索引之后，因此没有解决冷启动。另一个正确性缺口是 Weekly 连续两次调用 `BurnService.snapshot({ days: 7 })`；两个调用都以当前 clock 为终点，导致当前周与上周 token/cost 实际使用同一窗口。

## 设计

### 1. 窗口感知的 analytics 专用扫描

在内部 `ScanOptions` 与 `AggregateOptions` 增加 `modifiedSinceMs?: number`，并为 source/aggregator 增加只供 analytics 使用的 activity scan：

- Claude/Codex scanner 仍发现并 fingerprint 所有 JSONL，不使用数量上限；
- 当设置 `modifiedSinceMs` 时，先排除 `mtimeMs < modifiedSinceMs` 的文件；对 mtime 候选继续读取 JSONL 尾部的真实最后活动时间，不能把最近恢复/触碰的旧历史误当作窗口内活动；
- Claude 候选若最后活动早于窗口，只读取尾部；真实活跃候选以单次全文件读取提取全部 usage；
- Codex 候选从尾部反向读取最后活动、窗口内累计 `token_count`、一个窗口前 baseline 及所需 model context，不读取更早的大型 tool output；
- 反向 reader 首块为 1 KiB；当前块没有换行时指数扩大下一块、命中记录边界后重置，使常见小末行保持低 I/O，同时让超长末行的 carry copy 保持线性；
- activity scan 结果按 `sourcePath + fingerprint + modifiedSinceMs` 在进程内复用，warm Weekly 无需再次解析；窗口 usage 随 scan result 传入 Weekly，不能污染普通 Session/Burn 的完整 usage 读取；
- 普通持久化 session cache 由容错型 Session/Burn parser 生成，不携带严格 analytics-validation 证明，因此 Claude/Codex activity scan 均不复用其 rows；Codex 持久化 cache 继续保存公开 Burn 所需的“最终累计 sample”语义，Weekly 的 timestamped delta 只存在于 window-scoped activity result 与进程内 cache；
- `mtime` 只用于保守候选筛选，聚合结果仍完全使用 JSONL 的 `lastActiveAt` 和 usage `ts`；
- singleflight key 包含 `modifiedSinceMs`，不同窗口不能错误共享扫描结果；
- cache 统计增加或保留足够证据，能分别表示发现文件数与实际候选数。

该筛选依赖产品规格声明的 append-only + timestamp 单调不减来源不变量：包含窗口内追加记录的文件，其最后修改时间不会早于该记录，尾部最后完整记录的有效 timestamp 也是该 session 的最后活动。长时间运行但本周仍追加的 session 会被纳入；窗口外旧文件被安全排除。活跃候选在 full/relevant parse 中校验 timestamp 顺序，违反合同即显式报错；若要求对 3,000 个尾部已旧的大文件逐个全量证明单调性，只能牺牲冷启动门槛或引入本 Issue 非目标的持久索引。

### 2. Weekly 精确时间窗口

`WeeklyReviewService.snapshotAsync()` 先解析目标 ISO 周，使用 `prevStartMs` 作为 `modifiedSinceMs` 扫描边界。扫描结果不设 `limitPerSource`。

`BurnService` 增加内部可复用的精确范围 totals 方法，接收 `[startMs, endMs)` 与同一 `AggregateResult`：

- 当前周 totals：`[startMs, endMs)`；
- 上周 totals：`[prevStartMs, startMs)`；
- usage 事件必须同时满足 `ts >= start` 且 `ts < end`；
- Codex 的累计计数转换为相邻 sample 的 timestamped delta；窗口前最后一个 sample 只作为 baseline，不计入窗口 totals；计数重置时以重置后的累计值作为新 delta；
- focus hour 按 usage `ts` 过滤；跨周 session 即使 `lastActiveAt` 晚于目标周结束，也必须保留目标周 usage；
- 公开 `/api/analytics/burn?days=N` 行为保持不变。

Session 周计数、focus hour 与 burn totals 共享同一无截断 scan result。已有 SQLite session cache 继续负责候选文件的热复用。

### 3. 响应性边界

本 Issue 不引入后台 worker。主要响应性保证来自 mtime + JSONL 尾部两级筛选、Codex tail delta 解析和 Claude 单遍 usage 解析。候选解析错误汇总后由 Weekly 显式抛出，禁止部分结果。3k 候选重基准同时验证健康检查；没有基准证据时不扩大为常驻索引服务。

Analytics parser 对完整但损坏的 relevant JSONL 行显式报错；仅容忍 EOF 处无换行、以 JSON 容器开头且尚无闭合分隔符的明确未完成追加片段。遇到该片段时不得使用更早 timestamp 走旧文件 early-return。

## 受影响文件

- `server/src/adapters/source.ts`
- `server/src/adapters/aggregator.ts` 及测试
- `server/src/adapters/claude/scanner.ts` 及测试
- `server/src/adapters/codex/scanner.ts` 及测试
- Claude/Codex parser、JSONL tail helper 与 analytics session cache helper
- `server/src/domain/analytics/burn.ts` 及测试
- `server/src/domain/analytics/weekly.ts` 及测试
- 3k 独立 inode 的共享性能 fixture 与专用 Concept J 性能 E2E runner
- Weekly 冷启动 benchmark / E2E 文件（按验证需要）

不修改用户数据 schema、公开 shared 类型或 Concept J 展示合同。

## 测试策略

1. Scanner/reader 单测：旧文件 mtime 早于窗口时不进入 sessions/indexed；mtime 最近但内容已旧的候选只读尾部；512 KiB 最后记录保持线性；无 `modifiedSinceMs` 时原行为不变。
2. Aggregator 单测：singleflight key 区分不同 `modifiedSinceMs`，并把选项传给 source。
3. Weekly/Codex 单测：记录 scan options，断言边界为目标周前一周开始；使用跨周累计 token sample、当前周、上周及边界外 usage 验证 exact delta/totals/focus hour。
4. Burn 单测：范围 totals 使用左闭右开边界，且不改变 `days` snapshot。
5. 冷启动基准：fresh DB + 3,000 个独立 inode、mtime 均为候选但大部分内容已在窗口外的 512–600 KiB 有效历史，报告冷/热 API、候选统计和健康检查；Playwright 使用同一类 fresh root 验证 `/c/j` 标题时间、精确 totals 与真实点击交互。
6. 错误合同：候选无有效 timestamp、完整 JSONL 损坏、usage 缺 timestamp 或活跃文件 timestamp 回退时 Weekly 返回 500；仅明确 EOF partial 可被容忍；非法/不存在的 ISO week 在 HTTP 边界返回 400。
7. 门禁：focused server tests、server typecheck、全量 server test、client typecheck/build，以及仓库 `verify:ci`。

## 风险与回滚

- 风险：外部工具若回写历史 JSONL 却强制保留旧 `mtime`，或追加 timestamp 早于前一记录，可能违反来源合同。该情形不在本 Issue 支持范围；正常 Claude/Codex 追加会更新 `mtime` 并保持 timestamp 顺序。
- 风险：查询很早的历史周会产生更大的候选集。结果保持精确，性能只对当前/最近周设硬门槛。
- 回滚：本变更没有数据 migration；回滚 scanner option、activity-only Codex delta parser 与 Weekly range 调用即可恢复原路径，现有 Session/Burn cache 无需重建。
