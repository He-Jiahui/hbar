# hbar-app-ui 复用与修复计划

上级：[UI 总计划](index.md)。本计划以 hbar-app-ui 为主要实现，不另起一套应用专用组件库。

## 1. 当前盘点与取舍

下表基于当前公开导出、生产调用及最终截图检查；已完成项只描述已有提交和验证，仍列出的缺口继续进入后续任务。

| 组件族 / 现有实现                                             | 已有能力                                     | 新页面使用方式                                                          | 必须处理的缺口                                                                           |
| ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `HbarAppUiAppShell` / `HbarAppUiAppSidebar`（workbench 入口） | 受控左右结构、树和底部 slots                 | 唯一生产外壳，已完成 header/tool/modal、drawer 与受控 sidebar/tool 尺寸 | **布局 v2 已完成**：稳定模块、v1 迁移、坏数据回退；不引入自由停靠                        |
| `HbarAppUiWorkbenchShell` / `HbarAppUiNavigation`             | 旧全局顶栏、工作区选择、导航                 | 只保留 catalog/preview 兼容                                             | 已从 Web 生产构建输入移除；有明确旧调用者，不能直接删除                                  |
| `HbarAppUiSessionNavigator`                                   | 受控会话列表                                 | catalog/preview 保留；生产工程树由 app-react 按目录投影组合             | 生产已验证 0/1/100/101、服务端分页、唯一滚动和选择稳定                                   |
| `HbarAppUiActionMenu`                                         | 受控标签、菜单项、danger 与动作 ID           | 工程/会话原目标的紧凑行菜单                                             | 已验证 Escape、首项焦点、桌面按需显隐和触屏常显；靠近滚动边缘的未来菜单需继续测裁切      |
| `HbarAppUiToolPane`                                           | header / toolbar / status / children slots   | 四种会话工具共同容器                                                    | 当前是用户未提交新增文件；集成前核对，不直接夹带提交；补 footer 和窄屏返回契约           |
| `HbarAppUiConversation` / `HbarAppUiMessage`                  | 受控消息、composer/afterMessages/header slot | 已作为会话 Timeline 容器与消息                                          | **R3.5 已完成**：40 条阈值动态虚拟化、加载旧页锚点、按会话恢复和非强制跟随               |
| `HbarAppUiPromptComposer`                                     | 草稿、附件、IME、发送/停止回调               | 唯一生产输入组件，页面组合已验收                                        | 模型选择仍由状态/设置提供；整应用 light/system 主题仍归 R1.1                             |
| `HbarAppUiRunActivity` / ApprovalRequest / Questionnaire      | 实际运行、审批、问卷                         | 插入所属消息/当前交互区域                                               | 失败/中断项已有宿主文案重试按钮与忙碌态；待处理可达性继续随所属交互验证                  |
| AgentPlan / `HbarAppUiPlanEditor`                             | 计划展示与受控编辑                           | Goal/Plan 工具的摘要与编辑子视图                                        | 时间线内 Plan 归属和长计划容量仍需随 R3.2 核对                                           |
| `HbarAppUiCompactUsage`                                       | 用量、预算、速率与 inline 密度               | 会话输入下方紧凑摘要                                                    | 已移除大卡片依赖；完整统计进入 Monitoring/Usage                                          |
| `HbarAppUiWorkspaceFiles` / FileDocument                      | 受控虚拟列表、嵌入文档容器                   | 文件工具的列表→详情                                                     | 已完成返回、编辑保存和冲突保留草稿；超大目录容量继续由分页/虚拟化契约约束                |
| `HbarAppUiDialog`（NativeDialog）                             | 原生 top layer、焦点圈定、Escape、初始焦点   | Provider 与命令三步流                                                   | Provider 删除确认和命令分层 Escape 已实测；Tauri 标题栏/DPI 仍归 R6.4                    |
| `HbarAppUiCommandList` / CommandDialog                        | 分类、键盘、虚拟列表、对话框                 | CommandList 组合搜索→参数→回执单模态                                    | 已修行样式、查询滚动复位和紧凑帮助；失败/unknown 继续由 runtime 回执表达                 |
| `HbarAppUiPreferencesSettings` / SettingsField                | 受控偏好与设置行                             | 复用行外观/开关，抽出独立字段能力                                       | SettingsField 尚非完整公开 Schema renderer；不要直接把 demo WorkspaceSettings 当生产设置 |
| CompactMetrics / BarSeries / UsageSurfaces                    | 受控指标、趋势、用量与明细                   | Monitoring、Performance、Usage、Git 共享                                | 固定百分比上限和可选时间桶已完成；复杂科学图表不在本轮范围                               |
| Button / IconButton / Status / EmptyState                     | 公共基础组件                                 | 全部页面共享，使用语义图标尺寸                                          | 生产已改用窄入口避免旧 CSS 污染；整应用浅色与系统主题仍需完成                            |

