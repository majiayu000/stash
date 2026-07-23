# GH122 实施任务

## SP122-T1 — Worker foundation 与 cache session-only 合同

- Owner：backend implementation lane
- Dependencies：规格 PR 已合并
- Covers: B-003, B-007, B-010, B-012
- Files：`server/src/adapters/aggregator.ts`、`session-cache.ts`、`session-scan-worker*.ts`、`claude/scanner.ts`、`codex/scanner.ts`、`app-factory.ts` 及对应测试
- Done when：
  - 现有 full/activity scan 可通过一个 `SessionScanWorker` executor 执行；
  - cache metadata lookup 不读取 `usage_json`；
  - Worker lifecycle 与 same-key singleflight 的成功/失败路径完整测试；
  - 不包含审计分支中的无关 ProjectDetail 改动。
- Verify：`cd server && bun test src/adapters/aggregator.test.ts src/adapters/session-cache.test.ts src/adapters/session-scan-worker.test.ts src/adapters/claude/scanner.test.ts src/adapters/codex/scanner.test.ts`

## SP122-T2 — Worker 内 Burn accumulator

- Owner：backend implementation lane
- Dependencies：SP122-T1
- Covers: B-001, B-002, B-004, B-006, B-008, B-009
- Files：`server/src/domain/analytics/burn.ts`、Worker protocol/entry 与测试
- Done when：
  - Burn request 携带 `startMs`、可选 `beforeMs` 与 rates；rolling 路径保持无上界，exact range 保持半开上界；
  - 全量 metadata scan 后按 `lastActiveAt` 筛选 usage，不用 mtime 改写公开语义；
  - usage 逐 session 聚合，compact response 不含 raw events；
  - 主线程只补 share 与 project display name；
  - exact totals、custom rates、empty、future event、半开边界、坏 cache session/usage 全部有确定性测试。
- Verify：`cd server && bun test src/domain/analytics/burn.test.ts src/adapters/session-scan-worker.test.ts`

## SP122-T3 — 真实规模性能与内存门禁

- Owner：verification owner
- Dependencies：SP122-T2
- Covers: B-005, B-011, B-012
- Files：`server/src/__tests__/integration/burn-performance.int.test.ts`、Weekly performance fixture
- Done when：
  - 16,384+ cache rows、6,000+ candidates、50,000+ events 的 checksum 精确；
  - warm Burn ≤1,000 ms，concurrent health ≤250 ms；
  - 三次 warm Worker post-GC JSC heap 每次 ≤32 MiB，process RSS final delta ≤250 MiB；
  - 结构断言同时证明无 raw event response、无主线程 usage parse；
  - Weekly 原性能预算不变。
- Verify：运行新增 Burn benchmark 与 `cd server && bun test src/__tests__/integration/weekly-performance.int.test.ts`

## SP122-T4 — 完整验证、规格对照与交付

- Owner：coordinator / merge reviewer
- Dependencies：SP122-T1、SP122-T2、SP122-T3
- Covers: B-001, B-002, B-003, B-004, B-005, B-006, B-007, B-008, B-009, B-010, B-011, B-012
- Files：Issue #122 实现 PR 的全部改动
- Done when：
  - product invariant 与 task coverage 集合均为 B-001..B-012；
  - focused tests、typecheck、full verify、独立 review、review threads、CI 与 PR gate 均有当前 head 证据；
  - final PR 使用 `Fixes #122`，partial/spec PR 只使用 `Refs #122`。
- Verify：`bun run verify:ci`

## Coverage audit

- Product IDs：B-001, B-002, B-003, B-004, B-005, B-006, B-007, B-008, B-009, B-010, B-011, B-012
- Task union：B-001, B-002, B-003, B-004, B-005, B-006, B-007, B-008, B-009, B-010, B-011, B-012
- Missing：none
