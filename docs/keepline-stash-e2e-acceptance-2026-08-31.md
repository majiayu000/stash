# Keepline 与 Stash 真实接入验收记录

日期 2026 年 8 月 31 日

这轮工作把竞品调研后的第一项建议落到了真实产品上。验收对象是 Stash 打包应用、随应用分发的 Keepline Service，以及本机已有的 Codex 和 Claude Code 会话目录。测试使用隔离的 `KEEPLINE_HOME`，没有向用户现有的 Keepline 数据库写入验收数据。

## 本轮结论

Stash 已经可以在 3377 端口没有服务时自动启动内嵌 Keepline。服务完成真实扫描后，本次读到 27 个 Codex 会话。Claude Code 与 Codex 两个扫描器都返回 `degraded=false` 和 `errorCount=0`。

打包脚本中的签名修复有效。生成的应用通过 `codesign --verify --deep --strict`，内嵌 KeeplineService 也带有有效的临时签名。

验收过程中发现了一个生命周期缺口。Stash 主进程异常退出时，原实现只依赖 AppKit 的正常退出通知，子服务可能被系统接管并继续监听端口。当前机器上已有的一个 43879 端口进程也符合这种孤儿进程形态。

修复后，Stash 与它启动的服务通过匿名管道绑定生命周期。强制结束 Stash 主进程后，管道写端由内核关闭，Keepline 收到 EOF 后走原有的优雅关停路径。实测子服务退出、3377 端口释放、健康检查不可达。

独立服务路径也做了反向检查。先由命令行启动 Keepline，再启动 Stash。Stash 复用现有服务，没有替换监听进程。随后强制结束 Stash，独立 Keepline 仍然健康，说明新的退出机制只作用于 Stash 自己创建的子进程。

## 真实 Agent 投递结果

第二批验收从 Keepline Local API 创建一个 Stash 工作项，再让产品自己的 Terminal 启动流程发起 Codex。工作目录位于已经信任的 Stash 仓库内，提示词要求只返回验收标记，不修改文件也不运行命令。Keepline 找到了唯一的新 Codex session，返回 `linked`，会话目录、运行时和进程状态都与本次投递一致。

同一个幂等键和相同载荷再次提交时，Keepline 返回原 dispatch，没有启动第二个 Codex。保留幂等键但修改提示词后，Local API 返回 409。隔离目录里只有一个 Codex 进程。服务停止并使用原数据库重新启动后，dispatch 仍保持 `linked`，原 session ID 也没有变化。

第一次尝试使用全新的临时 Git 仓库。Terminal 已经创建 Codex 进程，但 Codex 还在等待项目可信确认，没有写出 session metadata。两分钟后 Keepline 按原规则把 dispatch 标为失败。现在的超时信息会提醒用户检查已经打开的 Terminal，处理项目信任或登录提示后再重试。安全确认仍由 Codex 负责，Keepline 不会绕过它。

多任务争用同一新 session、并发认领和人工歧义选择使用确定性测试验证。实际启动两个收费模型会话不会增加新的状态覆盖，因此没有放进日常验收。

完成证据使用打包后的 KeeplineService 验证。隔离的 Claude transcript 先与活动进程匹配，随后 Stop Hook 写入明确完成证据。服务重启后证据仍然存在，Stash 只有在人工接受后才把任务改为完成。Codex 当前公开声明的是人工完成能力，Claude Code 公开声明的是 Stop Hook 能力，两者没有伪装成相同能力。

## 注意力收件箱结果

Stash 右侧栏现在会把四类需要人介入的情况排在一起。顺序依次是歧义关联、待确认完成、等待输入和会话中断。普通运行中的会话不会混进收件箱，已经完成或移入废纸篓的任务也会被过滤。没有待处理事项时，右侧栏继续显示原来的 Agent 活动概览。

每一项都显示任务、运行时和需要介入的原因。点击后只选中 Stash 中已经存在的任务，并打开原有任务检查器。这个内部跳转不会启动 Terminal，也不会根据模糊目录猜测会话。Keepline 离线时，缓存下来的任务事项仍可打开，依赖服务的认领与完成操作继续由原有离线状态拦住。

分类由任务、Agent 链接和 Keepline 会话的只读投影生成，没有增加数据库字段。集成检查构造了四类状态以及运行中、已关闭的对照任务，确认排序和过滤符合预期。打包态完成回传随后再次通过。

## 确认式外部会话恢复

中断卡片现在多了一个 `Review recovery` 动作。第一次点击只向 Keepline 请求恢复预览，不会打开 Terminal。确认页会显示运行时、恢复方式、精确 session ID、工作目录、可执行文件和逐项转义后的参数。用户点击 `Open in Terminal` 后，Stash 才会提交执行请求。

