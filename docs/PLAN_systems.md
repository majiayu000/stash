# stash — Systems (可重复流程) Implementation PLAN

**基于**: `docs/PRD_systems.md`
**目标**: 在 stash 中增加一等公民的 “Systems” 功能（可重用、可重复执行的流程模板 + 每次运行的独立历史）。
**原则**:
- 最小侵入：主要扩展 `kind` + `parentId` + 复用现有 checklist / journal / recurrence。
- 手动权威：System 模板本身不进入 done，完成语义只在 Run 上。
- 本地优先、无静默降级。
- 每个阶段必须通过 `bun run verify`（或子集） + 手动验证。

---

## Phase 0 — PRD 对齐 & 范围确认 ✅

**输出**:
- `docs/PRD_systems.md`（已完成，包含痛点映射、数据模型、MVP 范围）
- 本 PLAN
- 初始 Issues 列表（见 `docs/SYSTEMS_ISSUES.md`）

**已决策**（来自 PRD）:
- 使用现有 WorkItem + parentId 表达模板与 Run 的关系。
- MVP 不新增独立 `system_runs` 表。
- System template 不能被标记 done。

**下一步准备**:
- 确认是否要独立 Concept（'s' 路由）还是先用 SmartLists + Concept L 增强。

---

## Phase 1 — 数据模型 + 后端核心（MVP 基础）

**状态**: 已完成基础闭环；seed 示例后移到 Phase 3。

**Touches**:
- `shared/src/work-item.ts`
- `server/src/domain/work-item/repository.ts`
- `server/src/domain/work-item/service.ts`
- `server/src/web/schemas.ts`
- `server/src/web/routes/work-items.ts`
- 相关测试

**步骤**:
1. 在 `WorkItemKind` 增加 `'system'` 并更新 `WORK_ITEM_KINDS`。
2. 在 ListFilter / ListWorkItemsQuery 支持 `kind` 过滤。
3. 实现 `service.instantiateSystem(templateId, opts)`：
   - 校验 kind === 'system'
   - 深拷贝 checklist（重新生成 item id）
   - 创建 Run（kind='chore'，parentId=templateId，checklist 重置为 false）
4. 路由增加 `POST /work-items/:id/run`
5. System template 禁止 status 流转到 'done'（在 update/create 时校验）。
6. 更新 seed / fixtures 支持创建 System 示例（Phase 3）。
7. **验证**:
   - `bun run server:typecheck`
   - `cd server && bun test`（新增 unit test for instantiate）
   - 手动：用 curl 或 client 创建 system → run → 检查 parentId + checklist 拷贝

**Done when**:
- 可以从一个 kind=system 创建多个独立 Run。
- 查询 `?kind=system` 和 `?parentId=xxx` 正常工作。
- 非法操作返回清晰错误。

---

## Phase 2 — 前端入口 + 基础 UX（用户可见）

**状态**: 基础入口已完成；历史计数和 e2e 后移到 Phase 3。

**Touches**:
- `client/src/api/work-items.ts`（加 runSystem）
- `client/src/workbench/SmartLists.tsx`（内置 systems chip）
- `client/src/workbench/concepts/ConceptL.tsx`（System 详情显示 “▶ Run system” 按钮）
- 相关 hooks / tests

**步骤**:
1. 实现 `runSystem(templateId, opts)` API wrapper。
2. 在 SmartLists 增加默认 chip `{ id: 'systems', label: '🔁 systems', filter: { kind: 'system' } }`。
3. 在 Concept L 的详情页，当 `item.kind === 'system'` 时显示 Run 按钮，点击后调用 API 并跳转到新 Run。
4. Run 详情页复用现有 ChecklistPanel + Journal（无需大改）。
5. 在 System 模板详情简单显示 “历史 Run 数量”（Phase 3）。
6. e2e：增加或扩展测试验证 Run 按钮创建并跳转（Phase 3）。
7. **验证**:
   - `bun run client:typecheck`
   - `bun run client:test`
   - 手动：在 UI 创建 System → 用 chip 找到 → Run → 勾选步骤 → Done → 返回模板看历史关联

**Done when**:
- 用户可以通过 UI 完成 “创建 System → Run → 执行” 闭环。
- Smart chip 能过滤出 Systems。
- 所有现有键盘操作在 System/Run 上继续可用。

---

## Phase 3 — 历史、创建入口、文档 & Seed（MVP 收尾）

**Touches**:
- `client/src/workbench/concepts/ConceptL.tsx`（增强历史列表）
- `client/src/workbench/QuickCapture.tsx` 或 capture parser（支持创建 system）
- `server/fixtures/seed*.ts`
- `README.md`
- `docs/PRD_systems.md` / `docs/PLAN_systems.md` 更新

**步骤**:
1. 在 System 模板详情页增加“历史 Runs”最小列表（日期 + 状态 + 完成进度，点击跳转）。
2. 增强 capture：支持 token 如 `kind:system` 或 `:system`，或在 create 表单增加 kind 选择。
3. 添加 seed 示例：
   - Morning routine
   - Travel packing
   - Airbnb turnover
4. 更新 README：说明 Systems 入口、Run 按钮、与 recurrence / areas 的关系。
5. 增加 e2e 测试覆盖创建入口 + 历史查看。
6. **验证**:
   - `bun run verify`（或至少 typecheck + test + e2e 子集）
   - 手动 seed 后启动，确认三个示例 System 可 Run 并有历史。

**Done when**:
- 新用户通过 seed 能立刻看到 Systems 价值。
- 创建入口顺畅（不只通过 API）。
- 文档清晰，用户能理解“System 不是普通任务”。

---

## Phase 4 — 增强 & 未来（Post-MVP）

- 专用 Systems 视图（可选新 Concept 's'）
- Run 统计（平均用时、完成率）
- AI Coach 针对 System 模板的优化建议
- Capture 语法 `:system` + `stash system "xxx"`
- 从 Run “采纳改进回模板”
- 模板版本提示（简单）
- 更多预置模板（dev onboarding, research workflow, weekly reset）

每个子项独立开 Issue。

---

## 验证节奏（所有 Phase 通用）

- 阶段结束必须运行：
  ```bash
  bun run typecheck
  cd server && bun test
  cd client && bun run test
  # 关键 e2e
  bun run client:e2e --grep "system|run"
  ```
- 手动验证核心 loop：
  1. 创建 System
  2. Run 它
  3. 在 Run 上勾选 + 加 journal
  4. Done Run
  5. 返回 System 看到历史
- 禁止静默降级：非法 kind、非 System template run、模板 done 必须报错；Run 拷贝必须重新生成 checklist item id。

---

**当前状态**（2026-06-29）：
- PRD 已校准为 v1.1。
- GitHub Issues 已创建：#85-#97。
- Phase 1 基础闭环已完成：`kind=system`、`instantiateSystem`、`POST /work-items/:id/run`、fail-closed kind filter、System template 禁止 done。
- Phase 2 基础入口已完成：SmartLists systems chip、Concept L `Run system` 按钮、Run 跳转。
- 仍需完成 Phase 3：创建入口、历史 Runs 面板、e2e、seed、README。

下一步：优先处理 #95（e2e）和 #93（创建入口），再处理 #91（历史 Runs 面板）与 #94/#97（seed + docs）。
