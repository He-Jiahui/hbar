# App UI 生产组合映射

更新时间：2026-10-03 UTC。范围为已批准的 hbar 会话工作台迁移。
全部 38 类、300 个目录 ID 保留。逐变体取用分类以
[初始审查报告](../artifacts/app-ui-migration-audit/render-report.json) 的 analysis.migrationRows 为准；
当前生产行为与验收见[迁移台账](app-ui-migration-ledger.md)和[验证回执](app-ui-migration-verification.md)。

## 选用编号

下列 121 项由 102 个现有功能配方和 19 个新功能配方组成。编号表示适用的结构/交互配方；
一个业务视图可组合多个配方，不复制导航、composer 或业务 store。

| 类别           | 选用变体            |
| -------------- | ------------------- |
| Agent Activity | 1–7                 |
| Agent Approval | 1、2、6             |
| Agent Plan     | 1、2、5             |
| AI Chat        | 1、2、4、5、6、7、9 |
| AI Usage       | 1、2、5、7、8       |
| Analytics      | 2、3、5、12         |
| App Dialog     | 1–7                 |
| App Shell      | 4、9                |
| App Sidebar    | 3、5、6             |
| Card           | 2、6、8             |
| Command Menu   | 1、2、3、4、6       |
| Dashboard      | 1、2、10            |
| Data Table     | 1、2、4、6、7、8    |
| Editor         | 2、3、5             |
| Empty State    | 1、2、4、5          |
| File Manager   | 1、3                |
| Filtering      | 2、3、4、7          |
| Forms          | 1、2、4             |
| Integrations   | 1、2                |
| Kanban         | 1、4、6             |
| List           | 1、2、5、8、12      |
| Mobile         | 5                   |
| Monitoring     | 1、2、5、8、9       |
| Navbar         | 1、6、11            |
| Notifications  | 1–6                 |
| Onboarding     | 3、6                |
| Prompt Input   | 1–7                 |
| Scheduling     | 1、3、4             |
| Settings Form  | 1、3、5、6          |
| Tool Calls     | 1–5                 |
| Wizard         | 7                   |

## 生产所有者与公开组件入口

正式 UI 使用 canonical [@lumen/app-ui 包](../packages/lumen-app-ui/package.json)；
兼容目录和稳定 hbar-app-ui ID 保留。runtime 拥有领域投影、异步恢复和草稿，
app-react 将投影转换为受控内容，apps/web 装配页面、locale 和平台端口。

