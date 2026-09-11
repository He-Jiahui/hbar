# React Bits Pro Application UI clean-room audit

审计地址：[React Bits Pro · Application UI](https://pro.reactbits.dev/docs/app-ui)。

本记录来自逐页打开目录中的 38 个类别，并在每个类别的公开预览中读取渲染后的 DOM、ARIA 语义和控件状态；示例页的商业源码没有复制到 hbar。类别页的卡片只是索引，真正用于实现的是可观察的布局、密度、键盘行为、折叠关系、状态文案和响应式变化。

## 目录盘点

| 分组              | 类别（变体数）                                                                                                                                    | 观察到的主要交互语言                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| AI & Agents       | AI Chat（9）、Prompt Input（7）、Agent Activity（7）、Tool Calls（6）、Agent Approval（6）、Agent Plan（6）、AI Usage（8）                        | 模型/供应商详情、流式消息、附件、斜杠命令、运行时间线、工具参数折叠、审批风险、计划步骤、token 与费用 |
| Navigation        | App Shell（9）、App Sidebar（7）、Command Menu（6）、Navbar（14）、Mobile（5）                                                                    | 图标轨、二级导航、折叠侧栏、命令搜索、面包屑、分段标签、移动抽屉与底部导航                            |
| Data              | Cards（11）、Data Table（8）、Dashboard（14）、Analytics（16）、List（12）、Filtering（9）、File Manager（4）、Monitoring（10）、Empty State（5） | 主次信息层级、筛选/排序、选择与批量操作、详情面板、分页、图表 tooltip、拖放与空状态                   |
| Forms             | Settings Form（6）、Forms（12）                                                                                                                   | 左侧分组导航、label/说明两列、局部校验、sticky 保存栏、危险操作确认                                   |
| Overlays          | App Dialog（7）、Notifications（6）                                                                                                               | popover、drawer、sheet、Escape 逐层关闭、toast 暂停计时、通知筛选与详情                               |
| Auth & Onboarding | Onboarding（7）、Paywall（7）、Authentication（14）                                                                                               | 顶部/垂直 stepper、邀请、恢复、权限门槛、验证码、SSO、密码与设备状态                                  |
| Workflows         | Kanban（6）、Wizard（7）、Comments（6）、Scheduling（7）、Integrations（6）、Editor（5）、Feedback（6）、Support（5）、Billing（8）、Chat（6）    | 拖放、逐步确认、线程、日历、同步、编辑模式、反馈分流、支持会话、账单与群聊                            |

## 逐类 DOM/行为摘要

以下是每一类实际打开过的变体范围和对 hbar 的迁移判断。数字与目录的公开变体计数一致。

- **AI Chat**：9 个变体覆盖完整线程、模型选择器、语音/多模态、来源引用、多代理、就地审批、token meter、嵌入式助手和 artifact 侧栏。公共控件包含 `Attach a file`、`Send`、`Regenerate`、来源按钮、`Show request`、`Conversation settings`。hbar 对应 `Chat`、`PromptComposer`、`ActivityPanel` 和 `SessionTools`。
- **Prompt Input**：7 个变体覆盖 autosize textarea、`/` 命令、附件托盘、上下文 pills、拖放上传、模板变量、建议 chips、工具开关和 token 计数。命令菜单在输入框上方，列表行左对齐，键盘上下/Enter 选择。hbar 已在 `PromptComposer` 实现真实斜杠列表与键盘导航。
- **Agent Activity**：7 个变体覆盖 live stream、嵌套时间线、状态 rail、历史表、日志筛选、并行 lane 和失败详情。每步都有状态点、耗时或进度条，运行头部提供 Stop。hbar 已在 `ActivityPanel` 增加按 run 过滤的事件时间线。
- **Tool Calls**：6 个变体覆盖参数折叠、结果、diff、搜索结果、终端 stdout/stderr 和权限行；状态必须区分 pending/running/success/failure，并提供 retry 或 scope。hbar 的消息工具结果保持就地折叠，右侧工具面板承载运行/事件细节。
- **Agent Approval**：6 个变体覆盖破坏性操作、批量队列、scope 请求、成本预估、审批审计。审批卡的影响摘要先于原始 request，`Show request` 展开详情，决定按钮固定在卡片底部。
- **Agent Plan**：6 个变体覆盖 checklist、嵌套树、plan/actual、可编辑排序、todo board 和成本摘要；当前步骤突出，已完成步骤弱化，顶部显示 `2 of 7 done` 和 Stop。
- **AI Usage**：8 个变体覆盖总览、按模型成本、request log、overage、预算、rate limit、成员支出和升级入口；数字、进度条、周期切换是同一信息轴。
- **App Shell**：9 个变体中，App Shell 9 是 AI 会话三列框架，App Shell 2 是功能图标轨 + 可替换二级导航 + 主列表。桌面侧栏约 288px、内部按钮 32/36px、列表行 32px；折叠后主内容获得全部宽度。
- **App Sidebar**：7 个变体覆盖主侧栏、二级面板、嵌套树、移动 drawer、搜索和 row action。移动端以 scrim + sheet 覆盖，不挤压内容。
- **Command Menu**：6 个变体覆盖分组结果、嵌套页面、AI ask fallback、参数确认和内联 popover；输入获得焦点，Escape 返回上一层/关闭。
- **Navbar**：14 个变体覆盖项目标题、面包屑、分段 tab、通知/账户 popover、搜索、mega menu 和移动 accordion。按钮 28/32px，标签行左对齐，选中态用 pill/underline 而非阴影。
- **Mobile**：5 个变体覆盖五项 bottom bar、floating dock、展开动作按钮、bottom sheet 和全屏菜单；未放进主导航的功能进入 More sheet，触摸目标不小于 44px。
- **Cards**：11 个变体覆盖账单、余额、成员、文件、更新、指标、套餐、日程、onboarding、集成和 presence；卡片内操作靠近对象，列表按钮使用 `text-align:left`。
- **Data Table**：8 个变体覆盖筛选 toolbar、行选择/批量条、sticky header/first column、内联编辑、分页、展开行、详情 pane 和 loading/empty/error。
- **Dashboard**：14 个变体覆盖 metric grid、chart panel、状态板、工作日志、usage、服务 master-detail、loading/empty。主指标和行动队列优先于装饰。
- **Analytics**：16 个变体覆盖 metric strip、area/bar/stacked/donut/funnel、cohort、heatmap、radial、candlestick、scatter、dual axis；切换、tooltip、键盘 cursor 是行为的一部分。
- **List**：12 个变体覆盖递归文件树、leaderboard、runbook、联系人、inbox undo、供应商、webhook log、资产批量选择、队列重排、安全事件和可展开指标行。
- **Filtering**：9 个变体覆盖 facets、query builder、filter drawer、range/stepper、token input、结果计数和横向 category pills；sticky count/clear action 与筛选主体同层。
- **File Manager**：4 个变体覆盖 drive explorer、资产网格、详情 pane、上传队列；上传行显示 progress、pause/retry/cancel，完成项可清理。
- **Monitoring**：10 个变体覆盖平台健康、live stream、incident、alert inbox、日志 tail、uptime、fleet、latency、run queue、SLO burn-down。
- **Empty State**：5 个变体覆盖首屏、无搜索结果、all caught up、失败重试、dropzone；每个都有明确下一步而不是只显示空白。
- **Settings Form**：6 个变体覆盖设置分组、profile、preferences、成员、API keys 和危险区；设置主体是可滚动详情页，hbar 使用详情页底部的单一正常文档流操作区，避免保存条浮在内容上方。
- **Forms**：12 个变体覆盖 checkout、环境创建、调查、规则 builder、申请、属性内联编辑、预置开通和多步报价；字段说明与控件分列，校验就地出现。
- **App Dialog**：7 个变体覆盖标准 dialog、输入确认、表单校验、多步 dialog、drawer、detail sheet 和 menu/submenu；详情多时用二级页面/sheet，避免把完整表单塞进小弹窗。
- **Notifications**：6 个变体覆盖通知中心、toast stack、delivery matrix、activity inbox、banner 和 bell popover；toast 悬停暂停自动消失，Escape 关闭 popover。
- **Onboarding**：7 个变体覆盖 split profile、vertical/horizontal stepper、checklist、use-case、邀请和完成总结；每一步都有可恢复的输入。
- **Paywall**：7 个变体覆盖文章锁、升级 dialog、套餐对比、quota、试用过期、metered reads 和管理员申请。
- **Authentication**：14 个变体覆盖 centered sign-in、provider-first、two-step、magic link、code、SSO、passkey、account chooser、workspace picker、邀请和 approval challenge。
- **Kanban**：6 个变体覆盖 WIP、键盘移动、泳道、可重组列、master-detail 和窄屏列 pager。
- **Wizard**：7 个变体覆盖 card/full-screen/modal、step counter、review/edit、progress run 和 service tiles。
- **Comments**：6 个变体覆盖线程、inline annotation、code review、composer mentions、inbox resolve 和画布 pin。
- **Scheduling**：7 个变体覆盖 month agenda、time range、booking、deadline、availability、week timeline 和 schedule form。
- **Integrations**：6 个变体覆盖 marketplace、连接详情、API keys、webhooks、OAuth consent 和同步状态。
- **Editor**：5 个变体覆盖 rich text、markdown write/split/preview、code tabs/minimap/status、suggestion review 和 outline/focus。
- **Feedback**：6 个变体覆盖 widget、survey、rating、feature request board、triage inbox 和 insights。
- **Support**：5 个变体覆盖 help center、ticket form、ticket thread、workspace-data chat 和 request list。
- **Billing**：8 个变体覆盖 overview、plan manager、invoice wizard、recovery queue、plan change、payment methods、usage/overage 和 invoice detail。
- **Chat**：6 个变体覆盖 team channel、DM inbox、social thread、support widget、group attachments 和 live stream。

## 已迁移与后续边界

当前 hbar 已按真实预览行为完成的闭环：

1. 模型菜单改为桌面双栏“供应商/模型列表 + 稳定详情卡”，详情显示上下文、最大输出、费用和思考等级；窄屏退化为单栏。
2. Prompt Composer 增加输入框上方的斜杠命令列表、过滤、上下键、Enter 执行和能力对话框衔接；附件、权限、模型仍保留在同一输入轴。
3. Activity Panel 增加当前 run 的实时事件时间线、状态点、耗时和停止操作，并保持 trace 视图可查看原始事件。
4. 供应商/模型编辑器继续作为设置二级详情页，而非小弹窗；长表单独立滚动，返回时不丢失目录筛选。
5. 会话顶部的 Chat/控制台切换保持在同一会话区域；控制台复用 CLI 的字符串命令解析，`/thinking`、`/model` 和 `/settings` 通过文本输出或键盘候选完成，不打开第二个底部工具窗口。
6. 工具 rail 使用明确的一次一功能入口；图标 tooltip 从 rail 水平展开避免遮挡，并支持跨左右 rail 拖放和顺序持久化。

尚未纳入 hbar 产品范围的类别（例如完整账单、营销 mega menu、认证流程）保留审计结论，但不会为了“看起来像”而引入没有对应契约的假业务。后续迁移以 hbar 已有 Host/SDK/插件契约为边界，优先补齐工具调用、审批、计划、文件/Git/终端/浏览器和设置的状态与恢复行为。
