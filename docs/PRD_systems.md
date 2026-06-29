# PRD: Systems — 可重复流程 (Reusable Routines & Checklists)

**状态**: Draft v1.1（实现校准版）
**日期**: 2026-06-29
**作者**: Grok (基于用户需求 + stash 现有代码库分析)
**目标产品**: 在 stash 之上增加一等公民的 “Systems” 功能，将 stash 从通用 todo + AI workbench 进化成同时支持**一次性任务**和**可重复流程**的本地优先个人系统。

---

## 1. 概述 (Summary)

stash 目前是一个优秀的**本地优先**（SQLite、无云、单设备、键盘优先）todo + AI agent 工作台。

用户反复表达的核心痛点是：

> “我有很多重复性流程（早间 routine、打包清单、每周重置、清洁 checklist、Airbnb 翻台、学习流程等），我希望**写一次**，然后**反复执行**、**记录每次完成历史**、**手动标记完成**、**不断迭代改进**，而不是每次都从头新建或被自动重置。”

当前 stash 的 checklist + recurrence + parentId + journal 已经提供了部分能力，但缺少**模板（System）与执行实例（Run）**的清晰分离和专用体验。

本 PRD 定义如何在不破坏现有 todo 能力的前提下，增加 **Systems** 作为一等功能，让用户能够：

- 定义可重用的流程模板
- 一键启动一次执行（fresh checklist 副本）
- 在执行过程中勾选、记录笔记
- 查看完整的执行历史
- 轻松从历史中改进模板

**核心原则**（与 stash 一致）：
- 本地优先，数据完全在用户设备
- 手动权威（manual is authoritative）
- 保留原始输入
- AI 是辅助（可选用于改进流程），不是自动接管
- 极致键盘/捕获速度

---

## 2. 背景与问题 (Background & Pain Points)

### 2.1 真实用户痛点（来源于 X + Reddit 分析 + 进一步调研）

**核心痛点**：
- 传统 Todo / Habit tracker 不适合 “介于 Todo 和 Habit 之间” 的可重复流程。
- 很多人把重复步骤记在脑子里 → 大脑简化后遗漏细节。
- 执行后想看到历史（我上周/上个月是怎么做的？哪些步骤可以优化？）。
- ADHD 用户特别需要**极细粒度步骤** + **视觉进度** + **不自动重置**。
- 家务、旅行、接待客人（Airbnb）、健身、学习、工作 SOP 等场景大量存在。

**额外深度痛点**（2026 最新观察）：
- **拆解疲劳 (Breakdown Fatigue)**：把流程拆成 checklist 本身就是高心智负担。用户想“写一次 SOP，坏日子直接照着做”。
- **重置摩擦 (Reset Friction)**：用完 checklist 后很难干净重置给下次用。Todoist/Notion 用户疯狂 hack duplicate / uncheck all，或转用纸质干擦板。
- **执行分心 & 部分完成**：尤其是清洁/家务，列了清单却被眼前东西带跑，最后“每件事做一点、每件事都没做完”。
- **过渡/出门焦虑**：打包、离开家、旅行准备反复铺东西、改主意、忘关键物品、过度打包。
- **日常 routine vs 偶发 procedure 割裂**：工具擅长 recurring task 或一次性，但对“偶尔执行但步骤固定”的 procedure 支持差。
- **低能量支持不足**：时间盲 + 低估时长 + 需要“手把手”指引。
- **知识工作者 SOP 需求**：开发者/创作者/freelancer 需要 client onboarding、research workflow、发布 checklist、deploy SOP，但缺少执行历史和迭代记录。
- **预制模板渴望**：强烈想要社区或预置 checklist，而不是每次从零写。

典型例子：
- Morning routine
- 出差/旅行打包清单
- 每周重置（weekly reset）
- 清洁房间 checklist
- Airbnb 客人 turnover 流程
- 学习新技能的工作流
- 发布前检查清单
- Client onboarding / Content pipeline / Research workflow (dev/creator)

### 2.2 当前 stash 的状态与差距

**已有优势**：
- WorkItem + inline `checklist`
- Recurrence（rrule + after_completion）
- parentId 层级
- Journal（append-only 笔记）
- 极快 capture（token 语法）
- Areas / Projects 分组
- SmartLists + 多 Concept 视图
- 本地 SQLite + CLI

**关键差距**：
- 没有“模板”概念，recurrence 是复制下一个 WorkItem，容易混淆定义和执行。
- 缺少专用的 “Run History” 视图。
- 缺少“一键启动本次执行”的明确 UX。
- 模板编辑和历史实例应该解耦。

---

## 3. 产品目标 (Goals)

### 3.1 主要目标

1. 用户可以**一次定义**一个可重复流程（System），并**反复、安全地执行**它。
2. 每次执行都有**独立、完整的历史记录**（完成时间、哪些步骤做了、笔记）。
3. 执行过程**手动完成**，不自动重置或消失。
4. 用户可以轻松**迭代改进**模板，而不破坏历史数据。
5. 与 stash 现有能力（capture、areas、journal、AI coach、recurrence）**无缝融合**。

