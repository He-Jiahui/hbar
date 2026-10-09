# 模型与设置

hbar 提供运行时和工作台，不内置商业模型。你可以先用本地 `--demo` fixture 验证流程，再在 Host 中配置真实服务商。

## Demo 与真实模型

Demo 模式显式使用本地 fixture，不发起模型网络请求，适合安装检查、Issue 复现和 CI 外的功能演示：

```powershell
bun run host --home .dev/demo --workspace <你的项目目录> --demo
```

移除 `--demo` 后，打开“设置 → 模型”，填写协议、地址、模型 ID、能力、价格和 API Key。模型能力声明会影响图片附件、工具调用和可选推理级别；服务商不支持的能力应显示为明确失败，而不是静默降级。

## 选择模型和推理级别

工作台可以从已配置的模型中选择具体 provider/model。CLI 也支持按 provider/model、ID 或名称选择：

```powershell
bun apps/cli/src/main.ts --headless --project <你的项目目录> --model <provider/model> --message "总结当前项目"
```

可用推理级别是 `off`、`minimal`、`low`、`medium`、`high`、`xhigh` 和 `max`；实际可选项取决于模型声明。Plan 模式会优先使用 `medium`，除非调用者明确选择其他级别。

## 密钥和生效范围

API Key 由 Host 通过 Bun Secrets 保存；Windows 使用系统凭据管理器。客户端只收到模型的非敏感描述，不会取得 Host 中保存的密钥，事件日志也不写入密钥内容。

一个数据目录对应一个 Host。更换 `--home`、数据根或缓存根只影响相应进程/实例；不要让多个 Host 共享同一数据库目录。路径、配对和恢复边界见 [工作区与会话](Workspaces-and-sessions.md)。

## 聊天数据库

“设置 → 聊天数据库”位于存储位置之后，提供真实占用统计、全局 → 项目 → 会话的保留规则、定时与容量触发、预览清理及执行记录。默认保留 90 天且只清理已归档聊天，自动清理默认关闭；共享缓存和数据库空间回收只在全局执行。详情见[聊天数据库设置、监控与清理](../chat-database.md)。

## 常见配置判断

- **模型列表为空**：确认已经保存 provider、模型 ID 非空，并重启或刷新 Host 的 bootstrap 信息。
- **图片被拒绝**：检查模型能力是否声明支持图片，以及附件是否超出单文件、总大小或数量限制。
- **工具调用失败**：先查看审批卡中的最终参数，再检查工作区路径、权限模式和 Host 日志。
- **Demo 能用、真实模型不行**：优先核对协议、Base URL、模型 ID、认证头和 provider 的限流/额度；不要为了排查把真实密钥贴到 Issue。

更多协议、设备和安全约束见 [模型、权限与数据安全](Security-and-data.md) 与主仓库的 [架构说明](https://github.com/He-Jiahui/hbar/blob/master/docs/architecture.md)。
