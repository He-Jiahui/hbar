# P0：框架包、业务模块与组合根

状态：完成。P0.1–P0.4 已随 A0–A15、B1–B7 逐项落地：commands、schema-core、settings-core、app-runtime 与 app-react 均有真实消费者、公开出口、依赖方向和行为门禁；CLI 构建不含 React，hbar-app-ui 不依赖 runtime。上级：[总计划](command-first-architecture-plan.md)。本计划固定所有后续子计划的源码边界；它不要求预先创建没有真实使用者的包。

## 1. 三层职责

| 层              | 内容                                                                 | 判断标准                                                   |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| 框架机制        | commands、schema-core、settings-core                                 | 去掉 hbar 的 Session/Provider 数据，仍可用测试领域独立执行 |
| hbar 领域和应用 | contracts、kernel、领域插件、app-runtime                             | 定义 hbar 的命令、状态结构、作用域、表单及业务语义         |
| 产品装配和呈现  | apps/host、apps/cli、apps/web、app-react、hbar-app-ui、Tauri adapter | 选择实现、注册能力、装配界面、连接平台和服务器             |

“核心只有注册”指组合根变薄。预算结算、运行调度、审批、设置应用规则仍有明确业务模块；不得将这些代码伪装成注册 callback 堆在入口文件，也不得塞入通用框架。

## 2. 包公开入口与依赖

下表路径均为规划目标。只列新增职责；现有包按公开出口渐进整理。

| 包/入口                   | 公开内容                                                                          | 允许的项目依赖                                                      | 禁止导入                                              |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| `@hbar/commands/protocol` | CommandDescriptor、Invocation、Receipt、CommandError、catalog 版本                | 无 hbar 业务包                                                      | contracts、kernel、React、Zustand、平台 API           |
| `@hbar/commands`          | 定义、注册、解析、补全、执行流水线、执行端口                                      | 自身 protocol                                                       | app-runtime、schema-core、具体网络/存储               |
| `@hbar/schema-core`       | Schema 描述、编译校验、SchemaPath、FormState 转换、callback 报告和依赖图          | 无 hbar 业务包                                                      | commands、settings-core、React、Zustand、Provider SDK |
| `@hbar/settings-core`     | LayerResolver、来源报告、ChangeSet、保存计划、版本和迁移端口                      | schema-core                                                         | commands、contracts、SQLite、React                    |
| `@hbar/contracts`         | hbar 命令定义、领域 DTO、网络方法、事件、状态、设置定义类型                       | commands/protocol、schema-core、settings-core 的公开类型/纯校验入口 | 执行器、runtime、client、业务插件实现                 |
| `@hbar/app-runtime`       | createAppRuntime、只读 StateReader、CommandClient、各状态/功能模块、Host/平台端口 | commands、schema-core、settings-core、contracts、zustand/vanilla    | React、DOM、Tauri、client 实现、kernel、storage       |
| `@hbar/app-react`         | 只读订阅 hooks、ViewModel adapter、command/form bindings、renderer registry       | app-runtime 的只读 API、schema-core、React、hbar-app-ui 生产入口    | client、kernel、storage、原始可写 store               |
| `hbar-app-ui`             | 受控组件、typed props、文案包、稳定 ID 回调                                       | 现有受控视图依赖                                                    | 上述运行时/领域包、apps/web、全局文案或数据 store     |
| `@hbar/client`            | typed RPC、连接、请求关联、订阅恢复                                               | contracts                                                           | app-runtime、Zustand、React                           |
| `@hbar/kernel`            | Host 用例、命令 adapter、设置应用服务、StoragePort                                | contracts、commands、settings-core、公开 SDK/端口                   | apps、UI、客户端 runtime、具体 storage 实现           |
| `@hbar/storage`           | 回执/事件/设置等端口实现、Worker、事务、迁移                                      | 现有公共存储契约                                                    | UI、Controller、领域插件私有实现                      |

三个基础框架包独立于 hbar contracts，避免 `commands → contracts → commands`。命令声明只保存 `formSchemaId`，不导入 Form 引擎；Schema callback 只定义 typed 调用端口，由 app-runtime 或 Host adapter 接到 commands。Schema 设置包不在内部拼 RPC。

`contracts` 按 `commands/`、`settings/`、`state/`、`events/`、领域 DTO 分文件，仍是无执行器的契约包；不能因新增框架再扩大为单一大文件。

## 3. 端口所有权

