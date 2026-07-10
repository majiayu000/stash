# GH113 产品规格：Session 证据与估算指标可信度

## 问题

Session 详情在没有真实 events 时展示固定 demo trace，导致用户把并未发生的文件读取、代码修改和失败测试误认为 Agent 证据。Workbench 还把由活动计数推导的 token、cost、duration 当作精确的 `24h` 指标展示，未说明来源或估算性质。

## 目标

- 所有 Session 证据都必须来自真实事件；无事件时显示明确空态。
- 所有活动推导指标必须在使用位置明确标注为估算值，并移除未经数据支持的时间窗口与精确拆分。
- 真实 usage analytics 的展示与 API 合同保持不变。

## 产品不变量

1. `events.length === 0` 时，Session transcript 只能说明“尚无可显示的真实事件”，不得渲染伪造 tool call、文件名、diff、测试结果或 assistant 内容。
2. 有真实 events 时，现有 transcript、tool-call 展开与 callId 配对行为保持不变。
3. 由 message/tool/session 数量推导的 token、cost、duration，在每个用户可见入口都必须包含 `estimated` 或等价明确标识。
4. 估算指标不得使用未被计算逻辑证明的 `24h`、input/output/cache 比例或其他精确来源声明。
5. 真实 `/api/analytics/burn` 与 weekly usage 数据不因本变更降级为估算值。
6. 空态与估算标识必须可被自动化测试稳定定位。

## 验收标准

- Session 空 events 路径显示真实空态，DOM 中不出现固定 demo 文件、tool call、diff 或失败测试文本。
- Session 详情不再展示固定 50/11/39 composition；活动推导的 token/cost/duration 显示估算标识。
- Topbar、Connected Flow、项目/Session 相关页面中使用 `WBData` 合成指标的位置均移除虚假的 `24h` 声明并标为 estimated。
- 真实 events 的现有测试继续通过，并新增空态与估算标签测试。

## 非目标

- 不修改 Claude/Codex parser。
- 不修改数据库 schema、AgentSession API 或真实 usage analytics API。
- 不在本 issue 中重新设计计费模型或引入新的 token 采集管道。
- 不处理 Weekly Review 冷启动性能或 Settings 空控件。
