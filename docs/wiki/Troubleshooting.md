# 排查问题

先确认使用的是最新提交、正确的数据目录和正确的工作区。排查时优先在新的临时 `--home` 与 `--demo` 下复现，这能区分代码问题和本地 provider/数据问题。

## Host 无法启动

- **提示数据目录已被占用**：每个 `--home` 只允许一个 Host。确认旧进程已退出，或为独立试验换一个数据目录；不要直接删除仍在使用的 `host.lock`。
- **端口已占用**：换一个 `--port`，并让浏览器/桌面端使用 Host 实际打印的地址。
- **想确认是否是模型问题**：加 `--demo` 启动本地 fixture；如果 Demo 正常，再检查 provider 配置。

## 配对或浏览器连接失败

- 配对码是一次性短时凭据，默认 5 分钟过期；在“设置 → 设备”生成新码后重试。
- 反向代理或不同前端域名必须用 `--origin https://example.com` 显式允许；检查协议、端口和浏览器的 Origin。
- LAN 访问时确认 Host 绑定了可达地址、防火墙放行端口，并记住文件和命令仍执行在 Host 所在机器。
- 普通 HTTP/WebSocket 不加密；跨不可信网络请使用 VPN 或 `--cert`/`--key` 配置 TLS。

## 模型没有回复

先在 Session 中查看 Run 的最终状态和错误卡片，再检查 provider 的 Base URL、认证方式、模型 ID、能力声明与额度。不要把 API Key 或完整请求头贴进日志。用 `bun apps/cli/src/main.ts diagnose` 可查看经过脱敏的诊断信息。

## 工具没有执行或执行结果不确定

写入和 Shell 默认需要批准；拒绝会产生明确失败结果。审批卡展示最终参数，先核对路径和命令。若 Host 在工具结算前崩溃，运行会标记 `interrupted`，工具意图可能是 `unknown`；先检查文件/外部系统，再手工决定是否重试。

## 桌面应用打不开

浏览器 Host 不依赖 Rust，可以先用 `bun run dev --demo` 验证 Web 与 Host。Windows 桌面构建还需要 Visual Studio C++ 工具链、Windows SDK、WebView2 和仓库固定的 Rust 工具链；桌面开发应使用 `bun run desktop`，并确认 Vite 已准备好。

## 插件导致异常

从“设置 → 插件”停用最近安装的插件，或在新的 `--home` 下复现。可信插件拥有进程内权限；停用、配置变更和 Scope 释放时应清理注册、订阅、连接和 Worker。若问题只在插件启用时出现，请在 Issue 中附上插件 ID、版本、作用域和脱敏日志。

仍未解决时，使用 [Bug report 模板](https://github.com/He-Jiahui/hbar/issues/new?template=bug_report.md) 提交最小复现、环境、实际/预期行为和已脱敏的日志；不要上传 `.dev/`、`.hbar/`、数据库或凭据文件。
