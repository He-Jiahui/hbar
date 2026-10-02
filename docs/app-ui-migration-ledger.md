# hbar-app-ui 迁移台账（300 变体）

更新时间：2026-10-02。本文是迁移计划的可追溯台账，不是完成声明。稳定 ID、来源入口、当前状态、容量策略和缺口以 [300 项基础清单](app-ui-variant-inventory.md) 为逐项事实源；预览挂载证据以 [render-report.json](../artifacts/app-ui-migration-audit/render-report.json) 为事实源。不得把 data marker、静态 SSR、preview fixture 或 API 导出当作生产业务完成。

## 总量与选型

| 选型         |    数量 | 记录方式                                                                            |
| ------------ | ------: | ----------------------------------------------------------------------------------- |
| 现有功能组合 |     102 | 接入现有会话、文件、运行、设置和工作区；需要真实 Host 状态/动作验收。               |
| 新增功能     |      19 | 模板、首次使用引导、运行/计划看板、通知和排期；生产契约、持久化和恢复闭环仍需验收。 |
| 替代设计保留 |      85 | 保留目录和稳定 ID，作为可选参考；不进入当前生产默认布局。                           |
| 本次范围外   |      94 | 账户、支付、团队协作、反馈与支持等；保留目录，不计入迁移完成。                      |
| **合计**     | **300** | 38 类；清单逐行应保持 300 个唯一 ID。                                               |

`render-report.json` 当前证明 300/300 预览挂载、0 page/console error、0 页面横溢（1280×800 深色预览）。这只证明预览可挂载，不证明 Host 数据、真实动作、持久化或桌面安装验收。

## 按类别的取用台账

| 类别与稳定 ID                                                         | 取用落点                                           | Host 提供的数据                                                    | 动作与当前证据                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| App Shell 1–9、App Sidebar 1–7、Navbar 1–14、Mobile 1–5               | 会话工作台外壳、工作区导航、标题工具区、移动导航   | workspace/session、导航项、标签、布局描述和窄屏状态                | 切换、打开面板、抽屉展开/收起；预览和 focused registry 已验证，桌面安装与刷新恢复待验收。 |
| AI Chat 1–9、Prompt Input 1–7                                         | 会话消息、输入、附件/mention/model 工具            | message/run/tool/source、draft、model、token 快照、Host labels     | 发送、停止、重试、选择上下文、附件；真实 provider、下载、剪贴板等缺口见清单。             |
| Agent Activity 1–7、Tool Calls 1–6、Agent Approval 1–6                | 运行时间线、工具参数/结果、审批队列                | run/tool/approval 实体、状态、revision、权限事实                   | 展开、批准/拒绝、取消、重试；预览动作不能写成真实执行，需 Host 确认、幂等和恢复证据。     |
| Agent Plan 1–6、Kanban 1–6                                            | 计划步骤、运行/计划看板                            | plan/run/card、expectedRevision、分页摘要                          | 编辑、排序、重试、取消、打开详情；真实 revision 冲突、分页和恢复待验收。                  |
| File Manager 1–4、Editor 1–5、List 1–12                               | 文件树、编辑器、列表/详情                          | file/document/tree、selection、draft、read position                | 打开、保存、比较、引用、搜索；真实文件写入、失败恢复和权限闭环待验收。                    |
| Command Menu 1–6、Forms 1–12、App Dialog 1–7                          | 命令搜索、参数表单、确认/编辑弹层                  | command/schema/form draft、validation、target ID                   | 搜索、导航、提交、取消、确认；需验证长文案、键盘、失效目标和真实提交。                    |
| AI Usage 1–8、Dashboard 1–14、Analytics 1–16、Monitoring 1–10         | 用量、性能、请求和运行监控                         | usage/request/metric、时间范围、预算、分页游标                     | 筛选、排序、展开、刷新；静态图表或 fixture 不代表真实计费/监控数据。                      |
| Card 1–11、Data Table 1–8、Filtering 1–9                              | 扩展、文件、指标、请求列表                         | typed rows、columns、filters、capacity、selection                  | 选择、展开、分页、编辑草稿；保存和下载等动作必须有 Host 确认。                            |
| Settings Form 1–6、Integrations 1–6                                   | 全局/工作区/会话设置、插件扩展                     | settings/provider/integration、scope、validation                   | 编辑、启停、授权、恢复；需验证真实 provider、权限和持久化。                               |
| Empty State 1–5、Onboarding 1–7、Wizard 1–7                           | 空态、首次配置、向导步骤                           | connection/workspace/model 状态、step data、draft                  | 重试、配置、下一步/返回/完成；Wizard 断言已对齐当前 reference class，生产引导仍待验收。   |
| Notifications 1–6、Scheduling 1–7                                     | 通知中心、铃铛、排期日历/编辑                      | NotificationRecord、ScheduleDefinition/Occurrence、偏好、IANA 时区 | 已读、跳转、暂停、创建、编辑、删除、预览触发；需验证持久化、去重、Cron DST、幂等和恢复。  |
| Authentication 1–14、Paywall 1–7、Billing 1–8、Chat 1–6、Comments 1–6 | 当前目录保留；账户/支付/团队协作不进入本次默认迁移 | 账户、订阅、团队和评论数据未纳入本次生产范围                       | 不把预览登录、付款、评论动作计为生产能力。                                                |
| Feedback 1–6、Support 1–5                                             | 当前目录保留，范围外                               | 外部反馈、客服工单不在本次 Host 契约                               | 不计入迁移完成。                                                                          |

## 状态定义与当前证据

- **已完成证据**：生产入口实际挂载组件；Host 提供类型化数据；动作到 Client/Host/Storage 有目标 ID；有成功、失败、取消/恢复行为测试或可重复浏览器证据。
- **在做**：组件契约、预览或局部工作区接线存在，但仍缺真实后端确认、持久化、恢复、安装包或完整交互矩阵。
- **未验证**：只有目录、SSR/static markup、data marker、fixture、API export 或 screenshot；不能升级为生产完成。
- 当前基础门禁提交：`6f34d35a`、`13f5d78d`、`f71f9867`、`044487c7` 及后续 `20db3e98`、`2985ee1b` 记录；这些是历史线索，不替代当前工作树和 focused tests。Windows Bun focused test 使用 `bun test ./tests/...`。

## 必须保留的验收缺口

- 桌面安装后 Windows toast 权限、托盘隐藏/前台/完全退出后的通知回读。
- 懒加载边界：生产包不得带入 catalog/fixtures；首屏加载、失败重试和 chunk 错误恢复。
- 排期：IANA 时区与夏令时、单排期活动执行上限、重叠合并、重启补跑、未知结果和幂等键。
- 模板：变量校验、失败恢复、套用模板写入**原始目标会话**，不能只写当前 active session。
- 运行/计划看板：分页/容量、旧响应隔离、真实取消/重试、revision 冲突和断线恢复。
- 通知：源事件去重、已读同步、偏好、权限拒绝、跳转目标和跨重启一致性。
- 内容与布局：中英文长文案、窄屏键盘/焦点恢复、空/单项/边界/超界容量、失效/重复 ID、无页面横溢。
- 迁移证据：每个子功能独立 focused test、typecheck/lint/build，验证后独立 commit；不以静态 marker 或 preview mount 替代。

## 维护规则

修改组件或生产接线时，先更新对应类别的 Host 数据、动作和证据链接，再更新状态。保持稳定 ID 与 [基础清单](app-ui-variant-inventory.md) 一致；禁止覆盖历史 visual audit 或运行生成脚本来刷新状态。新增证据应链接实际测试、源码或提交，并注明范围与未覆盖部分。