| 端口                                         | 所有者        | 实现/装配位置                            | 核心约束                                             |
| -------------------------------------------- | ------------- | ---------------------------------------- | ---------------------------------------------------- |
| Authorization / ExecutionJournal / Scheduler | commands      | Host 用公开领域服务和 StoragePort 装配   | 无 journal 时只能声明对应的暂态保证，不伪造持久幂等  |
| SchemaCallbackPort                           | schema-core   | runtime/Host 命令桥接器                  | 名称、输入、输出、AbortSignal、返回上限均验证        |
| SettingsRepositoryPort                       | settings-core | Storage Worker adapter                   | compare-and-commit、受影响层级版本、原子 patch       |
| SettingsDomainValidator                      | settings-core | kernel 或领域插件                        | 校验模型/路径等业务约束；不在校验时偷偷执行副作用    |
| HostCommandPort / StateFeedPort              | app-runtime   | `apps/*/adapters/client` 使用 client SDK | 引用公开契约，复用现有 HTTP/WS，不造第二传输         |
| PlatformPort / ClientPersistencePort         | app-runtime   | Web、CLI、desktop TS adapters            | 能力探测、取消、作用域与清理；原生实现留在 Tauri     |
| StateReader / CommandClient                  | app-runtime   | runtime 创建并向 View 暴露               | 只读快照与调用；内部 reducer/writer 不可导入         |
| ComponentRegistry / EditorRegistry           | app-react     | Web UI 组合根及受控 UI 扩展              | 白名单、类型兼容、版本、disposer；无任意 import 路径 |

消费者声明端口，组合根注入实现。公共 SDK 可转出端口类型，不能导出底层服务容器让插件自行取任意可写服务。

## 4. hbar 核心目录形态

```text
packages/
  commands/            protocol / catalog / parser / execution
  schema-core/         descriptor / path / validation / form / content
  settings-core/       layers / resolution / changes / persistence / migration
  app-runtime/
    public/            只读接口、CommandClient、createAppRuntime
    navigation/        当前目标与逻辑 surface
    drafts/            提示词、附件、表单宿主
    projections/       各领域投影与同步
    features/          hbar 应用命令注册与状态组合（逐功能入口）
    ports/             平台、Host、持久化
  app-react/           state / commands / schema / view-models
  contracts/           commands / settings / state / events
  kernel/              各领域 usecase / command-adapter / query-adapter
apps/
  host/src/            composition / controllers / adapters
  cli/src/             composition / argv / output / adapters
  web/src/             composition / features / locale / descriptors / adapters
plugins/*/             本领域声明、handler、Schema、可选 renderer
```

目录表达职责，不要求机械一文件一层。`features/` 不允许成为跨领域任意写状态入口；每个功能只接收自己的私有 writer 和所需公开端口。

Web 组合根只做：创建传输 adapter → 创建 runtime → 注册 hbar client commands/Schema callback → 注册 component/editor → 注入文案与布局 → 挂载 View。Host 组合根注册领域服务与执行器。CLI 组合根不加载 React、DOM 或 renderer registry。

## 5. 状态与框架的连接

Schema/Form 的纯状态机产出新状态与待执行效果描述，不创建全局 store，也不依赖 React。app-runtime 为表单实例创建 Zustand vanilla slice，通过 `form.*` handler 执行状态机并管理异步内容请求。

settings-core 解析与校验多层值；Host 是持久设置的权威执行方。客户端可复用纯解析得到预览，但保存结果和最终生效版本以 Host 为准。共用算法不等于共用可变状态。

app-react 接收窄接口，不获得 createAppRuntime 的内部容器。ViewModel action 只能绑定目标并调用 CommandClient；禁止通过一层 `actions.ts` 转发 setState 来规避只读边界。

## 6. 扩展、版本与资源释放

- 每项注册有 owner、namespace、version、scope 和 disposer；重复名称/别名、未知组件、callback 返回类型不兼容在注册/编译时明确失败。
- 复用 Cordis scope，不另造全局服务定位器。runtime、Host scope、插件卸载分别清理自己注册的能力及其在途任务。
- 包版本、命令版本、目录版本、Schema 版本、持久设置版本与协议版本独立。对破坏性变更提供显式 alias/适配/迁移，不仅增加 package version。
- 数据描述中不包含函数、JS 表达式、任意 import、远程脚本或密钥。代码执行器只来自已注册模块。
- 插件停用后目录和 callback 失效，面板显示能力不可用，草稿和已保存值保留；重启或升级通过版本校验恢复。
- 受信插件的端口约束不是恶意代码沙箱。使用既有权限及受管执行边界，不扩大本次为全面强隔离平台。

## 7. 独立交付与验收

| 切片 | 产物                                    | 验收                                             |
| ---- | --------------------------------------- | ------------------------------------------------ |
| P0.1 | 当前入口与状态映射、依赖禁令            | 每个功能有唯一所有者；说明历史/当前工作树差异    |
| P0.2 | 首个真实使用的框架包出口与门禁          | commands 的测试领域无需 hbar 领域数据即可运行    |
| P0.3 | 随 P3 落地 Schema/Settings 独立依赖测试 | 无 React/数据库的表单和层级覆盖可运行            |
| P0.4 | 随 P5 落地 React renderer adapter       | hbar-app-ui 不导入 runtime；CLI 导入图不含 React |

门禁包含 workspace dependency graph、ESLint 禁止导入/深层导入、无循环依赖、包出口的类型检查及行为测试。不能只用文本搜索 `setState` 宣称完成封装；需证明 View/插件拿不到 writer，返回快照也不能通过嵌套引用污染内部状态。
