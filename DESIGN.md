# hbar 视觉语言

当前方向：轻盈简洁。减少嵌套边框与卡片，用留白、清楚的文字层级和轻量分隔组织开发工作台。工具动作继续保持紧凑，聊天内容获得更舒适的阅读空间。

## 来源与取舍

- 设计参考：[VoltAgent awesome-design-md](https://github.com/VoltAgent/awesome-design-md)，版本 `13be5c05c63be24b57581162364167028020f043`。
- 本轮按用户选择采用 [Raycast](https://getdesign.md/raycast/design-md)、[MiniMax](https://getdesign.md/minimax/design-md)、[Apple](https://getdesign.md/apple/design-md)、[Cursor](https://getdesign.md/cursor/design-md) 和 [Runway](https://getdesign.md/runwayml/design-md)。Apple / Runway 提供轻量阅读表面；Raycast 提供侧栏和命令层级；Cursor 提供紧凑动作时间线；MiniMax 提供清楚的模型与状态信息。
- 五份原始分析保存在项目技能的 `references/`；Raycast / Cursor 固定到上述 Git 版本，另外三份是官网下载的 alpha 文档快照，日期、来源与文件校验记录在 [provenance.json](.agents/skills/hbar-design-md/references/provenance.json)。Vercel / Linear 保留为补充参考。
- 这些是第三方公开网站分析，包含营销示例；hbar 按自己的应用结构、真实数据和组件接口落地。
- 保留 ReactBits [App Shell 9](https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-9)的导航与内容区域关系，以及 [Prompt Input 1](https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1)的输入、附件和发送/停止行为。

## 表面与层级

| 区域           | 视觉职责                                                                       |
| -------------- | ------------------------------------------------------------------------------ |
| 侧栏与导航     | 轻量背景与稳定文字层级，普通动作以文本呈现；选择、悬浮与键盘焦点有明确反馈     |
| 主工作区       | 连续阅读背景，避免把普通段落和每个模块再包成卡片                               |
| 聊天输入区     | 一个清楚的输入表面，避免外层卡片与编辑器双重描边；操作栏与输入内容通过间距分区 |
| 工具与折叠摘要 | 保持紧凑的标签＋行为描述，颜色表达动作与结果；展开细节才呈现代码或结果表面     |
| 菜单和对话框   | 保留独立表面、清楚边界与共享浮层契约，不能为减少边框牺牲可识别性               |

## 色彩与字体

颜色消费既有 Lumen 语义变量，支持明暗主题和用户主题设置，不导入参考品牌的原始色板或字体。

子窗口遮罩使用主题背景色：暗色为黑色系，亮色为白色系，并模糊底层工作区。遮罩由共享浮层绘制一次，原生 top layer 与回退路径保持一致；窗口内容保持清晰。系统高对比度模式关闭背景模糊。

| 语义               | 既有角色                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| 主文字、次要说明   | `--lumen-ink`、`--lumen-muted`                                          |
| 表面、弱分隔       | `--lumen-contrast`、`--lumen-reading`、`--lumen-frost`、`--lumen-line`  |
| 操作、链接、进行中 | `--lumen-info`                                                          |
| 成功、警告、失败   | `--lumen-success`、`--lumen-warning`、`--lumen-danger`                  |
| 文字尺寸、控件圆角 | `--lumen-font-size`、`--lumen-radius-control`、`--lumen-radius-surface` |

正文、标题、强调、行内代码、路径、折叠摘要和工具源码继续使用已有会话阅读角色。正文行距支持长时间阅读，技术输出保持等宽语义与原文一致；不能因为着色或布局修改改变复制内容。

会话阅读字号统一从 `--lumen-font-size` 派生为正文、详情和辅助信息三个等级。Markdown 标题相对所属正文缩放，避免浏览器默认的大标题打断阅读。文字设置和页面缩放同时作用于正文、思考、折叠摘要、工具结果与代码；编辑器继续拥有自己的排版与测量。

思考详情使用轻量的左侧分隔与阅读留白；代码和原始工具输出仍保留必要的独立边界。Markdown 表格采用左对齐、单层细分隔和自身横向滚动，完整长值不撑宽会话。

## 间距与动效

- 同一工具行和小型操作组使用紧凑间距；独立内容区用更明显的组间留白。
- 侧栏使用一个连续导航表面。内容区按阅读轴对齐，用自然 flex 流与弹性宽度支持响应式。
- 非多行组件按完整文字、图标、gap 和 padding 自然占宽；禁止省略号、文字裁切、缩小字体或内部换行增高。空间不足由外层布局承接：操作组可按整个控件分组，受限的工具栏、标签页和单行数据行使用局部横向滚动。tooltip 不能替代可读的完整文字。
- 输入栏的辅助控件位于可键盘滚动的工具区，发送 / 停止动作留在滚动区外。加载、离线和错误文案同样保持单行，不使用固定标签宽度压缩内容。
- 普通状态切换使用既有 `--lumen-state-duration` 和 `--lumen-state-easing`。正在进行的任务保留蓝色呼吸；动效不改变位置、行高或控件宽度。
- 工程视图和时间视图共用运行指示器：运行使用 Lumen 信息蓝呼吸灯，等待审批使用警告图标，排队和取消请求使用静态辅助图标。状态槽使用语义图标尺寸，切换状态不挤动文字；零发光仍保留可见的状态点。
- 会话编辑器维护自己的排版与测量。宿主改造优先调整组合、外观和分组间距；不要用外层 CSS 覆盖编辑器的字体、行距和内部留白。
- 保留 reduced-motion 和系统高对比度模式，不为装饰增加持续动画。

本文件记录当前产品方向；用户新的明确选择优先。项目技能入口见 [hbar-design-md](.agents/skills/hbar-design-md/SKILL.md)。

Lumen 现状、差距与实施边界见 [Lumen 视觉设计评审](docs/lumen-design.md)。