Keepline Local API 新增 `GET /api/v1/sessions/{sessionId}/recovery-preview` 和 `POST /api/v1/sessions/{sessionId}/recover`。预览由服务端根据当前会话状态生成，内容带有 SHA-256 确认标识。执行请求只接收确认标识、终端选择和幂等键。服务会重新计算预览，内容有变化就返回 409，避免用户确认旧命令后执行新命令。

恢复命令始终使用结构化参数数组。Stash 不拼 Shell 字符串，Local API 也不接收任意命令。服务只允许 `codex`、`claude` 和 `claude-code` 三个可执行文件，也只允许 `auto`、`Terminal`、`iTerm` 和 `Warp` 四种终端选择。恢复参数固定关闭危险权限绕过。相同幂等键和相同载荷只产生一次逻辑执行，并发重复请求也共用同一个执行结果。

恢复计算和终端打开被放进隔离子进程，常驻服务的静态依赖图没有引入终端模块或完整恢复服务。打包态验收先发现一条真实格式的 Claude transcript，并将它归因到活动模拟进程。模拟进程退出后，同一 session 被标记为 `lost`。Swift 客户端随后通过包内 KeeplineService 取得恢复预览，返回的 session ID 和运行时都与原会话一致，参数中没有 `--dangerously-skip-permissions`。

自动验收没有提交真实执行请求，因为那一步会打开用户终端并产生外部状态。测试使用注入的终端打开器验证了确认标识不变时才会执行，并验证了预览变化、幂等键冲突和危险参数拒绝。实际终端打开仍由用户在确认页明确触发。

## 本轮改动

| 仓库 | 文件 | 作用 |
|---|---|---|
| Stash | `native/prototypes/time-ledger/Sources/StashTimeLedger/KeeplineServiceController.swift` | 为内嵌服务创建生命周期管道，并传入受控退出参数 |
| Keepline | `src/embedded-service.ts` | 只在内嵌入口识别 `--exit-on-stdin-close` |
| Keepline | `src/cli/service.ts` | 收到 stdin 的 EOF、close 或 error 后调用现有服务关停流程 |
| Keepline | `src/services/task-dispatch.service.ts` | 超时后提示检查 Terminal 中的项目信任或登录提示 |
| Keepline | `src/__tests__/task-dispatch-guidance.test.ts` | 锁定用户可见的超时处理建议 |
| Stash | `native/prototypes/time-ledger/Sources/StashKeeplineIntegration/AgentAttentionQueue.swift` | 从任务、链接和会话生成无副作用的注意力队列 |
| Stash | `native/prototypes/time-ledger/Sources/StashTimeLedger/AgentActivitySection.swift` | 显示四类介入事项并提供任务内跳转 |
| Stash | `native/prototypes/time-ledger/Sources/StashTimeLedger/DetailRail.swift` | 把任务选择绑定传给注意力列表 |
| Stash | `native/prototypes/time-ledger/Sources/StashIntegrationChecks/StashIntegrationChecks.swift` | 验证分类、恢复传输和打包态恢复预览 |
| Stash | `native/prototypes/time-ledger/Sources/StashKeeplineIntegration/KeeplineTransport.swift` | 暴露恢复预览与确认执行的类型化传输接口 |
| Stash | `native/prototypes/time-ledger/Sources/StashTimeLedger/KeeplineIntegrationStore.swift` | 管理恢复忙碌状态、错误和幂等执行 |
| Keepline | `src/local-api/routes/recovery.ts` | 提供带认证、确认哈希和幂等语义的恢复接口 |
| Keepline | `src/cli/service-recovery.ts` | 在隔离进程中生成预览并以结构化参数打开终端 |
| Keepline | `src/services/service-runtime.ts` | 把常驻服务接到隔离恢复子进程 |
| Keepline | `sdk/swift/Sources/KeeplineKit/KeeplineClient.swift` | 提供 Swift 恢复预览与执行方法 |
| Keepline | `sdk/swift/Sources/KeeplineKit/KeeplineModels.swift` | 定义恢复预览、终端选择和执行结果模型 |
| Keepline | `docs/local-api-v1-recovery.openapi.yaml` | 记录 Local API 恢复契约 |

打包脚本中的 `codesign --remove-signature` 在本轮开始前已经存在。Patch Guard 把它保留在基线中，没有计入上表。

## 真实验收结果

