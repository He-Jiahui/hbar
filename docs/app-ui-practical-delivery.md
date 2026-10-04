# app-ui 实用交付回执：38 类 / 300 变体

本轮按用户调整后的标准交付：核心流程成立、语义结构有依据、内容变化后自然流布局合理、关键操作可达。
共享机制和未变布局可由实现与已有案例推导，不逐按钮、逐主题或逐视口组合重复验证。
38 类均有对应实现与核心机制依据，300 个稳定 ID 的来源映射和本地入口已核对；这里不使用“严格全量通过”的说法。

逐变体的容量策略、当前状态和未证实动作见 [变体清单](app-ui-variant-inventory.md)，
各次实现和验证过程见 [集成记录](app-ui-integration.md)。
严格参考审计仍是独立的可选流程，见 [审计说明](app-ui-visual-audit.md) 和
[当前交付标准](reactbits-pro-visual-audit.md)。本回执不会改写历史 `needs-fix` / `needs-review` ledger。

## 范围和机制交付

- 完整目录：38 类、300 个本地 ID、300 个来源 ID、300 行交付记录，无重复、缺失或额外项；逐行组件入口存在。
- 变体结构：保留来源的区域、阅读顺序、控件和状态差异，不再仅靠类别模板替换标题或数字。
- 内容归属：宿主提供类型化文案、内容和列表；React 表面消费受控契约，预览 Zustand 模型拥有本地状态。
- 交互边界：按稳定目标 ID 处理草稿、筛选、选择、展开、取消和重试；异步确认及失效 owner 有相应保护。
- 布局边界：自然 flex/flow 与明确的 content-grown、pane-scroll、pagination 或 virtualization 策略；覆盖层与普通内容分开。
- 审计设施：保留 discover / capture / interactions / compare / audit 五个入口，动态来源目录、DOM/AX/控件状态、截图与差量报告、失败分类及 live/offline 模式。
- 报告契约：公开类型已对齐实际 capture、interaction、delta、feedback 和结构化错误记录；旧字符串错误保留兼容。

以下表格索引已完成的类别闭环，不是本次重跑了全部脚本。未改部分复用已记录的实现、测试和预览证据；
具体测试数量与诊断范围以集成记录和对应产物为准，不将各次结果拼成一次“全套测试”。

