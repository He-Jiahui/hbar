# 架构概览

hbar 用清晰的跨进程边界把桌面体验、浏览器访问、Agent 执行与持久化分开。React 工作台不直接读取 Host 或 SQLite；Host 不把业务规则塞进 HTTP/WS Controller；共享的数据结构由 contracts 定义。

```text
Tauri 桌面 / 浏览器 / 手机浏览器
              ↓
React + Zustand 工作台
              ↓  HTTP / JSON-RPC over WebSocket
         Client SDK
              ↓
           Bun Host
       ↙               ↘
Session / Run 内核      Cordis 插件作用域
       ↓
Storage Worker → SQLite WAL
```

## 依赖方向

| 位置                            | 负责什么                                      | 不应做什么                                |
| ------------------------------- | --------------------------------------------- | ----------------------------------------- |
| `apps/web`                      | React 视图、Zustand ViewModel、布局与平台适配 | 直接导入 Host、kernel 或 storage          |
| `packages/client`               | 跨端传输、请求关联、重连与订阅恢复            | 依赖 React 或页面生命周期                 |
| `apps/host`                     | Bun 组合根、HTTP/WS Controller、认证          | 在 Controller 中实现领域规则或直连 SQLite |
| `packages/kernel`               | 用例、领域规则、调度、执行与审批入口          | 依赖 UI 或 Controller                     |
| `packages/storage`              | StoragePort、Worker、事务和投影               | 让调用方绕开端口直接访问数据库            |
| `packages/*-sdk` 与 `plugins/*` | 公开能力契约与插件实现                        | 访问其他模块私有状态或绕过权限入口        |

## 两个重要模型

前端采用 MVVM：React View 通过 selector 读取 Zustand ViewModel，通过明确 action 调用 Client SDK。后端采用 MVC：Controller 校验请求并调用用例，Model 保存领域规则和存储端口，响应与事件的序列化层维持公开契约。

持久化对象则遵循 [工作区与会话](Workspaces-and-sessions.md) 中的层级。Run 的取消、工具意图、消息流和重连都需要遵守这一层级，而不是由 UI 自己猜测后端状态。

## 深入阅读

- [主架构说明](https://github.com/He-Jiahui/hbar/blob/master/docs/architecture.md)：进程、协议、恢复、数据与安全细节。
- [插件开发](https://github.com/He-Jiahui/hbar/blob/master/docs/plugins.md)：SDK、作用域、manifest 和公开接口。
- [CLI 与终端](https://github.com/He-Jiahui/hbar/blob/master/docs/cli.md)：Host 的键盘客户端和无头模式。
- [开发与验证](Development.md)：在改变这些边界时需要运行的检查。
