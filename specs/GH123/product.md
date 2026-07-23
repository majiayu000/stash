# GH123 产品规格：Weekly 合法非单调时间戳

## Linked Issue

- Issue：#123
- Locale：`zh-CN`
- Complexity：medium

## 问题

Claude 与 Codex 的 JSONL 按物理顺序追加，但记录自带的 timestamp 不保证
单调递增。Weekly analytics 把两种顺序错误地视为同一不变量：时间戳回退会
使整个 `/api/analytics/weekly` 返回 500；更严重的是，物理末条 timestamp
早于统计窗口时，tail shortcut 会静默忽略物理较早位置中的窗口内事件。

时间戳乱序不是来源损坏。系统仍须拒绝完整坏 JSON、非法 timestamp 和
usage/token 记录缺 timestamp，并保持现有大历史性能门槛。

## 目标与行为不变量

1. **B-001**：完整记录可解析且 timestamp 合法时，timestamp 回退不得产生
   source error。
2. **B-002**：Claude/Codex `lastActiveAt` 是全部完整记录中的最大有效
   timestamp，而不是物理末条 timestamp。
3. **B-003**：Claude usage 保留产生它的记录 timestamp，并按该时间归周。
4. **B-004**：Codex 累计 token delta 按 JSONL 物理追加顺序计算，不按
   timestamp 排序。
5. **B-005**：Codex delta 归属于当前 sample 的 timestamp；counter reset
   继续把 reset 后累计值作为原子 sample，model context 仍按物理顺序生效。
6. **B-006**：完整坏 JSONL、任意非法 timestamp 必须显式失败。
7. **B-007**：Claude usage 或 Codex `token_count` 缺 timestamp 必须失败。
8. **B-008**：仅明确的 EOF trailing partial 可以暂时忽略；完整无换行 JSON
   仍须处理。
9. **B-009**：物理末条 timestamp 在窗口外时，也不得漏掉更早物理位置中的
   窗口内事件。
10. **B-010**：3,000 个独立 inode、每个 512–600 KiB 的 Weekly 门禁保持
    冷请求 ≤2,000ms、热请求 ≤250ms、并发 `/health` ≤250ms。
11. **B-011**：公开 Burn 最终累计语义、Session 列表/events 和 Weekly
    response shape 保持兼容。
12. **B-012**：同 fingerprint 与窗口的 warm 结果必须与 cold 结果完全一致。

## 验收

- Claude old-tail fixture 返回无错误 session、最大 `lastActiveAt` 和逐事件
  timestamp/token。
- Codex old-tail fixture 按物理顺序得到精确 delta，并保留 sample timestamp、
  reset 和 model attribution。
- 同时包含两类非单调来源的 HTTP 集成测试返回 200，并精确断言当前周与上周。
- malformed、invalid、missing timestamp 和 trailing partial 正反例均有覆盖。
- 原性能常量与断言不修改、不放宽。

## 非目标

- 不改变 Weekly UI、API schema、ISO 周/配置时区语义或计价模型。
- 不把真正损坏的来源降级为部分成功。
- 若完整严格扫描不能满足 B-010，才引入可失效的持久 activity index；不得以
  tail shortcut 换取静默漏算。
