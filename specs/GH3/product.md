# GH3 产品规格：前端异步失败必须对用户可见

## 问题

部分 Workbench 页面在 API 失败后继续渲染空数据、旧数据或无反馈状态。`reportAsyncError` 虽然会记录 console 并派发 `stash:async-error`，但当前没有任何 UI 订阅者；用户无法区分“确实没有数据”和“数据加载失败”。另有少数事件处理器没有显式捕获 rejected Promise，失败时只产生浏览器 `pageerror`。

当前已复现的高价值路径包括：

- Concept A 的 burn analytics 与 quick capture；
- Concept N 的 projects 与 budgets；
- Concept O 的 Todo、Prompt、Runs、Skills、Bindings、Close 与 Copy；
- Concept L 的详情辅助数据、Journal、Subtasks 与 Linked Sessions。

## 目标

- 所有会影响用户可见数据或操作结果的异步失败都显示明确错误，而不是伪装为空态或无操作。
- 提供一个共享错误入口，统一展示失败范围、错误消息、Dismiss，以及调用方能够安全提供时的 Retry。
- Retry 必须重新执行原读取、幂等更新或安全的真相刷新，不能盲目重复可能已生效的破坏性操作。
- API 失败不得继续形成未处理的 Promise rejection 或浏览器 `pageerror`。

## 产品不变量

1. 用户可见 API 数据加载失败时，页面必须显示包含失败范围和错误消息的 `role="alert"` 状态；不得只写 console。
2. 同一失败范围重复报错时，共享错误入口保留最新消息，不无限堆叠重复通知。
3. 每条共享错误都可由用户 Dismiss；Dismiss 只关闭当前错误，不影响其他范围的错误。
4. 调用方提供安全 Retry 时显示 Retry；读取请求重新读取数据，幂等更新可重试目标状态，结果不确定的删除或解绑只重新拉取服务端真相。
5. Retry 运行期间按钮必须防重复触发；Retry 成功后移除原错误，Retry 再次失败时保留最新错误。
6. Concept A 的 capture 失败时保留输入内容并恢复可提交状态，同时显示错误；成功前不得清空输入。创建请求是非幂等 POST，不提供自动 Retry，用户检查文本后可手动重新提交。
7. Concept N 的 projects 或 budgets 加载失败时必须显示错误，且不得产生未处理 rejection；空列表文案可以继续存在，但不能成为唯一反馈。
8. Concept O 的 Todo、Prompt、Runs、Skills、Bindings、Close 与 Copy 失败都必须可见；本 issue 不改变 Dispatcher 的项目选择或 Skill 上下文语义。
9. Concept L 中用户可见的 Journal、Subtasks 与 Linked Sessions 失败不得静默吞掉；安全读取提供 Retry，状态不确定的 mutation 提供真相刷新。
10. 已有 H/J/M 的 `LoadErrorPanel` 页面级错误行为保持不变。
11. 仅当 telemetry 或 localStorage 失败完全不影响用户可见数据和操作结果时，才允许保持静默。
12. 组件卸载后的迟到响应不得重新渲染错误或数据。

## 验收标准

- 派发 `stash:async-error` 后，共享 Host 显示 scope、message、Dismiss，并在存在安全回调时显示 Retry。
- Concept A burn 与 capture、Concept N budgets、Concept O compose 的 forced failure 测试均出现可见错误。
- Concept A capture、Concept N 初始加载和 Concept O effects 的 forced failure 不产生未处理 rejection。
- Concept A capture 错误不显示 Retry，输入仍可编辑并可由用户手动重新提交。
- Retry 测试证明实际请求被再次调用，成功后错误消失并显示恢复后的数据。
- `client/src` 中本 issue 覆盖的用户可见路径不再存在 silent catch。
- client focused tests、全量 tests、typecheck 与 build 全部通过。

## 边界与异常情况

- 多个不同 scope 可同时失败；Host 至少保留最近三条不同 scope 的错误。
- 非 `Error` rejection 必须通过 `String(error)` 转成可读消息。
- Retry 回调自身意外 reject 时不得形成新的未处理 rejection，原错误继续可见。
- 同一 scope 在 Retry 期间产生新错误时，新错误不能被旧 Retry 的完成状态误删。

## 非目标

- 不修复 Concept A/N/J 的 dead controls。
- 不修改 Concept O 的项目回退、Skill 选择或 Prompt 上下文真实性。
- 不新增后端 endpoint、数据库 schema、telemetry 或持久化错误队列。
- 不替换已有页面级 `LoadErrorPanel`，也不重新设计全站通知系统。
