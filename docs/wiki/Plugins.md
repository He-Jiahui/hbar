# 插件与扩展

hbar 通过 Cordis scope 管理 Host 与客户端插件。插件可以扩展工具、配置、面板、内容渲染器和终端命令，但必须明确自己的生命周期与权限边界。

## 从现成示例开始

在“设置 → 插件”中可以加载一个本地插件目录、启停插件并编辑配置。仓库中的 `examples/observer` 是最小的完整示例：它提供工具、配置、只读面板、交互式 React 面板和内容渲染器；停用后会释放注册与订阅。

也可以在启动时替换必需能力。下例加载只读策略配置，使写入和进程操作被拒绝：

```powershell
bun run host --home .dev/readonly --workspace <你的项目目录> --demo --profile examples/read-only.profile.ts
```

## 生命周期和作用域

插件作用域可以是 Host、Workspace、Session、Run 或 Client。子作用域继承父作用域中的注册表；运行级插件不能意外泄漏到其他 Session。订阅、定时器、连接、Worker 和注册都必须通过 disposer 在插件停用、配置变更或 scope 释放时清理。

跨模块协作应通过公开的 SDK、服务或有类型事件完成。客户端插件不能绕过 Client SDK 直接操作 Host 内部状态；Host 插件也不能绕过审批入口或访问内核私有实现。

## 信任边界

插件目前是可信的进程内代码，可能拥有 Host 或浏览器页面权限。Cordis scope 负责生命周期与服务可见性，**不是**操作系统沙箱。只加载你审查过、来源可信的插件，并把长任务的取消和资源释放路径作为验收条件。

接口、manifest、依赖方向、例子和测试要求请阅读主仓库的 [插件开发文档](https://github.com/He-Jiahui/hbar/blob/master/docs/plugins.md)。开发插件时也应执行 [开发与验证](Development.md) 中与改动范围相符的检查。
