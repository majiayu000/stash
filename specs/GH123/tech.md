# GH123 技术规格：分离物理顺序与事件时间

## Linked Issue

- Issue：#123
- Product spec：`specs/GH123/product.md`

<!-- specrail-planned-changes
{"version":1,"issue":123,"complete":true,"paths":["specs/GH123/product.md","specs/GH123/tech.md","specs/GH123/tasks.md","server/src/adapters/claude/parser.ts","server/src/adapters/codex/parser.ts","server/src/adapters/claude/scanner.test.ts","server/src/adapters/codex/scanner.test.ts","server/src/__tests__/integration/weekly-performance.int.test.ts","specs/GH106/tech.md","docs/user_story_tracker.csv"],"spec_refs":["B-001","B-002","B-003","B-004","B-005","B-006","B-007","B-008","B-009","B-010","B-011","B-012"]}
-->

## 根因

- Claude tail shortcut 只读取物理末条 timestamp；末条在窗口外时直接返回空，
  无法证明更早物理位置没有窗口内事件。
- Claude full parser 把 timestamp 回退判为损坏，并把物理末条作为活跃时间。
- Codex reverse parser 同时用 timestamp 顺序做损坏判断和提前停止，混淆了
  cumulative counter 的物理顺序与事件归属时间。

## 设计

### Claude

候选文件单次完整读取并严格解析：

1. 每个存在的 timestamp 都执行 `Date.parse` 校验。
2. 用数值最大值确定 `lastActiveAt`。
3. usage 保留来源记录 timestamp。
4. usage 缺 timestamp、完整坏 JSON 和非法 timestamp 继续抛错。
5. 仅 EOF 明确未完成的 JSON 容器片段可忽略。

### Codex

继续用 reverse JSONL reader 控制单行内存，但读取并验证所有完整记录：

1. 对全部 timestamp 校验并归约最大 `lastActiveAt`。
2. 只保留 `turn_context` 与 `token_count`，完成后 reverse 回物理追加顺序。
3. 既有 delta helper 按物理顺序处理相邻累计值、reset 和 model context。
4. delta 的 `ts` 继续取当前 sample timestamp。

`activeSinceMs` 不再决定 parser 内提前停止；它仍由 scanner cache key 和上层
Weekly 窗口过滤使用。这样 old-tail 文件也可精确统计。

## 性能决策

先以现有最坏形状基准验证完整严格扫描，而不是预先增加 schema。3,000 个独立
inode、2,998 个 512 KiB 窗口外文件的当前实测冷请求约 853ms、热请求约
17ms、并发 health 约 8ms，均低于原硬门槛。因此本 Issue 不新增持久索引；
同 fingerprint/window 的后续请求继续复用进程内严格 analytics cache。

## 测试映射

| 不变量 | 验证 |
| --- | --- |
| B-001..B-003、B-006..B-009 | Claude scanner strict + old-tail regression |
| B-001、B-002、B-004..B-009 | Codex scanner strict + physical-delta regression |
| B-003..B-005、B-011、B-012 | mixed-provider Weekly HTTP integration |
| B-010 | unchanged 3k cold/warm/health performance integration |
| B-011 | existing Burn cumulative contract and full regression |

## 回滚

无 migration。回滚两个 analytics parser、测试和规格即可；公开 Session/Burn
持久 cache 不需重建。
