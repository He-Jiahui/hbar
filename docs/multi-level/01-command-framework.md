# P1：命令框架、分类目录与参数执行

状态：实施中，A1 命令包、A3 预算持久回执与 A5 Run 受理/查询/取消/watch 已交付；CLI/TUI 与其余领域入口迁移继续按 A6/A11 完成。上级：[总计划](command-first-architecture-plan.md)。依赖：[P0 包边界](00-framework-boundaries.md)。交付包：`packages/commands`，配套 hbar contracts、Host adapter 和 terminal adapter。

## 1. 对用户和代码统一的调用模型

```text
session.setBudget 120000 --session session_123
app.setSession "审查会话" --workspace workspace_1
```

```ts
// A3 已实现的类型化入口；持久写入必须有稳定幂等键。
await commands.execute(
  'session.setBudget',
  {
    sessionId: 'session_123',
    tokens: 120000,
  },
  { idempotencyKey: 'budget-request-1' },
)
```

字符串是稳定的操作标识。UI 不拼接待解析的命令行，避免表单值含引号、空格或路径时改变命令含义。字符串 parser、typed API 与网络入口最终得到同一种 invocation。

| 类别           | 示例                                                           | 实际责任                             |
| -------------- | -------------------------------------------------------------- | ------------------------------------ |
| Host command   | `session.setBudget`、`run.submit`、`approval.resolve`          | 修改业务事实，返回回执               |
| Client command | `app.setSession`、`app.openPanel`、`form.setField`             | 修改特定 runtime 的应用状态          |
| Query          | `session.list`、`settings.getThinkingLevels`、`usage.query`    | 返回类型化数据；不具备业务写权限     |
| Fact event     | `session.budgetChanged`、`run.completed`、`app.sessionChanged` | 由事实所有者发布；可有多个只读订阅者 |

command/query 共用可发现的具名能力目录；`kind`、`execution: host | client | platform`、`stateEffect`、`visibility` 是不同维度。平台命令经所属 runtime 的 PlatformPort 执行。fact event 不作为可执行命令列出，UI 不能发布伪造事实改变状态。

## 2. 命令定义与注册 API

每项声明包含：

| 组       | 必备字段与语义                                                               |
| -------- | ---------------------------------------------------------------------------- |
| 身份     | id、version、owner、namespace、scope、aliases                                |
| 可发现性 | category、titleKey、descriptionKey、keywords、visibility、surfaces           |
| 输入输出 | 输入/输出 Schema、目标类型、位置参数/具名参数映射、formSchemaId              |
| 执行     | kind、execution、stateEffect、capabilities、timeout、cancelMode、concurrency |
| 一致性   | idempotency、expectedRevision、回执保留策略、长任务支持                      |
| 可用性   | capability 条件、具名只读 availability check、不可用原因                     |
| 呈现限制 | 敏感字段、输入上限、结果上限、必要确认的声明                                 |

定义中的展示描述与 wire schema 可序列化；Zod 校验器、handler、权限检查器仅保留在注册代码。内置命令以同一受限 Schema 定义生成 TS 类型、wire schema、CLI 约束及表单约束，不手写四份验证。不能序列化的业务 refinement 注册为具名服务端校验，并明确标注需要最终 Host 校验。

```ts
// 概念接口：具体泛型在 P1.1 通过类型测试固定。
const session = registry.namespace('session')
const dispose = session.registerCommand('setBudget', {
  definition: setBudgetDefinition,
  execute: budgetCommandHandler,
})
```

`setBudgetDefinition` 来自 hbar/预算公开契约，`budgetCommandHandler` 来自领域 adapter；commands 包内部不认识预算。代码内调用根据 ID 推导参数和结果。插件动态输入按登记的 schema 验证为类型化数据，不能借动态扩展变成无验证的任意对象调用。

同一执行域/作用域的规范 ID 只有一个执行器。注册时检查名称、别名、版本、声明与实现一致；失败撤销本次注册，不能部分污染目录。disposer 清理 handler、补全、availability 及目录版本。

目录来自各功能贡献的联合视图，不维护一个依赖全部插件实现的中央文件。发布 catalog snapshot + revision，增删贡献可增量通知；目录合并拒绝冲突，权限或 scope 变化后重新计算可见性。

## 3. 命令名、文本解析与兼容

- 规范 ID 采用 `namespace.camelCase`；大小写精确匹配。搜索文案可以忽略大小写，执行器不能自动把 ID 转小写。
- argv 是 shell 已拆分的参数，直接解析；REPL 文本单独 tokenize，不把 argv 拼回文本再拆。
- 规定并测试单/双引号、空字符串、Unicode、转义、Windows 路径、负数、重复 flag、未知参数、`--` 后原始内容及输入容量。
- parser 不执行 shell、环境替换、管道、重定向、命令替换或任意代码。复杂 JSON/正文通过 `--input-file`、stdin 或结构化调用进入，文件读取由 CLI adapter 完成。
- `--workspace`、`--session`、`--context`、`--client` 是统一上下文参数；handler 得到已解析的稳定 ID。名称歧义返回候选 ID，不能自动挑第一项。
- 旧 slash 命令与 CLI 子命令通过显式 alias/参数 adapter 映射，迁移 `packages/terminal` 的 `toLowerCase()` 与 contracts 中仅小写的 regex。保留旧 `//` 发送字面 slash 的语义。
- `/new` 等历史复合行为可以由兼容工作流依次调用创建和选择，但不能再保留一份创建逻辑；每个结果均能核对。

