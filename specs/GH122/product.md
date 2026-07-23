# GH122 产品规格：有界 Burn 聚合

## Linked Issue

- Issue: [#122](https://github.com/majiayu000/stash/issues/122)
- 状态：`ready_to_spec`
- complexity: large

## 问题

Burn analytics 的公开请求会先扫描全部 session cache，再在 API 主进程逐会话读取 usage，并把窗口内所有 `UsageEvent` 完整物化后计算 totals、日桶、小时热力图、model mix 与 project leaderboard。

在真实 16,386 条 cache rows、约 6,393 条 30 日候选和约 50,000 个 usage events 下，该路径会超过请求超时，并曾把服务端 RSS 推至约 9.5 GB。现有 3,000 文件门禁主要覆盖文件发现与 Weekly 窗口筛选，没有覆盖持久 cache 的真实聚合形状。

## 目标

- Burn 在大历史下保持精确、及时并且内存有界。
- 文件扫描、cache usage 读取与事件聚合离开 API 主事件循环。
- 普通 session 列表扫描不解析没有被消费的 usage。
- 保留当前 Burn API、Claude/Codex usage 与费用计算语义。
- 所有损坏、Worker 崩溃和无法解析状态保持显式可见。

## 非目标

- 不通过增加 Bun idle timeout 或放宽性能断言解决问题。
- 不改变公开 `BurnSnapshot` schema。
- 不改变 Weekly 的 Codex timestamped delta 语义。
- 不引入常驻外部服务或新的用户数据 migration。
- 不在本 Issue 改变 UTC/本地时区产品语义。

## 产品不变量

1. **B-001** 对相同有效数据、model rates 和查询窗口，Burn 的 totals、cost、daily buckets、hourly heatmap、model mix、project leaderboard、session 去重与 share 必须与现有公开语义精确一致；rolling `days` 查询保留“包含 `ts >= start` 的事件而无额外上界”的语义，`totalsBetween()` 继续使用 `[start,end)`。
2. **B-002** 系统必须先取得所有候选的轻量 session metadata，再用 `lastActiveAt` 应用 rolling 下界；明确在窗口外的 session 不得读取或解析 `usage_json`。不得仅凭文件 `mtime` 排除可能包含窗口内事件的 session。
3. **B-003** 普通 full-session scan 只消费 session metadata 时不得解析 `usage_json`，cache API 必须把 session-only 与 usage 读取分离。
4. **B-004** Burn 聚合必须在专用 Worker 内逐 session 消费 usage，并只返回紧凑聚合；原始窗口级 `UsageEvent[]` 不得跨 Worker 边界，也不得在 API 主进程完整物化。
5. **B-005** 大规模 Burn 运行期间 `/health` 和其他轻量请求必须保持响应；实现不得用提高 server timeout 代替事件循环隔离。
6. **B-006** cache 中被读取的 session row 或 usage row 结构损坏时请求必须显式失败并包含可诊断来源，不得返回零值、部分值或陈旧值冒充成功；底层 Claude/Codex public parser 对坏 JSON 行的既有容错合同不在本 Issue 改变。
7. **B-007** 相同 Burn 窗口与 rates 的并发请求必须复用同一个 in-flight Worker 任务；一个请求失败或完成后不得留下永久占用的 singleflight 项。
8. **B-008** 调用方提供的自定义 model rates 必须在 Worker 聚合中精确生效；不得静默退回默认 rates。
9. **B-009** 空来源、空窗口和只有窗口外数据时必须返回结构完整的零值快照，所有请求仍正常终止。
10. **B-010** Worker postMessage 失败、Worker crash、不可读响应或 cache 数据库无法打开时，所有对应 pending 请求必须拒绝并清理，不能无限等待。
11. **B-011** 16,384+ cache rows、6,000+ 最近候选和 50,000+ usage events 下，warm 30 日 Burn 必须满足 1 秒预算；三次 warm Worker 在 compact result 返回且执行 GC 后的 JSC heap 不得严格单调增长，进程末次 RSS 相对基线增量不得超过 250 MiB。
12. **B-012** 现有 Agent Session 列表、详情、events、Weekly 3,000 文件性能与公开 `/api/analytics/burn?days=N` 合同必须保持兼容。

## 验收标准

- [ ] 真实规模 fixture 同时验证精确结果、warm ≤1,000 ms、并发 `/health` ≤250 ms。
- [ ] 三次连续 warm 请求记录 Worker post-GC JSC heap 与进程 RSS，验证 Worker heap 无严格单调增长且进程末次 RSS 相对基线增量 ≤250 MiB。
- [ ] 结构测试证明主线程 Burn 不调用 source/cache `getUsage`，Worker response 不含原始 usage event 列表。
- [ ] cache session-only 测试证明普通 scan 不读取或 `JSON.parse` `usage_json`。
- [ ] 并发相同查询只产生一个 Worker 请求；不同窗口或 rates 不错误共享。
- [ ] Worker crash、message error、post failure、坏 cache 与坏 usage 均显式拒绝。
- [ ] empty、窗口外、counter reset、custom rates、project 去重与半开时间边界都有确定性测试。
- [ ] 现有 Weekly 性能门禁、服务端测试、类型检查、客户端构建/E2E 与 `bun run verify:ci` 全部通过。

## Boundary checklist

| Boundary | Verdict |
| --- | --- |
| Empty / missing input | covered: B-009；缺省 `days` 和空数据返回完整 30 日零快照 |
| Error and failure paths | covered: B-006, B-010 |
| Authorization / permission | N/A：仅本机 loopback 内部 analytics，不引入新的授权状态 |
| Concurrency / race / ordering | covered: B-007, B-010 |
| Retry / repetition / idempotency | covered: B-007, B-011 |
| Illegal state transitions | N/A：无持久业务状态转换 |
| Compatibility / migration | covered: B-001, B-012；无 migration |
| Degradation / fallback | covered: B-006；禁止静默 partial/zero/stale 成功 |
| Evidence and audit integrity | covered: B-004, B-005, B-011；结构证据与真实规模证据同时必需 |
| Cancellation / interruption / partial completion | N/A：当前 API 没有 caller-cancellation 合同；有界共享 Worker 任务允许完成。Worker 自身中断与 pending 清理由 B-010 覆盖 |

## Open questions

无阻断性产品问题。实现可选择在现有 `SessionScanWorker` 协议中增加 Burn request；不得创建第二套重复 Worker。
