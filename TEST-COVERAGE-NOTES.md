# 测试里发现、但这次没有改的问题

用例按当前实现的真实行为来写。下面这些是写测试时对上的问题。按你的要求，只记录原因，没有改实现。

## 这台机器跑不了 SQLite 用例

`packages/desktop/tests/trace/payloadIndex.test.ts` 失败：

`better-sqlite3` 是按 Electron 的 Node 编译的（`NODE_MODULE_VERSION` 136），当前用来跑 Vitest 的 Node 需要 127。

没有执行 `npm rebuild`。那会把原生模块改成给系统 Node 用，桌面进程反而加载不了。因此也没有为下面这些「一 import 就会打开 SQLite」的模块新写会在这台机器上失败的用例：

- `packages/desktop/src/trace/traceDb.ts`（`pruneTraceStore` 也走这里）
- `packages/desktop/src/log/logsDb.ts`（`pruneExpiredLogs` 也走这里）
- 设置里真正解密密钥的路径（现有 lazy secrets 用例能过，是因为它测的是「公开视图不解密」）

## 实现和注释不一致，或有明确缺陷

### `truncateForTrace` 遇到循环引用会一直递归

`packages/desktop/src/trace/truncate.ts` 里，`JSON.stringify` 失败只用来估算字节数。后面的 `walk` 没有环检测。值如果自己引用自己，会栈溢出。测试没有覆盖这条路径，避免把测试进程打挂。

### 检查点文件名会把不同 threadId 撞到同一个文件

`packages/engine/src/checkpoint/file.ts` 把 threadId 里非 `a-zA-Z0-9._-` 的字符都换成 `_`。`a/b` 和 `a_b` 会写成同一个 `a_b.json`，后一次 `save` 覆盖前一次。`load` 再因为文件里的 `threadId` 对不上而返回 `null`，检查点等于丢了。测试只覆盖了「文件内容和要读的 threadId 不一致就当没有」，没有把碰撞写成期望行为。

### 重试注释写的是 5xx，代码不是

`packages/engine/src/model/retry.ts` 文件头写网络抖动 / 429 / 5xx 可重试。`isRetryableHttpStatus` 只把 429、502、503、504 当成可重试。500 和 501 不会重试。用例断言的是代码，不是那句注释。

### 行号错误文案写「必须是整数」，实现会把小数向下取整

`parseLineRange` 在数字非法时抛 `must be integers >= 1`。`parseLineNumber` 对 `1.9` 和 `"2.2"` 用 `Math.floor`，当成 1 和 2 收下。

### 删除恢复的上限注释写字符，比较的是字节

`packages/engine/src/tools/delete_file/execute.ts` 注释写「按 utf8 字符近似」，常量名是 `MAX_RESTORE_CHARS`。实际比较的是 `stat.size`（字节）是否 `<= 120_000`。

### 查找 run 会 trim，登记不会

`getRunHandle` 用 `runId.trim()` 查表，`registerRun` 把 `context.runId` 原样当 key。带空白的 id 登记之后，用去掉空白的 id 查不到。`createRunId` 不会生成这种 id，所以现在只是埋着。
