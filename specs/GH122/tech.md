# GH122 技术规格：Worker 内流式 Burn 聚合

## Linked Issue

- Issue: [#122](https://github.com/majiayu000/stash/issues/122)
- Product spec: `specs/GH122/product.md`
- PR tier: `heavy`

<!-- specrail-planned-changes
{"issue":122,"complete":true,"paths":["specs/GH122/product.md","specs/GH122/tech.md","specs/GH122/tasks.md","server/src/adapters/aggregator.ts","server/src/adapters/aggregator.test.ts","server/src/adapters/session-cache.ts","server/src/adapters/session-cache.test.ts","server/src/adapters/session-scan-worker.ts","server/src/adapters/session-scan-worker-entry.ts","server/src/adapters/session-scan-worker.test.ts","server/src/adapters/claude/scanner.ts","server/src/adapters/claude/scanner.test.ts","server/src/adapters/codex/scanner.ts","server/src/adapters/codex/scanner.test.ts","server/src/domain/analytics/burn.ts","server/src/domain/analytics/burn.test.ts","server/src/web/app-factory.ts","server/src/__tests__/integration/burn-performance.int.test.ts","server/src/__tests__/integration/weekly-performance.int.test.ts","docs/PRODUCTION_READINESS.md"],"spec_refs":["specs/GH122/product.md#产品不变量","specs/GH122/product.md#验收标准","specs/GH122/tasks.md"]}
-->

## Codebase context

| Anchor | Current behavior |
| --- | --- |
| `server/src/domain/analytics/burn.ts:55` | `snapshotAsync()` 使用无窗口 `scanAsync({})`，之后在主线程计算完整快照 |
| `server/src/domain/analytics/burn.ts:77` | `collectEvents()` 把窗口内事件复制到一个完整数组 |
| `server/src/adapters/aggregator.ts:83` | 当前 async scan 仅用主线程 microtask 包装同步 scan；现有审计分支已证明可接入一个 Worker executor |
| `server/src/adapters/aggregator.ts:126` | `getUsageForScan()` 在 scan result 无 usage 时同步回退到 source `getUsage()` |
| `server/src/adapters/session-cache.ts:20` | `getFresh()` 同时 select/parse `session_json` 与 `usage_json`，即使 caller 只消费 session |
| `server/src/web/app-factory.ts:147` | aggregator 在 app factory 中构建，是注入 scan executor 和 Worker config 的边界 |
| `server/src/__tests__/integration/weekly-performance.int.test.ts` | 已有 3,000 文件、health 与窗口精确性门禁，但没有真实 cache-shape Burn benchmark |

## 设计

### 1. 复用并扩展现有 SessionScanWorker

以审计分支 `14a54fc` 已验证的 `SessionScanWorker` 为基础，将 Worker protocol 建模为可辨识 request/response：

- `scan` request：保留 full/activity session scan；
- `burn` request：携带 `startMs`、可选 `beforeMs`、`days` 与完整 model rates；rolling `days` 的 `beforeMs` 为空，精确范围使用 `[startMs,beforeMs)`；
- 每个 request 使用唯一 id；response 只能是对应的 compact result 或 error；
- singleflight key 包含 request kind、窗口和 rates fingerprint；
- Worker crash、`onmessageerror`、post failure 时拒绝并清空全部 pending。

不创建第二个 Worker，也不让 `BurnService` 直接管理 Worker 生命周期。`AgentSourceAggregator` 暴露内部 `aggregateBurnAsync()`，由已注入的 executor 实现；没有 executor 的单元测试路径使用同一个纯聚合器同步执行。

### 2. 拆分 cache 读取合同

`AgentSessionCache` 增加 session-only fresh lookup：

- `getFreshSession()` 只 select/parse `session_json` 与必要 fingerprint/index metadata；
- `getUsage()` 继续按 source path 单独读取并严格验证 `usage_json`；
- scanner 的普通 metadata 路径使用 `getFreshSession()`；
- 需要同时写入 session/usage 的 changed-file 索引逻辑保持现状；
- 旧 `getFresh()` 若不再有 caller 则删除，避免并存两个含糊 API。

损坏的 session 或 usage 仍 invalidate 对应 row 并显式抛错。不得因为 session metadata 可读就把损坏 usage 当作空数组。

### 3. Worker 内有界聚合

Burn request 首先执行无 `modifiedSinceMs` 的 metadata-only scan，发现全部文件并通过 `getFreshSession()` 或 changed-file parser 得到轻量 session metadata。然后以 session `lastActiveAt >= startMs` 筛选 usage 候选。这样保留当前 Burn 语义：被恢复、复制或 mtime 异常的文件不会仅因 mtime 较旧而丢失。

Worker 对每个候选 session：

1. 读取一个 session 的 usage；
2. 验证并过滤 `ts >= startMs`，并只在 `beforeMs` 存在时应用 `ts < beforeMs`；
3. 立即更新 totals、daily、hourly、model 与 project accumulators；
4. 用 source-path set 完成全局/project session 去重；
5. 丢弃本 session 的 usage array，再处理下一条。

response 只包含内部 `BurnAggregate`：

- totals；
- daily token/cost buckets；
- 7×24 token grid；
- `{model,tokens,cost}`；
- `{projectId,tokens,cost,sessions}`；
- cache/scan telemetry。

share 与 project display name 在主线程根据 compact totals 和 `AreaService` 补齐。Worker 计算费用时使用 request 中传入的 rates；rates 必须是可序列化闭集数据。rolling Burn 的 daily buckets 仍只有 `days` 个，因此未来事件保持现有行为：会进入 totals/model/project/hourly，但不会进入超出数组范围的 daily bucket；测试固定这一兼容边界。

### 4. 兼容同步测试路径

提取一个不保留跨 session event 集合的纯 accumulator。生产 async path 和无 Worker 的单元测试 path 共用它，防止出现两套 Burn 计算语义。现有 `snapshot()`/`totalsBetween()` 继续服务 Weekly 的 window-scoped usage result；公开 Burn route 只调用新 async compact path。

### 5. 真实规模与结构门禁

新增独立 Burn integration benchmark：

- fresh SQLite，至少 16,384 cache rows；
- 至少 6,000 rows 落入 30 日候选；
- 至少 50,000 usage events，包含多模型、多 project、unlinked、边界事件；
- 先 warm cache，再测三次 warm 请求；
- 同时发 `/health`；
- 记录 elapsed、Worker post-GC JSC heap series、进程 RSS baseline/series/final delta 与 result checksum。

内存门禁在干净 Bun 子进程运行。Worker 的 `runBurnAggregation()` 返回 compact result 后先执行 GC，再通过官方 `bun:jsc` `heapSize()` 记录 live JSC heap。三次 warm Worker heap 每次必须 ≤32 MiB；进程 RSS 保留完整 series 作为诊断，并继续约束末次相对基线增量 ≤250 MiB。结构断言同时证明 response 无 raw events、主线程无 `getUsage` 和 full scan 无 usage parse。

干净子进程重复实验显示：Worker post-GC heap 会因 Bun/JSC 的回收时机在约 4 MiB 与 22 MiB 两个状态间切换，稳定状态下也可能出现几十字节至数 KiB 的运行时记账增长；进程 RSS 同时会因 mimalloc page commitment 偶发增加约 1–4 MiB。三点严格单调性既会把微小运行时记账误判为泄漏，也会因一次回收掩盖真实的高水位。门禁因此直接约束每次 Worker live heap ≤32 MiB，并保留 process RSS 最终增量 ≤250 MiB，分别覆盖 JSC 对象保留和进程总内存边界。

## Product-to-test mapping

| Behavior invariant | Implementation area | Verification |
| --- | --- | --- |
| B-001 | shared accumulator + `BurnService` compact finalize | `bun test server/src/domain/analytics/burn.test.ts` 精确 totals/buckets/share、rolling future event 与 exact range half-open boundary |
| B-002 | metadata-only full scan + `lastActiveAt` prefilter + per-session usage loop | fixture：旧 mtime 但窗口内 metadata 仍计入；窗口外 usage getter 调用数为 0 |
| B-003 | `AgentSessionCache.getFreshSession()` + scanners | cache/scanner test：损坏 `usage_json` 不影响 metadata-only lookup，且 usage parse spy 为 0 |
| B-004 | Worker request/response schema + accumulator | Worker test 断言 response JSON 不含 raw events；main-thread `getUsage` spy 为 0 |
| B-005 | production Worker wiring | Burn benchmark 并发 `/health` ≤250 ms；检查 server timeout 未改 |
| B-006 | cache session/usage validation + Worker error response | cache session corruption/invalid cached usage integration test 返回显式 5xx；既有 tolerant parser test 保持不变 |
| B-007 | aggregator/worker singleflight | concurrent same-key test=1 request；不同 window/rates=不同 request |
| B-008 | Worker rates payload | custom rates deterministic cost test |
| B-009 | accumulator initialization | empty/missing/window-outside unit tests |
| B-010 | Worker pending lifecycle | post failure/crash/message error/unopenable DB tests |
| B-011 | real-scale benchmark | 16k/6k/50k warm latency + Worker post-GC heap ceiling + process RSS final-delta assertions |
| B-012 | existing routes and Weekly | `bun run verify:ci` 与 Weekly performance integration unchanged |

## 风险

- **Worker structured clone**：Map/Set 不作为 response 合同，统一转换为普通数组/对象。
- **allocator page commitment**：mimalloc 的 process RSS page commitment 不等同于 Worker live heap；直接约束连续 Worker post-GC JSC heap 的绝对上限，process RSS series 用于诊断并以最终 delta 约束总边界。
- **rates 漂移**：rates 纳入 request 和 singleflight key，禁止 Worker 使用隐式默认值覆盖 caller。
- **SQLite 并发**：Worker 使用独立只读/读写连接并沿用 WAL；不共享 `Database` 对象。
- **基础提交依赖**：实现 PR 必须包含或基于审计分支的 Worker foundation，但不得混入无关 ProjectDetail 改动。

## 回滚

无 schema migration。回滚 production wiring 与 Worker Burn request 后可恢复旧 async 路径；cache rows 与公开 API 数据无需迁移。若回滚，必须同时恢复对应 benchmark 预期，不能只删除门禁。
