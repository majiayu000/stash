# GH3 技术规格：共享异步错误通道与安全重试

## 当前行为与证据

`client/src/workbench/reportAsyncError.ts` 当前只执行两件事：写入 `console.error`，以及派发 `stash:async-error`。`Workbench` 没有订阅该事件，因此现有 22 个调用点仍是 console-only。Concept A capture 与 Concept N 的初始 projects/budgets 读取还会让 rejection 逃出事件处理器或 effect。

既有 `LoadErrorPanel` 适合 required page data，但 optional panels、跨页面辅助读取和 mutation 失败需要较轻量的共享 Host。本设计保留两种层级：页面不可用时继续使用 `LoadErrorPanel`；页面仍可用时使用共享异步错误 Host。

## 错误事件合同

扩展 `WorkbenchAsyncErrorDetail`：

- `id: number`：进程内单调递增标识，用于避免旧 Retry 删除新错误；
- `scope: string`：稳定、面向用户可读的失败范围；
- `message: string`：由 `Error.message` 或 `String(error)` 归一化；
- `retry?: () => void | Promise<void>`：仅在调用方能安全重试或刷新真相时提供。

`reportAsyncError(scope, error, retry?)` 保持现有 console 日志，并派发包含上述字段的 `CustomEvent`。该合同只在当前浏览器 realm 内使用，不序列化、不持久化，也不成为公共后端 API。

## 共享 Host

新增 `client/src/workbench/AsyncErrorHost.tsx` 并在 `Workbench` shell 中挂载：

1. 订阅与清理 `stash:async-error`；
2. 按 scope 去重并保留最新错误，最多保留最近三条不同 scope；
3. 每条使用 `role="alert"` 展示 scope 与 message；
4. Dismiss 按 `id` 删除单条；
5. Retry 按 `id` 标记进行中，防止重复点击；
6. Retry resolve 后只删除相同 `id` 的旧错误；若执行期间同 scope 报出新 `id`，新错误保留；
7. Retry reject 被 Host 捕获并转成当前可见消息，不向浏览器泄漏未处理 rejection。

Host 使用现有 Workbench CSS variables，固定在左下角，避免覆盖右下角 Quick Capture 与中部 triage toast。不引入新依赖。错误栈设置视口相关的 `max-height`、`overflow-y: auto` 与 `overscroll-behavior: contain`，保证三条长消息不会越出可访问区域。

## 页面接入

### Concept A

- burn effect 抽出可等待的安全读取函数，失败时通过共享 Host 重新执行真实请求；
- capture 抽成捕获全部异常的异步函数；失败时保留原文本并恢复 submitting。由于 `createWorkItem` 是非幂等 POST，不向 Host 注册 Retry，用户只能检查内容后手动重新提交；
- capture 在 await 前后检查 mounted ref；页面卸载后的迟到 resolve/reject 不清空输入、不 reload、不更新 submitting，也不向新路由的 Host 派发错误；
- 不修改 `+ new project` 或 `+ new` 控件。

### Concept N

- projects 与 budgets 的 `refresh` 显式捕获失败并调用 `reportAsyncError`；
- effect 使用 `void refresh()`，所有 Promise rejection 在函数内部终止；
- Retry 重新执行对应 list API；CRUD 已有 Dialog 错误保持不变；
- `requestReminderPermission` 不把浏览器 rejection 改写成 `false`；`NotificationsPanel.enable` 捕获后通过共享 Host 展示，并由用户点击 Retry 重新发起权限请求；
- 权限状态统一通过 `getReminderPermission()` 读取，unsupported 浏览器不直接访问不存在的 `Notification.permission`；
- `NotificationsPanel` 使用 mounted ref 保护权限请求的 resolve/reject 分支；卸载后的迟到结果不得 set state、打开 Dialog 或派发 async error；
- Host 中已存在的 permission Retry 也检查同一 mounted ref，面板卸载后回调变为 inert，不得跨路由重新请求；
- 不修改 settings rail、toggle、theme preview 或 integration 控件。

### Concept O

