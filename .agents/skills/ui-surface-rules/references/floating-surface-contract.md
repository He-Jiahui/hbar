# 浮层组件契约

## 模式选择

- `anchored`：菜单、下拉列表、能力选择器、模型/权限选择器和 tooltip。必须提供元素 `anchorRef`，由公共组件计算位置并限制在视口内。
- `point`：上下文菜单等只有指针坐标、没有稳定触发器的表面。使用 `mode="point"` 与 `anchorPoint`，仍通过公共组件定位、portal 和关闭。
- `modal`：命令面板、设置、移动端更多面板等需要遮罩和焦点语义的表面。保持 `role="dialog"`、`aria-modal="true"` 及焦点恢复；不要退化成业务组件自建 `<dialog>` 生命周期。

业务组件可以选择 `menu`、`listbox`、`option`、radio 或 dialog 语义，但不能自行决定渲染容器、层级或关闭机制。

## 交互生命周期

公共 `FloatingSurface` 负责：

- `document.body` portal、固定定位、最高层级 token、独立不透明背景和 `backdrop-filter` 模糊；
- 一个全局活动表面协调器，打开新表面前关闭旧表面；
- 捕获阶段 `pointerdown`，使用 `event.composedPath()` 判断当前内容。命中内容以外的任何位置（包括 anchor、工具栏、遮罩和其它浮层）都关闭当前表面；
- Escape、滚动、resize、视口边界、最大高度和卸载清理；
- modal 表面的遮罩和焦点恢复。

打开表面的 trigger 使用 `useFloatingTrigger` 或等价公共辅助：已打开时在 pointerdown 阶段关闭并阻止后续 click，避免“先关闭、后 toggle 又打开”的竞态；未打开时才执行打开动作。

## 反模式与迁移检查

发现以下任一项时，应迁移到公共组件，而不是增加例外：

- 业务组件直接调用 `createPortal`；
- 业务组件注册自己的 `pointerdown`、`mousedown`、`blur` 或 Escape 关闭监听；
- 使用 `onMouseDown` 判断 `event.target === event.currentTarget` 作为唯一外部关闭路径；
- 在组件或页面 CSS 内复制 `.floating-layer` 的背景、模糊、z-index 或定位；
- 把 anchor 永久视为浮层内容，导致点击入口无法关闭；
- 使用内嵌 DOM 让浮层受父级 `overflow`、`transform` 或 stacking context 影响；
- 选项内容通过 `justify-content: center`、`text-align: center` 或无图标时改变文字起点。

迁移验收至少覆盖：

1. portal 位于 `document.body`，内容高于普通面板且背景隔离并可观察到模糊；
2. 图标、标题、说明和快捷键左对齐，长内容滚动且四边不溢出；
3. 点击内容外、另一个浮层或任一入口后旧表面关闭，交互后最多一个表面可见；
4. 内容内点击不误关闭，Escape 可关闭，modal 焦点进入并在关闭后恢复；
5. 窄视口、滚动、resize、快速打开/关闭和 StrictMode 重挂载不产生重复监听或残留节点。
