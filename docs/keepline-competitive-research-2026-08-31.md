# Keepline 竞品、交互与产品方向调研

调研日期 2026 年 8 月 31 日

调研对象 Keepline，用户口述中的 KeepPlan 按当前仓库和工作分支语境解释为 Keepline

证据口径 以官方产品文档、官方代码仓库、许可证和本地实现为主。功能结论分为已核验、推断和未知三类。没有一手材料支撑的产品能力不写成事实。GitHub 星标和价格只作为当日快照，后续会变化。

## 一页结论

Keepline 所在的市场已经分成四条路线。

第一条路线是终端会话管理器。Agent Deck、CCManager、Claude Squad 和 cmux 都在解决多会话切换、等待提醒和终端持久化。它们通常要求用户从产品里启动 Agent，随后用 tmux、PTY 或自带终端接管会话。

第二条路线是工作区编排器。Vibe Kanban、Conductor、Agor、cdesktop 以及 GitHub Copilot App 把任务、Git worktree、Agent 会话、Diff、测试、PR 和合并串成一条流程。这里的核心对象已经从会话变成了可交付的工作分支。

第三条路线是模型厂商自己的 Agent 工作台。Claude Code Desktop 和 Agent View、OpenAI Codex App、Cursor Cloud Agents、Warp 都能管理并行 Agent。厂商可以直接拿到准确的运行状态、权限请求、上下文和恢复能力，第三方工具很难在单一运行时上取得同等深度。

第四条路线是历史与可观测性。ClaudeStudio、AgentDeck History、ccusage、Langfuse、Phoenix 和 LangSmith 关注搜索、回放、成本、轨迹和评估。它们解决的是会话结束后怎样理解工作，和 Keepline 最早的实时监控问题有一部分重叠。

Keepline 继续做全能控制台会同时撞上这四条路线。当前 Web 导航已经包含 Overview、Work、Sessions、Projects、Plans、Memory、Analytics 和 Terminal，产品对象过多。用户打开它以后，需要先理解八种信息架构，再判断眼前哪一个会话值得处理。

最有价值的收敛方向是跨运行时会话连续性层。它在后台发现用户从任意终端、IDE 或脚本启动的 Claude Code 和 Codex，会把进程、会话文件和 Hook 事件归为同一个会话，告诉用户谁正在工作、谁在等他、谁意外消失，并提供跳回、继续和恢复动作。

这个方向有五个理由。

1. 多数竞品只可靠地管理由自己启动的会话，旁路发现仍然稀缺。
2. 单一厂商产品只看得到自己的运行时，跨 Claude Code 和 Codex 的统一视图仍有空位。
3. Keepline 已经有进程扫描、会话文件解析、进程归因、五态状态模型和恢复命令，重做成本较低。
4. Stash 需要的正是任务旁边的一小块实时 Agent 状态，并不需要另一套完整 Agent IDE。
5. 历史、记忆、用量和任务已经分别有 Remem、ccstats 和 Stash 作为更合适的事实源。

最终建议采用收敛式适配。

| 决策 | 内容 |
|---|---|
| 采用 | 借鉴 cmux 的注意力提示、CCManager 的忙碌与等待可视化、Claude Desktop 的结果摘要与 Diff 分层、Conductor 的工作区归属表达 |
| 适配 | 保留 Keepline 的跨运行时发现、状态证据、进程归因和恢复，把它们做成薄本地服务与 Stash 的次级界面 |
| 自建 | 只自建厂商产品难以提供的统一会话身份、旁路发现、置信度和恢复路由 |
| 放弃 | 不再扩展任务板、记忆、用量解析、通用终端、Git worktree 编排、Diff 审阅、团队协作和第二套会话历史库 |

## Keepline 当前到底是什么

本地仓库把 Keepline 定义为面向 Agent CLI 重度用户的命令中心。它支持 Claude Code 和 Codex，功能包括实时会话监控、丢失会话恢复、用量和费用、跨会话记忆、计划追踪、Web UI、终端 UI、后台守护进程和本地 API。这个定义可以在 [Keepline README](../../keepline/README.md) 和 [Keepline 仓库说明](../../keepline/AGENTS.md) 中核验。

从实际代码看，产品已经走得比 README 更远。

| 当前模块 | 已核验的实现 | 对用户的意义 | 主要问题 |
|---|---|---|---|
| Overview | Orchestrator 注意力队列、分数、原因、意图摘要和操作按钮 | 帮用户决定先看哪个会话 | 与 Sessions、Work、Plans 的职责容易重叠 |
| Work | 工作项和 Agent 证据 | 把任务与会话挂在一起 | 与 Stash 的事实源冲突 |
| Sessions | 状态、运行时、PID、目录、工具、消息、最后回复、用量和子 Agent | 查看所有会话及其细节 | 卡片信息很重，默认界面难以扫读 |
| Projects | 按项目聚合会话和费用 | 找到某个项目的工作 | 项目已经同时出现在 Stash 和会话目录里 |
| Plans | 读取并展示 Agent 计划 | 查看执行阶段 | 不同运行时的计划语义不稳定 |
| Memory | 保存跨会话进度 | 恢复上下文 | 与 Remem 重复 |
| Analytics | Token、费用和趋势 | 了解资源消耗 | 与 ccstats 重复，价格表维护成本高 |
| Terminal | 浏览历史会话、新建 PTY、恢复并交互 | 留在 Web UI 内继续操作 | 引入高风险的远程命令和认证边界 |

