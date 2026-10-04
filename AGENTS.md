# hbar 项目指引

本仓库的开发、重构、评审、测试和交付必须遵守项目技能
[hbar-engineering](.agents/skills/hbar-engineering/SKILL.md)。开始相关任务前读取该技能，并按任务范围读取其中的参考规范。

当任务是依据截图、公开预览或 iframe 可见内容复刻、校正或新增 Application UI 组件时，还必须读取并遵守
[hbar-reference-flow-layout](.agents/skills/hbar-reference-flow-layout/SKILL.md)。该技能要求先理解可见结构、语义文本与响应式流，再用 flex/grid 实现；禁止把截图坐标或固定高度当作普通内容布局，定位仅可用于已证实的覆盖层。

当任务新增、重构或审查用户可见的 UI 图标、文案、可编辑内容或列表时，还必须读取并遵守
[hbar-icon-scale](.agents/skills/hbar-icon-scale/SKILL.md) 与
[hbar-content-contract](.agents/skills/hbar-content-contract/SKILL.md)。前者使用少量语义尺寸等级而不是猜测单个像素；后者要求宿主提供类型化 i18n 文案与内容数据，并为容量、溢出和交互边界提供测试。

核心要求：React 功能组件化，Zustand 管理应用数据，前端 MVVM、后端 MVC；Bun 驱动 TypeScript 后端；通过公开契约保持单向依赖，禁止越层访问和隐式耦合；严格 lint 与类型检查；完整、简洁、就近响应的 JetBrains 风格工作台；描述文件驱动布局；有界并发、可取消和可靠增量同步。

每个子功能完成并通过相应验证后，立即进行独立 Git commit，再进入下一个子功能；不得等整个大功能结束后集中提交。提交前检查暂存差异，只提交当前子功能的文件；提交后确认本次改动无残留，保持工作区干净，不得夹带或清除用户原有及其他任务的改动。未运行或失败的检查必须如实报告，不得将规范要求写成已经实现的能力。

出现问题时优先查证相关 Git commit 历史和提交差异，同时核对未提交改动，用复现和测试证据定位原因。提交说明应记录变更目的及验证结果；修复应记录症状、原因和相关提交，使问题有据可循。具体排查流程见技能的质量与交付规范。

仓库实现背景见 [架构说明](docs/architecture.md)、[插件开发](docs/plugins.md) 和 [验证说明](docs/testing.md)。这些文档描述现状；新增和修改代码的目标约束以项目技能为准。处理现存差距时围绕当前功能闭环实施，跨项目迁移需要独立明确的任务范围。
