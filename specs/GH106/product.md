# GH106 产品规格：Weekly Review 冷启动与精确周统计

## 问题

Concept J（`/c/j`）在冷缓存和大量 Claude/Codex 历史下会长时间停留在加载态。最新 `main` 的隔离复验中，3,000 个约 586 KiB 的旧 Claude 历史使 `/api/analytics/weekly` 冷请求耗时 7.3465 秒，页面到周报标题可交互耗时 8.4979 秒；同一数据热请求为 0.1178 秒。

#110 只减少扫描完成后的部分 usage 读取，没有避免冷缓存对窗口外历史执行 summary 与 usage 全文件解析，也没有证明原 Issue 的 `<3s` 目标。

## 目标

- Weekly Review 在大量旧历史和空缓存下快速显示完整、可交互的精确周报。
- 当前周与上一个 ISO 周的 session、token、cost 和 focus-hour 统计使用各自真实时间窗口，不能截断或复用错误窗口。
- 冷扫描不能长时间阻塞健康检查及其他轻量请求。
- 保留按任意合法 `YYYY-Www` 周查询的行为和热缓存性能。

## 产品不变量

1. Weekly Review 的当前周与上周统计必须覆盖两个完整 ISO 周窗口 `[prevStart, start)` 与 `[start, end)`，边界为左闭右开。
2. 支持的 Claude/Codex JSONL 记录为 append-only，文件 `mtime` 随最后追加
   更新。GH123 已取代本规格最初的 timestamp 单调假设：合法 timestamp 可以
   回退；mtime 候选必须完整严格解析，并按最大 timestamp 和逐事件 timestamp
   精确聚合，不得按数量或物理 tail 截断。
3. 候选文件进入聚合后，session 数、usage、token、cost 与 focus hour 必须按 JSONL 中的真实时间戳计算，不能用 `mtime` 代替业务时间戳。
4. 查询历史周时仍返回完整结果；较早周可能需要扫描更多候选文件，但不得为满足性能目标静默返回部分统计。
5. 索引或解析失败必须沿用现有显式错误路径，不能显示零值或旧数据冒充成功结果。
6. 优化不得改变 `/api/analytics/burn` 的公开查询合同，也不得降低 Agent Session 列表、详情和 events 的完整性。
7. Codex `token_count` 是累计计数；跨周 session 必须用相邻累计值的增量归属到各自事件时间，不能把最终累计值全部归到最后一周。

## 验收标准

- 在空缓存、3,000 个 512–600 KiB 的有效旧历史并混入少量当前周/上周历史的基准中：
  - `/api/analytics/weekly` 冷请求不超过 2 秒；
  - `/c/j` 周报标题不超过 3 秒可见且可交互；
  - 同一数据热请求不超过 250 毫秒。
- 冷 Weekly 请求进行期间，`/health` 响应不超过 250 毫秒；测试环境不能稳定制造并发时，至少以确定性测试证明窗口外大文件不会进入解析路径。
- 自动化测试证明当前周与上周 token/cost 使用不同且正确的时间窗口，并覆盖周边界事件。
- 自动化测试证明窗口外旧历史不会被解析，窗口内、跨周长会话和最近修改的候选仍被纳入。
- 任一候选无法解析时，Weekly API 返回显式错误，不得以 HTTP 200 返回部分或零统计。
- 基准输出同时报告 discovered/candidate/indexed/reused 或等价证据，能够区分“快速筛选”与“静默截断”。

## 非目标

- 本 Issue 当时不建设常驻后台索引服务、worker 队列或新的进程间协议；
  后续 Worker 迁移由 GH122 完成。
- 不重新设计 Claude/Codex JSONL 格式，也不支持手工篡改 `mtime`、非
  append-only 或时间戳伪造的数据源；合法 timestamp 非单调已由 GH123 支持。
- 不改变 Concept J 的视觉布局、周报动作或导出格式。
- 不优化与当前周/上周统计无关的 Session events 详情读取。
