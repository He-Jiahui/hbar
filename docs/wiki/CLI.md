# CLI 与无头模式

hbar CLI 是 Host 的键盘客户端，不复制 Session、模型、插件或审批逻辑；它通过同一套 Client SDK 访问 Bun Host。源码运行前先完成 [快速开始](Quickstart.md) 中的依赖安装。

## 常用命令

```powershell
bun apps/cli/src/main.ts --help
bun apps/cli/src/main.ts version
bun apps/cli/src/main.ts session list
bun apps/cli/src/main.ts session new
bun apps/cli/src/main.ts model list
bun apps/cli/src/main.ts plugins list
bun apps/cli/src/main.ts skills list
bun apps/cli/src/main.ts config paths
bun apps/cli/src/main.ts diagnose
```

默认运行 `hbar [message...]` 会打开当前项目的 TUI。`session resume|fork|archive|export`、`model use`、`plugins install|enable|disable|remove|inspect|doctor|lock` 需要在已连接的 Host 上执行，并且会作用于当前项目或指定 Session。

## 无头请求

无头模式适合脚本和 CI：

```powershell
bun apps/cli/src/main.ts --headless --demo `
  --project <你的项目目录> `
  --message "检查当前工作区" `
  --output-format text
```

也可以把一条消息从 stdin 传入，并使用 `jsonl` 获取结构化事件：

```powershell
'检查当前工作区' | bun apps/cli/src/main.ts --headless --demo --output-format jsonl
```

`jsonl` 输出包含 `run.started`、独立偏移的消息增量、工具/审批事件、`message.committed` 和 `run.completed`；错误也保持为 JSON。无头模式默认 `--approval deny`，非交互终端不能使用 `--approval ask`。需要放宽权限时必须显式传入 `--approval allow`，仍会经过 Host 的执行策略和资源限制。

## 连接已有 Host

`hbar serve` 启动后台 Host；`hbar attach <url>` 连接已有地址。没有 `HBAR_TOKEN` 时，交互式终端会提示输入一次性配对码。令牌不应放进 URL，也不要把命令行历史或终端日志提交到仓库。

## 退出码

成功为 `0`；参数错误为 `2`；审批失败为 `3`；模型/供应商错误为 `4`；插件错误为 `5`；Session 或存储恢复错误为 `6`；其他内部错误为 `7`。脚本应根据退出码和 JSONL 的最终事件判断结果，而不是只检查是否有部分文本输出。

完整参数和终端快捷键见主仓库的 [CLI 文档](https://github.com/He-Jiahui/hbar/blob/master/docs/cli.md)。