| 类别           | 变体数 | 核心机制 / 证据入口                                                                            | 主要实现提交                              | 业务或来源边界                                                  |
| -------------- | -----: | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| AI Chat        |      9 | [对话、披露、模型、草稿与窄屏](../scripts/verify-hbar-app-ui-ai-chat-reference-core.ts)        | `70413de7`                                | 无真实 provider、麦克风或文件操作；未证实审批只报请求           |
| Prompt Input   |      7 | [输入、模型、附件、变量与键盘](../scripts/verify-hbar-app-ui-prompt-reference-core.ts)         | `493ef7e8`                                | 不伪造发送、上传或模板运行；来源 7 的单组件裁切另列             |
| Agent Activity |      7 | [时间线、披露、筛选与有界回放](../scripts/verify-hbar-app-ui-agent-activity.ts)                | `16afb5e8`                                | Stop / Retry / Download 的真实远端结果未接入                    |
| Tool Calls     |      6 | [目标绑定、参数输出、权限与失败](../scripts/verify-hbar-app-ui-tool-calls.ts)                  | `16835b8c`                                | 不执行真实工具或授予权限                                        |
| Agent Approval |      6 | [请求队列、决定、范围与历史](../scripts/verify-hbar-app-ui-agent-approval.ts)                  | `4a0c730f`                                | 本地确认不等于真实删除、授权或计费                              |
| Agent Plan     |      6 | [计划草稿、暂停、定向重试与事实保留](../scripts/verify-hbar-app-ui-agent-plan.ts)              | `10c2dc34`                                | 不执行任务或虚构耗时、成本更新                                  |
| AI Usage       |      8 | [快照、排序、分页、配额与范围](../scripts/verify-hbar-app-ui-usage.ts)                         | `6f8c6938`                                | 无真实账单或套餐策略修改                                        |
| App Shell      |      9 | [各类工作台区域与 owner 状态](../scripts/verify-hbar-app-ui-app-shell.ts)                      | `3c5d1ed7`                                | 预览导航、保存和服务动作不等于正式宿主接入                      |
| App Sidebar    |      7 | [导航、披露、选择和窄屏流](../scripts/verify-hbar-app-ui-app-sidebar.ts)                       | `932e7d43`                                | 无真实账户或文件操作                                            |
| Command Menu   |      6 | [查询、分组、键盘和 10,000 项虚拟化](../scripts/verify-hbar-app-ui-command.ts)                 | `445a0015`                                | 不真实邀请或修改项目、模型与工作流                              |
| Navbar         |     14 | [导航、菜单、搜索与 tabs](../scripts/verify-hbar-app-ui-navbar.ts)                             | `19d1d972`                                | 不真实邀请、部署或分享                                          |
| Mobile         |      5 | [移动布局、选择、披露与短高可达性](../scripts/verify-hbar-app-ui-mobile.ts)                    | `bd460214`                                | 不伪造运行、创建、附件或未知 tab 内容                           |
| Card           |     11 | [独立卡片语义、选择与内容流](../scripts/verify-hbar-app-ui-card.ts)                            | `c8785a86`                                | 无真实连接、下载或转账；未捕获周期明确不可用                    |
| Data Table     |      8 | [筛选、排序、选择、分页与草稿](../scripts/verify-hbar-app-ui-data-table.ts)                    | `ded8880a`                                | 不伪造导出、保存或未知页数据                                    |
| Dashboard      |     14 | [独立指标/面板与超容量列表](../scripts/verify-hbar-app-ui-dashboard.ts)                        | `1de5b48a`                                | 无真实连接、支付或回滚；缺失数据不推成事实                      |
| Analytics      |     16 | [图表、选择、披露与周期来源](../scripts/verify-hbar-app-ui-analytics.ts)                       | `a84cf4a8`、`b309f322`；子仓 `adb8f05c8b` | 未捕获周期不可用，部分图形明确为示意；无真实指标服务            |
| List           |     12 | [查询、分组、目标动作与 pane 滚动](../scripts/verify-hbar-app-ui-list.ts)                      | `351a8dbf`                                | Download / Move / Delete / Replay 及未知周期只保留请求边界      |
| Filtering      |      9 | [草稿、组合条件、计数与空态恢复](../scripts/verify-hbar-app-ui-filtering.ts)                   | `e66f8c9b`                                | 部分关联为本地推导；无真实搜索或预订                            |
| File Manager   |      4 | [目录、选择、筛选与超容量 pane](../scripts/verify-hbar-app-ui-file-manager-core.ts)            | `ea1ae18b`                                | 无真实存储、传输或下载；未知目录不补造文件                      |
| Monitoring     |     10 | [过滤、详情、窗口与有界预览流](../scripts/verify-hbar-app-ui-monitoring-core.ts)               | `a9217339`                                | 无真实遥测、Resolve 或未知窗口数据                              |
| Empty State    |      5 | [空态主流程与局部反馈](../scripts/verify-hbar-app-ui-empty-state-core.ts)                      | `4bfb122e`                                | 无真实上传、导入或服务重试                                      |
| Settings       |      6 | [owner 草稿、确认、失败重试与 Cancel → Review](../scripts/verify-hbar-app-ui-settings-core.ts) | `3c354b77`、`d3b816d3`；子仓 `97a9930fcd` | 无真实保存、上传或密钥/危险操作；未知 Review 后果不伪造         |
| Forms          |     12 | [活跃 Host 边界与代表性表单](app-ui-integration.md#forms-112-active-owner-closure)             | `10e96174`                                | 未证实提交与上传只报告类型化请求                                |
| App Dialog     |      7 | [既有逐变体签核与容量记录](app-ui-variant-inventory.md)                                        | `a474be2b`                                | 复用未变实现的历史预览证据，不宣称正式服务接入                  |
| Notifications  |      6 | [偏好失败重试、确认已读与窄屏长文](../scripts/verify-hbar-app-ui-notifications-core.ts)        | `b4b00b53`、`4dafef3a`；子仓 `f66cc62bd8` | 1/2/4/5 复用未变证据；6 历史 source 裁切仍为 strict `needs-fix` |
| Onboarding     |      7 | [活跃 Host 边界与 1/5 代表流程](app-ui-integration.md#onboarding-17-active-owner-closure)      | `9eb8818e`                                | 无真实上传、邀请、Tour 或工作区创建；未知步骤不补造             |
| Paywall        |      7 | [套餐选择、输入、退出和局部反馈](../scripts/verify-hbar-app-ui-paywall-reference-core.ts)      | `68c401fe`                                | 无真实购买、登录、邮件或续订                                    |
| Authentication |     14 | [受控输入、provider 与核心校验](../scripts/verify-hbar-app-ui-authentication-core.ts)          | `7b8916ca`；2–5 详见集成记录              | 无真实认证、SSO、WebAuthn 或导航；2/3 的 strict 差异另列        |
| Kanban         |      6 | [稳定目标移动、键盘、原生拖拽与取消](../scripts/verify-hbar-app-ui-kanban-core.ts)             | `a8365353`                                | 本地状态变更，不等于远端同步；来源详情范围有限                  |
| Wizard         |      7 | [草稿、步骤、校验、返回与复核](../scripts/verify-hbar-app-ui-wizard-core.ts)                   | `59988845`                                | 不伪造支付、最终发送、部署或未知跳步结果                        |
| Comments       |      6 | [线程目标、mention、reaction 与 resolve](../scripts/verify-hbar-app-ui-comments-core.ts)       | `fe3d8645`                                | 无真实发布或上传；6 的历史 strict `needs-review` 保留           |
| Scheduling     |      7 | [日期/时段、选择、回退与预约请求](../scripts/verify-hbar-app-ui-scheduling-core.ts)            | `0f04ecf9`                                | 无真实预约持久化；4 的来源顶部裁切另列                          |
| Integrations   |      6 | [连接草稿、筛选、失败和重试](../scripts/verify-hbar-app-ui-integrations-reference-core.ts)     | `dd8f9b28`                                | 无真实 OAuth、凭据、同步或投递                                  |
| Editor         |      5 | [草稿、预览、选择与本地编辑](../scripts/verify-hbar-app-ui-editor-core.ts)                     | `029490c9`                                | 安全 Markdown 子集；无真实 Run / Save / Export                  |
| Feedback       |      6 | [评分、草稿、验证、重试与定向动作](../scripts/verify-hbar-app-ui-feedback-core.ts)             | `689a890f`                                | 无真实发送、Issue 创建或归档                                    |
| Support        |      5 | [帮助、助手与请求流程](../scripts/verify-hbar-app-ui-support-reference-core.ts)                | `08850354`                                | 无真实 AI、转人工、工单创建或投递                               |
| Billing        |      8 | [套餐、账单、付款草稿与状态](../scripts/verify-hbar-app-ui-billing-reference-core.ts)          | `fa0e6ff2`                                | 无真实支付、扣款或套餐切换                                      |
| Chat           |      6 | [消息、线程、群聊、草稿与选择](../scripts/verify-hbar-app-ui-chat-reference-core.ts)           | `ee9e0012`                                | 无真实投递、已读回执、通话或下载                                |

Analytics 的主仓适配、测试和文档实际包含在并行提交 `a84cf4a8`，另有周期来源修复与子仓提交；
保留真实提交归属，不补写一个不存在的独立提交。其余类别的具体历史增量以集成记录为准。

## 最终范围核对（不重放界面）

[交付范围检查](../scripts/verify-hbar-app-ui-delivery.ts) 只检查目录、来源元数据、逐变体记录及组件入口。
它要求显式传入已授权的来源 inventory；没有缓存就失败，不猜测替代路径，也不绕过参考站访问限制。
来源捕获时间、URL 和 hash 会写入报告，不能将旧捕获描述为刚刚重新访问线上站点。

```text
bun scripts/verify-hbar-app-ui-delivery.ts artifacts/reactbits-pro-visual-audit/authentication-2-current-v2/source-inventory.json
bun test ./tests/hbar-app-ui-delivery.test.ts ./tests/reactbits-pro-audit-contract.test.ts --timeout 20000
```

实测范围结果：`categories=38`、`localIds=300`、`sourceIds=300`、`deliveryRows=300`。
报告输出在被忽略的 `artifacts/app-ui-delivery/report.json`；来源 inventory 捕获时间为
`2026-09-29T23:01:54.109Z`。4 个范围测试覆盖缺失/重复/额外 ID、类别/编号/URL 差异、
不可用来源、不完整记录和历史 strict 限制；另 3 个公开报告契约测试覆盖状态差量及证据边界。

报告明确保留 `interactionReplayInThisRun=false`、`freshStrictAcceptance=false`、
`remoteBusinessDelivered=false`。本检查不把“映射完整”自动升级为“每个操作或真实服务已验收”。

## 验证结果及未纳入本轮的事项

- 各子功能已按改动风险完成对应单元/契约测试、核心浏览流程、范围内 lint 和相应布局/图标/内容 guard，并独立提交；不重新排列主题/尺寸反复运行。
- 最近 Notifications 修复：3 条生产浏览器核心记录、0 条页面/控制台诊断，10 个契约测试 / 112 assertions；完整长文动作、筛选和页脚在 286×420 可达。
- 根预览生产构建、Lumen 子仓类型检查与 bundle 已通过。已有大 chunk 告警不冒充失败，也不宣称已优化。
- 根全局 TypeScript 检查仍只有两项既有 SessionStop `guided` 错误：`session-stop-model.ts:251`（TS2678）及 `session-stop.tsx:223`（TS7053）。它们属于其他未提交工作，本轮不改动、不报告全局绿灯。
- 子仓锁定 pnpm 12.3.4，当前安装版本 11.19.0；使用已有 CLI 验证类型与构建，未安装新工具，也未宣称锁定 pnpm 工作流通过。
- 历史 strict 审计的 `needs-fix` / `needs-review`、未知来源 after-state 及部分来源裁切继续如实保留。没有新跑 2400 组静态组合或逐按钮全量对照。
- live / offline 审计门禁和报告设施保留可执行入口；本轮未新增外部 CI 配置、运行远端 CI 或进行新一轮全站 live 捕获。
- 正式 Host/Web/桌面业务接入、真实登录、模型调用、支付、文件传输及远端持久化不属于参考预览交付结论；未证实结果保留请求边界。
- 未 push、发布、重写历史、清理或夹带用户原有未提交修改。来源截图、授权缓存和生成报告留在被忽略的本地产物目录。
