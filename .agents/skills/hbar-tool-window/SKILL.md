---
name: hbar-tool-window
description: 在 hbar 中设计、实现或评审可停靠、可成页签或可独立窗口存在的 Tool Window 插件。仅适用于 hbar 的 contracts、plugin-sdk、ui-sdk 与 Web 工作台。
---

# hbar Tool Window

使用这项技能时，先阅读 [contract.md](references/contract.md)，需要交互验收时再阅读 [acceptance.md](references/acceptance.md)。

Tool Window 是一个稳定 ID 对应一个按钮、一个页签内容和一个可恢复窗口状态的工作台能力。插件不得自行创建第二套布局、浮层、z-index、portal 或 outside-click 关闭逻辑。

## 设计要求

- 使用 `ToolWindowDescriptor` 声明 `id`、标题、白名单图标、`defaultDock`、`allowedDocks`、作用域、最小尺寸与 `canPopout`。
- `defaultDock` 表示首次打开位置；用户移动后的实际位置由 FlexLayout 布局描述保存。
- `allowedDocks` 必须包含默认停靠区；禁止的停靠目标必须在拖动时不可用，并在 action 层再次拒绝。
- ID 在插件内稳定且唯一；宿主会加 owner 命名空间。标题要短、可翻译、能在窄 tab strip 中省略显示。
- 图标只能使用 contracts 白名单名称。不要传 SVG、HTML、任意 import 路径或可执行脚本。
- Client 组件接收 `ToolWindowProps`。当窗口被 popout 或重新停靠时，使用传入的 `window`/`document` 或元素的 `ownerDocument`，不要假设全局窗口。
- 所有注册、事件、定时器和订阅都必须返回 disposer 或通过 `api.effect` 管理；插件停用和窗口关闭后不得留下按钮、监听器或业务写入。
- 业务数据通过 `api.client` 和公开 contracts 获取；不要读取 Zustand 内部 store，也不要让插件修改布局模型。
- 菜单、popover、dialog 和临时提示必须使用共享 `FloatingSurface`，遵守统一左对齐、portal、最高层级、背景模糊、Escape 和 capture-phase 外部点击关闭契约。

## 注册形状

```ts
api.registerPanel({
  id: 'status',
  title: 'Status',
  icon: 'activity',
  defaultDock: 'right',
  allowedDocks: ['left', 'right', 'bottom', 'editor', 'window'],
  scope: 'workspace',
  canPopout: true,
  closable: true,
  component({ document }) {
    const target = document ?? globalThis.document
    return api.react.createElement('output', { ownerDocument: target }, '…')
  },
})
```

静态 Host 面板使用同一份描述并提供 `kind` 与有界 `content`。不要在静态内容中放脚本、组件路径或任意 HTML。

## 取舍边界

首版使用可信 Client 插件，不提供 OS 沙箱；独立窗口由宿主负责，浏览器 popup 被阻止时必须回退到工作台内面板。不要把一次性的视觉偏好或某个插件的业务字段写成通用规范。
