# P5：hbar-app-ui 工作台与 Schema 渲染

状态：第二阶段实施中；P5.1、P5.2 与 P5.4 已完成，P5.3、P5.5–P5.7 待实施。Schema 设置工作台现已覆盖三层 override、动态内容、稳定 List 与 ProviderDialog。上级：[总计划](command-first-architecture-plan.md)。完整 UI 实施依赖第一阶段退出门禁；P1–P3 可以提前使用最小 UI adapter 验证框架。

P5.1 新增独立 `@hbar/app-react`，只公开 runtime context、只读订阅 hook 和工作台组合组件。Web 组合根负责 Client、runtime、Host generation、平台布局与 i18n；组件没有获得 Client、Host、Storage 或可写 store。生产 AppShell 现从 Host 目录按最多 100 项分页展示 Workspace → Session，展开保持为局部 UI 状态，选择与公开页面入口分别执行 `app.setSession`、`app.openPanel`、`app.openStatus` 和 `app.openSettings`。版本化布局描述经 Schema 校验；旧损坏 localStorage 不参与新状态，也不会被删除。无 Host 时显示只读断开状态并允许显式重连。

P5.2 已将选中 Session 的有界 timeline、流式 Markdown/GFM、安全渲染、Run 活动、审批、问卷、PromptInput 与可靠 AIUsage 接入同一个只读 runtime。草稿、附件、发送、取消、审批和问卷答案全部执行 command；React 不保存业务草稿或写共享状态。真实 Host 浏览器场景验证发送、用量结算、审批与取消，断线外壳继续使用相同受控组件显示明确状态。

## 1. 界面组合边界

`hbar-app-ui` 是受控组件库；`@hbar/app-react` 提供只读 hooks、ViewModel 映射、命令回调绑定、Schema ComponentRegistry/EditorRegistry；`apps/web` 注册功能、i18n、布局和平台 adapter。View 不获得原始 client/store，也不根据 UI 挂载状态维持业务运行。

实施前核对生产子入口。`6ec3b46` 已在 Web 挂载 `hbar-app-ui/workbench` 的结构性 AppShell/AppSidebar 和维护提示，但尚不连接 Host。第二阶段复用并接通该外壳，不重复创建 Shell，也不能用 catalog 演示组件或 preview 数据当成生产业务实现。

必须读取并应用[内容契约](../../.agents/skills/hbar-content-contract/SKILL.md)、[图标档位](../../.agents/skills/hbar-icon-scale/SKILL.md)；依据实际预览复刻时先按[参考布局](../../.agents/skills/hbar-reference-flow-layout/SKILL.md)及其 evidence 清单观察语义、流、断点和状态。本计划不虚构已观察过的预览结果。

## 2. AppShell、侧栏与布局所有权

```text
AppShell
├─ AppSidebar
│  ├─ header：品牌 / 命令入口
│  ├─ scroll：Workspace → Session
│  └─ footer：Host 只读状态 / 状态按钮 / 设置按钮
└─ Main workspace
   ├─ 当前 Session 主区
   ├─ PromptInput 与 AIUsage
   └─ 右侧工具入口与绑定 Session 的工具面板
```

默认布局保存在独立版本化描述文件，包含模块 ID/type、region/order、尺寸约束、可见性和配置。沿用 FlexLayout adapter 管理停靠与序列化；AppShell 消费同一逻辑布局投影，不再保存另一套相互竞争的面板 open/selected 状态。

普通内容采用语义 flex 流；不能用截图坐标、固定内容高度或定位排正文。真正浮层仅定位其容器，内部仍是正常流。桌面与窄屏使用同一模块 ID 和状态，工具区在窄屏变为可返回的单面板/抽屉。

侧栏工作区为一级、Session 为二级。一级展开属于局部 UI；点击 Session 执行 `app.setSession`，行内命令不冒泡触发行选择。按 stable ID 展示运行、未读、待审批摘要，流式正文更新不让整棵树重绘。

