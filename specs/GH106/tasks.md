# GH106 实施任务

## SP106-T1 — 窗口感知扫描合同

- Owner：`/root/weekly_cold_start_audit`
- Dependencies：无
- Files：`server/src/adapters/source.ts`、`aggregator.ts`、Claude/Codex scanner 及测试
- Done when：
  - scan options 支持 `modifiedSinceMs`，singleflight key 包含该字段；
  - scanner 通过 mtime + 尾部 activity 两级判断排除窗口外旧内容，不使用数量截断；
  - Claude 活跃候选单遍解析，Codex 反向读取窗口累计 sample 与 baseline；活跃候选校验 timestamp 单调性；
  - tail reader 对小末行低 I/O，对 512 KiB 末行保持线性而非重复复制；
  - activity 结果按 fingerprint + 窗口在进程内复用；Claude/Codex 均不复用缺少严格验证证明的普通持久 cache，Codex delta 不污染普通 Session/Burn usage；
  - 无窗口参数的现有 Session 路由行为保持不变；
  - 测试覆盖旧文件排除、近期文件保留及不同窗口不共享结果。
- Verify：`cd server && bun test src/adapters`

## SP106-T2 — 当前周与上周精确 usage totals

- Owner：`/root/weekly_cold_start_audit`
- Dependencies：`SP106-T1`
- Files：`server/src/domain/analytics/burn.ts`、`weekly.ts` 及测试
- Done when：
  - Weekly 扫描边界为目标周的 `prevStartMs`；
  - token/cost 分别按 `[prevStart,start)` 与 `[start,end)` 计算；
  - Codex 累计 token 转换成跨周 timestamped delta；
  - 跨周 session 的历史 focus hour 不因较晚 `lastActiveAt` 丢失；
  - 边界外 usage 不进入 totals，历史周查询仍完整；
  - `/api/analytics/burn` 原合同和测试保持通过。
- Verify：`cd server && bun test src/domain/analytics/burn.test.ts src/domain/analytics/weekly.test.ts`

## SP106-T3 — 冷启动与响应性回归门禁

- Owner：`/root/weekly_cold_start_audit`
- Dependencies：`SP106-T1`、`SP106-T2`
- Files：Weekly benchmark / integration / E2E 测试文件
- Done when：
  - fresh DB、3k 独立 inode、512–600 KiB 且大部分窗口外历史的冷 API ≤2s；
  - GH123 后 3k mtime 候选会完整严格解析，仍须满足同一冷启动门槛；
  - 热 API ≤250ms；
  - `/c/j` 在同类 fresh 3k root 上标题 ≤3s且真实交互可点击；
  - `/health` ≤250ms，或确定性测试证明大文件未进入同步解析路径；
  - 基准校验 exact totals，不能只测耗时。
  - 完整坏行、非法 timestamp、无 timestamp usage 返回显式错误；合法
    timestamp 回退由 GH123 支持；仅明确 EOF partial 可容忍；非法 ISO week
    返回 400。
- Verify：运行任务内新增的 benchmark 命令及 focused E2E。

## SP106-T4 — 完整验证与本地交付

- Owner：`/root/weekly_cold_start_audit`
- Dependencies：`SP106-T3`
- Files：本 Issue 分支全部改动
- Done when：
  - focused tests、server/client typecheck、client build 和仓库门禁通过；
  - 对照 `product.md`、`tech.md` 无未满足验收；
  - 改动已本地提交，未执行 push、PR 或 merge。
- Verify：`bun run verify:ci`
