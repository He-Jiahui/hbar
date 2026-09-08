---
name: hbar-engineering
description: 在 hbar 仓库开发、重构、排错、评审和交付 React/Zustand 工作台、Bun TypeScript Host、SDK 或插件时使用。执行模块边界、MVVM/MVC、描述文件布局、就近交互、可靠增量同步、严格类型与 lint、逐子功能验证和立即 Git 提交规范；问题优先查证提交历史。仅用于 hbar 项目及其工作树。
---

# hbar 工程规范

## 使用方式

本技能是 hbar 的项目约束，不是现有实现全部达标的声明。相对仓库路径以当前 hbar 工作树为根，不绑定某台机器的绝对路径。

1. 先检查 `git status --short`、相关代码、`package.json` 与既有测试，确定当前功能、模块所有者、公开接口及验收条件。
2. 涉及 React、状态、布局或交互时读取 [前端与界面](references/frontend.md)。
3. 涉及 Host、存储、异步任务、Client SDK 或通信时读取 [后端与同步](references/backend.md)。跨端功能同时读取两份。
4. 所有代码任务读取 [质量与交付](references/quality.md)，每个子功能通过对应检查后立即提交，再进入下一项；排错优先执行其中的 Git 历史查证流程。纯规范修改执行文档与技能校验，不虚构业务测试结果。

## 模块与架构

“不准耦合”具体指禁止隐式耦合、循环依赖、反向依赖和访问其他模块内部实现。必要协作通过有类型、可验证的公开契约完成，不能声称模块间完全没有依赖。

| 边界                               | 职责                                          | 禁止事项                                            |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `packages/contracts`               | DTO、Zod schema、协议版本、事件契约           | 依赖 UI、Host、数据库或业务实现                     |
| `apps/web`                         | React View、Zustand ViewModel、布局与平台适配 | 直接导入 kernel/storage/Host；组件自行管理网络协议  |
| `packages/client`                  | 跨端传输、请求关联、连接与订阅恢复            | 依赖 React、Zustand 或页面生命周期                  |
| `packages/ui-sdk`                  | Client 插件公开接口                           | 暴露内部 store、Host 实现或任意全局状态写入能力     |
| `apps/host`                        | Bun 入口、组装、HTTP/WS Controller、认证      | 在路由里堆积业务规则或直接读写 SQLite               |
| `packages/kernel`                  | 用例、领域规则、调度、执行与审批入口          | 依赖 UI/Controller；绕过审批或依赖具体插件私有实现  |
| `packages/storage`                 | StoragePort 适配、Worker、事务与投影          | 引入 UI/Controller 规则；让调用方绕开端口访问数据库 |
| `packages/plugin-sdk`、`plugins/*` | 能力契约、插件实现、作用域与释放              | 越过公开 SDK 操作内核私有状态或绕开权限入口         |
| `apps/desktop/src-tauri`           | 窗口、托盘、本地 Host 启动与连接              | 承载本应由 Bun Host 管理的会话业务                  |

- 前端采用 MVVM：React View 调用 ViewModel 的明确 action，通过 selector 读取状态；ViewModel 通过 Client SDK 操作后端，Model 表达领域数据与纯转换。
- 后端采用 MVC：HTTP/WS Controller 校验请求并调用用例；Model 包含领域规则及存储端口；接口的 View 是有契约的响应/事件序列化层。通过应用服务协调用例，不能把业务规则塞进 Controller。
- MVVM 与 MVC 各自用于对应边界，不为凑命名重复创建两套状态或镜像目录。共享类型不等于共享可变状态。
- 跨 workspace 包只能使用公开导出；禁止 `../../other-package/src/...` 等深层导入。包内功能也必须有明确入口，不得绕过入口修改另一功能的状态。
- 依赖方向保持单向；跨功能通过公开 action、用例或有类型事件协作，必要时使用端口与依赖注入。组合根可以装配具体实现，但不能成为其他模块反向依赖的全局服务容器。
- 按领域和变更原因拆分文件。只抽取有实际复用价值的公共模块，不把业务代码堆进万能 `utils`、单一 store 或巨大组件。
- I/O、副作用和资源生命周期归属明确；订阅、定时器、连接、Worker、插件注册必须有可验证的释放路径。

## 不可降低的交付标准

- React 相关功能单元组件化；Zustand 管理应用共享数据；不得用多个状态源复制同一业务事实。
- 后端业务和自动化脚本由 Bun 运行 TypeScript，复用 workspace 工具链。
- 启用严格代码 lint 和 TypeScript 类型检查；禁止滥用 `any`、类型断言或忽略指令掩盖问题。
- 界面以适度圆角矩形、多模块工作台为主，方便、简洁、可快速定位功能；布局保存在独立描述文件中。
- 同一栏目中的按钮职责独立、语义单一且不重复；动作目标显式绑定，结果、错误、进度就近展示。
- 功能必须完成可用闭环，包括与该功能有关的空态、处理中、成功、失败、恢复和取消等状态；不得以静态占位或半成品宣告完成。
- 后端支持有界并发、超时、取消与恢复；前端投影最终与后端事实一致，不能长期假成功或持续无反馈。
- 推送按需、有界、简洁；可稳定增量传递的内容不得反复全量发送；协议版本、顺序、幂等和恢复语义必须清晰。
- 每个子功能完成并通过验证后立即独立 commit，再进入下一项，不积攒到整个大功能结束；提交后本次改动无残留，保持工作区干净，保留用户及其他任务的既有改动。
- 问题排查优先查证相关 Git commit 历史、提交差异及未提交改动；原因判断必须有复现或测试证据，提交记录保留目的、验证结果及修复依据。

## 与现有实现衔接

初始检查日期：2026-09-09。后续使用必须以实际代码重新核实。

- 已有 React、Zustand、Bun、FlexLayout、Client SDK、contracts、Storage Worker，以及 TypeScript `strict` 和 `noUncheckedIndexedAccess`。
- `package.json` 尚无 `lint`，`check` 目前只做类型检查和 Bun 测试；Prettier 不是代码 lint。严格 lint 的接入规则见质量规范。
- `App.tsx` 仍含默认布局构造和直接 Client 调用；`stores.ts` 集中多类行为。修改相应功能时落实组件、ViewModel 和布局描述边界。
- 当前 `stream.update` 的 `LiveStream` 携带累计文本，不能仅因限频就视作增量推送。涉及流式链路的实现任务须按后端规范同时设计契约、生产端、消费端和恢复逻辑。

这些差距是后续实现的约束输入。本技能创建任务只建立规范，不自动扩张为整个仓库的架构迁移；不能把未处理的差距标记为已解决。