### 3.2 成功指标（MVP 后 3 个月）

- 至少 30% 活跃用户创建过 ≥1 个 System。
- System 相关 WorkItem 的平均执行次数 > 3 次。
- 用户通过 journal 或 checklist 修改模板的次数占比 > 20%。
- “Run System” 动作的成功率 > 90%（从点击到能开始勾选）。

---

## 4. 目标用户 (Target Users)

**主要用户画像**（与 stash 当前用户高度重叠）：

- **ADHD / 神经多样性用户**：需要外部大脑来管理重复生活流程。
- **重度个人生产力用户**：远程工作者、独立开发者、内容创作者、频繁旅行者。
- **家庭/生活管理**：需要管理家务、清洁、旅行准备、接待客人。
- **专业重复流程**：Airbnb 房东、健身教练、老师、咨询师等有固定 SOP 的人。

**次要**：任何讨厌每次重复造轮子的人。

---

## 5. 非目标 (Non-Goals)

- 不取代现有通用 Todo 能力（Systems 是**补充**，不是替代）。
- 不做团队/多人协作（保持单用户）。
- 不强制云同步。
- 不自动执行 checklist（必须是手动）。
- MVP 不做复杂的可视化仪表盘或 streak 游戏化（可以后期加）。
- 不改变现有 WorkItem 的核心状态机。

---

## 6. 核心概念与数据模型 (Core Concepts & Data Model)

### 6.1 System（模板）

- 一种特殊的 `WorkItem`，`kind = 'system'`
- `checklist` 字段存储**流程定义**（步骤列表）
- 不允许被标记为 `done`（它是定义，不是一次执行；完成语义只属于 Run）
- 可以有 `recurrence`（可选，用于自动提醒/建议运行）
- 属于 Area 或 Project（可选）

### 6.2 Run（执行实例）

- 普通 WorkItem（MVP 使用 `kind = 'chore'`）
- `parentId` 指向对应的 System 模板
- `checklist` 是**模板的深拷贝**（每次运行独立状态）
- `scheduledFor` / `completedAt` / `journal` 记录本次执行
- 完成 Run 即完成一次流程执行

### 6.3 关键字段复用 / 扩展

在现有 `WorkItem` 上：

```ts
interface WorkItem {
  // ... 现有字段

  kind: 'system' | 'chore' | ...;   // 新增 'system'

  // Run 实例特有语义（通过 parentId 表达）
  parentId?: string;                // Run 时指向 System

  checklist: ChecklistItem[];       // System: 定义；Run: 本次执行快照

  // 推荐新增可选字段（MVP 可先用 journal 代替）
  // systemRunMeta?: { startedAt?: string; notes?: string; completionRate?: number }
}
```

约束规则：
- `kind='system'` 的 WorkItem 是模板，不能进入 `status='done'`。
- Run 只能从 `kind='system'` 的模板创建；普通 task/chore 不能作为 System template。
- Run 创建时复制模板当前 checklist，并将每个步骤重置为 `completed=false`。
- Run 的 checklist item id 必须重新生成，避免模板和历史实例共享步骤 id。

历史记录通过以下方式获得：
- `listWorkItems({ parentId: systemId })` 获取所有历史 Run
- 结合 `completedAt` + Journal 得到完整上下文

### 6.4 推荐新增辅助概念（可选，MVP 后）

- `SystemRun` 轻量记录（如果需要更丰富的聚合统计）
- 但优先复用现有 WorkItem + Journal

---

## 7. 关键用户流程 (Key User Flows)

### 7.1 定义 / 编辑 System

1. 快速捕获或手动创建 → 设置 `kind = 'system'`
2. 在详情页编辑标题、checklist 步骤、标签、Area
3. 可选设置 recurrence（每周一提醒我运行这个 routine）

### 7.2 启动一次执行（Run）

1. 在 Systems 列表 / Smart Chip 找到目标 System
2. 点击 **“Run”** 或快捷键
3. 系统创建新的 Run WorkItem：
   - checklist 完整拷贝（全部 unchecked）
   - parentId = System.id
   - 状态 active / planned
4. 自动跳转到该 Run 的详情页

### 7.3 执行流程

- 使用现有 ChecklistPanel 逐项勾选
- 可随时在 Journal 添加本次执行笔记（“今天多花了 8 分钟因为...”）
- 支持手动 Done（不自动消失）

### 7.4 查看历史 & 改进

- 打开 System 模板 → 看到所有历史 Run（日期、完成率、笔记）
- 可以直接编辑模板的 checklist（不影响历史 Run）
- 可从某个 Run 的 journal 复制内容回模板，或让 AI coach 建议优化

### 7.5 与现有功能融合

- Capture 语法扩展支持创建 System
- Areas 天然分组（Home Systems / Travel Systems）
- AI Coach 可以作用于 System（“帮我优化这个 morning routine”）
- Recurrence 可以作用于 System 模板
- 现有 SmartLists、SearchPalette、键盘操作全部复用

