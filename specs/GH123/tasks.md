# GH123 实施任务

## SP123-T1 — 失败契约与乱序回归

- Covers：B-001、B-002、B-003、B-006、B-007、B-008、B-009
- Files：Claude/Codex scanner tests
- Done when：
  - old-tail fixture 能击穿旧 shortcut；
  - 非单调来源不再期望报错；
  - malformed、invalid、missing 和 trailing partial 均精确断言。

## SP123-T2 — Claude 最大活跃时间与逐事件归属

- Covers：B-001、B-002、B-003、B-006、B-007、B-008、B-009
- Files：`server/src/adapters/claude/parser.ts`
- Done when：
  - 完整候选单遍严格解析；
  - `lastActiveAt` 为最大 timestamp；
  - usage timestamp 不被改写。

## SP123-T3 — Codex 物理顺序累计差值

- Covers：B-001、B-002、B-004、B-005、B-006、B-007、B-008、B-009
- Files：`server/src/adapters/codex/parser.ts`
- Done when：
  - 全部完整记录被验证；
  - token/model 记录恢复物理顺序后计算 delta；
  - reset、model 与 sample timestamp 合同保持。

## SP123-T4 — HTTP、性能与兼容门禁

- Covers：B-003、B-004、B-005、B-010、B-011、B-012
- Files：`server/src/__tests__/integration/weekly-performance.int.test.ts`
- Done when：
  - mixed-provider 非单调 Weekly 返回精确 totals；
  - cold/warm cache 结果一致；
  - 3k cold/warm/health 常量和断言原样通过；
  - public Burn 与全库回归通过。

## SP123-T5 — 文档与交付

- Covers：B-001..B-012
- Files：GH123 specs、GH106 supersession note、canonical tracker
- Done when：
  - 旧的 timestamp 单调来源假设被明确标记为 GH123 取代；
  - tracker 不再把已修复的乱序统计列为开放缺口；
  - typecheck、tests、build、E2E、`git diff --check` 与 CI 均为 fresh green。

## Coverage audit

- Product IDs：B-001..B-012
- Task coverage union：B-001..B-012
- Missing：none