| 生产落点       | 组件组合与所有者                                                                                                                                                                                                                               | 状态/动作来源及回归                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 外壳           | [lumen-workspace-shell](../packages/app-react/src/lumen-workspace-shell.tsx)、[FlexLayout adapter](../packages/app-react/src/lumen-flex-layout-adapter.tsx)；Shell09/04、Sidebar03/05/06、Navbar01/06/11。                                     | [布局描述](../apps/web/src/shell-layout.json) 为唯一持久事实，FlexLayout 是 desktop 投影；同一 shell 支持部分 custom slots。公开 vendor 色彩变量消费 Lumen 主题。shell-layout/app-react/native smoke。                                                                               |
| 会话           | [lumen-session-workspace](../packages/app-react/src/lumen-session-workspace.tsx)；AiChat01 与原 message、tool、approval、Agent 和 context slot。                                                                                               | 原 Client/Host run、消息、决策、问卷、模型/预算与草稿；原目标 CAS/receipt 和 native 发送/审批/取消。Chat2/4/5/6/7/9 通过共享内容组合，未宣称七个独立编号页面。                                                                                                                       |
| 输入           | [prompt-composer](../packages/app-react/src/prompt-composer.tsx)；PromptInput01/04/07。                                                                                                                                                        | 原 session/pre-session draft、附件、mention、model、thinking、intent、Goal/Plan、send/stop；[持久草稿适配](../apps/web/src/client-persistence.ts)与 reload 回归。                                                                                                                    |
| 计划           | [goal-plan-workspace](../packages/app-react/src/goal-plan-workspace.tsx)；Plan01/02。                                                                                                                                                          | 原 Goal/Plan revision 与编辑/审批链，不创建第二份计划状态。                                                                                                                                                                                                                          |
| 运行看板       | [run-board-page](../apps/web/src/run-board-page.tsx)；Kanban01/04/06、Plan05 detail。                                                                                                                                                          | [run-board runtime](../packages/app-runtime/src/run-board.ts)、Host run.board.list 与原 cancel/retry/setSession。状态只读，100 条分页/400 上限。runtime、生产页、真实 Host E2E。                                                                                                     |
| 用量/状态      | [usage-budget](../packages/app-react/src/usage-budget.tsx)、[usage-requests](../packages/app-react/src/usage-requests.tsx)、[status workspace](../packages/app-react/src/lumen-status-workspace.tsx)；Usage01/02/05/07/08、Dashboard01/02/10。 | 原预算 CAS/receipt；usage.export 的 source/provider/model 和实际 from/to 窗口；请求页有界分页和导出。Usage08 仅显示。runtime/React 回归验证原 scope 与未知费用。                                                                                                                     |
| 文件/设置/扩展 | app-react 既有受控 adapters；Editor02/03/05、FileManager01/03、Settings01/03/05/06、Integrations01/02。                                                                                                                                        | 原文件 compare-and-write、读取位置、三层设置、Host Provider/插件/技能。native 与原业务回归。                                                                                                                                                                                         |
| 模板           | [prompt-templates-page](../apps/web/src/prompt-templates-page.tsx)、[runtime](../packages/app-runtime/src/prompt-templates.ts)；PromptInput04 editor。                                                                                         | [公开模板契约](../packages/contracts/src/commands/prompt-templates.ts)、Host/Storage Worker；变量校验、revision、分页、原草稿追加/替换与未知结果恢复。                                                                                                                               |
| 引导           | [onboarding page](../apps/web/src/onboarding-page.tsx)、[readiness adapter](../packages/app-react/src/onboarding-readiness.tsx)；Onboarding03/06、Wizard07。                                                                                   | 真实连接、工作区路径、model.canExecute；配置、workspace.open/createSession、retry。中英文 readiness 回归。                                                                                                                                                                           |
| 通知           | [通知 adapter](../packages/app-react/src/notifications.tsx)、[page](../apps/web/src/notifications-page.tsx)；Center01、Preferences03、Bell06 及受控参考能力。                                                                                  | [runtime](../packages/app-runtime/src/notifications.ts)、[公开契约](../packages/contracts/src/commands/notifications.ts)、Host/Storage Worker。read/unread、全局已读、偏好、分页400、receipt、[原目标导航](../apps/web/src/notification-navigation.ts)。真实 Host 与故障注入浏览器。 |
| 桌面通道       | [NotificationDesktopBridge](../apps/web/src/NotificationDesktopBridge.tsx)、[有界投递](../apps/web/src/notification-desktop-delivery.ts)、[Tauri](../apps/desktop/src-tauri/src/main.rs)。                                                     | 原生 visible/focused、权限、稳定源 ID、UTF-8 上限；只处理新事件，不标记已读。native smoke 和 exact WinRT history 证据分别记录。                                                                                                                                                      |
| 排期           | [schedules-page](../apps/web/src/schedules-page.tsx)、[runtime](../packages/app-runtime/src/schedules.ts)；Scheduling01/03/04。                                                                                                                | [公开契约](../packages/contracts/src/commands/schedules.ts)、[service](../packages/kernel/src/schedule-service.ts)、[runner](../packages/kernel/src/schedule-runner.ts)、Storage Worker；IANA/Cron、CRUD/CAS、原目标、并发/合并/补跑/receipt。                                       |

## 组合方式与能力边界

- Activity1/2/4–7、ToolCalls2–5、Chat2/4/5/6/7/9 等参考结构通过共享受控区域、原 presenter 或原工具视图承接，未为了编号复制全部页面。目录存在不作为生产证据。
- Shell09 一套导航、session 标题、输入及上下文区；desktop 仅在隐藏侧栏时显示紧凑展开入口。移动导航继续保留完整 header。
- Dashboard01/02/10 围绕同一 Host 状态 workspace 组合，Usage08 无写入操作，不生成独立重复导航。
- Notifications2/4/5 的 feed/banner/toast 参考能力保留在公共组件中；默认产品采用中心、铃铛、偏好和原生通道。没有以浏览器 preview toast 冒充系统通知。
- 账户、付款、团队社交、反馈和客服在本次范围外；85 个替代设计保留。原始 300 预览报告和 strict 审计历史未改写。
- 成功、失败、未知结果、恢复、取消及容量证据按所属功能验证；当前结果和未覆盖的商业模型/系统 popup 边界以验证回执为准。
