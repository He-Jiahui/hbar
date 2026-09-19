# hbar-app-ui 复用与修复计划

上级：[UI 总计划](index.md)。本计划以 hbar-app-ui 为主要实现，不另起一套应用专用组件库。

## 1. 当前盘点与取舍

下表基于当前公开导出、生产调用及截图检查；“待修复/改造”不是已经完成的能力。

| 组件族 / 现有实现                                             | 已有能力                                   | 新页面使用方式                        | 必须处理的缺口                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `HbarAppUiAppShell` / `HbarAppUiAppSidebar`（workbench 入口） | 受控左右结构、树和底部 slots               | 新外壳主实现                          | 大内边距、窄屏上下堆叠；增加 header/tool/modal slots 和受控 drawer                       |
| `HbarAppUiWorkbenchShell` / `HbarAppUiNavigation`             | 旧全局顶栏、工作区选择、导航               | 复用其中图标/导航行为，兼容旧预览     | 不与 AppShell 嵌套形成双顶栏；迁移后停止作为新应用根                                     |
| `HbarAppUiSessionNavigator`                                   | 受控会话列表                               | 复用行显示与交互语义                  | 外层仍需工程分组、分页和空态；核对重复/失效 ID                                           |
| `HbarAppUiToolPane`                                           | header / toolbar / status / children slots | 四种会话工具共同容器                  | 当前是用户未提交新增文件；集成前核对，不直接夹带提交；补 footer 和窄屏返回契约           |
| `HbarAppUiConversation` / `HbarAppUiMessage`                  | 受控消息和 composer slot                   | Timeline 容器与消息                   | 重复标题、消息元信息密度；增加可选 header slot，长历史用已有有界 timeline                |
| `HbarAppUiPromptComposer`                                     | 草稿、附件、IME、发送/停止回调             | 唯一生产输入组件                      | 本轮已修输入/按钮自包含样式，后续仍需自动高度、完整页面布局验收                          |
| `HbarAppUiRunActivity` / ApprovalRequest / Questionnaire      | 实际运行、审批、问卷                       | 插入所属消息/当前交互区域             | 核对薄条、裁切、待处理可达性；禁止裸图标按钮和空标题                                     |
| AgentPlan / `HbarAppUiPlanEditor`                             | 计划展示与受控编辑                         | 时间线计划摘要、目标工具详情          | 编辑与摘要分离，取消多层大标题和永久展开表单                                             |
| `HbarAppUiCompactUsage`                                       | 用量、进度、sparkline、metrics             | 增加 `density='inline'`，详细模式保留 | 现有 Frame/图表把“compact”变成大卡片；不能靠页面 CSS 隐藏内部节点                        |
| `HbarAppUiWorkspaceFiles` / FileDocument                      | 受控虚拟列表、文件文档容器                 | 文件工具的列表与详情                  | 原生灰按钮、重复标题、长路径；增加嵌入模式、选中状态、列表→文档返回                      |
| `HbarAppUiDialog`（NativeDialog）                             | 原生 top layer、焦点圈定、Escape、初始焦点 | Provider、命令、业务参数表单          | 关闭按钮视觉、底部操作；主题从父宿主继承，长内容滚动与焦点回归                           |
| `HbarAppUiCommandList` / CommandDialog                        | 分类、键盘、虚拟列表、对话框               | 搜索→参数→回执的单模态                | 生产仍使用整页目录；需要参数/回执 slots 与分步返回                                       |
| `HbarAppUiPreferencesSettings` / SettingsField                | 受控偏好与设置行                           | 复用行外观/开关，抽出独立字段能力     | SettingsField 尚非完整公开 Schema renderer；不要直接把 demo WorkspaceSettings 当生产设置 |
| MetricStrip / UsageSurfaces / Monitoring / Dashboard          | 指标与部分图表展示                         | 受控指标、趋势、明细                  | 部分变体仍依赖 spec 或 demo 结构；先抽受控能力，再接真实统计                             |
| Button / IconButton / Status / EmptyState                     | 公共基础组件                               | 全部页面共享                          | tone-hover 对比度、键盘焦点、长标签、禁用态与透明背景需要系统检查                        |

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

首个实例见[2026-09-19 视觉修复记录](visual-audit-2026-09-19.md)。完成 Prompt 修复不代表输入区整体重排或其他组件已通过。