- Todo、Prompt、Runs、Skills/Bindings effect 各增加 retry tick；
- Close Run 失败可重试同一幂等 close 操作；
- Clipboard Copy 失败不再静默，显示错误并允许重试；
- 不修改 `selectedProject`、project picker 或 Skill button 的语义。

### Concept L

- 详情、subtasks、lessons、journal、linked sessions 的读取失败进入共享 Host，并通过 retry tick 或读取函数重试；
- subtask toggle/drop 使用显式目标状态，失败后可安全重试相同状态；
- journal delete 与 session unlink 结果不确定时不盲目重复 mutation，Retry 改为重新拉取服务端真相；
- 现有局部 `flashSaved` / Dialog 可保留，但 silent catches 必须消失。

### Inbox、Today 与 Reminders

- `InboxTriage` 与 `TodayTriage` 的初始读取和 `stash:captured` reload 失败进入共享 Host；读取是安全操作，因此提供对各自 reload 函数的 Retry；
- `ReminderTicker` 的 server-backed polling 失败进入共享 Host，并允许重新执行读取；通知权限未授予时仍按既有合同跳过轮询；
- 三者在 effect cleanup 后不得派发迟到错误；
- reminder fired-set 的读取/写入是 best-effort localStorage 去重，损坏、quota 或 privacy mode 不影响服务端数据，因此保留静默并在代码中说明边界。

### Concept K Knowledge Editors

- Intent、Notes、Milestones、Decisions 与 Lessons 的保存失败全部进入共享 Host；
- PUT 或写入绝对目标值的 PATCH 属于幂等更新，可重试相同 payload；
- create 与 delete 的服务端结果可能已生效，不提供 Retry，避免重复创建或对已删除资源再次操作；
- 本变更不调整 Project Workbench 的控件、数据语义或导航。

## 测试策略

- `AsyncErrorHost.test.tsx`：scope/message、按 scope 去重、最多三条、Dismiss、Retry success、Retry rejection、新错误不被旧 Retry 删除。
- `async-error-surfaces.test.tsx`：
  - Concept A burn forced failure 可见且 Retry 重新请求；
  - Concept A capture forced failure 保留输入、恢复按钮并显示错误，同时断言没有自动 Retry；
  - Concept N budgets forced failure 显示错误且可 Retry；
  - Concept O compose forced failure 显示错误且 Retry 后恢复 Prompt。
- `async-error-secondary-surfaces.test.tsx`：Inbox/Today reload、Reminder polling 与 Concept K 幂等 update/non-idempotent create 的 forced failure 行为。
- notification permission 测试同时锁定 helper rejection 合同，以及 Concept N caller 的可见错误与成功 reattempt。
- notification permission 生命周期测试保留 Host、只卸载 Concept N，分别验证迟到 resolve、迟到 reject 与卸载后 Retry 不产生跨路由副作用。
- Concept A 延迟 capture rejection 测试：保留 Host、卸载 Concept A 后 reject，断言不派发跨路由错误且不 reload。
- Host 长消息测试：三条 alert 保留，样式包含限高、纵向滚动与 overscroll containment。
- 定向静态检查 `client/src` 不再存在用户可见 `silent|noop|swallow|surface elsewhere` 路径；只保留并记录不影响应用数据的 localStorage/telemetry 例外。
- 门禁：focused Vitest、client 全量 test、client typecheck、client build、`git diff --check`。

## 风险与兼容性

- 多个页面可能在启动时同时失败；三条上限与 scope 去重防止错误风暴占满页面。
- Retry callback 是进程内函数；Host 按 pathname/search 重挂载，调用组件仍需 mounted/cancelled guard，防止路由切换期间已在途的 Promise 向下一路由派发迟到错误。
- 现有调用点不传第三参数时仍兼容，只获得 Dismiss 而不显示 Retry。
- 错误 Host 只改变前端可见反馈，不修改 API、数据库或数据迁移。

## 回滚

本变更可按 commit 整体回滚。没有 schema 或持久化数据变化；回滚后恢复原 console-only 行为，不需要数据修复。
