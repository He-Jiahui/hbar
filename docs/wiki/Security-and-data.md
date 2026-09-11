# 模型、权限与数据安全

hbar 的默认设计是“本地 Host 执行，客户端显示和请求操作”。这不等于所有插件、模型服务或网络拓扑天然安全；在接入真实模型、扩展或局域网之前，请先确认下面的边界。

## 模型密钥和会话数据

真实模型在“设置 → 模型”中配置协议、地址、模型 ID、能力、价格与 API Key。密钥由 Host 通过 Bun Secrets 保存；Windows 使用系统凭据管理器。它们不会发送给 Web 客户端，也不会写入事件日志。

会话、队列、事件投影和附件引用属于 Host 数据目录。备份数据库时应先停止 Host，或使用 SQLite backup；不能只复制主数据库文件而忽略 WAL。

## 工具和审批

所有工具调用都经过固定管线：参数 schema 校验、插件前置处理、最终参数再次校验、策略或人工审批、意图记录、执行、后置处理和结果结算。审批卡展示的是最终参数。

默认允许读取工作区内文件，写入和 Shell 请求批准。批准过的 Shell 与可信插件仍拥有运行 hbar 的操作系统用户权限，因此“批准”不是沙箱，也不应把不可信插件当作隔离代码运行。

## 浏览器、设备和局域网

Host 默认只监听回环地址。设备需要短时一次性配对码；令牌使用 HttpOnly Cookie 或 Authorization Header，WebSocket 握手也支持消息体令牌，不使用 URL 查询参数。

若要让手机或另一台设备访问，可显式绑定局域网地址：

```powershell
bun run host --home .dev/lan-host --workspace <你的项目目录> --host 0.0.0.0 --port 4317 --demo
```

普通 HTTP/WebSocket 不加密，设备配对不能替代 TLS。跨越不可信网络时，请使用 VPN，或为 Host 配置 `--cert` 与 `--key`。反向代理或额外前端域名必须通过可重复的 `--origin https://example.com` 显式放行。

## 提交前的安全检查

- 不要提交 `.env`、API Key、设备凭据、`.dev/` 或 `.hbar/` 数据目录。
- 截图、日志和 Issue 中应隐藏 token、配对码、路径和任何私密提示词。
- 新增工具或插件时，说明它的权限、作用域、副作用和可释放路径。
- 真实模型验证只在你明确授权、可承担成本并拥有可信凭据的环境中运行。

更多协议与恢复约束见 [架构概览](Architecture.md) 和主仓库的 [架构说明](https://github.com/He-Jiahui/hbar/blob/master/docs/architecture.md)。

发现可能的安全漏洞时，请按照仓库的 [安全策略](https://github.com/He-Jiahui/hbar/blob/master/SECURITY.md) 私下报告，不要把凭据或利用细节贴到公开 Issue。
