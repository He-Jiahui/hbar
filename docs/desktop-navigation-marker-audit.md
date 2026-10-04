# 原生设置导航标记诊断

本页只收口旧通用 smoke 的失败原因，不宣称整套 `desktop-smoke.ts` 已通过。相关实现历史：Lumen `f6bae3863b` (`feat(lumen): establish borderless lamp primitives`) 将持久指示器表达为 `LumenIndicator` 的 typed DOM。`LumenNavigationButton` 提供 `aria-current="page"` 和 `data-state="selected"`，不是 `button::before`。

当前 `scripts/desktop-smoke.ts` 中一段已有并行未提交检查读取按钮 `::before`，要求方形、glowing、width≥2；上轮读到 shadow=none、width=null。未覆盖该任务的改动，也没有删除断言或把产品改造成伪元素来使测试通过。

本轮使用 `verify-desktop-goal-lifecycle.ts` 已校验独立临时 profile/Host/native main WebView，在 General 选中状态 CSS transition 结束后读取两条证据路径：

- 旧伪元素的 content/width/shadow；
- 真实 `[data-state="selected"][data-edge] > beam > halo` 的状态、方向、几何、opacity、box-shadow。

脚本实际断言当前选中项、right边缘、可见细长竖条、正opacity和非none halo shadow；没有用截图坐标或修改任何生产材质。证据 [navigation-marker.json](../artifacts/desktop-entry-matrix/language/native/navigation-marker.json) 与 [原生选中图](../artifacts/desktop-entry-matrix/language/native/general-zh-CN-900.png)。同一次原生 Goal/language 流通过并正常清理新fixture，无provider Run，未重编译exe。

结论：当前 canonical marker 已真实渲染，旧 smoke 观察了不存在的 `::before`，并附加了不属于当前 canonical primitive 的方形要求。这是**断言与组件契约不一致**的实证，而不是证明全部桌面视觉无缺陷。后续应由该旧门禁变更的任务协调迁移到正确语义 DOM，并保留 selected/idle 对照、可见性与 glow 验证；本次不覆盖其 dirty hunk，整个通用 smoke 仍未标绿。