滚动只归树内容区，header/footer 固定在正常 flex 结构内。数据按 workspace 分页/增量加载，大列表虚拟化；空工作区、失效选中项、重复 ID、归档、长名称均有行为。树切换不改变其他窗口选择。

底部 Host 状态为只读数据；状态按钮执行 `app.openStatus`，设置按钮执行 `app.openSettings`。它们不同时包含隐式重连/保存等额外动作。

## 3. AIChat、PromptInput 与 AIUsage

AIChat 使用类型化 timeline：message、activity、approval、toolCall、plan，所有项由稳定业务 ID 关联。文本按现有 Markdown/GFM/sanitize 策略渲染；模型正文不能通过特殊文字伪造审批、计划或可执行 UI。

Activity 显示实际运行、队列、工具与子 Agent 状态；Approval 操作绑定 approvalId；Tool Calls 关联 ToolCall/Attempt/意图；Plan 展示真实计划及进度。展开内容可保留组件内部，但批准、拒绝、重试、取消和跳转绑定业务/应用命令。

PromptInput 使用 runtime 草稿；发送 `run.submit`，取消 `run.cancel`，模型/思考等级/附件/预算按钮引用同一命令目录。输入法、选区、自动高度为本地 UI 行为，字段/附件内容不能直写共享状态。

发送捕获原 Session、草稿 revision 与附件引用。等待期间可继续输入或切换，成功仅确认原提交，失败保留原草稿。新附件上传使用有界任务状态、取消和失败反馈，按钮附近显示结果。

AIUsage 紧接 PromptInput 下方，读 P4 的用量/预算投影，显示可靠已用量、剩余、模型、费用/速率与来源状态；不能按 UI 收到的文本长度自行结算。

## 4. 右侧工具入口

| 入口             | 打开命令/目标                              | 页面内容与闭环                                        |
| ---------------- | ------------------------------------------ | ----------------------------------------------------- |
| Files            | app.openPanel，kind=files，sessionId       | File Manager，分页树、预览、编辑/保存、路径权限与冲突 |
| Monitoring       | app.openPanel，kind=monitoring，sessionId  | Session/含后代 Usage、运行与可归属性能视图            |
| 子 Agent         | app.openPanel，kind=agents，sessionId      | 父子关系、状态、预算归属、创建/取消和跳转             |
| 目标与计划       | app.openPanel，kind=goalsPlans，sessionId  | 真实 Goal/Plan 查询、草稿、保存、清除及运行约束       |
| Session Settings | app.openSettings，scope=session，sessionId | 同一 Schema 设置系统，显示上层继承和本层 override     |

面板 instance 采用 P2 的 followActive/pinned 规则。打开、关闭、Escape 与重开都经应用命令；重复 open 聚焦已存在实例。读请求随目标变化失效，写请求始终绑定原对象，反馈归原操作位置。

旧浏览器/计算机、终端控制台、事件/诊断等能力通过注册的扩展面板或相应菜单仍可访问，不因右栏仅列五个主要入口而消失。

## 5. Schema 设置工作台

设置页由作用域选择 + 左侧 Schema 分组导航 + 右侧 SettingsForm 组成。顶层显示 global/workspace/session 和确切目标；每字段区分本层值、有效值、来源、dirty、错误及生效状态。

分组从 Schema 生成，文案来自宿主 i18n；页面不硬编码各供应商模型清单。多级分组和列表使用稳定路径/条目 ID，重排不丢草稿。切换作用域保留各自草稿，提交不在异步途中改绑新作用域。

ComponentRegistry 的目标形态：

```ts
// 概念注册，组件契约由 schema-core 的类型和 content report 推导。
components.register('ComboBox', comboBoxDescriptor, ComboBoxFieldAdapter)
components.register('List', listDescriptor, ListFieldAdapter)
editors.register('ProviderDialog', providerEditorDescriptor, ProviderDialogAdapter)
```

component descriptor 声明支持的字段类型、single/multiple、内容报告 kind、交互模式和版本；renderer 获得 `value/fieldState/content/labels/onIntent` 等窄 props。onIntent 转换为本地 form command，保存绑定 settings.apply/具体业务 command。adapter 与受控 hbar-app-ui 组件分离。

