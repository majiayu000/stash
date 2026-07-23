# GH121 技术规格：共享快照、SWR 与请求取消

## 设计摘要

本变更在客户端模块作用域增加一个单实例 `SharedRefreshResource<AdaptInput>`。它持有最后一次成功快照、刷新错误、更新时间、订阅者和单个刷新周期。`useWorkbenchData` 通过 `useSyncExternalStore` 消费稳定快照，避免跨路由卸载时丢失成功数据。

通用 `useAsync` 使用单调递增 request generation。每次 effect、reload 或 cleanup 都使旧 generation 失效，只有当前 generation 可以更新 React state。

API 客户端为每个请求创建内部 `AbortController`，同时桥接调用方 signal 与默认超时，并在 fetch、response body 读取的整个生命周期内保持错误分类。

## 刷新状态机

`SharedRefreshResource` 公开两条路径：

- `revalidate()`：若快照在 TTL 内则立即结束；过期或不存在时启动刷新。
- `refresh()`：强制启动刷新；若主刷新正在运行，只设置一次 trailing 标记。

一个刷新周期最多包含：

1. 一次 primary fetch；
2. primary 运行期间收到强制刷新时，一次 trailing fetch。

trailing fetch 运行期间的新强制请求共享当前周期，不再递归追加。每次成功原子替换快照并清除错误；失败保留已有快照并记录错误。仅当没有快照时，错误才形成阻断状态。

默认 freshness TTL 为 30 秒。Workbench 的 focus、visibility、heartbeat 调用 `revalidate`；`stash:captured` 和页面 mutation 沿用 `reload`，其语义为强制刷新。

## API 取消语义

`ApiRequestOptions`：

- `signal?: AbortSignal`
- `timeoutMs?: number`

默认超时为 15 秒。错误合同：

- 内部 timeout 触发：`ApiError(0, "REQUEST_TIMEOUT", ...)`
- caller signal 触发：`ApiError(0, "REQUEST_ABORTED", ...)`
- 其他 fetch/stream 异常：`ApiError(0, "NETWORK_ERROR", ...)`
- 已收到的 HTTP/API 错误继续保持原 status/code/body。

`apiGet` 的 options 是第三参数；有 body 的 mutation helper 也是第三参数，保持现有调用兼容。

## UI 语义

- `loading && !data`：现有阻断 loading。
- `error && !data`：现有阻断错误页。
- `data && error`：完整 Workbench 继续渲染，并新增刷新错误 alert、API 状态/错误码、错误消息和 retry。
- `data && loading`：保持现有页面，不显示阻断 loading。

## 边界检查清单

- API boundary：只增加可选 options，不改变请求/响应字段命名。
- 数据完整性：失败不清除最后成功快照，不把错误伪装为空数据。
- 并发：单个 in-flight 周期，最多一个 trailing fetch。
- 生命周期：hook cleanup 使 generation 失效；组件 effect 清理 listeners 和 interval。
- 错误处理：不吞异常；错误保存在状态并通过阻断页或 alert 展示。
- 安全：无新动态 HTML、命令执行、凭据或持久化输入。
- 性能：无第三方依赖；fresh snapshot 不触发四源请求。
- 回滚：删除 resource 并恢复 `useAsync` 加载即可，无 schema 或持久化迁移。

## 精确文件清单

允许修改或新增的文件只有：

- `specs/GH121/product.md`
- `specs/GH121/tech.md`
- `specs/GH121/tasks.md`
- `client/src/hooks/useAsync.ts`
- `client/src/hooks/useAsync.test.tsx`
- `client/src/api/client.ts`
- `client/src/api/client.test.ts`
- `client/src/workbench/workbenchDataResource.ts`
- `client/src/workbench/workbenchDataResource.test.ts`
- `client/src/workbench/useWorkbenchData.ts`
- `client/src/workbench/Workbench.tsx`
- `client/src/workbench/Workbench.refresh.test.tsx`

不得修改 package/lockfile、服务端、共享 schema、E2E 基础设施、AGENTS/config/hooks 或其他产品文件。

## 测试策略

- `useAsync.test.tsx`：新请求成功或失败后，旧请求晚完成不能覆盖；卸载后无状态写回。
- `client.test.ts`：默认 HTTP 行为保持；超时、caller abort、网络失败具有不同错误码。
- `workbenchDataResource.test.ts`：fresh snapshot 复用、过期后台重验证、in-flight 去重、单次 trailing、错误保留快照。
- `Workbench.refresh.test.tsx`：有数据刷新失败时页面和 alert 同时存在、retry 强制刷新；无数据失败仍阻断。
- 门禁：聚焦 Vitest、client 全量 test、`bun run client:typecheck`；完整 E2E 和 `verify:ci` 由协调通道执行。
