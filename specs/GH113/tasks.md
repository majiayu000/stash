# GH113 实施任务

## SP113-T1 — 估算数据模型去除虚假窗口语义

- Owner：`/root`
- Dependencies：无
- Files：`client/src/workbench/data.ts`、适配层单测
- Done when：
  - `WBProject`、`WBSession`、`WBStats` 只暴露技术规格中的 estimated 字段；
  - 合成公式有明确 provenance 注释，且不声称应用了 24h 窗口；
  - 单测验证 estimated shape 和公式，旧字段不存在。
- Verify：`bun run test -- data.test.ts`

## SP113-T2 — 所有 Workbench 合成指标入口标注 estimated

- Owner：`/root`
- Dependencies：`SP113-T1`
- Files：`client/src/workbench/shared.tsx`、`ConnectedFlow.tsx`、Concept A/B/C/D/E/F/G/I/J/K、Concept PRD 及相关测试 fixture
- Done when：
  - 所有 TypeScript 调用点完成字段重命名；
  - 用户可见合成数值都带 `estimated` 或 `est.`；
  - 未经计算证明的 `24h`、趋势和 hourly burn 文案被移除；
  - Concept H 的真实 analytics 与 Concept J 的 weekly usage 展示不变。
- Verify：`bun run typecheck`；对合成字段执行定向 `rg` 检查。

## SP113-T3 — Session 无 events 路径改为真实空态

- Owner：`/root`
- Dependencies：无
- Files：`client/src/workbench/concepts/ConceptG.tsx`、`ConceptG.test.tsx`
- Done when：
  - 空 events 渲染 `EmptyTranscript` 和 `empty-session-events` 测试标识；
  - DOM 不包含固定 auth 文件、demo tool call、diff 或失败测试；
  - 固定 50/11/39 composition 被移除；
  - 真实 events 和错误路径行为保持不变。
- Verify：`bun run test -- ConceptG.test.tsx`

## SP113-T4 — 组件语义与回归测试

- Owner：`/root`
- Dependencies：`SP113-T1`、`SP113-T2`、`SP113-T3`
- Files：focused component/data tests
- Done when：
  - Topbar、SessionRow 或等价公共入口有 estimated 标签断言；
  - Session 空态及 estimated metrics 有稳定定位断言；
  - 既有真实 event 配对测试继续通过；
  - 新增生产逻辑达到本仓库测试覆盖要求。
- Verify：focused Vitest suites；`bun run test`

## SP113-T5 — 完整门禁与交付

- Owner：`/root`
- Dependencies：`SP113-T4`
- Files：本 issue 分支全部改动
- Done when：
  - client test、typecheck、build 均在当前 session 通过；
  - implementation-against-spec 审查无未解决 blocker；
  - PR 关联并关闭 #113，独立 reviewer 与 CI/merge 门禁通过。
- Verify：`bun run test && bun run typecheck && bun run build`，随后执行 SpecRail PR gate。
