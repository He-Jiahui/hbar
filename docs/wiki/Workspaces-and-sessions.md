# 工作区与会话

hbar 把“Agent 正在处理什么”拆成稳定的持久化对象。理解它们的归属关系，能帮助你安全地切换设备、取消任务，或在出现故障后判断应该重试什么。

```text
Workspace → Session → Run → Step → Attempt / ToolCall
```

## Workspace 和数据目录不是同一件事

- **Workspace** 是 Agent 可以操作的项目目录。文件工具会验证实际路径和符号链接，Host 数据目录不会对文件工具开放。
- **数据目录** 由 `--home` 指定，保存设备配对、设置、SQLite 事件和投影、附件索引等 hbar 自身状态。一个数据目录只允许一个 Host。

例如，下面的命令让 hbar 在 `.dev/my-host` 保存自身数据，而 Agent 的项目工作区仍是 `<你的项目目录>`：

```powershell
bun run host --home .dev/my-host --workspace <你的项目目录> --demo
```

想并行运行互不影响的实例，请使用不同的 `--home` 和端口；不要让两个 Host 共享同一数据目录。

## Session、队列和取消

Session 是历史、队列和运行状态的归属。每个 Session 同时只会 claim 一个活动 Run；不同 Session 可以并发运行。重复提交相同 `requestId` 会返回原 Run，使用相同标识却提交不同输入会报冲突。

取消会立即中止对应 Run 的 `AbortController`。已经排队的输入可以单独取消；关闭窗口或浏览器断线不会取消 Run，因此你可以之后重新连接并查看最终状态。

## 崩溃与恢复的边界

事件和投影通过独立 SQLite Worker 以事务写入。重启时，活动 Run 会标记为 `interrupted`，未结算工具意图标记为 `unknown`，系统不会自动重放可能已经产生副作用的调用。需要由用户明确重新提交，而不是假定上一次写文件或 Shell 命令没有执行。

流式内容在结算前可能因崩溃丢失一小段增量；完整 assistant 或工具结果结算后才会进入会话历史。

## 多个客户端如何协作

桌面、浏览器和手机浏览器都经由同一个 Host 访问同一数据目录。客户端断线后会先取得分页快照和游标，再继续订阅事件；客户端会按序号去重并处理乱序更新。

局域网访问意味着 Agent 的文件与命令仍执行在 Host 所在机器。开放局域网前，请先阅读 [模型、权限与数据安全](Security-and-data.md)。协议、顺序和恢复细节以主仓库的 [架构说明](https://github.com/He-Jiahui/hbar/blob/master/docs/architecture.md) 为准。
