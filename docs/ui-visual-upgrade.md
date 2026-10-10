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
- 工具栏只迁移已经挂载的控件。支持原子迁移的浏览器使用 `Element.moveBefore` 保留焦点、打开的浮层及动画状态；相同容器不重复搬动。浮层关闭时通过公共 `focusLumenControl` 揭示原控件并恢复焦点。依据见 [Chrome 的状态保留迁移说明](https://developer.chrome.com/blog/movebefore-api)。
- 保存布局的恢复使用内部 `app.initializeSidebar` 命令，用户主动显隐使用 `app.setSidebarVisible`。ViewModel 在首次主动选择之后拒绝迟到的初始化；快捷键的返回也不会覆盖之后的选择。初始化状态不进入可见菜单或产品文案。

## 已完成的分阶段验证

| 阶段           | 实际验证                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Lumen 基础组合 | 8 项组件测试，2 项浏览器容量场景；Web 构建、严格 scoped lint、独立 Lumen 类型检查              |
| 外壳与抽屉     | 61 项布局／状态测试，4 项 Edge 320–1920 容量场景；面板实例、阅读位置与焦点保留                 |
| 自适应输入     | 10 项组件测试，8 项 Edge 真实本地 Host 场景；中英文、IME、附件引用、草稿、发送、排队与停止     |
| 紧凑工具       | 48 项模型／组件测试，9 项 Edge 场景；原始输入与复制、结果色、呼吸和关闭动效                    |
| 会话状态页签   | 54 项组件／runtime 测试，2 项真实 Host 场景；目标、计划、断线恢复、取消及请求展开状态          |
| 生产页面语义   | 54 个 Web／业务样式及 2 个 Lumen 样式通过流式布局检查；设置分组和阅读锚点已有专项场景          |
| 全界面矩阵     | 27 类页面：原 26 类中英文／明暗／1440／320 矩阵，加首发区 5 种宽度；前后共 480 张截图          |
| 文本对比度     | 240 个改造后页面采样 7,002 个可见语义文本，最低约 4.65:1；单行无省略、页面无横向溢出           |
| 验收与对照预览 | 4 个组件预览场景、2 个证据对照场景通过；真实公共组件、完整复制、容量与动态样式采样             |
| 语言与恢复     | 16 个选择组件测试及 1 个离线键盘场景通过；选择后文字可读，重试后焦点恢复到对应选项             |
| 浮层与焦点连续 | 32 个相关单元测试、4 个 MAX 场景、2 个模型分页场景、触屏及容量迁移场景通过                    |
| 初始化与晚响应 | 42 个 runtime 测试、26 个快捷键相关测试通过；最终中英文／明暗生产矩阵 4 个场景全部通过         |
| 最新主干兼容   | 整合 `aea52fbe` 的文件并发发布和 MAX 命令清单修复；16 个对应测试、严格类型及范围 lint 通过      |
| 首发区补齐     | 89 个相关测试、4 个容量／真实首发、2 个推理选择及 2 个斜杠场景通过；补 20 对真实前后截图       |
| 最终主干兼容   | 整合 `8764143e`、`a21997b1` 的诊断契约、模型生命周期及真实 HTTP 状态记录；最终 13 个对应测试通过 |

整合 `0a5bbefc` 后，React 组件全量检查为 **1,046 通过、6 失败**，覆盖 178 个测试文件、1,052 个用例。6 项失败均通过隔离加载未修改的 `0a5bbefc` 组件源码复现；相同范围的基线检查为 **57 通过、6 失败**。涉及归档输入区的旧禁用断言、未知模型恢复、未确认计划反馈、旧推理强度属性及工作区名称读取失败反馈。日志分别为 `artifacts/visual-upgrade/tests-final-react.log`、`tests-final-master-baseline.log`。这些结果不计作新增回归，也不记作通过。

额外执行的 2 个 Goal 替换运行浏览器场景未通过：夹具启用自动续作，断言期望 1 次运行，实际已经记录 8 次。使用未修改的 `0a5bbefc` Goal 组件独立构建后，同样的 2 个断言失败；日志为 `goal-owner-final-browser.log`、`goal-owner-baseline-browser.log`。本轮不为通过该夹具断言修改 Host 的 Goal 续作策略。首发／会话斜杠和 Goal 编辑的另外 4 个场景通过，明确关闭夹具自动续作，并保留完整输入、附件及不重复发起用户运行的断言。

严格 TypeScript、Web 与预览构建通过，保留既有的 chunk 大小提示。独立 Lumen pnpm 类型、构建与改动范围 lint 通过；生产导入边界、文案、图标及本轮变更样式的流式布局守卫通过。本轮设计文件的 21 个本地链接通过；全库文档检查仍报告 752 个历史失效链接，主要包含未随干净工作树保留的旧验收产物，未清除其他任务的文档。

最终完整 `bun run lint` 检查 3,443 个受维护文件，分 54 个有界批次，退出码为 0。执行期间新增的浏览器时间轴验收和并入的文件发布代码另做严格范围 lint，退出码也为 0。严格 TypeScript 在最新主干整合后再次通过。日志为 `lint-delivery-final.log`、`lint-preview-delivery.log`、`lint-final-master-increment.log` 和 `typecheck-delivery-final.log`，均位于 `artifacts/visual-upgrade`。

原生空会话复核发现首发区仍使用旧的横向轨道，随后在 `9da2a59f` 补齐：首发直接提供公共 `LumenToolbarItem`，模型、推理、工作位置、审批、附加操作有独立 ID 和优先级；发送保持常驻。公共业务输入组合同时保留自定义工具栏的受管理反馈入口。首发场景覆盖 IME、草稿跨容量迁移、浮层及键盘恢复、模型／推理确认、斜杠动作和首发后才创建 Session。触屏窄屏遵守关闭“更多”后继续编辑的路径，测试不通过强制点击绕过共享浮层。

完成首发补齐并整合 `8764143e` 后再次执行全量 React 检查：仍为 1,046 通过、相同 6 项基线失败，未新增失败。日志为 `tests-complete-delivery-react.log`。首发及诊断增量的严格 lint、最新完整类型检查通过，分别记录在 `lint-first-send-final.log`、`lint-final-diagnostics-merge.log`、`typecheck-complete-delivery.log`；本轮新增的首发测试另有完整类型及范围 lint 记录。

随后整合 `a21997b1`，最终 13 个诊断测试、严格范围 lint 和完整类型检查通过。最终 Web／Host 资源按 `296c4816` 重新构建并使用官方 `tauri bundle` 更新 NSIS；该增量没有修改 Rust 源码，保留已经通过标准构建的 Rust EXE。真实包复核追加首发工具栏没有旧滚动轨道的断言。最终日志为 `tests-latest-diagnostics-merge.log`、`typecheck-final-delivery.log`、`packaged-final-passed.log`。

交付整合期间，主干新增 `f4855a44`、`d16f9e4a` 的离线反馈保留修复，以及 `142cc92f` 的现行模型／推理验收修正，已合并保留。最终全量 React 为 **1,049 通过、3 失败**；剩余为中英文归档输入区的旧禁用断言及未知模型恢复断言，均属于此前在未修改 `0a5bbefc` 源码中复现的基线集合，没有新增失败。日志为 `tests-delivery-last-react.log`。最新严格类型及对应范围 lint 通过。

这次最终资源按 `c64b123b` 对应的运行时代码构建：Web 包含离线反馈修复，Host 包含真实 HTTP 诊断；后续模型验收提交只修改测试。包复核为 `packaged-last-verified.log`。主干整合时逐项校验保留了原工作区 6 个待提交文件、141 个未跟踪项和原暂存状态，未提交其他任务的修改；干净交付工作树及 Lumen 工作树没有源码残留。

## 可交互验收和证据来源

预览入口为 `workbench-acceptance.html` 和 `visual-report.html`。前者组合真实 Lumen 页面标题、表面、工具行、指标、操作栏及弹窗；后者提供按页面、语言、主题和窗口宽度切换的前后截图。执行 `bun scripts/publish-visual-upgrade-evidence.ts` 发布 PNG 与受限索引，再执行 `bun run app-ui:build` 构建预览。发布目录已加入忽略规则，服务日志、认证信息和浏览器 trace 不进入可见证据页。

基线为 `96dee0a9`，使用其匹配的 Host、contracts 和 Lumen 源码生成真实界面。基线窄屏侧栏有初始化时反复折叠的故障，验收脚本在桌面进入对应页面后缩窄并截图；改造后在窄屏直接执行导航。截图使用隔离本地 Host 与固定测试内容，当前用户的会话、运行和草稿保持独立。

默认主题的对比度检查覆盖声明的实色及半透明背景层，禁用控件单独处理；位图、模糊背景和用户自定义色板仍需按实际内容检查。动画验收控制浏览器真实 CSS 过渡的时间轴，在三分之一进度记录亮度，并在实际指针移出时记录反向过渡的零时间点；连续性误差小于 0.001，再播放到结束。该方式避免两次 CDP 通信之间的时延混入亮度差。另检查关闭动效、reduced motion、forced colors 和零发光。检查结果不等同于完整可访问性认证。

## 原生调试与构建交付

标准 `bun scripts/desktop.ts build` 生成 release EXE 与 NSIS 安装包。便携交付包含 `hbar-desktop.exe`、`runtime` 与 `native`，必须保持它们相对位置；不能把单个 EXE 当作完整的便携包。打包 Host 使用随包的 Playwright，不依赖开发工作树的绝对路径。

独立 Windows WebView2 验证使用临时数据根和本地测试模型，真实执行连接、发送完成、停止取消、模型弹窗搜索焦点与恢复、768×600 容量检查。临时进程与数据在验证后清理，已安装程序及用户正在运行的会话、草稿不参与测试。结果及校验记录为 `artifacts/visual-upgrade/packaged-verification.json`。

Tauri＋Vite 调试入口是 `bun scripts/desktop.ts dev`。本轮实例使用独立 `HBAR_HOME`、Vite `4389`、Host `4391`；TSX 的临时属性通过真实 WebView2 热更新呈现并随后恢复源码，期间 EXE 修改时间与 Host 实例 ID 都未改变，记录为 `artifacts/visual-upgrade/native-hmr.json`。调试窗口保留供检查。

截图和构建包保存在 `artifacts/visual-upgrade`，可交互证据页为 `http://127.0.0.1:5196/visual-report.html?locale=zh-CN&theme=dark`，真实 Lumen 组合验收为同端口的 `workbench-acceptance.html`。构建产物和日志属于忽略文件，版本化设计规则保存在本文件、项目 `DESIGN.md` 和 Lumen 包级 `DESIGN.md`。

环境边界：已验证当前 Windows 的真实 WebView2，未声称在没有 WebView2 的全新 Windows 中完成安装。NSIS 安装包已生成，但没有覆盖安装用户当前正在使用的 hbar。Rust 保留既有的 `unused_mut` 与 Cargo 配置弃用提示；Vite 调试保留 FlexLayout 分发包缺失 CSS source map 的提示。
