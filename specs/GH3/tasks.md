# GH3 实施任务

## SP3-T1 — 共享异步错误合同与 Host

- Owner：`/root/dead_controls_audit`
- Dependencies：无
- Files：`client/src/workbench/reportAsyncError.ts`、`client/src/workbench/AsyncErrorHost.tsx`、`client/src/workbench/Workbench.tsx`
- Done when：
  - `stash:async-error` 包含单调 `id`、scope、message 与可选 retry；
  - Host 按 scope 去重、最多三条，并支持 Dismiss；
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
  - N effects 不泄漏 rejected Promise；
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
- Files：`AsyncErrorHost.test.tsx`、`async-error-surfaces.test.tsx`
- Done when：
  - Host 的去重、容量、Dismiss、Retry race 均有测试；
  - A burn/capture、N budgets、O compose forced failure 均有可见错误断言；
  - Retry 至少证明一次真实重请求与成功恢复；
  - 测试没有未处理 rejection 或 act warning。
- Verify：focused Vitest suites。

## SP3-T5 — 完整门禁与本地交付

- Owner：`/root/dead_controls_audit`
- Dependencies：`SP3-T4`
- Files：本 Issue 分支全部改动
- Done when：
  - `git diff --check`、client 全量 test、client typecheck、client build 在当前 session 通过；
  - 本地 commit 只包含 GH3 范围文件；
  - 返回 changed files、命令结果、commit SHA 与任何未满足验收；
  - 不 push、不创建 PR、不修改远端 Issue。
- Verify：`bun run test && bun run typecheck && bun run build`。
