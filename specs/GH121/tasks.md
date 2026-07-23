# GH121 实施任务

## SP121-T1 — 请求代际安全

- 覆盖：B-121-07、B-121-09
- 文件：`client/src/hooks/useAsync.ts`、`client/src/hooks/useAsync.test.tsx`
- 完成条件：每次请求拥有独立 generation；旧请求和卸载后的请求不能写状态；成功与错误乱序均有测试。
- 验证：`bun run test -- src/hooks/useAsync.test.tsx`

## SP121-T2 — API 超时与取消分类

- 覆盖：B-121-08、B-121-09
- 文件：`client/src/api/client.ts`、`client/src/api/client.test.ts`
- 完成条件：默认 timeout、caller signal 和网络错误分别映射稳定 code；timer/listener 在所有完成路径清理；既有结构化 HTTP 错误保持。
- 验证：`bun run test -- src/api/client.test.ts`

## SP121-T3 — 共享 Workbench 刷新资源

- 覆盖：B-121-01、B-121-02、B-121-03、B-121-04
- 文件：`client/src/workbench/workbenchDataResource.ts`、`client/src/workbench/workbenchDataResource.test.ts`
- 完成条件：共享快照、TTL、in-flight 去重与最多一次 trailing refresh 有确定性单测；失败保留快照。
- 验证：`bun run test -- src/workbench/workbenchDataResource.test.ts`

## SP121-T4 — Hook 接入与刷新路由

- 覆盖：B-121-01、B-121-02、B-121-03、B-121-04、B-121-09
- 依赖：SP121-T1、SP121-T3
- 文件：`client/src/workbench/useWorkbenchData.ts`、`client/src/workbench/Workbench.tsx`
- 完成条件：hook 使用共享 resource；自动事件走 TTL revalidate；capture/mutation/retry 走强制 reload；卸载清理 timer/listener。
- 验证：TypeScript 检查及 SP121-T3/T5 测试。

## SP121-T5 — 阻断与非阻断错误交互

- 覆盖：B-121-05、B-121-06
- 依赖：SP121-T4
- 文件：`client/src/workbench/Workbench.tsx`、`client/src/workbench/Workbench.refresh.test.tsx`
- 完成条件：缓存数据和刷新 alert 同时可见，alert 有详情及 retry；无成功快照时仍只显示阻断错误。
- 验证：`bun run test -- src/workbench/Workbench.refresh.test.tsx`

## SP121-T6 — 当前 head 验证与交付

- 覆盖：B-121-01 至 B-121-09
- 依赖：SP121-T1 至 SP121-T5
- 完成条件：精确 manifest 无越界；聚焦测试、client 全量测试和 client typecheck 通过；协调通道完成 E2E、`verify:ci`、独立审查和 PR gate。
- 验证：`bun run client:test && bun run client:typecheck`，随后执行仓库交付门禁。