Keepline 当前的五个底层状态是 running、waiting、idle、lost 和 completed。会话恢复会根据源文件和工作目录，选择 resume、continue 或 new，并按运行时生成 Claude Code 或 Codex 的参数数组。这个能力已经有实际代码支撑，见 [状态呈现](../../keepline/src/domain/session/status-presentation.ts)、[运行时描述](../../keepline/src/domain/runtime/descriptors.ts) 和 [恢复服务](../../keepline/src/services/recovery.service.ts)。

Stash 现有集成规格已经给出了更小的产品边界。Stash 保持用户可见的任务规划器身份，Keepline 只提供本地 Agent 运行态；Stash 首屏不等待 Keepline，数据过期时不得冒充实时数据，Agent 也不能自动完成或重排任务。见 [Stash 与 Keepline POC](SPEC_stash_keepline_poc.md)。

## 市场地图

### A 类直接竞品

这些产品与 Keepline 一样，直接处理本地 Agent CLI、多会话、状态或恢复。

| 产品 | 开放方式 | 主要界面 | 核心对象 | 最强能力 | Keepline 可以学什么 | Keepline 不应照搬什么 |
|---|---|---|---|---|---|---|
| [Agent Deck](https://github.com/asheshgoplani/agent-deck) | MIT，813 星 | TUI、Web、远程控制 | 会话 | 多运行时状态、分组、搜索、Fork、远程会话、成本 | 一键进入会话、全局搜索、状态 Hook、远端会话列表 | MCP、Skill、成本、Conductor 全部塞进一个产品 |
| [CCManager](https://github.com/kbwo/ccmanager) | MIT，1229 星 | TUI | 项目和 worktree 会话 | 不依赖 tmux，支持八类 CLI，显示 busy、waiting、idle | 极简状态菜单、按运行时配置检测策略、项目级配置 | 自动批准和复制会话目录 |
| [Claude Squad](https://github.com/smtg-ai/claude-squad) | AGPL 3.0，8393 星 | TUI | 任务实例 | tmux 持久化、worktree 隔离、预览和 Diff | 会话列表与预览、Attach 和 Detach 的低成本流程 | 把 worktree 和推送流程并进 Keepline |
| [cmux](https://github.com/manaflow-ai/cmux) | GPL 3.0 或更高版本，26604 星 | 原生 macOS 终端 | 工作区和 Pane | 注意力光环、通知收件箱、分栏、浏览器、可编程 Socket | 用视觉边缘提示谁需要用户，不打断当前工作 | 自建终端、浏览器和布局系统 |
| [Happy](https://github.com/slopus/happy) | MIT，23556 星 | 手机、Web、桌面、CLI Wrapper | 可远程接管的会话 | 推送通知、手机接管、端到端加密、Claude 与 Codex | 等待和错误的移动通知、桌面与手机的控制权切换 | 为移动端重建完整聊天和同步服务 |
| [cdesktop](https://github.com/cdesktop-ai/cdesktop) | Apache 2.0，108 星 | Web，Tauri 规划中 | 项目会话 | 五种 Agent、供应商切换、四分屏、Diff、预览和 PR | 会话侧栏、结果区和辅助面板的层级 | 再造 Claude Desktop 和 IDE |
| [Mirafold](https://github.com/mirafold/mirafold) | MIT，13 星 | Web | 会话 | 忠实呈现原运行时、多个浏览器观察端、Mission Control | 保留上游权限模型，不制造通用 Agent 替代层 | 生成式 UI 组件平台 |
| [Claude Code UI](https://github.com/siteboon/claudecodeui) | AGPL 3.0，13508 星 | Web 和移动端 | Claude 项目与会话 | 项目浏览、会话恢复、Git、终端、移动访问 | 从项目进入历史会话的路径 | 暴露通用 Shell。该项目曾出现默认密钥、WebSocket 鉴权和命令注入串联的高危公告，见 [GHSA 公告](https://github.com/siteboon/claudecodeui/security/advisories/GHSA-gv8f-wpm2-m5wr) |

当日星标来自 GitHub API，只表示社区可见度。Agent Deck 和 CCManager 的星标低于几个成熟项目，但两者在 2026 年 8 月仍有近期提交，功能也更贴近 Keepline 的核心问题。

### B 类工作区和交付编排器

这些产品把 Agent 会话纳入 Git 交付流程。它们与 Keepline 有交集，却采用了不同的产品锚点。

| 产品 | 开放方式 | 产品锚点 | 标准交互 | 可借鉴点 | 边界判断 |
|---|---|---|---|---|---|
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | Apache 2.0，27958 星，2026 年 4 月后未见新提交 | 任务尝试 | 建任务、建 worktree、运行 Agent、看日志、批准动作、看 Diff、继续追问 | 一个任务可以有多次尝试，过程和结果分开 | 属于任务编排，不应并入 Keepline |
| [Agor](https://github.com/preset-io/agor) | BSL 1.1，2029 年转 Apache 2.0 | Git 分支 | 在二维 Board 上管理分支、会话、环境和队友 | 用分支作为会话、环境和 PR 的共同身份 | 适合研究实体模型，不适合直接复用到竞品产品 |
| [Conductor](https://www.conductor.build/docs/concepts/parallel-agents) | 闭源，免费本地层和付费云协作 | 隔离工作区 | 新建工作区、选运行时、运行、测试、审阅、PR、合并或归档 | 清楚区分多个独立工作区和同一工作区里的协作 Agent | 它接管启动和交付，Keepline 应继续做旁路观察 |
| [GitHub Copilot App](https://docs.github.com/en/copilot/concepts/agents/github-copilot-app) | 闭源，随 Copilot 计划提供 | GitHub Issue 和 PR | 选 Issue、选模式与模型、建分支、运行、审阅、CI、合并 | 把 Agent 状态放进真实交付链，模式选择清楚 | GitHub 原生能力无法由 Keepline 低成本复制 |
| [OpenAI Codex App](https://openai.com/index/introducing-the-codex-app/) | 闭源客户端，Codex CLI 另行开源 | 项目下的线程 | 多线程并行、worktree 隔离、在线审 Diff、评论、应用改动 | 会话历史从 CLI 无缝进入 App，线程和项目层级清楚 | 单一 Codex 运行时有天然数据优势 |
| [Claude Code Desktop](https://code.claude.com/docs/en/desktop) | 闭源 | 会话工作台 | Chat、Diff、浏览器、终端、文件、计划、任务和子 Agent 可自由排布 | Normal、Verbose、Summary 三种结果密度，侧栏状态过滤，行级 Diff 反馈 | 已经覆盖 Claude 单运行时的大量高级需求 |
| [Cursor Cloud Agents](https://prod.cursor.com/docs/cloud-agent) | 闭源，付费计划加模型用量 | 云端 Agent | 从桌面、Web、手机、Slack、GitHub 或 API 发起，云 VM 执行，回来审阅 | 多入口归一到同一耐久 Agent，支持离线执行 | 面向云任务，不解决任意本地 CLI 的旁路发现 |
| [Warp](https://www.warp.dev/blog/reimagining-coding-agentic-development-environment) | 闭源 | Agentic Development Environment | 通用输入发起命令或 Agent，多线程列表，完成和求助通知，内置编辑与知识 | 输入统一、状态管理和系统通知相互配合 | 自有 Agent、终端和知识库形成封闭平台 |
| [crystl](https://www.crystl.dev/) | 闭源，免费与付费层 | 原生终端里的项目和 Shard | 项目 Dock、每任务 Shard、Action Panel、手机批准、worktree 和 Agent Party | 把批准、问题和通知抽成跨会话 Action Panel | 游戏化命名、角色系统和编排超出 Keepline 所需 |

### C 类历史、恢复和用量工具

| 产品 | 开放方式 | 主要能力 | 对 Keepline 的启发 | 推荐关系 |
|---|---|---|---|---|
| [ClaudeStudio](https://github.com/ingridtoulotte/claudestudio) | MIT，5 星 | Claude JSONL 的本地索引、全文搜索、回放、Diff、费用、恢复简报、MCP | 历史浏览适合三栏布局，搜索需要跳到命中消息，恢复简报应能解释来源 | 作为历史产品参考，不复制其数据面 |
| [AgentDeck History](https://github.com/lepfinder/AgentDeck) | MIT，1 星 | 六类 Agent 只读同步、SQLite、三栏浏览、Spotlight、备份、本地 API | 只读导入和独立索引比修改上游记录安全 | 与 Remem 的边界高度重叠 |
| [ccusage](https://github.com/ccusage/ccusage) | MIT，18231 星 | Claude Code 和 Codex 的本地用量、费用、报表和 JSON 输出 | 用量应成为独立库和稳定 JSON 契约 | 采用思路或 SDK，不在 Keepline 维护价格表 |
| [Langfuse](https://langfuse.com/) | MIT，自托管和云服务 | Trace、评估、Prompt、成本、数据集和实验 | 会话细节应沿事件树展开，成本和延迟可挂在 Span 上 | 面向自有 Agent 应用，不直接替代 CLI 发现 |
| [Phoenix](https://arize.com/docs/phoenix/) | 当前仓库采用 Elastic License 2.0 | OpenTelemetry 与 OpenInference Trace、评估和实验 | 标准化事件比逐个适配 UI 更耐久 | 适合未来接收 OTel，不宜作为当前依赖 |
| [LangSmith](https://www.langchain.com/langsmith/observability) | 闭源 SaaS | 多语言 SDK、Trace、监控、评估和团队协作 | Trace 列表加细节面板是成熟的调试模式 | 解决应用 Agent 可观测性，离 Keepline 核心较远 |

## 功能矩阵

符号说明 ● 表示官方资料明确支持，○ 表示部分支持或需要从该产品启动会话，空白表示没有查到可靠证据。

| 产品 | 旁路发现已有会话 | 多运行时 | 等待状态 | 丢失恢复 | 内嵌终端 | worktree | Diff 审阅 | 历史搜索 | 用量 | 手机 |
|---|---|---|---|---|---|---|---|---|---|---|
| Keepline | ● | ● | ● | ● | ● |  |  | ○ | ● |  |
| Agent Deck | ○ | ● | ● | ● | ● | ● |  | ● | ● | ○ |
| CCManager |  | ● | ● | ○ | ● | ● | ○ |  |  |  |
| Claude Squad |  | ● | ○ | ○ | ● | ● | ● |  |  |  |
| cmux |  | ● | ● | ○ | ● |  |  |  |  |  |
| Happy |  | ● | ● | ● | ○ |  | ○ | ● |  | ● |
| cdesktop |  | ● | ● | ● | ● | ● | ● | ● | ○ | ● |
| Claude Code Desktop | ○ |  | ● | ● | ● | ● | ● | ● | ○ |  |
| Codex App | ○ |  | ● | ● | ○ | ● | ● | ● | ○ |  |
| Conductor |  | ● | ● | ○ | ● | ● | ● | ● | ○ |  |
| GitHub Copilot App |  | ● | ● | ● | ● | ● | ● | ● | ○ |  |
| Cursor Cloud Agents |  |  | ● | ● | ○ | 云隔离 | ● | ● | ● | ● |
| crystl |  | ● | ● | ● | ● | ● | ○ | ● | ● | ● |
| ClaudeStudio | ● |  | ○ | 恢复简报 |  |  | ● | ● | ● |  |
| AgentDeck History | ● | ● |  |  |  |  |  | ● | ● |  |

这张表揭示了一个重要差异。Keepline 的稀缺组合来自旁路发现、多运行时、等待状态和丢失恢复同时成立。大多数强竞品能做到后三项，前提是会话从自己的 UI、tmux 或 Wrapper 中启动。Keepline 可以观察用户已经在别处启动的工作，这仍然有产品空间。

## 竞品怎样设计用户交互

### 入口选择

竞品常用四种入口。

终端入口适合键盘用户。Agent Deck、CCManager 和 Claude Squad 启动后先显示会话列表，回车 Attach，快捷键创建、Fork、删除或恢复。它们把学习成本压在快捷键帮助里，优点是快，缺点是新用户很难预先知道动作后果。

桌面工作区入口适合长时间监督。Codex App、Claude Desktop、Conductor 和 GitHub Copilot App 用项目或工作区侧栏组织线程，中间是对话和执行过程，右边放 Diff、终端、预览或文件。用户始终知道当前会话属于哪个代码副本。

任务板入口适合从需求出发。Vibe Kanban 用卡片承载工作，一个卡片下面允许多次 Agent 尝试。用户先决定做什么，再选择运行时。会话只是任务的一次执行记录。

注意力入口适合同时跑很多会话。cmux 的 Pane 光环、通知面板和 crystl 的 Action Panel 都把等待批准、问题和完成事件集中起来。用户不用逐个打开会话寻找求助信息。

Keepline 最适合第四种入口。它无须成为用户启动工作的地方，也无须抢占桌面主界面。它应当在有人需要处理时出现，平时安静待在菜单栏、Stash 的任务检查器或一个很薄的本地页面里。

### 列表怎样让人一眼看懂

成熟产品很少在默认列表里展示完整统计。最常见的一行信息包括会话名、项目或目录、运行时、当前状态、最近动作和更新时间。分支、PR、端口或费用只在当前产品以它为核心时出现。

Keepline 当前 SessionCard 默认展示状态、运行时、PID、标题、路径、工具数、消息数、最后工具、最近活动和 Token。展开后还有初始 Prompt、工具调用、最后回复、用量和子 Agent。信息都可能有用，放在同一张卡片里会削弱扫描速度。

更合适的默认行可以收敛成下面六项。

| 位置 | 内容 | 示例 |
|---|---|---|
| 状态点 | 用户语义状态 | 需要你、工作中、安静、已结束 |
| 主标题 | 当前任务或首个有效 Prompt 摘要 | 修复登录回调重复跳转 |
| 归属 | 仓库、分支和运行时 | stash、feature/auth、Codex |
| 当前动作 | 最后一个对用户有意义的动作 | 正在运行测试、等待命令批准 |
| 时间 | 状态变化后的时长 | 等待 2 分钟 |
| 主动作 | 当前最安全的一个动作 | 跳回、回复、恢复、查看结果 |

PID、消息数、工具数、原始路径和推断证据放进详情。它们适合诊断，不适合帮助用户排优先级。

### 状态怎样表达

厂商和第三方工具都逐渐从机器状态转向用户行动。

busy、running 和 working 说明 Agent 正在消耗时间。waiting、needs you 和 approval required 说明用户必须介入。idle、resting 和 quiet 表示会话还活着，当前没有任务。done、completed 和 exited 表示一次工作已经结束。lost 和 stalled 只在系统能给出恢复建议时有独立价值。

Keepline 可以保留现有五态作为内部状态，把用户界面改成四组。

| 用户状态 | 内部来源 | 默认动作 |
|---|---|---|
| 需要你 | waiting，或可恢复的 lost | 打开请求、跳回会话、恢复 |
| 工作中 | running | 查看最近动作、停止 |
| 安静 | idle | 继续、标记结束 |
| 已结束 | completed，或不可恢复的 lost | 查看结果、归档 |

每个状态旁边应显示证据来源和置信度。Hook 事件可以标成直接证据，PID 与会话 ID 对应可以标成进程证据，只凭目录和时间匹配时应标成推断。状态过期就明确显示上次确认时间，不能继续使用绿色实时标记。

### 详情怎样展开

Claude Desktop 的 Normal、Verbose 和 Summary 三种密度值得学习。用户监督十个 Agent 时想看结果，排查错误时才需要完整工具调用。Keepline 可以采用两级详情。

第一层是结果摘要。显示当前目标、最后进展、阻塞原因、改动文件和建议动作。数据来自运行时事件或 Remem 的稳定引用，Keepline 不保存第二份 Transcript。

第二层是原始证据。显示 PID、会话文件、Hook 事件、最后工具、时间戳和进程匹配理由。用户只有在状态看起来不对时才打开。

### 通知怎样避免打扰

cmux 和 Happy 都证明了通知的价值，好的通知只处理需要行动的变化。每次工具调用、Token 增长和普通输出都不应通知。

建议只保留四类通知。

1. Agent 请求批准或回答。
2. 长任务完成并有结果可看。
3. 活跃进程意外消失且可以恢复。
4. 状态判断发生冲突，需要用户确认。

多个会话同时求助时，通知应进入一个收件箱，按等待时长和任务优先级排序。不要连续弹出十条系统通知。

## 竞品背后的技术路线

### 路线一 从产品内启动并持有 PTY

Agent Deck、Claude Squad、CCManager、cmux、cdesktop 和 Conductor 都在不同程度上采用这条路线。产品创建 PTY、tmux Session 或工作区，因此天然知道会话 ID、目录、进程和退出状态。它也可以稳定地 Attach、Detach、发送输入和恢复终端。

优点是状态准确、交互完整。代价是用户必须改变启动习惯，产品还要承担终端兼容、Shell 注入、认证、目录权限、窗口尺寸和断线恢复。Claude Code UI 的安全公告说明了 WebSocket 终端边界一旦做错会发生什么。

Keepline 已经有 PTY 和 Web Terminal，但这条路会把它推向 Claude Desktop、cdesktop 和 Conductor 的正面战场。建议停止扩展通用终端，只保留用参数数组打开用户选定终端的恢复动作。

### 路线二 读取运行时落盘文件

Keepline、ClaudeStudio、AgentDeck History 和 ccusage 都会读取 Claude Code 或 Codex 的本地会话数据。它适合历史、用量、最后消息和文件改动，也能发现从别处启动的会话。

这类数据通常没有稳定的跨厂商契约，路径、字段和压缩方式会变化。文件最近写入也不能单独证明进程还活着。可靠实现必须把解析器版本、源文件身份和失败语义写清楚。

Remem 已经被确定为本地编码会话的原始历史事实源。Keepline 应消费 Remem 的 session_ref、source、host 和内容哈希，只保留运行态观察。这样可以避免两个 SQLite 库同时复制 Transcript。

### 路线三 使用 Hook 和事件

cmux、Agent Deck、ClaudeStudio 和 Keepline 都使用或支持运行时 Hook。Hook 可以准确告诉系统某一回合开始、结束、等待权限或会话退出，延迟低于文件扫描。

Hook 也有缺口。用户可能没有安装，旧会话没有事件，运行时升级后事件名会变，Hook 接收器也可能停机。正确设计是把 Hook 作为高置信度证据，不能在 Hook 缺失时静默伪装成同样准确的状态。

### 路线四 扫描系统进程并做归因

这是 Keepline 最有辨识度的一层。扫描系统可以发现用户在任何终端里启动的 Claude Code 和 Codex。难点在于同一目录同时运行多个会话时，PID 和会话文件并没有天然一一对应。Keepline 当前会综合运行时、目录、已知 PID、进程开始时间和候选会话做匹配。

这类推断必须向用户保留证据和置信度。错误地把 A 会话的进程归给 B，会导致错误停止和错误恢复，影响比少显示一条会话更大。无法唯一归因时应显示未关联进程或待确认会话，不要猜一个看起来合理的答案。

### 路线五 使用厂商 SDK、API 或云任务

Codex App、Claude Code、Cursor、GitHub Copilot 和 Warp 掌握运行时内部状态。它们可以准确呈现权限、计划、上下文、Diff 和完成事件。Cursor 还把耐久 Agent、每次运行、SSE 重连和终态做成 API。

第三方产品很难用文件和进程扫描完全追平这类准确度。Keepline 的竞争策略应利用跨运行时和旁路发现，避免在单个运行时细节上追逐厂商全部功能。

### 路线六 使用 OpenTelemetry 和 Trace

Langfuse、Phoenix 和 LangSmith 以 Trace、Span、事件和评估为中心。它们很适合开发者自己构建的 Agent 服务，因为应用可以主动埋点。Claude Code 和 Codex 的个人 CLI 会话未必提供完整 OTel 数据。

Keepline 可以在未来接受标准事件，但当前没有必要为了兼容可观测性平台重建采集链。最小做法是让内部观察事件有稳定字段，并允许本地 API 输出。等运行时官方提供 OTel，再加一个输入适配器。

## 值得直接学习的产品细节

### 注意力收件箱

cmux 的通知面板和 crystl 的 Action Panel 都把跨会话介入请求放在一起。Keepline 已经有 Orchestrator Queue，可以删掉评分仪表盘，把它改成更朴素的收件箱。

每条收件箱记录只回答三件事。

1. 哪个会话需要我。
2. 它为什么需要我。
3. 我现在能做什么。

分数只在排序算法内部使用。用户看到 82 分通常不知道它比 79 分重要在哪里。等待 18 分钟、需要命令批准、关联 P0 任务，这些理由更有用。

### 会话恢复的分级动作

Keepline 现有 resume、continue 和 new 三种恢复方式合理，但名称对普通用户太接近。建议改成结果导向的文案。

| 技术动作 | 用户文案 | 说明 |
|---|---|---|
| resume | 恢复原会话 | 使用原运行时和原会话 ID，保留完整上下文 |
| continue | 在原目录继续 | 原会话不可恢复时，从该目录最近上下文继续 |
| new | 新开会话并带入摘要 | 建立新会话，只带经过确认的目标和进展摘要 |

系统先推荐一个动作，其他方式放进二级菜单。每个选项都说明将打开哪个运行时、哪个目录，以及会不会创建新会话。

### 结果密度切换

Claude Desktop 的 Summary 很适合监督场景。Keepline 默认只展示最终回复、改动摘要、测试结果和阻塞。原始工具调用放在诊断层。这样既能保留证据，又不会让十个会话变成十面滚动日志墙。

### 项目归属与分支归属

Conductor 和 GitHub Copilot App 都让用户随时知道会话属于哪个代码副本。Keepline 即使不管理 worktree，也应显示仓库根目录、当前分支和脏工作区状态。这个信息可以降低恢复错目录的风险。

### 搜索后的精确落点

ClaudeStudio 和 AgentDeck History 的搜索会跳到命中消息。Keepline 若保留历史入口，也应把查询交给 Remem，然后打开精确 message_ref。只把用户送到一张会话卡片，会让他再找一遍。

### 明确的数据新鲜度

Stash 与 Keepline 的 POC 已要求过期数据不能冒充实时数据。可以进一步在每一条会话上显示最近一次高置信度确认时间。WebSocket 断开、Hook 接收器停止或扫描失败时，列表整体进入离线或过期状态，不用旧绿点维持视觉完整。

## 不建议学习的部分

### 不做第二个 Agent IDE

Claude Desktop、Codex App、cdesktop、Conductor、Warp 和 GitHub Copilot App 已经把 Chat、Diff、终端、浏览器、文件和 PR 组合得很完整。Keepline 的资源规模很难长期跟进每个运行时的权限、模型、工具块和消息格式。

### 不做第二个任务系统

Vibe Kanban 和 GitHub Copilot App 以任务或 Issue 为起点，Stash 已经是本地任务和最终完成决策的事实源。Keepline 只提供 Agent 观察与任务的关联证据，不保存另一份 Work Item。

### 不做第二个记忆和历史库

ClaudeStudio、AgentDeck History 和 Remem 都专门解决历史索引。Keepline 继续保存 Memory、Transcript 和向量会带来删除、纠错、备份和一致性责任。历史应该通过 Remem 引用打开。

### 不维护用量和价格真相

ccusage 与现有 ccstats 已经承担模型、Token、缓存和价格解析。Keepline 自己的 Analytics 可以改成链接或嵌入只读摘要，数据由 ccstats 提供。

### 不把恢复变成默认跳过权限

Claude Squad 的 AutoYes 和一些工具的危险模式虽然省步骤，却会改变上游安全契约。Keepline 可以恢复会话，不应默认附加跳过权限或沙箱的参数。任何危险参数都必须由用户在运行时本身明确选择。

## 推荐的新产品定义

建议文案如下。

> Keepline watches Claude Code and Codex sessions wherever they were started, tells you which one needs attention, and gets you back to the right session safely.

中文可以写成。

> Keepline 观察你从任何地方启动的 Claude Code 和 Codex。有人等你、会话意外中断或需要继续时，它把你带回正确的位置。

这个定义刻意不承诺任务管理、团队编排、长期记忆、费用核算和代码审阅。

### 推荐信息架构

| 层级 | 页面或入口 | 内容 |
|---|---|---|
| 常驻入口 | 菜单栏或 Stash Agent Activity | 需要处理的数量、最高优先级会话 |
| 默认页 | Attention | 等待、可恢复丢失、状态冲突和刚完成的会话 |
| 次级页 | All Sessions | 按项目、运行时、状态和主机筛选的全部会话 |
| 详情 | Session | 目标、最新进展、状态证据、关联任务、跳回和恢复 |
| 设置 | Runtime Health | Claude Code、Codex、Hook、扫描器和 Remem 连接状态 |

Overview、Work、Projects、Plans、Memory、Analytics 和 Terminal 不再各占一个一级入口。项目是筛选维度，计划和历史由 Remem 打开，用量由 ccstats 打开，工作项由 Stash 打开。

### 推荐的核心流程

```text
用户在任意终端启动 Agent
        ↓
Keepline 发现进程、会话文件或 Hook 事件
        ↓
归并为带证据和置信度的统一会话
        ↓
工作中时保持安静
        ↓
等待、完成、异常中断或证据冲突
        ↓
进入 Attention，并通知一次
        ↓
用户跳回原终端、恢复原会话或打开结果
```

### 建议保留的功能

| 优先级 | 功能 | 保留理由 |
|---|---|---|
| P0 | Claude Code 和 Codex 的旁路发现 | 主要差异点 |
| P0 | 统一会话身份与进程归因 | 所有状态和恢复动作的基础 |
| P0 | 有证据的工作中、等待、安静、结束状态 | 用户决定下一步所需的最小信息 |
| P0 | 跳回原位置和安全恢复 | 直接解决会话丢失和多窗口切换 |
| P0 | 数据新鲜度、离线和冲突状态 | 防止错误的实时感 |
| P0 | 只读本地 API | 供 Stash 和其他本地消费者使用 |
| P1 | 系统通知和注意力收件箱 | 会话数量增加后的核心交互 |
| P1 | 仓库、分支、主机和关联任务 | 防止进入错误工作副本 |
| P1 | Remem 精确引用 | 查看历史和结果，不复制 Transcript |
| P2 | 远端主机观察 | 有真实多机使用证据后再做 |

### 建议删除或停止扩展的功能

| 功能 | 处理方式 | 后继者 |
|---|---|---|
| Work Items | 停止独立持久化，只保留关联 ID | Stash |
| Memory 和向量检索 | 停止新增写入，迁移引用后删除 | Remem |
| Transcript 历史搜索 | 改成跳转 | Remem |
| Usage 和价格预测 | 删除本地解析，消费只读结果 | ccstats |
| Plans | 不做跨运行时统一模型 | 运行时原生界面或 Stash 任务 |
| 通用 Web Terminal | 停止扩展，保留外部终端打开 | 用户终端、Claude Desktop、Codex App |
| Orchestrator 评分 | 改成可解释的 Attention 排序 | Keepline 薄服务 |
| Git worktree、Diff、PR | 不进入产品范围 | Conductor、Codex App、Claude Desktop、GitHub |

## 建议的最小实现批次

这一批不需要新平台、新配置层或大量文件。

1. 把统一会话快照固定为 runtime、session_ref、host、repo、branch、status、status_reason、confidence、last_confirmed_at、process_ref 和 recover_actions。
2. 只保留 Claude Code 与 Codex 两个运行时，删除为了未来运行时预留的空扩展。
3. 让 Hook、进程扫描和会话文件各自产出观察事件，由一处归并和判定。
4. 状态无法唯一判断时返回明确冲突，不使用旧状态或目录近似静默兜底。
5. Stash 通过 loopback API 读取 Attention 和会话快照，不读取 Keepline SQLite。
6. 恢复动作只生成参数数组并打开受支持的外部终端，不再把通用 Shell 暴露到 WebSocket。
7. 历史详情只保存 Remem 引用，用量只保存 ccstats 查询键。

### 验收场景

| 场景 | 通过条件 |
|---|---|
| 从普通 Terminal 启动 Claude Code | 无须从 Keepline 启动，短时间内被发现并正确归属 |
| 同一仓库同时启动 Claude Code 和 Codex | 两个会话、两个进程和两个运行时不会串联 |
| 同一目录启动两个相同运行时 | 无法唯一归因时明确显示冲突，不猜 PID |
| Agent 请求用户输入 | Attention 出现一次，跳回后打开正确会话 |
| Terminal 意外退出 | 会话变为可恢复，原 Transcript 存在时推荐恢复原会话 |
| Keepline 服务停止 | Stash 保持可用并显示离线，不展示旧实时状态 |
| Hook 未安装 | 功能降为扫描证据并明确较低置信度 |
| Remem 不可用 | 历史入口明确报错，实时状态仍可用 |
| ccstats 不可用 | 不显示用量，且不自己估算一个数字 |
| 100 个历史会话和 10 个活跃会话 | 首屏只载入 Attention 和轻量快照，展开时再取详情 |
| 恢复动作 | 运行时、会话 ID、目录和参数都可在执行前审阅 |

## 主要风险

### 平台挤压

Claude Code 已经提供 Agent View、Desktop 多会话、跨会话消息和 worktree。Codex App 也读取 CLI 历史并管理并行线程。厂商继续增强跨终端发现后，Keepline 的单运行时价值会下降。

缓解方式是保持多运行时和旁路观察，同时把 Stash 的任务归属作为用户价值的一部分。不要依赖任何一个厂商的 UI 缺口长期存在。

### 状态误判

第三方状态判断永远弱于运行时内部状态。同目录多进程、会话压缩、后台子 Agent 和恢复后的新 PID 都会制造歧义。

缓解方式是保存观察证据，给出置信度，冲突时停止自动动作。停止和恢复属于高影响动作，必须要求唯一归因。

### 适配器维护

Claude Code 和 Codex 的文件格式、Hook、命令参数会变化。功能面越宽，升级后的破损点越多。

缓解方式是把适配器收敛到发现、状态和恢复三件事，建立真实安装版本的契约测试。历史解析交给 Remem，用量解析交给 ccstats。

### 本地安全

任何能在浏览器里创建 PTY、发送 Shell 输入或选择目录的服务，都接近本地代码执行面。把服务暴露到局域网或反向代理会显著放大风险。

缓解方式是 loopback 默认、短期令牌、Origin 校验、参数数组、目录允许范围和外部终端跳转。薄服务完成任务后，可以删除大部分 Web Terminal 攻击面。

### 数据所有权漂移

Keepline、Remem、Stash 和 ccstats 若都复制会话、任务和用量，删除、备份和纠错会互相打架。

缓解方式是固定单一事实源。Remem 拥有原始会话，Stash 拥有任务和完成决策，ccstats 拥有用量，Keepline 只拥有短生命周期运行态观察与恢复证据。

## 最终判断

Keepline 有同类竞品，而且数量很多。若按现有 README 的全能命令中心定位继续开发，它会同时面对开源 TUI、原生终端、工作区编排器、厂商桌面 App、历史搜索和可观测性平台。每一条赛道都已经出现完成度更高或渠道更强的产品。

Keepline 仍有一个清楚的空位。用户已经在多个地方启动了 Claude Code 和 Codex，他不愿把全部工作迁进某个新终端，也不想逐个窗口寻找谁在等他。Keepline 可以在不接管工作流的前提下，发现这些会话，解释状态，集中求助，并安全回到原处。

这也是和 Stash 最合适的组合方式。Stash 回答今天要做什么，Keepline 回答哪个 Agent 现在需要你。Remem 保存发生过什么，ccstats回答花了多少。四个边界清楚以后，用户只看到一个任务工作台，底层能力各自保持单一事实源。

因此，本调研的产品裁决是适配并合并。先把 Keepline 的旁路发现、进程归因、实时状态和恢复动作做成可独立验证的薄能力，接入 Stash。真实端到端验收通过后，冻结独立 Keepline UI 的新增功能。若旁路状态在同目录多会话等关键场景里仍无法达到可信门槛，就保持 Keepline 维护冻结，不用更多界面掩盖底层不确定性。

## 主要资料

### 本地资料

- [Keepline README](../../keepline/README.md)
- [Keepline 功能路线图](../../keepline/docs/FEATURE_ROADMAP.md)
- [Keepline Web 导航](../../keepline/src/web/client/src/components/TabNav/TabNav.tsx)
- [Keepline SessionCard](../../keepline/src/web/client/src/components/SessionCard/SessionCard.tsx)
- [Keepline Orchestrator](../../keepline/src/web/client/src/components/OrchestratorPanel/OrchestratorPanel.tsx)
- [Stash 与 Keepline POC](SPEC_stash_keepline_poc.md)
- [开源仓库收敛方案](todo/8-30/open-source-portfolio-consolidation.md)

### 开源产品

- [Agent Deck](https://github.com/asheshgoplani/agent-deck)
- [CCManager](https://github.com/kbwo/ccmanager)
- [Claude Squad](https://github.com/smtg-ai/claude-squad)
- [cmux](https://github.com/manaflow-ai/cmux)
- [Vibe Kanban 执行监控文档](https://github.com/BloopAI/vibe-kanban/blob/main/docs/core-features/monitoring-task-execution.mdx)
- [Happy](https://github.com/slopus/happy)
- [cdesktop](https://github.com/cdesktop-ai/cdesktop)
- [Mirafold](https://github.com/mirafold/mirafold)
- [Agor](https://github.com/preset-io/agor)
- [ClaudeStudio](https://github.com/ingridtoulotte/claudestudio)
- [AgentDeck History](https://github.com/lepfinder/AgentDeck)
- [ccusage](https://github.com/ccusage/ccusage)
- [Langfuse](https://langfuse.com/)
- [Phoenix](https://arize.com/docs/phoenix/)

### 闭源产品与官方能力

- [Claude Code 并行 Agent](https://code.claude.com/docs/en/agents)
- [Claude Code Desktop](https://code.claude.com/docs/en/desktop)
- [OpenAI Codex App](https://openai.com/index/introducing-the-codex-app/)
- [GitHub Copilot App](https://docs.github.com/en/copilot/concepts/agents/github-copilot-app)
- [Conductor 并行 Agent](https://www.conductor.build/docs/concepts/parallel-agents)
- [Conductor 运行时层](https://www.conductor.build/docs/reference/harnesses)
- [Cursor Cloud Agents](https://prod.cursor.com/docs/cloud-agent)
- [Warp 2.0](https://www.warp.dev/blog/reimagining-coding-agentic-development-environment)
- [crystl](https://www.crystl.dev/)
- [LangSmith Observability](https://www.langchain.com/langsmith/observability)
