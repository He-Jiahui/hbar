---
name: hbar-reactbits-ui
description: 在 hbar Web 工作台设计或修改布局、React 组件和交互表面时，按 ReactBits Pro Application UI 参考矩阵实现统一的视觉语义、响应式外壳、AI 对话、工具调用、设置和数据面板；仅适用于 hbar 项目。
---

# hbar ReactBits UI

## 适用范围

当任务涉及 `apps/web` 的布局、工作台外壳、侧栏、顶部栏、移动导航、对话、composer、工具调用、审批、计划、用量、设置、文件、Git、诊断、列表、卡片、表单、对话框或通知时使用本技能。它不是通用 React 教程，也不要求把 ReactBits Pro 网站作为运行时依赖。

## 不可省略的设计契约

- 所有新增或修改的布局都必须在 [references/reactbits-application-ui.md](references/reactbits-application-ui.md) 中找到对应的 ReactBits URL 和具体示例；提交说明或变更记录必须写明采用了哪个 URL、迁移了哪些逻辑/层级/风格。
- 先建立语义层，再迁移业务组件。颜色、表面层级、边框、圆角、阴影、动效、焦点环和状态色只从 `apps/web/src/gallery-theme.css` 的 `--hbar-*`/`--dsh-*` token 读取；不得在业务 CSS 中重新发明一套 palette。
- 优先复用 hbar 已有的 `GlassSurface`、`SpotlightCard`、`GlareButton`、`GlassIconButton`、`AnimatedList`、`FloatingSurface`。ReactBits 效果组件负责视觉效果，业务组件负责数据、状态和可访问交互；不要把网络调用或 Zustand 写入塞进通用视觉组件。
- 保持 hbar 的 MVVM、Zustand、FlexLayout、公开 contracts/Client 边界。UI 只读取真实 snapshot、stream、event、approval、plan、usage、artifact 和 catalog 数据；没有协议字段时不得用 mock 数字或假引用填充视觉空位。
- 每个表面必须覆盖适用的空、加载、成功、失败、恢复、取消和禁用状态；错误和重试入口就近显示。桌面、窄屏、移动端使用相同模块 ID 和数据归属，移动端改为单面板/底部导航或 sheet，不复制业务状态。
- 浮层、菜单、popover、dialog 和 drawer 统一使用 `FloatingSurface` 及 [ui-surface-rules](../ui-surface-rules/SKILL.md) 的左对齐、最高层级、背景模糊、Escape、外部点击关闭和焦点恢复契约。
- 高风险或涉及协议/并发的改动仍遵守 [hbar-engineering](../hbar-engineering/SKILL.md)：先查当前 diff/history，再按子功能验证并立即独立 commit；不要覆盖用户已有改动。

## 工作流程

1. 检查 `git status --short`、目标组件、`stores.ts`、contracts、布局描述和现有测试；识别当前真实数据及不可改变的接口。
2. 阅读参考矩阵，至少选定一个“结构 URL”和一个“组件/交互 URL”；把参考中的布局关系、状态表达、密度和响应式行为翻译成 hbar 现有能力。
3. 先实现或整理语义 token/通用原语，再迁移一个完整业务表面；不要先在多个页面复制局部 CSS。
4. 用 selector/action 接入 Zustand，绑定稳定实体 ID；检查快速切换、重复点击、旧响应、断线/取消和长文本。
5. 运行相关单元测试、`bun run lint`、`bun run typecheck`、`bun run build` 和对应 Playwright E2E/截图检查；如基线已有失败，明确记录而不把它写成已修复。

## 参考资料路由

- 设计 URL、示例语义和 hbar 落点：阅读 [references/reactbits-application-ui.md](references/reactbits-application-ui.md)。
- 组件级 URL → 独立 fixture → adapter 绑定：阅读生成的 [references/reactbits-registry.md](references/reactbits-registry.md)；它必须与 `ReferenceRegistry` 通过 `bun run check:reactbits-reference` 保持一一对应。
- 只做浮层、菜单、下拉、dialog、sheet 或 popover：同时阅读 [ui-surface-rules](../ui-surface-rules/SKILL.md)。
- 涉及 React/Zustand/布局或跨端同步：同时阅读 [hbar-engineering](../hbar-engineering/SKILL.md) 及其相关 references。