---

## 8. 功能需求 (Functional Requirements)

### MVP 已落地

- [x] 支持 `kind=system` 的 WorkItem 创建、编辑、删除
- [x] `instantiateSystem(templateId)` 接口 + `POST /work-items/:id/run`
- [x] SmartLists 内置 “🔁 systems” chip
- [x] System 详情页显示 “▶ Run system” 按钮
- [x] Run 创建时深拷贝 checklist、重置完成状态、重新生成 checklist item id，并设置 parentId
- [x] 通过 parentId 可以查询历史 runs
- [x] 所有现有 checklist 操作在 Run 上正常工作
- [x] 本地优先：所有数据 SQLite，无需网络
- [x] `kind` 查询 fail closed：非法 kind 返回验证错误，不静默返回空结果
- [x] System template 不能被标记为 done；完成语义只在 Run 上发生

### MVP 仍需补齐

- [x] 创建入口：UI / capture 能直接创建 `kind=system`
- [x] System 详情页历史 runs 列表（最小版：日期、状态、完成率）
- [x] e2e 覆盖 Run system 按钮创建并跳转
- [x] seed 示例：Morning routine / Packing checklist / Airbnb turnover
- [x] 文档更新：README 或 docs/PLAN 中说明 Systems 入口与约束

### MVP 之后（高优先）

- System 专用列表视图 + 统计（上次执行、上次完成率、平均用时）
- 在 System 详情中展示历史 runs 列表（带摘要）
- 支持从 Run 快速 “采纳改进到模板”
- Capture token 已支持 `:system` / `kind:system`；CLI 专用 `stash system "xxx"` 可后续补
- 模板上可设置默认 Area / Labels

---

## 9. 非功能需求 & 约束

- **本地优先 & 隐私**：数据永不离开设备（除非用户主动导出）
- **速度**：从决定 “Run” 到可以开始勾选 < 300ms
- **键盘优先**：所有核心动作可无鼠标完成
- **数据完整性**：模板修改不影响已存在 Run 的 checklist 历史
- **可观测性**：所有 Run 都有明确来源（parentId + rawInput）
- **验证边界**：非法 kind、非 System template run、malformed JSON 都必须返回错误，不能静默降级
- 与现有 `verify` / e2e / typecheck 流程兼容

---

## 10. 与现有 stash 集成策略

- **最小侵入**：主要通过扩展 kind + parentId + 复用 checklist/journal
- **UI 策略**：
  - SmartLists chip（快速发现）
  - System 详情增强（Run 按钮 + 历史）
  - 未来可加独立 Concept（例如新增 's' 路由）
- **AI 集成**：System 可以被 Task Coach / AI Draft 使用，用于流程优化建议
- **Recurrence**：可以作用于 `kind=system` 的模板作为提醒/建议运行；模板自身不能因 completion 生成下一份模板，完成动作必须发生在 Run 上

---

## 11. MVP 范围 & 分阶段

**MVP Scope (4-6 周)**：
- 数据模型 + API + 基础服务
- Smart chip + Run 按钮 + 基础历史联动
- 支持通过 API / 现有创建流程创建 System
- 文档 + 简单 seed 示例

**Phase 2**：
- 专用 Systems 视图 + 统计
- 更好的历史面板
- Capture 语法增强
- AI 辅助改进模板

**Future**：
- 可视化流程图
- 多人模板分享（可选）
- 移动端优化

---

## 12. 决策与开放问题 (Decisions & Open Questions)

### 已决策

1. System 本身不允许被标记为 done；完成语义只属于 Run。
2. MVP 不新增 `system_runs` 表，使用 WorkItem + parentId + Journal。
3. MVP 历史统计实时计算，不缓存。
4. MVP 不支持一个 Run 关联多个 System。
5. MVP 不做模板版本控制；模板编辑只影响未来 Run，不影响历史 Run。

### 仍开放

1. System 的默认创建入口优先放在哪里：Quick Capture token、SmartLists drawer、还是 Concept L 操作区？
2. Run 的默认标题是否保留模板标题，还是自动加日期/序号？
3. 历史面板是否默认显示未完成 Run，还是只显示 completed runs？

---

## 13. 附录

### 与原始痛点映射

| 原始需求                  | 本 PRD 覆盖方式                     |
|---------------------------|------------------------------------|
| 可重用 checklist          | kind=system + checklist 字段       |
| 完整完成历史              | parentId + completedAt + Journal   |
| 手动 Done                 | 现有 status 机制                   |
| 进度指示                  | 现有 done/total + 未来增强         |
| 不取代全能 Todo           | System 是补充类型                  |
| 改进流程                  | 编辑模板不影响历史 + AI coach      |

---

**下一步建议**：

1. 基于本 PRD 细化 `PLAN.md` 风格任务拆分。
2. 补齐创建入口、历史面板、e2e 和 seed 示例。
3. 再评估是否需要独立 Systems Concept。

欢迎反馈任何部分需要加强或调整。