Provider List 按钮通过 `app.openSettingsEditor` 打开 ProviderDialog。子页面可高度定制组块，但共用 FormState、动态内容、继承、版本与保存；不能自建第二个 provider store。ComboBox 的 loading、empty、unavailable、error、selected-invalid 状态均按 P3 报告显示。

文件/目录控件显示路径所属环境，浏览器上传与 Host 路径查询分别实现。恢复继承与写默认值是不同命令；整组保存不包含未编辑的 inherited 值。保存失败或生效失败保留内容并展示对应状态。

## 6. 全局状态中心

| 分区                  | 可视内容                                                                                              | 用户操作                            |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Performance Dashboard | CPU、内存、线程、进程、磁盘 I/O、网络、Host 队列/并发                                                 | 时间窗、Host/进程过滤、详情         |
| Usage                 | 工具调用、并发、token 总量/速率、输入/输出速率、模型用量、金额、总耗时、TTFT/响应总时长、缓存命中变化 | scope/model/provider/时间聚合与导出 |
| Git                   | 自动提交数量柱状图、文件数、增删行时间图、repo 状态                                                   | 仓库/来源/时间窗过滤、提交详情      |

所有图表来自 P4。null/unavailable/gap 不画成真实零值；显示单位、口径、样本数量和估算状态。Session Monitoring 是同一查询的过滤视图，不另做一套累计逻辑。改变持久过滤/共享视图参数走应用命令，hover 十字线等仅本地 UI。

## 7. 分类命令面板与内容容量

分类、名称、参数、可用性和执行结果均消费 P1。必要时展开参数 form；补全使用可取消的只读 query。公开导航和子页面开关必须能在目录中找到，内部字段编辑不作为普通操作展示。

| 集合                                     | 容量所有者                                           |
| ---------------------------------------- | ---------------------------------------------------- |
| Workspace/Session 树、消息历史、工具日志 | pane-owned scroll + cursor/虚拟化，定义每页/渲染上限 |
| 命令搜索结果、供应商/模型列表、Git 历史  | 有界返回；达到阈值分页/搜索，按实际容量虚拟化        |
| 简短右栏按钮、设置操作组、少量选项       | 内容自然增长，不造固定高度滚动框                     |
| 时序图                                   | 服务端有界点数/降采样，客户端不加载全历史            |

宿主提供 typed labels/content/formatter；生产组件不含示例列表、硬编码可见文案或全局 locale 导入。预览 fixture 独立入口。图标统一 xs/sm/md/lg/xl，hit area 与图形尺寸分别设计。

## 8. 独立交付与验收

| 切片 | 完整交付                                     | 验收重点                                           |
| ---- | -------------------------------------------- | -------------------------------------------------- |
| P5.1 | app-react 基础绑定 + AppShell/侧栏           | 只读边界、命令导航、树滚动、两窗口、布局恢复       |
| P5.2 | AIChat/PromptInput/AIUsage 与活动卡          | 发送/审批/取消/结算、IME、断线、草稿保护           |
| P5.3 | 右栏工具，按工具拆独立提交                   | 绑定原目标、失败、关闭/重开、数据/写入闭环         |
| P5.4 | Schema renderer、设置工作台与 ProviderDialog | 动态依赖、类型兼容、override/冲突/失败、作用域切换 |
| P5.5 | 分类命令面板与参数表单                       | 按分类可发现、缺参数、不可用、原位错误、键盘       |
| P5.6 | 状态中心三个分区逐项提交                     | 数据口径、无数据/不可用、过滤、导出、容量          |
| P5.7 | 旧页面/样式删除与全回归                      | 功能映射闭合、无重复状态/写入口、生产/预览隔离     |

各视图覆盖非默认语言/长文案、0/1/正常/上限/上限+1 项、重复/失效 ID、列表变化后回调原目标、桌面/窄屏、键盘焦点与可访问名称。执行相关内容/图标/flow guards、build、Playwright 交互及人工截图检查；基于实际渲染流修正，不靠坐标补丁。
