# GH121 产品规格：Workbench 有界后台刷新

## 问题

Workbench 的所有产品路由都会同时加载 work items、agent sessions、workboard 和 areas。路由挂载、窗口 focus、页面重新可见、60 秒 heartbeat 及 `stash:captured` 都可能触发相同的昂贵请求批次。当前没有共享成功快照或 in-flight 去重，因此路由切换与并发事件会重复扫描会话。

刷新失败时，即使用户已经看到了完整 Workbench，页面也会被阻断式错误替换。通用 `useAsync` 还允许旧请求在新请求之后写回状态；API 请求没有默认超时，也不能区分超时、调用方取消和网络失败。

## 目标

- 成功的 Workbench 快照可跨路由挂载立即复用。
- 过期快照在后台重验证，不阻塞已有页面。
- 自动刷新遵守 freshness TTL，并发刷新共享请求。
- mutation 强制刷新在当前请求结束后最多追加一次。
- 旧请求永远不能覆盖新请求的结果或错误。
- API 超时、显式取消和网络失败具有稳定错误码。
- 后台刷新失败保留旧数据，并明确显示错误详情与重试入口。

## 行为需求

- **B-121-01 冷启动单批请求**：无快照时，任意数量的同时挂载最多启动一批四源请求，并显示阻断式 loading。
- **B-121-02 快照首帧复用**：存在成功快照时，重新挂载首帧直接返回快照；快照未过期时不发请求，过期时后台重验证。
- **B-121-03 自动刷新有界**：focus、visibility 和 heartbeat 使用普通重验证；同一 freshness 窗口内最多启动一批刷新。
- **B-121-04 强制刷新有界**：mutation 使用强制刷新；当前刷新期间发生一个或多个强制刷新时，最多追加一次 trailing refresh。
- **B-121-05 非阻断刷新错误**：有成功快照后的刷新失败必须保留完整 Workbench，并显示 `role="alert"`、错误详情和 retry。
- **B-121-06 初始错误阻断**：从未成功加载时的失败继续显示阻断式错误页。
- **B-121-07 请求代际安全**：A 先启动、B 后启动时，无论完成顺序，A 都不能覆盖 B 的成功或失败状态。
- **B-121-08 API 错误分类**：默认超时返回 `REQUEST_TIMEOUT`，调用方 signal 取消返回 `REQUEST_ABORTED`，其他 fetch 失败返回 `NETWORK_ERROR`。
- **B-121-09 生命周期清理**：组件卸载后不写 React 状态；Workbench 的 interval 与 DOM listeners 全部移除。

## 非目标

- 不引入 TanStack Query 或其他数据框架。
- 不实施 route-specific core/enrichment 拆分。
- 不重写全部 `stash:captured` 事件。
- 不放宽现有性能测试断言。
- 不修改服务端扫描、数据库或 API 响应合同。

## 完成条件

- B-121-01 至 B-121-09 均有实现与自动化证据。
- client 聚焦测试及 TypeScript 检查通过。
- 完整 E2E、`verify:ci`、独立审查与 PR gate 由交付协调通道在当前 head 验证。
