# GH113 技术规格：Session 证据与估算指标可信度

## 设计摘要

本变更只处理 `client/src/workbench` 适配层生成的合成指标及 Session events 空态。它不改变后端返回值，也不把真实 analytics 数据降级为估算值。

## 数据模型

`client/src/workbench/data.ts` 中由活动计数推导的字段改为显式估算命名，不保留旧别名：

- `WBProject.tokens24h` → `estimatedTokens`
- `WBProject.cost24h` → `estimatedCost`
- `WBSession.tokens` → `estimatedTokens`
- `WBSession.cost` → `estimatedCost`
- `WBSession.duration` → `estimatedDuration`
- `WBStats.totalTokens24h` → `totalEstimatedTokens`
- `WBStats.totalCost24h` → `totalEstimatedCost`

估算公式保持现状，避免在本 issue 中伪造新的精度：

- token：`(toolCount + messageCount) * 80`
- session cost：`(toolCount + messageCount) * 0.001`
- project cost：`sessionCount * 0.05`
- duration：`max(60, toolCount * 30)`

适配层注释必须说明这些值没有真实 token/cost/duration provenance，也没有应用 24 小时时间窗。

## Session transcript

`client/src/workbench/concepts/ConceptG.tsx` 的 `events.length === 0` 分支改为导出的 `EmptyTranscript`：

- 使用 `data-testid="empty-session-events"`；
- 只说明当前 Session 尚无可显示的真实 events；
- 不渲染 preview、tool call、文件名、diff、测试结果或 assistant 内容；
- `eventsError` 路径仍优先显示错误面板，不能把加载失败伪装为空态；
- `RealTranscript` 及 tool call/output 配对逻辑不变。

Session 侧栏移除固定 50/11/39 input/output/cache 拆分，改为三个明确标注的估算总量：tokens、cost、duration。标题或说明包含 `estimated from activity counts`，并提供稳定测试标识 `data-testid="estimated-session-metrics"`。

## 用户可见标签

所有消费上述估算字段的用户可见入口都必须满足：

1. 不出现 `24h`、`vs yesterday`、每小时 burn 等没有计算依据的时间/趋势声明；
2. 数值标签使用 `estimated`、`est.` 或等价明确措辞；
3. 仅用于排序、容量上限或活动状态判断的内部消费可以继续使用估算值，但变量名必须反映估算语义；
4. `ConceptH` 的 `/api/analytics/burn` 与 `ConceptJ` 的 weekly usage 保持原有真实窗口标签，不作重命名或降级。

受影响的合成数据入口包括 `Topbar`、`SessionRow`、`ConnectedFlow`、Concept A/B/C/D/F/G/I/K/E 以及 Concept PRD 的数据说明。TypeScript 重命名作为遗漏检测器，旧字段名不得残留。

## 测试策略

- `ConceptG.test.tsx`：验证空态只显示真实说明，固定 demo auth 文件、tool call 与失败测试均不存在；保留真实 events/tool-output 配对测试；验证 Session 估算区标签。
- 新增或扩展适配层单测：验证合成公式写入 estimated 字段，且公开 shape 不再包含旧 `24h` 字段。
- 共享组件测试：验证 Topbar/SessionRow 的 estimated 标签，或由组件级查询覆盖相同可见语义。
- 静态检查：`rg` 确认 Workbench 合成字段的旧名字和固定 composition 不再存在；允许真实 analytics 页面继续出现受后端窗口支持的 `24h`/`7d`。
- 门禁：client focused tests、client 全量 test、`bun run typecheck`、`bun run build`。

## 风险与回滚

- 字段重命名会影响多个 Concept 组件；依靠 TypeScript 全量检查确保没有遗留调用点。
- 视觉文案会变长；使用现有短标签 `est.` 控制布局，详细来源放在标题/说明中。
- 若门禁失败，只回滚本 issue 分支；不修改真实 analytics API 或数据库，因此无数据迁移风险。
