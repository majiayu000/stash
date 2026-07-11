# GH3 实施任务

## SP3-T1 — 共享异步错误合同与 Host

- Owner：`/root/dead_controls_audit`
- Dependencies：无
- Files：`client/src/workbench/reportAsyncError.ts`、`client/src/workbench/AsyncErrorHost.tsx`、`client/src/workbench/Workbench.tsx`
- Done when：
  - `stash:async-error` 包含单调 `id`、scope、message 与可选 retry；
  - Host 按 scope 去重、最多三条，并支持 Dismiss；
  - 三条长错误受 max-height 约束并可纵向滚动；
  - 安全 Retry 防重复，成功只移除原 `id`，reject 不形成未处理 rejection；
  - Host 在 Workbench 中挂载且不依赖新包。
- Verify：`bun run test -- AsyncErrorHost.test.tsx`

## SP3-T2 — Concept A/N/O 显式失败处理

- Owner：`/root/dead_controls_audit`
- Dependencies：`SP3-T1`
- Files：`ConceptA.tsx`、`ConceptN.tsx`、`ConceptO.tsx`
- Done when：
  - A burn/capture、N projects/budgets、O Todo/Prompt/Runs/Skills/Bindings/Close/Copy 失败均可见；
  - A capture 失败保留文本并恢复可提交状态；
  - A capture 的非幂等创建失败不提供自动 Retry，只允许用户手动重新提交；
  - A capture 的迟到 resolve/reject 在卸载后不派发错误、不 reload、不设置组件状态；
  - N effects 不泄漏 rejected Promise；
  - Notification permission rejection 保留至 Concept N 调用层，由 Host 显示并支持用户触发的安全 Retry；
  - permission 状态只通过 `getReminderPermission()` 读取，unsupported 环境不直接访问 `Notification.permission`；
  - 所有安全读取或幂等操作提供 Retry；
  - 不修改任何 dead control 或 Dispatcher 上下文语义。
- Verify：`bun run test -- async-error-surfaces.test.tsx`

## SP3-T3 — Concept L 清理用户可见 silent catches

- Owner：`/root/dead_controls_audit`
- Dependencies：`SP3-T1`
- Files：`client/src/workbench/concepts/ConceptL.tsx`
- Done when：
  - Journal、Subtasks、Linked Sessions 与详情辅助读取失败进入共享 Host；
  - subtask 显式状态更新可安全重试；
  - delete/unlink 结果不确定时 Retry 重新拉取真相；
  - 用户可见路径不再存在 ignore/swallow catch。
- Verify：定向 `rg -n "catch" client/src/workbench/concepts/ConceptL.tsx` 人工核对所有 catch 均有可见处理。

## SP3-T4 — Forced-failure 回归测试

- Owner：`/root/dead_controls_audit`
- Dependencies：`SP3-T1`、`SP3-T2`、`SP3-T3`
- Files：`AsyncErrorHost.test.tsx`、`async-error-surfaces.test.tsx`、`async-error-secondary-surfaces.test.tsx`
- Done when：
  - Host 的去重、容量、Dismiss、Retry race 均有测试；
  - A burn/capture、N budgets、O compose forced failure 均有可见错误断言；
  - Inbox/Today reload、Reminder polling 与 Concept K 代表性 mutation 均有 forced-failure 断言；
  - notification permission helper 保留 rejection，Concept N caller 测试证明错误可见且 reattempt 成功；
  - A delayed capture rejection 在卸载后不泄漏到保留的 Host；
  - 三条长 alert 的错误栈具备限高滚动样式；
  - Retry 至少证明一次真实重请求与成功恢复；
  - 测试没有未处理 rejection 或 act warning。
- Verify：focused Vitest suites。

## SP3-T5 — Review round 1：补齐广义静默路径

- Owner：`/root/dead_controls_audit`
- Dependencies：`SP3-T1`
- Files：`InboxTriage.tsx`、`TodayTriage.tsx`、`ReminderTicker.tsx`、`conceptK.knowledge.tsx`
- Done when：
  - Inbox/Today reload 与 Reminder polling 失败可见，安全读取可 Retry；
  - Concept K Intent/Notes/Milestones/Decisions/Lessons mutation 失败可见；
  - 仅幂等目标更新附带 Retry，create/delete 不附带 Retry；
  - `client/src` 的 `silent|noop|swallow|surface elsewhere` 审计不再命中用户可见错误路径；
  - localStorage/telemetry 例外必须完全不影响用户可见应用数据，并在 catch 处记录原因；
  - 不修改 dead controls 或 Concept O 上下文语义。
- Verify：`bun run test -- async-error-secondary-surfaces.test.tsx` 与定向 `rg` 审计。

## SP3-T6 — 完整门禁与本地交付

- Owner：`/root/dead_controls_audit`
- Dependencies：`SP3-T4`、`SP3-T5`
- Files：本 Issue 分支全部改动
- Done when：
  - `git diff --check`、client 全量 test、client typecheck、client build 在当前 session 通过；
  - 本地 commit 只包含 GH3 范围文件；
  - 返回 changed files、命令结果、commit SHA 与任何未满足验收；
  - 不 push、不创建 PR、不修改远端 Issue。
- Verify：`bun run test && bun run typecheck && bun run build`。
