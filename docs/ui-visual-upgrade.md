# hbar 全界面视觉升级评估与验收

方向为轻盈简洁、对话优先。实施起点为 `96dee0a9`，复用聊天附带的干净工作树；生产界面使用 Lumen 公共组件，品牌参考预览保持其原样。本文区分设计决定、已实现行为和实际验证结果。

## 评估基线

基线来自用户 2026-10-10 提供的桌面截图、只读结构信息、生产入口依赖和提交差异。截图里的三栏同时展开时，对话被压缩到约三分之一窗口宽度；命令摘要暴露整段 PowerShell，失败摘要暴露 JSON；状态、目标与请求元数据重复出现，输入操作栏依赖横向滚动。

| 维度       | 基线问题                                   | 本轮设计决定                                                                      |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| 高信息密度 | 多层边框和重复状态占用空间                 | 导航、工具和请求用紧凑行；正文、表单用自然阅读流                                  |
| 可视化美感 | 深灰卡片与灰文字承担大部分层级             | 连续阅读背景，排版、间距和语义颜色承担层级                                        |
| 布局       | 三栏挤压正文及输入区                       | 新布局默认关闭工具；保留 32rem 阅读预算，不足时抽屉呈现                           |
| 极端内容   | 同一套换行规则误用于标题、说明与按钮       | 用位置语义决定单行、裁剪、换行、展开和局部滚动                                    |
| 交互体验   | 输入控件隐藏，切换呈现方式容易丢失局部状态 | 动作按优先级进“更多”，发送／停止常驻；面板和操作使用稳定实例                      |
| UI 参考    | 品牌参考与业务组件缺少统一映射             | Apple／Runway 的阅读空间、Raycast 导航、Cursor 时间线、MiniMax 元数据映射到 Lumen |

