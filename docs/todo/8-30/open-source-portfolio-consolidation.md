# 开源仓库组合收敛与退役计划

Status: decision record and execution backlog
Date: 2026-08-30
Revalidated: 2026-08-31
GitHub owner: [`majiayu000`](https://github.com/majiayu000)
Scope: 100 个公开、原创、非 fork 仓库
Method: 10 个只读调研 lane，加文档落盘时的实时增量复核；基于 GitHub 实时元数据、源码树、README、Release、CI、Issue、部署和重复文件核验
Evidence: [`portfolio-evidence.md`](./portfolio-evidence.md)

## 1. 结论

当前公开组合的问题不是项目数量不够，而是同一条 Agent 工具链被拆成了过多平级入口。

截至审计时：

- 100 个公开原创仓库；
- 82 个尚未归档，18 个已归档；
- 57 个仓库为 0 star，77 个仓库为 0 fork；
- 近 90 天新建了 27 个仓库；
- 外部关注主要集中在 `claude-skill-registry`、`spellbook`、`litellm-rs`、`harness`、`vibeguard`、`remem` 等少数项目。

说明：10 个调研 lane 完成时共有 98 个仓库。文档写入期间新增了 `awesome-grok-bot` 和 `patch-tournament`；初版只补审了前者。2026-08-31 复核时已补入 `patch-tournament`，当前基线为 100 个。

### 1.1 所有权与分析范围校正

以下校正以 2026-08-30 的本地 remote、GitHub 元数据和用户确认共同为准。目录存在、账号归属和长期产品所有权是三件不同的事，后续不再混用。

| 名称 | 当前事实 | 本计划中的处理 |
|---|---|---|
| `remem` | `origin` 为 `majiayu000/remem`，是用户自己的主项目。 | 作为唯一记忆事实源和这一组的 successor。 |
| `claude-mem`（用户口述的 CloudMEM） | 本地 checkout 的 `origin` 为 `thedotmack/claude-mem`，不是用户项目。 | 只作为外部竞品和兼容性参考，不进入合并、退役或推广清单。 |
| `claudemem-rs`（用户口述的 CloudMEMRS） | 本地目录和 `majiayu000/claudemem-rs` remote 仍存在，但用户已明确宣布该项目终止。 | 从 active portfolio、重复功能矩阵和路线图移除；不再为它设计迁移或兼容层。 |
| `remem-web` | `majiayu000/remem-web` 当前是私有仓库。 | 作为 Remem 的私有附属迁移候选，不计入公开组合；继续只调用 Remem REST API。 |
| `keel` | `majiayu000/keel` 当前是私有仓库。 | 作为 Refine 的私有迁移候选，不计入公开组合；只迁有真实使用证据的派生能力。 |
| `verdict` | GitHub 当前显示 `majiayu000/verdict` 为非 fork、无 parent/source；仓库只有一个由用户身份提交的初始 commit。 | 归类为用户自己的早期实验仓，不归类为外部项目；功能并入 successor 后退役。 |

本节只校正决策范围，不执行本地目录删除、GitHub 归档或仓库迁移。

六个月组合目标：

- 未归档仓库从 82 个降到不超过 40 个；
- 最多 12 个仓库拥有 active roadmap；
- 最多 6 个仓库同时对外主推；
- 同时最多保留 1 个 90 天孵化实验；
- 每个 successor 每批最多吸收 3 个旧仓，目标仓发布并完成迁移验收后再开始下一批；
- 新增一个旗舰时，必须同时降级、合并或归档一个现有项目。

`KEEP` 只表示仓库不应退役，不表示它应该持续扩功能、占据推广名额或保持高频 Release。

## 2. 产品边界

不建设巨型 monorepo。保留天然不同的数据面、执行面和产品面：

```text
公共发现
  Claude Skill Registry
    ├─ registry：站点、API、抓取、扫描、索引、发布门
    └─ registry-data：原始归档数据和 provenance
                    │
                    ▼
自有能力发行
  Spellbook ───── Loom
      │              └─ 安装、锁定、投影、回滚
      ▼
  VibeGuard
      └─ 运行时规则、Hook、策略和审计
                    │
                    ▼
Agent 运行
  Harness ───── Sage
      │            └─ 单 Agent 执行器
      ▼
  litellm-rs
      └─ 模型 Gateway 和 provider data plane

会话与工作
  Remem ───── Refine
    │            └─ 只保存引用和派生分析
    └────── Stash
               └─ 任务、项目、Today 和证据工作台

用量
  ccstats ───── QuotaBar
      └─ SDK       └─ GUI
```

必须保持的边界：

- Registry 负责社区发现；Spellbook 负责一方内容，二者不合并。
- Loom 负责本机 Skill 状态；Spellbook 不直接管理投影。
- `litellm-rs` 是模型数据面；Harness 是 Agent 控制面，二者不合并。
- Sage 是单 Agent 执行器；Harness 调用 Sage、Codex、Claude Code 等执行器，不再实现另一套代码 Agent。
- Remem 是原始会话、来源、host 和 memory 的唯一事实源。
- Refine 只保存经过验证的 Remem ref/hash 和派生 observation，不保存第二份 transcript。
- Stash 是任务和最终完成决策的事实源，不复制 Remem 的原始会话或 Keepline 的运行时数据库。
- ccstats 是 usage、pricing、quota 的唯一解析层；QuotaBar、Stash、CCP 不再各写一套 parser。
- Argus 是安装前扫描；VibeGuard 是运行时约束。只允许 VibeGuard 消费 Argus 报告，不建设共享规则引擎。

### 2.1 记忆、认知与治理的收敛主链

这一组不依赖 Stash 或 Harness 才能成立。先完成三层职责闭环：

```text
Claude Code / Codex ──► Remem：原始编码会话、来源、稳定引用、检索、备份恢复
                              │ session_ref / message_ref / content_hash
                              ▼
ChatGPT / Claude Web ──► Refine：浏览器来源、认知观察、趋势、画像和治理建议
Gemini / Grok                 │ approved proposal only
                              ▼
                         VibeGuard：运行时规则、Hook、触发证据和执行审计
                              │ event_ref
                              └────────► Remem / Refine 只引用证据
```

边界规则：

- Remem 保存 Claude Code/Codex 的原始会话事实；Refine 和 VibeGuard 不再扫描并持久化第二份 coding-agent transcript。
- Refine 可以继续拥有它独有的 ChatGPT、Claude Web、Gemini、Grok 浏览器采集；本轮不把 Remem 扩成通用网页内容库。
- Refine 保存可重算的派生 observation，并记录输入 `session_ref`、分析器版本和输出 hash。
- VibeGuard 保存规则及实际触发事件；Refine 可以生成修改建议，但不得自动改规则。
- 三者保持三个仓库，不建设 monorepo，也不增加共享数据库或新的控制平面。
- Stash 未来只消费稳定引用来关联任务；Harness 未来只产生运行事件。两者都不是本轮收敛的前置条件。

## 3. 推广组合

### 3.1 六个月优先投入

1. `spellbook`
2. `litellm-rs`
3. `harness`
4. `vibeguard`
5. `remem`

第六席留给 `stash`，但必须先完成：

- 增加明确的 OSS License；
- 发布第一个公开 Release；
- 完成 Stash–Keepline 真实端到端流程；
- 发布 Keepline 数据迁移和退役说明；
- session/evidence 全面使用 Remem 稳定引用；
- usage/cost 全面使用 ccstats SDK。

未达到门槛时，第六席保持空缺，不用 Argus、Sage 或 DSH Desk 临时补位。

### 3.2 暂停推广、先修基础

`claude-skill-registry` 是最大的流量入口，但在恢复集中推广前必须完成：

- `core` 安全扫描失败时，最终发布必须 fail closed；
- 主仓停止提交完整 Skill 归档正文；
- `core` 的代码、schema、crawler、站点和发布管线迁回主仓；
- `data` 只保留内容、metadata、license、source commit 和 hash；
- 连续两个定时发布周期通过同一个安全晋级门；
- Loom 和旧 registry consumer 通过新 API smoke test。

## 4. 旗舰功能路线图

### 4.1 Spellbook

1. 建立正式版本化 Release、bundle manifest 和 changelog。
2. 完成 install、update、uninstall、doctor 闭环。
3. 只主推 3–5 个高价值 starter bundle，每个包含可复现实例或 eval。
4. 为 Skill 建立稳定 ID、canonical owner、依赖和退役状态。
5. 吸收 `agent-patterns`、`anosome-workflow`、`specrail` 的有效内容，禁止继续保留重复 Skill 名称。

### 4.2 litellm-rs

1. 从“100+ provider”收缩为优先保证 8–12 个生产级 provider。
2. 建立 Chat、Responses、tool continuation、thinking、stream EOF 和错误映射 conformance suite。
3. 统一 model identity、deployment identity、catalog 和 pricing authority。
4. 发布可复现的正确性、流式兼容和性能 benchmark。
5. 提供单二进制安全部署、鉴权、限流、成本、观测和故障转移闭环。
6. 在 v1 和集中推广前更换独立品牌，避免被理解为 LiteLLM 官方 Rust 实现。

### 4.3 Harness

1. 更换名称，避免与 Harness.io 和 DeepSeek Harness 混淆。
2. 发布真正可下载的一键 Quickstart。
3. 建立唯一的 issue intake → execute → validate → independent review → land 工作流。
4. 吸收 `agent-harness` 的 workpad、feedback sweep 和 land gate。
5. 吸收 `auto-contributor` 的 issue discovery、DCO、fork 和 PR handoff。
6. 统一任务生命周期，补齐预算门禁、取消、失败恢复和运行证据面板。
7. 提供版本化 Sage adapter，定义 stream schema、resume、cancel、completion 和 error 语义。

### 4.4 VibeGuard

1. 安装前提供 preview，触发后提供 explain。
2. 本地和 CI 使用同一策略基线。
3. 支持有审计记录的局部豁免和误报反馈。
4. 吸收 `test-loop` 中确定性的测试证据新鲜度、报告完整性和 drill guard。
5. 吸收 Verdict 的运行轨迹越权审计，不吸收 Loom 的 provenance 和 pinning。
6. 消费 Argus 稳定 JSON/SARIF 报告，不复制扫描规则。

### 4.5 Remem

1. 提供五分钟内完成安装、捕获、跨会话带引用召回的新用户流程。
2. 每次召回显示来源、时间、命中原因，并支持纠错和遗忘。
3. 发布稳定 consumer contract 和 contract test kit，供 Refine、Stash 使用。
4. 吸收 `chat-archive-rs` 的压缩、加密、manifest hash-chain、verify 和 restore。
5. 建立备份恢复演练，不把 archive 内容自动晋升成 memory。
6. 降低 Release 频率，优先处理数据可靠性和真实恢复故障。

### 4.6 Stash 条件席位

1. 吸收 Keepline 的多 runtime 进程发现、session live state、process attribution 和恢复动作。
2. 任务只保存 Remem `session_ref`，不保存第二份 transcript body。
3. usage 和 budget 全部调用 ccstats SDK。
4. 保持用户最终确认完成；Agent completion 只能生成建议。
5. 完成安装、升级、备份、恢复和从 Keepline 导入的真实 E2E。
6. 取得开源许可证和首个稳定公开 Release 后再退役 Keepline。

## 5. 逐库裁决

### 5.1 Agent 与模型运行时

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `litellm-rs` | KEEP / 旗舰 | 完成 provider 收缩、conformance suite、统一 model/pricing authority 和独立品牌。 |
| `harness` | KEEP / 旗舰 | 统一工作流、可安装 Release、预算与恢复、Sage adapter，并改名。 |
| `sage` | 条件 KEEP | 90 天内只修发布和可靠性；完成 fresh install、cloud/Ollama、edit-test-undo-resume E2E。未通过则 maintenance freeze。 |
| `patch-tournament` | 90 天孵化 | 当前唯一孵化实验；只验证隔离候选、独立检查和最小合格补丁选择。90 天内证明真实采用，否则冻结；不建设第二个 Harness 控制面。 |
| `agent-harness` | MERGE → Harness | 迁 workpad、feedback sweep、land/validation gate 和薄 plugin；不迁第二套 Agent 和生命周期。 |
| `auto-contributor` | MERGE → Harness | 迁 issue discovery、DCO、fork/PR handoff；不迁独立 worker pool、SQLite、dashboard 和无限 loop。 |
| `auto-contributor-dashboard` | MERGE → Harness | 只迁 Issue、PR、Stats、Blacklist 信息架构；使用 Harness 认证、API 和事件流重做。 |
| `agent-base` | RETIRE | 不迁代码。若保留教育价值，只在归档 README 说明 11 个 pattern 已被 Sage/Harness 覆盖。 |
| `claude-autopilot` | RETIRE / 已归档 | 只指向 Harness；不迁 Markdown 数据格式、Docker runner 或无限循环。 |
| `anywhere-ai` | RETIRE / 已归档 | 不迁 tmux、SQLite 和旧远程控制实现；未来需求重新基于 Harness API 设计。 |

### 5.2 Skill、Registry 与 Guard

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `spellbook` | KEEP / 旗舰 | 版本化内容发行、稳定 ID、eval、少量高价值 bundle。 |
| `loom` | KEEP | 本地 registry、provenance、lock、binding、projection 和 rollback。 |
| `claude-skill-registry` | KEEP | 唯一公共品牌、站点、API、生成与发布入口。 |
| `claude-skill-registry-core` | MERGE → Registry | 迁 crawler、scripts、sources、schema、taxonomy、站点和 workflow，完成后归档。 |
| `claude-skill-registry-data` | KEEP / 基础数据 | 只存原始正文、metadata、内容哈希、source commit、license 和抓取时间。 |
| `claude-skill-manager` | MERGE → Loom | 迁 manifest、shard、gzip、search/info/resolve；生命周期和投影改用 Loom。 |
| `dsh-plugin-registry` | KEEP | 保持 DSH 专属 schema；补签名、权限、兼容和精确 commit 证明。 |
| `vibeguard` | KEEP / 旗舰 | 唯一运行时规则、Hook、Guard 和审计平台。 |
| `verdict` | SPLIT MERGE / 用户实验仓 | 已核实为用户账号下的非 fork 原创实验。`scan/pin/watch/attest` 进 Loom，trajectory audit 进 VibeGuard；不补齐独立产品路线，迁移验收后归档。 |
| `specrail` | RETIRE / 已归档 | 模板进 Spellbook，验证规则进 flowguard，threads 集成进 threads。 |
| `anosome-workflow` | MERGE → Spellbook | 唯一 release-readiness workflow 迁入对应 Skill reference，随后归档。 |
| `agent-patterns` | MERGE → Spellbook | 合并重复 pattern；不保留孵化器品牌。 |
| `test-loop` | SPLIT MERGE | 确定性检查进 VibeGuard，说明性流程进 Spellbook；禁止迁入 `eval` 命令执行。 |
| `workspaceguard-mcp` | FREEZE → RETIRE | 只在 Harness 确认缺失时提取路径 containment、timeout/redaction、evidence freshness 契约。 |
| `awesome-goal-prompts` | KEEP / 内容库 | 维护 CC0 catalog、provenance、来源检查和 runtime import；不发展成控制面。 |
| `awesome-grok-bot` | KEEP / 内容目录 | 不占旗舰或 active-roadmap 名额。只维护官方 share link、来源、权限说明和导入后安全验证；条目必须经过真实 import 与 `first_safe_task` 才能标记 verified。90 天内没有外部提交或稳定采用时冻结，不扩成第二个 Skill Registry。 |

### 5.3 记忆、会话、任务与使用量

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `remem` | KEEP / 旗舰 | 唯一 coding-agent raw transcript、source、host、memory、检索和记忆注入审计事实源。 |
| `refine` | KEEP / 上层产品 | 保留浏览器来源、认知 observation、趋势、画像、建议和派生知识；所有 coding session 输入改用 Remem 稳定 ref/hash，停止第二份 coding-agent transcript、collector 和原文搜索事实源。 |
| `stash` | KEEP / 条件旗舰 | 唯一任务、项目、Today 和最终完成决策工作台。 |
| `keepline` | DEFER / 后续拆分 | 本轮不要求 Stash 或 Harness 接管。session identity 和历史搜索改用 Remem；live runtime、process attribution、session recovery、terminal launch 待 Stash 最小状态模型稳定后再决定是否迁入；不迁 memory、usage parser、work-item 和旧 UI。 |
| `chat-archive-rs` | MERGE → Remem | 迁 lossless backup、压缩、加密、hash-chain、verify、restore；不保留第二个 collector/daemon。 |
| `ccstats` | KEEP / 基础 SDK | 唯一 provider parser、dedup、token accounting、pricing、quota 和 model switch detector。 |
| `quotabar` | KEEP / GUI 产品 | 收敛到单一已发布 ccstats 依赖；实现模型切换、额度预测和 native alert。 |
| `cc-model-watch` | MERGE → ccstats + QuotaBar | 比较逻辑进 ccstats，通知进 QuotaBar；随后归档。 |
| `ccp` | KEEP / 孵化 | 只做 profile、secret、launch；删除 usage parser，不扩成 session dashboard。 |
| `gh-mine` | FREEZE | 只修 GitHub API 兼容、分页完整性和安装发布。 |
| `open-source-repo-ledger` | MERGE → profile-control-plane | 迁 readiness model、blocking reasons 和 renderer，随后归档。 |
| `profile-control-plane` | KEEP | 停止新增主题；提供 audit、建议展示/隐藏的 YAML diff 和 publish dry-run。 |

### 5.4 开发者工具与分发

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `argus` | KEEP | 安装前供应链扫描；发布 SARIF、真实恶意包 benchmark 和 Homebrew formula。 |
| `rclean` | KEEP | 保持可重建产物边界；补 plan diff、graveyard verify 和 restore dry-run。 |
| `jsonrepair-rs` | KEEP / 推广库 | 增加 WASM/npm wrapper、真实 malformed corpus；有证据后再做 streaming parser。 |
| `rnk` | KEEP / 推广库 | 冻结稳定 API、定义 core widgets、补终端兼容矩阵，向 1.0 推进。 |
| `rui` | FREEZE | 只修安全、依赖和 macOS 兼容；两个季度无真实消费 App 就归档。 |
| `filament` | RETIRE | 把被使用的组件复制进唯一真实 Web 产品；无消费方则直接归档。 |
| `rekey` | RETIRE | 先发布系统 CA 卸载说明；不迁 MITM CA、无鉴权 dashboard 和自建 vault。 |
| `llm-launchpad` | FREEZE | 固定为带测试日期的 Apple Silicon 配方，只修安全和失效问题。 |
| `spaceview` | RETIRE | 不并入 rclean；只保留 treemap/benchmark 参考，说明缓存清理后归档。 |
| `rust-windows-app` | RETIRE | 历史学习样例，直接归档，不迁提交的二进制。 |
| `caff` | KEEP | 补签名/notarize、lease refcount 和崩溃恢复诊断。 |
| `homebrew-tap` | KEEP / 唯一分发仓 | 吸收 Caff、rclean、Sage，增加 audit/style/install/checksum CI。 |
| `homebrew-caff` | MERGE → homebrew-tap | 迁 Cask、更新安装说明，观察一个发布周期后归档。 |
| `homebrew-rclean` | MERGE → homebrew-tap | 迁 Formula 和 release workflow，随后归档。 |
| `homebrew-sage` | MERGE → homebrew-tap | 迁 Formula 和 Sage 发布目标，随后归档。 |

### 5.5 内容、发现与发布

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `rss-scout` | KEEP | 先修 RustSec CI；统一 SourceAdapter、标准条目 schema、二进制 Release 和 doctor。 |
| `techpulse` | MERGE → rss-scout | 以真实实现分支为源迁 HN、Trending、Lobsters、Reddit adapter；不迁第二套 RSS/daemon/storage。 |
| `resnode-radar` | KEEP / maintenance | 补稳定 product identity、唯一性校验、adapter fixtures、source freshness 和变更历史。 |
| `blog` | KEEP | 唯一长内容、canonical、RSS 和 content index 发布源。 |
| `docsite` | RETIRE | 只有真实导入需求时才迁自包含 HTML 打包；不迁 Caddy、rsync、hooks 和自动猜 metadata。 |
| `shipwise` | KEEP | 唯一开源发布与 discoverability 产品；实现 init、check 和 GitHub Action。 |
| `seo-agent-suite` | MERGE → Shipwise | 将 plugin、Skills、scripts、tests 移入 Shipwise 单目录，发布后归档。 |
| `majiayu000` | KEEP / Profile | 只展示 Start here、3–6 个旗舰和 Blog 最新内容，不保存第二份项目介绍。 |
| `cre-om-citation-docs` | RETIRE | 迁入真实 CRE/OM 产品文档或提炼为脱敏 Blog case study。 |
| `looper-public` | FREEZE | 只修高危安全问题；90 天内不能建立可靠 private → public projection 就归档。 |
| `twitter-mcp` | RETIRE / 已归档 | 不迁 Cookie、selector 和浏览器自动发布；通用修复回馈上游。 |

### 5.6 AI 应用与展示

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `autodify` | KEEP / 专业工具 | 收窄为 Dify DSL 编译器；补真实 import round-trip、自然语言 diff/edit 和首个 Release。 |
| `codia` | KEEP / 孵化 | 只闭环真实 TTS、音频驱动嘴型、统一 provider 和可控记忆 MVP。 |
| `terminal-namer-vs-plugin` | KEEP | API key 迁 SecretStorage；发送前脱敏和预览；远程模型显式 opt-in。 |
| `warp-celestial` | KEEP | 做第二台干净 Mac 安装烟测、GPU benchmark 和上游兼容 Release。 |
| `crypto-coin-ticker` | KEEP / maintenance | 先修 glib 安全告警并发布签名跨平台二进制，再转低频维护。 |
| `hongbao` | FREEZE | 更新 README 为真实能力，作为季节性 Demo；不并入 Codia。 |
| `chatgptcli` | MERGE → OpenCLI | 迁 ChatGPT ask adapter、结构化输出和登录诊断，删除独立包。 |
| `chatgpt-for-desktop` | RETIRE | 不迁明文凭据、自动登录、验证绕过或 WebView 注入。 |
| `ai-manju` | MERGE → Spellbook | 迁剧本、分镜、角色一致性和提示词；不迁假成功 pipeline、旧 provider 和 mock 评分。 |
| `StarLight` | RETIRE | 只挑仍准确的原创内容进 Blog；不迁 Notebook、数据库和媒体 dump。 |
| `claude-code-anime-sounds` | RETIRE | 不迁来源和授权不明确的音频；若未来有通知 host，只重写事件主题映射。 |

### 5.7 游戏与视觉实验

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `games-monorepo` | KEEP | 修 workspace、唯一 lockfile、root commands、CI、LICENSE；只做 app-level monorepo。 |
| `werewolf-nakama` | RETIRE | 与 monorepo 内版本逐文件相同；加 canonical 指向后直接归档。 |
| `game-dice` | MERGE → games-monorepo | 先补减骰、淘汰、胜利、规则和断线重连测试，再迁入统一 multiplayer runtime。 |
| `timberman-game` | MERGE → games-monorepo | 先去 Timberman 品牌和视觉，重命名后只迁核心玩法、回放、分享和高分。 |
| `voxel-dungeon` | KEEP | 独立 3D 游戏；做 daily seed、手柄/触屏、第二 biome/Boss 和性能 gate。 |
| `leidian` | KEEP / benchmark | 改名 `vertical-shooter-benchmark`；记录 prompt/model/version/hash，自动生成 manifest 和统一 smoke/FPS 评测。 |
| `leidian-codex` | RETIRE | 核心文件与 `leidian/models/codex` 相同，直接归档。 |
| `mysterious-revival` | RETIRE / 转私有 | 不迁小说名、角色、怪物、文本和具体规则；未来只能做完全原创的新项目。 |
| `neural-cinema` | FREEZE / 展示 | 保持独立 Pages；只做可分享 preset、无障碍说明和导出，不产品化。 |

### 5.8 历史与旧样例

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `Binance-api` | RETIRE | 不迁；README 标明实验性且不可用于生产。 |
| `agent` | RETIRE | 空壳调度器不迁，只指向现有 Agent runtime。 |
| `bookmark-1130` | RETIRE | 先关闭仍在线的 Pages 和 deployment，再归档或转私有。 |
| `chat-pdf-viewer` | RETIRE | 旧 LangChain/OpenAI Demo，无独特资产，不做兼容迁移。 |
| `echart-use-flask` | RETIRE / 安全优先 | 先轮换 Oracle 凭据、扫描历史，再归档；不迁旧 Flask/Oracle 练习代码。 |
| `es-client` | FREEZE | 保持归档；若未来重做，只参考领域模型和信息架构，重写凭据存储与 Tauri 边界。 |
| `fastapi-starter` | RETIRE | 不再维护万能模板；硬编码 Redis 凭据必须视为已泄露。 |
| `go-web-starter` | RETIRE | 不拆新库；真实服务需要时只按需复制单个模块并补测试。 |
| `myweather` | RETIRE / 隐私优先 | 删除 Secrets、轮换 SMTP、禁用 Actions、处理公开个人收件信息。 |
| `pycheckio-solutions` | RETIRE | 保留为个人学习历史，不作为库推广。 |
| `pypackage-sample` | RETIRE | 指向 PyPA 官方模板，不迁旧 setup.py/Twine 教程。 |
| `question-search-go` | RETIRE | `go-web-starter` 的残缺复制，直接标记未实现并归档。 |
| `rs-view` | RETIRE | Actix/Diesel 骨架无迁移价值。 |
| `sse-fast-chat-server` | RETIRE / 最高安全优先级 | 立即 revoke/rotate Azure OpenAI 凭据；扫描历史后转私有或删除，不复制旧 SSE 服务。 |
| `starship-old` | FREEZE → RETIRE | 只迁 review domain、SAT adapter 和内容 renderer；不迁题库备份、二进制、starter 和无关分支。 |

### 5.9 DSH Desktop

| 仓库 | 裁决 | 迁移或下一步 |
|---|---|---|
| `dsh-desk` | 90 天验证 | 只做 Windows Authenticode、stable channel/原子回滚、诊断/安全模式/脱敏支持包和可信插件目录。达到持续自然下载且至少 10 个非作者互动或 3 个外部贡献者才继续；否则迁出兼容证据后归档。 |

## 6. P0 安全、隐私和法律事项

这些事项先于任何推广、合并和 README 美化。

### P0-1 凭据

- [ ] revoke/rotate `sse-fast-chat-server` 暴露的 Azure OpenAI 凭据；
- [ ] rotate `echart-use-flask` 暴露过的 Oracle 凭据；
- [ ] 检查并轮换 `fastapi-starter` 中的 Redis 凭据；
- [x] 删除 `myweather` 仓库中的 `USERNAME`、`PASSWORD` Secrets；
- [ ] 由 SMTP 凭据所有者确认旧凭据已失效；
- [x] 为四个凭据相关仓库启用 GitHub 标准 Secret Scanning；当前公开告警为 0；
- [ ] 对上述仓库执行完整 Git 历史 secret scan；
- [ ] 确认默认分支不再包含有效凭据；
- [ ] 对继续公开且含敏感历史的仓库评估转私有或删除，而不是只 Archive。

禁止在记录、Issue 或迁移 PR 中复制任何密钥值。

### P0-2 仍存活的外部面

- [x] 关闭 `bookmark-1130` GitHub Pages，并实测旧 URL 返回 HTTP 404；
- [x] 保留其历史 deployment/environment 作为审计证据；Pages 配置已删除；
- [x] 禁用 `myweather` Actions；
- [ ] 检查所有退役仓的 Webhook、Deploy Key、Secrets、自定义域名和 Pages；
- [ ] 实测其余旧部署已经不可访问，而不是只观察 GitHub Archived 标记。

### P0-3 版权、商标和数据授权

- [ ] 将 `mysterious-revival` 转私有或退役，不继续公开原著角色和设定；
- [ ] `timberman-game` 去名称、角色、视觉和整体形象后才允许迁移；
- [ ] `leidian` 改为通用 vertical shooter benchmark 名称；
- [ ] 删除 `voxel-dungeon` description 中不必要的具体商标引用；
- [ ] 审核 `starship-old` 题库备份的数据来源和公开授权；
- [ ] 核查 `claude-code-anime-sounds` 音频来源和许可证，不明确时不迁移。

### P0-4 Public source 与 OSS

公开可读不等于规范开源。对计划继续推广或接收贡献的仓库：

- [ ] 增加明确 LICENSE；
- [ ] 检查 README、package metadata 与 LICENSE 一致；
- [ ] 增加安全报告方式；
- [ ] 明确支持状态和 Release 渠道；
- [ ] 对纯数据、展示和历史仓明确其非产品身份。

## 7. 执行阶段

### Phase 0：安全止血

完成门槛：

- 凭据所有者确认 rotate/revoke；
- 公开部署与 Actions 实际停止；
- 历史 secret scan 有结果；
- 无授权或敏感仓已转私有、删除或明确隔离；
- 默认分支不再暴露有效秘密。

### Phase 1：建立唯一 successor

#### Phase 1A：先完成 Remem–Refine–VibeGuard 主链

这是当前应优先执行的收敛批次，不等待 Stash/Harness 完成。

截至 2026-08-30 的实时执行状态：

- Remem [PR #1054](https://github.com/majiayu000/remem/pull/1054) 已合并，稳定 host-bound `session_ref`、content hash 和精确 message snapshot contract 已进入 `main`。
- Refine [PR #206](https://github.com/majiayu000/refine/pull/206) 已合并，coding-agent transcript 已改为 Remem 单一事实源，第二份 raw body 和本地 provider fallback 已移除。
- 2026-08-31 本机验收已安装 source-built Remem `0.6.84`，worker 正常运行；生产查询返回 5 个带稳定 ref/hash 的 `codex-cli` 会话，并保留、显式报告 3,193 行（220 个 session）无法恢复身份的旧数据。修复提交为本地 `43a6c190`，尚未推送或形成 upstream issue-close proof。
- 同日已从 Refine `origin/main` 的 `5707d20` 完成全量测试、clippy、本机安装、真实 Remem-only dry-run 和缺失 provider 故障注入；没有 local fallback，也没有 dry-run 写入。无人值守非 dry-run 仍因本机没有授权的 LLM provider 凭据而阻塞，#203/#204 尚不能据此关闭。

1. 冻结重复写入
   - Refine 不再新增 transcript/session 存储能力；保留现有读取只用于迁移验收。
   - Keel 不再扩展聊天目录扫描器。
   - Keepline 不再扩展跨会话 memory 和 usage parser。
2. 固化 Remem consumer contract
   - 对外只承诺 `session_ref`、`message_ref`、source/host、content hash、分页读取和明确错误语义。
   - 提供 Refine 使用的 contract tests；不要为了兼容旧扫描器增加 alias 或 fallback。
3. 切断 Refine 的重复事实源
   - `ingest-sessions` 只从 Remem 读取；移除 `--legacy-local-scan`，不保留长期回滚开关。
   - observation 必须记录 Remem 输入引用、分析器版本和输出 hash。
   - Refine 对 coding-agent 数据只搜索派生 observation；原始编码会话检索跳转到 Remem。浏览器来源仍按 Refine 自己的边界检索。
4. 合并 Remem 的直接附属能力
   - 第一小批迁 `remem-web`，放入 Remem 仓内并沿用现有 REST 边界。
   - 第二小批迁 `chat-archive-rs` 的 backup/verify/restore；不迁它的第二套 collector/monitor 数据面。
   - 每小批都必须先通过 fresh install、引用一致性和真实 restore drill，再归档来源仓。
5. 收拢认知治理
   - 将 Keel 中仍有真实使用价值的指标、约束生命周期和人工批准提案并入 Refine。
   - Refine 只产生治理建议；VibeGuard 只接受人工批准后的规则变更。
6. 结束 Verdict 实验
   - Loom 接管 capability contract、content hash、pin/watch/attest。
   - VibeGuard 接管 runtime trajectory audit。
   - 两边均有 successor commit 和验证后归档 Verdict，不实现它尚未完成的独立 CLI 路线图。
7. 最后再决定 Keepline
   - 先让 Keepline 的 session/history 视图消费 Remem，而不是迁库。
   - Stash 的最小 task/session 状态模型和恢复动作验证通过后，只迁 live runtime 与恢复动作。
   - 如果该状态模型仍不成立，Keepline 保持 maintenance freeze，不为了“完成合并”把它接到 Harness。

完成门槛：

- 同一条 coding session 只存在一个原始事实源，Refine 和 VibeGuard 均能通过稳定引用回到 Remem；
- 删除 Refine、Keel、Keepline 的新增重复 collector 路径，没有 silent fallback；
- Refine 可以从全新 Remem 数据完成一次认知分析，并展示每条 observation 的来源；
- 一条人工批准的 Refine 治理建议能形成可审阅的 VibeGuard 规则变更，但不会自动生效；
- `remem-web` 和 backup/restore 在 Remem 内完成真实 E2E 后，才归档来源仓；
- Stash 和 Harness 即使尚未成熟，也不阻塞以上验收。

第一批：

1. Registry 主仓 + Core + Data；
2. Harness + agent-harness + auto-contributor；
3. Homebrew Tap + 三个分散 Tap。

第二批：

1. Spellbook + agent-patterns + anosome-workflow；
2. Loom + claude-skill-manager + Verdict provenance；
3. VibeGuard + test-loop + Verdict runtime audit。

第三批：

1. Remem + remem-web + chat-archive-rs；
2. Refine + Keel；
3. ccstats + QuotaBar + cc-model-watch。

Keepline 不再列入这一批。只有 Stash 的最小状态模型和恢复动作先通过独立验证，才另开迁移批次；Harness 不作为该决策的默认 runtime。

第四批：

1. rss-scout + techpulse；
2. Shipwise + seo-agent-suite；
3. games-monorepo + game-dice + 去品牌后的 timberman。

完成门槛：

- 每项迁移存在 successor commit；
- successor 已发布新版本；
- fresh install 和迁移 E2E 通过；
- 旧仓 README/About 指向唯一 successor；
- package manager 标记 deprecated 或更新安装路径；
- 旧仓不再被 installer、registry、Skill 或文档投影；
- 不创建兼容 shim、alias table、旧数据 backfill 或迁移平台。

### Phase 2：产品可靠性

完成门槛：

- 每个主推产品至少有一个真实用户流程 E2E；
- 所有声称可安装的平台都有 fresh-install smoke；
- 用户可见错误 fail closed，不返回空成功或 warning + fallback；
- 主分支 CI 绿色；
- README 明确当前能力和限制；
- Release、包管理器和文档版本一致。

### Phase 3：推广

每次只推广一个仓库。进入推广前必须具备：

- 清楚的一句话定位；
- 一个可复制的安装命令；
- 一个 30–60 秒无剪辑成功演示；
- 一个公开、可重复的 benchmark 或 acceptance proof；
- 签名 Release 或稳定包管理安装；
- 连续 30 天核心 CI 正常；
- 十分钟内可完成 Quickstart；
- 明确竞争差异；
- 有能力响应外部安全问题和回归。

## 8. 统一退役流程

每个需要退役的仓库遵循以下顺序：

1. 确定唯一 successor，或明确没有 replacement。
2. 固定默认分支 SHA、非默认分支、tag、release 和仍在线的部署面。
3. 先处理凭据、数据授权、Pages、Actions、Webhook 和 Secrets。
4. 只迁移已经列入白名单且有真实消费者的能力。
5. successor 发布新版本并完成 fresh-install/migration E2E。
6. README 和 About 增加 superseded/unsupported 提示。
7. 关闭或转移 Issue、Discussion 和包管理入口。
8. 验证旧入口不会重新安装、投影或启动退役代码。
9. 最后执行 GitHub Archive。

归档不等于删除，也不等于秘密已失效。默认保留历史、tag 和 release；只有涉及有效秘密、无授权数据或明确法律风险时，才单独评估转私有、历史重写或删除。

统一 README 模板：

```md
# <repository-name>

> Archived on <YYYY-MM-DD>. This repository is read-only, unsupported,
> and is not recommended for new production use.

## What this was

<一句话说明原实验或产品用途。>

## Why it was archived

- <重复、未完成、依赖过时或已被替代的具体原因>
- No new features, compatibility work, or security fixes are planned.

## Replacement

Use <canonical repository or official upstream> instead.

## Migration note

<只列已经迁移完成的能力和链接；没有迁移就明确写 None。>

## Security and support

Do not deploy this repository as-is. Public issues and pull requests are not
actively monitored. Previously exposed credentials must be considered revoked.
```

## 9. 禁止事项

- 不建设 `litellm-rs + Sage + Harness + Remem + VibeGuard + Spellbook + Stash` 巨型 monorepo。
- 不让 Refine 保存原始 transcript 或失败后回退到本地原文扫描。
- 不为 Argus 和 VibeGuard 新建共享规则引擎。
- 不把 WorkspaceGuard 整套骨架迁入 Harness。
- 不重建万能 FastAPI、Go 或全栈 starter。
- 不为退役仓增加兼容层、alias、旧数据 backfill 或迁移框架。
- 不新建 portfolio control plane；一张带 GitHub 证据链接的 tracker 足够。
- 不用 Issue 数量、规则数量、provider 数量或 Skill 数量代替用户验证。
- 不在 successor 发布并通过迁移 E2E 前归档来源仓。

## 10. 当前状态

本文件起初记录只读审计和决策建议。2026-08-31 已执行第一批 GitHub 侧安全止血：

- 已关闭 `bookmark-1130` Pages，旧 URL 返回 HTTP 404，仓库保持 Archived；
- 已删除 `myweather` 的两个旧仓库 Secrets，并禁用 Actions；
- 已为四个凭据相关仓库启用 GitHub 标准 Secret Scanning，当前公开告警为 0；
- provider 侧 Azure、Oracle、Redis、SMTP 凭据是否已吊销仍未取得证明。

仍未执行以下动作：

- 没有 revoke 或 rotate 任何凭据；
- 没有关闭其余 Pages、Actions、Webhook 或部署；
- 没有修改、归档、转私有或删除任何 GitHub 仓库；
- 没有发布 Release；
- 没有创建迁移 PR、Issue 或包管理器 deprecation。

涉及远端归档、发布和公开迁移的动作必须先完成 Phase 0 安全止血。当前可以直接开始 Phase 1A 的 contract、重复写入清理和本地 E2E，不需要等待 Stash 或 Harness。