## 4. 执行、权限、回执和恢复

invocation 包含协议/命令版本、requestId、规范 ID、输入、冻结目标、来源 runtime、可选 expectedRevision 和独立 idempotencyKey。实际 actor/权限由认证连接注入，自报来源只作关联用途。

执行顺序为：解析 → 定位执行域 → 校验类型与目标 → 鉴权/能力检查 → 版本与幂等检查 → 用例与既有审批链 → 提交 → 发布事实 → 更新回执/投影。显示禁用与执行端权限检查同时存在；UI 可用性不替代授权。

| 状态                        | 用户可观察的语义                            |
| --------------------------- | ------------------------------------------- |
| validating / submitting     | 本地校验或请求尚未被执行端确认              |
| accepted / running          | 已有 operationId，任务被受理或正在执行      |
| succeeded / failed          | 确定终态，包含结果/错误、关联对象和版本     |
| cancelRequested / cancelled | 取消已受理 / 执行端已确认停止；两者不能合并 |
| unknown                     | 断线、崩溃等导致尚不能确认结果，需核对      |

短命令返回提交版本和结果；长命令尽快返回 operationId，通过 `operation.get/watch/cancel` 操作。error 包含稳定 code、field path、retryable、关联 ID 与安全详情；View 在原位置翻译和显示。

持久副作用命令将身份/作用域/幂等键和规范载荷摘要写入 journal；同键同载荷返回同一结果，同键不同载荷拒绝。持久状态、事件、实体序号和回执在可行的同一事务中提交；外部网络/进程副作用复用意图日志，失败后核实 unknown，不承诺全局 exactly-once。

commands 提供执行机制与 journal/scheduler 端口；实际持久化在 storage，业务事务由用例协调。先落一个独立“成功回执”再写业务不符合验收。

网络超时后先按原 request/operation 核对，不用新键自动重放；超过公布的幂等保留窗口返回结果过期/未知。不同 Session 有界并发，同实体冲突写入依照领域锁或 CAS；无全局串行锁。AbortSignal 传播到可取消的 I/O，释放计时器/监听器，拒绝等待不代表底层副作用已停止。

本地 `form.setField` 等轻量命令不写 Host journal，不逐键发网络/持久日志。记录级别、容量与保留策略按执行类型声明，避免命令化造成输入延迟。

## 5. 分类命令面板

| category           | 对应公开操作示例                                                                      |
| ------------------ | ------------------------------------------------------------------------------------- |
| app.navigation     | setWorkspace、setSession、open/closePanel、open/closeWindow、openSettings、openStatus |
| workspace.session  | 工作区创建/打开；会话创建、重命名、归档、分支、导出、查询                             |
| run.approval       | submit、cancel、retry、审批、问卷                                                     |
| model.budget       | 设置模型、思考等级、预算，查询预算与模型能力                                          |
| agent.goal.plan    | 子 Agent 创建/取消；目标和计划 CRUD                                                   |
| files.tools        | 文件、附件、已交付 browser/computer 能力                                              |
| settings.providers | 设置读取、修改、继承、批量提交、供应商配置                                            |
| monitoring.git     | 性能、Usage、Git 查询与导出                                                           |
| system.extensions  | 连接、配对、设备、插件、路径、诊断                                                    |

category 和命令名是稳定 ID，显示名由宿主 i18n 提供。目录标记 `public | advanced | internal`；`form.setField` 和内部恢复操作保持可调用/可测试但不污染用户面板。普通键盘焦点移动不需要公开命令。

面板是目录消费者：按分类浏览/搜索 → 选择操作 → 绑定目标 → 参数不足则打开参数表单 → 验证 → 执行 → 原位回执。按钮、快捷键、历史引用同一 command ID。缺失执行器的贡献不能显示成可运行功能；当前不可用项显示原因。

`app.openCommandForm { commandId, target, initialInput }` 打开编辑器；表单提交时映射到目标命令。formSchemaId 的映射在注册时校验，隐藏字段也不能丢失目标、权限和版本参数。参数已齐全时直接执行，不要求先创建 UI form instance。

必要确认来自具体业务声明，绑定操作、目标和版本；CLI 非交互行为复用现有审批模式，不新增普遍的人工批准流程。

## 6. 独立交付与验收

| 切片 | 完整行为                                  | 主要验证                                             |
| ---- | ----------------------------------------- | ---------------------------------------------------- |
| P1.1 | 定义、注册、目录、解析和 typed invocation | 大小写、别名冲突、引号/空串/路径、畸形输入、类型失败 |
| P1.2 | 与 P2/P4 贯通预算用例和回执               | CLI/API 同结果，版本冲突、重复请求、原目标绑定       |
| P1.3 | 持久 journal、长任务、取消、恢复          | 崩溃/断线、超期键、外部 unknown、受理与完成区分      |
| P1.4 | 旧 terminal/CLI/UI 入口归并与分类目录     | 同输入错误一致、卸载清理、所有公开操作有分类         |

业务和恢复测试使用真实 dispatcher + 临时存储 + fixture 服务，不只断言某个 execute 函数被调用。组件列表和参数表单的视觉验收由 [P5](05-app-ui-rebuild.md) 补齐。
