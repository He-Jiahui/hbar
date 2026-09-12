# Tool Window 契约速查

公开类型位于 `@hbar/contracts` 与 `@hbar/ui-sdk`：

- `ToolWindowDock`: `left | right | top | bottom | editor | window`。
- `ToolWindowDescriptor`: 稳定 ID、标题、白名单图标、默认停靠区、可选允许停靠区、作用域、popout/close 能力和最小尺寸。
- `ToolWindowContribution`: 静态 `markdown`/`json` 内容加上同一描述。
- `ToolWindowProps`: `panelId`、owner、当前 dock、workspace/session 上下文以及当前窗口的 `window`、`document`。

宿主会把插件 ID 命名空间化，并以 FlexLayout 模型保存实际顺序和停靠位置。插件只声明能力，不直接写布局 JSON。

视觉参考：React Bits Dock（https://reactbits.dev/components/dock）采用固定尺寸、邻近距离和缓动放大的图标 dock。hbar 将这一逻辑用于工具栏 hover：使用主题 token、短过渡和 tooltip，不把放大效果用于改变实际拖放顺序或可访问焦点顺序。

兼容迁移：旧面板的 `placement` 映射为 `defaultDock`；未声明位置默认 `right`。`window` 不能作为默认停靠区，且只有 `canPopout=true` 时才能允许。
