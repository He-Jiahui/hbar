<!--
  这些 Markdown 文件是 hbar GitHub Wiki 的规范源。请在主仓库中编辑、通过
  `bun run check:docs`，再由 Wiki 发布工作流同步；不要只在 GitHub Wiki 网页中改。
-->

# hbar Wiki

hbar 是本地优先的 Agent 工作台：Bun Host 负责会话、模型与工具执行，React 工作台运行在桌面应用或浏览器中。你可以在同一处管理项目、Session、审批、插件和模型配置，同时保留可恢复的执行记录。

它适合两类读者：想快速跑通一条本地 Agent 会话的人，以及想扩展或参与开发的人。产品能力、协议和实现的权威细节仍在主仓库的 [README](https://github.com/He-Jiahui/hbar/blob/master/README.md)、[架构说明](https://github.com/He-Jiahui/hbar/blob/master/docs/architecture.md) 与源码中；这里提供稳定、可导航的入口。

## 从这里开始

- [快速开始](Quickstart.md)：安装依赖、启动安全的 Demo Host，并完成第一次配对。
- [跑通第一条会话](First-session.md)：选择工作区、审批工具、取消运行并检查结果。
- [模型与设置](Models-and-settings.md)：从 Demo fixture 切换到真实 provider，理解密钥与能力声明。
- [工作区与会话](Workspaces-and-sessions.md)：理解数据目录、Session、队列、取消和跨设备恢复。
- [模型、权限与数据安全](Security-and-data.md)：在接入真实模型或局域网访问前先了解边界。
- [插件与扩展](Plugins.md)：加载本地插件、理解可信代码与生命周期责任。
- [排查问题](Troubleshooting.md)：按 Host、配对、模型、桌面和插件症状定位问题。

## 读源码或参与开发

- [架构概览](Architecture.md)：从进程、依赖方向和持久化模型开始读。
- [CLI 与无头模式](CLI.md)：终端会话、结构化输出和脚本退出码。
- [测试与验收](Testing.md)：按改动范围运行确定性检查，并理解手工验收边界。
- [开发与验证](Development.md)：按改动范围选择检查，并定位测试证据。

## 维护这套 Wiki

所有页面都以 `docs/wiki/` 下的文件为准，`Home.md` 和 `_Sidebar.md` 是 GitHub Wiki 的特殊入口页。请使用相对 Markdown 链接，并在提交前运行：

```powershell
bun run check:docs
```

原生 GitHub Wiki 尚未启用时，这些页面仍可在仓库中审阅。启用后的发布配置与分支协作约定会在 [GitHub Flow](GitHub-Flow.md) 中说明。