参考依据：[MUI 三种按钮样式](https://mui.com/material-ui/react-button/)、[Apple 侧栏](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Carbon 表格密度与展开](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines)、[W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、[W3C 文本对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。项目的品牌分析原文和版本见 [DESIGN.md](../DESIGN.md)。这些原则不构成已通过全部可访问性门禁的声明。

## 生产界面与组件清单

| 页面／区域                       | 所属组件与契约                                                                  | 本轮统一规则                                             |
| -------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 外壳、侧栏、页签                 | `HbarWorkspaceShell`、`SessionNavigationRow`、`SidebarCaption`、`WorkspaceTabs` | 连续导航背景、左对齐、末尾裁剪、实体 ID 绑定             |
| 输入与首发                       | `HbarPromptComposer`、`HbarSessionWorkspace`、`PreSessionLanding`               | 一个输入表面、优先级工具栏、完整单行标签、IME 与草稿保护 |
| 消息、思考、工具、审批           | `HbarMessageBlocks`、`HbarSessionDecision`、`HbarSessionLiveStatus`             | 语义着色、动作摘要、完整原文复制、真实结果与进度         |
| 会话状态                         | `HbarSessionMonitoring`、`HbarSessionRequestDetails`                            | 概览／请求／原始消息；按需挂载并保留展开状态             |
| 文件、图片、Markdown、代码、diff | `HbarFileWorkspace`、`FileDocument`、资源窗口                                   | 公共标题和工具栏，专用渲染器保留测量、选择和局部滚动     |
| Agent、目标、计划、工作流        | `HbarAgentWorkspace`、`HbarGoalPlanWorkspace`、`ActivityWorkflowView`           | 紧凑任务摘要、真实状态、说明自然换行                     |
| 全局／工程／会话设置             | `HbarSettingsWorkspace`、宿主自定义分组与 schema 表单                           | 统一内容列、页面标题、表单说明、就近错误和恢复           |
| 模型、供应商、执行策略           | `ProviderSettings`、`HbarProviderEditor`、`SandboxProfileSettings`、模型选择器  | 共用表单、弹窗、选择与文本语义                           |
| 扩展、技能、导入                 | `ExtensionWorkspace`、Plugin／Skill Detail、`SkillImportPanel`                  | 连续详情、独立集合状态、分页及稳定实体操作               |
| 状态中心、系统／Git／用量        | `HbarStatusWorkspace`、`SettingsUsage`、`UsageRequests`                         | 主题排版、真实指标、局部详情与图表，不补造缺失数据       |
| 通知、看板、排期、模板、首次配置 | `GlobalFeaturePage` 及宿主页面组件                                              | 公共页面标题；次要目的地通过就近菜单进入                 |
| 聊天搜索、会话内查找、命令       | `HbarChatSearchView`、`HbarSessionFindView`、`HbarCommandPalette`               | 单一共享浮层，搜索结果与说明按位置承载                   |
| 弹窗、菜单、选择、阅读锚点       | Lumen Dialog／FloatingSurface／ActionMenu／PopupSelect／ReadingMarker           | 统一焦点、外部关闭与语义图标，状态变化不挤动几何尺寸     |

图表挂载节点及 Markdown 行内 renderer 是允许保留原生 DOM 的明确边界。业务页面不新增原生按钮、输入、选择或文本容器。守卫沿生产入口、静态导入、公开 React 导出和动态导入检查；独立品牌参考及未启用的旧外壳不属于生产迁移范围。检查清单由 `productionDesignSystemFiles` 生成，避免靠目录扫描把参考原文误当作生产代码。

## 公共视觉契约

- `LumenSurface.surfaceRole` 表达信息层级，材质独立选择。生产 `LumenProvider` 显式提供默认 reading 角色；导航、输入及浮层可明确覆盖，独立旧调用保持兼容。连续阅读表面不执行玻璃折射测量。
- `LumenContentText` 明确按钮、状态、导航记录、标题、段落、表单、弹窗、选项和技术输出的职责。单行标签不省略、不缩字；说明、弹窗和多行记录自然换行。原文与复制不受呈现摘要影响。
- 排版从用户的 Lumen 字号派生，正文与控件继续响应设置。编辑器、Markdown 代码测量及图表保留各自渲染契约。
- 实色、描边、文本三种动作样式；蓝色表示进行中，绿色成功，黄色无结果／警告，红色失败。动作类别和结果使用独立角色。
- 呼吸改变光强，不改变行高、宽度或位置；普通状态过渡使用同一主题时间与缓动，支持零发光、关闭动效、reduced motion 和系统高对比度。

## 已完成的分阶段验证

| 阶段           | 实际验证                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Lumen 基础组合 | 8 项组件测试，2 项浏览器容量场景；Web 构建、严格 scoped lint、独立 Lumen 类型检查              |
| 外壳与抽屉     | 61 项布局／状态测试，4 项 Edge 320–1920 容量场景；面板实例、阅读位置与焦点保留                 |
| 自适应输入     | 10 项组件测试，8 项 Edge 真实本地 Host 场景；中英文、IME、附件引用、草稿、发送、排队与停止     |
| 紧凑工具       | 48 项模型／组件测试，9 项 Edge 场景；原始输入与复制、结果色、呼吸和关闭动效                    |
| 会话状态页签   | 54 项组件／runtime 测试，2 项真实 Host 场景；目标、计划、断线恢复、取消及请求展开状态          |
| 生产页面语义   | 54 个 Web／业务样式及 2 个 Lumen 样式通过流式布局检查；设置分组和阅读锚点已有专项场景          |
| 全界面矩阵     | 26 类页面，每类覆盖中英文、明暗、1440／320；对话追加 768 短视口、1088、1920。前后共 440 张截图 |
| 文本对比度     | 220 个改造后页面采样 6,699 个可见语义文本，最低约 4.62:1；单行无省略、页面无横向溢出           |
| 验收与对照预览 | 4 个组件预览场景、2 个证据对照场景通过；真实公共组件、完整复制、容量与动态样式采样             |
| 语言与恢复     | 16 个选择组件测试及 1 个离线键盘场景通过；选择后文字可读，重试后焦点恢复到对应选项             |

整合 `f7f53c3d` 后，React 组件全量检查为 1,038 通过、9 失败，覆盖 178 个测试文件。9 项失败均通过隔离加载未修改的 `f7f53c3d` 源码复现：4 项仍按原生 `<select><option>` 读取已改用 Lumen PopupSelect 的组件，5 项仍期望旧的紧凑反馈／离线文案及模型恢复次数。基线检查为 50 通过、同样的 9 失败；日志在 `artifacts/visual-upgrade/tests-master-baseline.log`。这些结果不计作本次新增回归，也不记作通过。

Web 与预览构建通过，保留既有的 chunk 大小提示。独立 Lumen pnpm 类型、构建与改动范围 lint 通过；生产导入边界、文案、图标及本轮变更样式的流式布局守卫通过。完整门禁、最终构建及主干整合在收尾后记录其实际版本与结果。

## 可交互验收和证据来源

预览入口为 `workbench-acceptance.html` 和 `visual-report.html`。前者组合真实 Lumen 页面标题、表面、工具行、指标、操作栏及弹窗；后者提供按页面、语言、主题和窗口宽度切换的前后截图。执行 `bun scripts/publish-visual-upgrade-evidence.ts` 发布 PNG 与受限索引，再执行 `bun run app-ui:build` 构建预览。发布目录已加入忽略规则，服务日志、认证信息和浏览器 trace 不进入可见证据页。

基线为 `96dee0a9`，使用其匹配的 Host、contracts 和 Lumen 源码生成真实界面。基线窄屏侧栏有初始化时反复折叠的故障，验收脚本在桌面进入对应页面后缩窄并截图；改造后在窄屏直接执行导航。截图使用隔离本地 Host 与固定测试内容，当前用户的会话、运行和草稿保持独立。

默认主题的对比度检查覆盖声明的实色及半透明背景层，禁用控件单独处理；位图、模糊背景和用户自定义色板仍需按实际内容检查。动画验收采样开始、中间、结束及反向过渡，检查关闭动效、reduced motion、forced colors 和零发光。检查结果不等同于完整可访问性认证。