| 检查项 | 结果 | 现场证据 |
|---|---|---|
| Keepline 服务与 Local API 聚焦测试 | 通过 | 当前工作树 23 项通过，0 项失败 |
| Keepline TypeScript 类型检查 | 通过 | `bun x tsc --noEmit` 返回 0 |
| Stash 集成检查 | 通过 | `StashIntegrationChecks` 全部通过 |
| Stash 核心检查 | 通过 | 连续三次全绿；10 次 10,000 任务规划为 0.463–0.485 秒，10,000 任务 mutation 为 0.049–0.050 秒 |
| Release 打包 | 通过 | Swift release 与内嵌 Bun 二进制构建成功 |
| 应用签名 | 通过 | 应用满足 designated requirement |
| 自动启动 | 通过 | KeeplineService 的父进程是本次 Stash 进程 |
| 真实会话扫描 | 通过 | 27 个 Codex 会话，两个运行时扫描器均无降级 |
| 父进程异常退出 | 通过 | 子服务退出，3377 释放，健康检查失败 |
| 外部服务共存 | 通过 | Stash 退出后，独立 Keepline 仍可返回健康状态 |
| 真实 Codex 投递 | 通过 | 唯一 session 自动关联，且只有一个对应进程 |
| 投递幂等 | 通过 | 相同载荷复用 dispatch，冲突载荷返回 409 |
| 关联持久化 | 通过 | Keepline 重启后仍保留 dispatch 和 session ID |
| 明确完成证据 | 通过 | Stop Hook、重启持久化和 Stash 人工接受全部通过 |
| 注意力分类 | 通过 | 四类事项按动作优先级排列，运行中和已关闭任务不会进入队列 |
| 安全任务跳转 | 通过 | 点击只打开对应 Stash 任务，不执行终端或恢复命令 |
| 恢复接口聚焦测试 | 通过 | 预览、确认执行、并发幂等、冲突和隔离进程共 3 项通过 |
| 打包态恢复预览 | 通过 | 活动会话转为 lost 后，Swift 客户端从包内服务取得精确恢复预览 |
| 真实终端执行 | 通过 | 授权后，恢复流程使用的结构化 Terminal 边界在 Keepline 目录安全执行 `codex --version`，约 4 秒返回且无残留进程 |

本轮使用了以下主要命令。

```sh
bun x tsc --noEmit
bun test --preload ./src/__tests__/test-preload.ts \
  src/__tests__/local-api-recovery.test.ts \
  src/__tests__/service-runtime.test.ts \
  src/__tests__/local-api-v1.test.ts \
  src/__tests__/task-dispatch-correctness.test.ts \
  src/__tests__/task-dispatch-guidance.test.ts \
  src/__tests__/web-service-coexistence.test.ts
swift run StashIntegrationChecks
swift run StashCoreChecks
./scripts/package_app.sh
codesign --verify --deep --strict --verbose=2 '.build/app/Stash Time Ledger.app'
```

## 已知环境限制

Keepline 的 `test:sdk:swift` 脚本固定使用 `/Applications/Xcode.app/Contents/Developer`。当前机器只安装了 `/Library/Developer/CommandLineTools`，其中缺少 XCTest，因此 SDK 自带测试无法在本机执行。SDK 代码已经由 Stash 的调试构建、发布构建和集成检查实际编译并调用。这项环境限制没有通过修改测试或降低断言绕过。

`StashCoreChecks` 的性能门槛已经修复。根因是规划器对每个候选任务调用 `Calendar.dateComponents` 计算年龄，10 次 10,000 任务规划会重复执行约 100,000 次昂贵的日历运算。规划器现在每次预计算最近 90 个日界线并二分计算封顶年龄；UTC、上海、洛杉矶和柏林时区及 DST 附近样本与原算法结果一致。性能断言和评分规则没有降低，连续三次完整核心检查均通过。

真实 Terminal 边界使用与恢复流程相同的结构化参数入口，并将命令限制为无副作用的 `codex --version`。首次调用按预期等待 macOS Apple Events 自动化授权；用户授权后复测约 4 秒正常返回，Terminal.app 已运行，且没有残留 `osascript` 或 Bun 进程。该结果与确认页、类型化请求、确认哈希和 Keepline 执行链路的自动化检查共同覆盖本批次恢复路径，没有恢复真实会话或启动收费任务。

Keepline 仓库在本轮期间还有并发中的会话识别和完成回调改动。Stash 的打包验收也由并发工作补上了真实进程识别。Patch Guard 记录到了这些变化，本轮没有覆盖或归属它们。

## 后续产品工作

注意力收件箱、Stash 内部安全跳转、确认式外部恢复、真实 Terminal 边界和性能门槛修复已经完成，本批次没有功能性验收阻塞。在有真实 lost 会话时检查确认页信息密度仍可作为后续视觉走查，但不再是恢复链路的交付门槛。终端模拟器、用量统计、长期记忆和工作树管理继续留在 Keepline 之外的产品边界中。
