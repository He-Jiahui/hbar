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

| 语义               | 既有角色                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| 主文字、次要说明   | `--lumen-ink`、`--lumen-muted`                                          |
| 表面、弱分隔       | `--lumen-contrast`、`--lumen-reading`、`--lumen-frost`、`--lumen-line`  |
| 操作、链接、进行中 | `--lumen-info`                                                          |
| 成功、警告、失败   | `--lumen-success`、`--lumen-warning`、`--lumen-danger`                  |
| 文字尺寸、控件圆角 | `--lumen-font-size`、`--lumen-radius-control`、`--lumen-radius-surface` |

正文、标题、强调、行内代码、路径、折叠摘要和工具源码继续使用已有会话阅读角色。正文行距支持长时间阅读，技术输出保持等宽语义与原文一致；不能因为着色或布局修改改变复制内容。

## 间距与动效

- 同一工具行和小型操作组使用紧凑间距；独立内容区用更明显的组间留白。
- 侧栏使用一个连续导航表面。内容区按阅读轴对齐，用自然 flex 流与弹性宽度支持响应式。
- 标签、思考状态和输入区按钮文字保持单行。长名称在自身文本容器省略，完整内容通过原有标题或详情访问。
- 普通状态切换使用既有 `--lumen-state-duration` 和 `--lumen-state-easing`。正在进行的任务保留蓝色呼吸；动效不改变位置、行高或控件宽度。
- 保留 reduced-motion 和系统高对比度模式，不为装饰增加持续动画。

本文件记录当前产品方向；用户新的明确选择优先。项目技能入口见 [hbar-design-md](.agents/skills/hbar-design-md/SKILL.md)。

Lumen 现状、差距与实施边界见 [Lumen 视觉设计评审](docs/lumen-design.md)。