`AppShell`、`PromptInput`、`FileManager` 等带 `spec/onAction` 的目录变体是展示入口，不等于生产接口。它们可以展示同一受控组件，但业务页面不能依赖 catalog 注册和演示数据。

## 2. 修复优先级与责任

**P0：组件独立可用。** 无旧全局 CSS、无 preview.css 也能显示字体、颜色、焦点和控件尺寸。主路径中的输入、按钮、对话框与工具容器先完成。样式由所属组件 import，颜色/字体由明确 theme 入口提供。

**P1：可组合。** 页头只出现一次；组件区分独立与 embedded 呈现，不通过祖先 class 猜测业务场景。Conversation、FileDocument、Usage、表单的标题和动作以受控 slot/density 表达。

**P2：容量与细节。** 批量记录、长文案、窄屏、可访问名称、可取消异步、局部错误。此阶段同步清理该组件族遗留的普通内容 grid、固定像素尺寸和定位补丁，不把全库无关演示变体一并重写。

所有新增/修复视觉组件保留在 hbar-app-ui。app-react 只负责组装、转换和命令绑定。Schema 包保留通用性，由 app-react 注册 hbar-app-ui 字段适配器，不使 schema-core 反向依赖 hbar 视觉库。

## 3. 需要固化的基础契约

| 契约                                 | 输入                                                                   | 输出/行为                                                    |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| PageHeader                           | title、context、status、leading、actions、labels                       | 不查询数据；长标题省略可查看全名；窄屏操作进入更多菜单       |
| ToolPane                             | title、targetLabel、toolbar、body、footer、busy、error、onClose/onBack | header/footer 不随 body 滚动；唯一内容滚动区域               |
| Field                                | id、label、hint、error、required、source、action、children             | 原生 label 关联控件；错误不只靠颜色；继承说明就近            |
| Input / Textarea / Select / CheckBox | 原生受控属性、invalid、disabled、readOnly、ref                         | 一致主题/焦点/尺寸；业务值转换在 adapter                     |
| ComboBox / MultiSelect               | typed options、selected IDs、query、loading/error、分页回调            | 禁用/已失效选项、键盘/读屏、无结果及重试；不能把数组强转单值 |
| Usage inline                         | formatted values、quality、budget、onOpenDetails                       | 无大标题、无独立大图表；窄屏最多两行，详细视图仍可达         |

控件默认最小点击区域 `2.25rem`，紧凑图标按钮不小于 `2rem`；图标使用既有五档。文字正文与 label 独立于图标尺寸。错误/成功状态统一语义 token，不能因 hover 丢失对比度。

## 4. 主题与样式治理

- 以 `tokens.css` 定义尺寸、空间和语义变量；抽出基础 theme 与组件样式，不让生产依赖整个 catalog 的特殊选择器。
- 同一 token 只有一个基础定义和明确的浅/深主题覆盖；不要在多个 `:root` 重复定义尺寸。
- 新主题沿用 cc-haha 的层级和密度，颜色作为设计 token 管理；实际样式值以截图校准，不从截图坐标还原布局。
- 保留用户已设主题；新的 system 选项解析到 light/dark。Web 的 `color-scheme` 跟随实际主题，修复当前硬编码 dark 的问题。
- 删除新页面对库私有 DOM 的补丁式隐藏规则；对接前先提供 public prop/slot。
- 普通组件用 flex，真实 overlay 只定位外层；测试 fixture 外壳不能给子组件补上生产缺少的 CSS。

## 5. 每族组件的验收模板

1. 列出所有公开导出及实际生产调用者，检查相关 git 历史和未提交修改。
2. 在独立生产入口预览复现，记录主题、视口、locale、状态与初始截图。
3. 修复库内结构/样式/窄接口，保留调用端行为契约。
4. 看桌面、窄屏、浅深色截图；测焦点、输入、触发目标、取消和失败恢复。
5. 在实际应用页面再次采集，确认无父容器/旧 CSS 冲突。
6. 通过相关 guards、lint、typecheck、tests、build 后独立提交。

逐切片结果见[2026-09-19 视觉修复记录](visual-audit-2026-09-19.md)，最终跨页索引见[Web/Host 验证矩阵](final-validation-matrix.md)。组件表中的已完成状态不覆盖仍单列的整页主题、Plan 归属和 Tauri 验收。
