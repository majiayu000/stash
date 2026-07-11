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

Host 使用现有 Workbench CSS variables，固定在左下角，避免覆盖右下角 Quick Capture 与中部 triage toast。不引入新依赖。

## 页面接入

### Concept A

- burn effect 增加 retry tick，失败时通过共享 Host 提供重新读取；
- capture 抽成捕获全部异常的异步函数；失败时保留原文本、恢复 submitting，并提供对原标题的安全 Retry；
- 不修改 `+ new project` 或 `+ new` 控件。

### Concept N

- projects 与 budgets 的 `refresh` 显式捕获失败并调用 `reportAsyncError`；
- effect 使用 `void refresh()`，所有 Promise rejection 在函数内部终止；
- Retry 重新执行对应 list API；CRUD 已有 Dialog 错误保持不变；
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

## 测试策略

- `AsyncErrorHost.test.tsx`：scope/message、按 scope 去重、最多三条、Dismiss、Retry success、Retry rejection、新错误不被旧 Retry 删除。
- `async-error-surfaces.test.tsx`：
  - Concept A burn forced failure 可见且 Retry 重新请求；
  - Concept A capture forced failure 保留输入、恢复按钮并显示错误；
  - Concept N budgets forced failure 显示错误且可 Retry；
  - Concept O compose forced failure 显示错误且 Retry 后恢复 Prompt。
- 定向静态检查 Concept L 不再存在 `catch(() => {})`、`catch { /* ignore */ }` 或 `catch { /* swallow */ }`。
- 门禁：focused Vitest、client 全量 test、client typecheck、client build、`git diff --check`。

## 风险与兼容性

- 多个页面可能在启动时同时失败；三条上限与 scope 去重防止错误风暴占满页面。
- Retry callback 是进程内函数，页面卸载后 Host 同时卸载，因此不会跨 route 持久化旧回调。
- 现有调用点不传第三参数时仍兼容，只获得 Dismiss 而不显示 Retry。
- 错误 Host 只改变前端可见反馈，不修改 API、数据库或数据迁移。

## 回滚

本变更可按 commit 整体回滚。没有 schema 或持久化数据变化；回滚后恢复原 console-only 行为，不需要数据修复。
