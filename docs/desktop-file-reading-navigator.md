# Files：阅读时持续可用的文件导航

## 参考证据与迁移边界

依据 cc-haha 的真实应用画面 [workspace-diff.webp](../../cc-haha/docs/images/app/en/workspace-diff.webp)：主区域阅读 diff，右侧独立滚动的 Changed files 列表显示当前选中行；列表上方可以切换 Changed files / All files。工具栏的分栏图标是显示／隐藏导航，不是增加并排 diff 模式。

源码证据：[WorkspacePanel.tsx](../../cc-haha/desktop/src/components/workspace/WorkspacePanel.tsx) 的 `isNavigatorVisible`、`PanelRightClose` / `PanelRightOpen` 和 navigator view selector。普通列表与阅读区域参与布局流，迁移使用 flex，不依据截图坐标定位。

## 本子功能实现

- 文件／diff 打开后保留同一 Files 实例的右侧导航，当前路径高亮；切换 All / Changed 和刷新列表不退出阅读区域。
- 工具栏加入本地化显示／隐藏按钮；打开时聚焦筛选框，关闭时焦点返回触发器。
- 响应式依据 Files 容器宽度而非全局屏幕宽度。具备两栏阅读空间时默认显示；窄容器默认阅读优先，显式打开导航后选择文件返回阅读。保留原“返回文件列表”和“返回对话”路径。
- 不增加第二份文件草稿。继续使用 workspace + canonical path 的有界文件缓存；切文件、列表模式和刷新不会保存／丢弃 dirty 或 unknown 文件。
- 现有 client commands 增加可选 `preservePreview`。旧调用默认行为不变；导航使用显式保留预览语义。Changed 列表刷新保留有效后页，条目减少时夹紧页码。
- 路径筛选、树展开、分页、真实 Git 状态、只读 diff、CAS 保存与结果核对沿用已有契约，不伪造文件内容或状态。
- 原有 `--lumen-selected` 未定义导致选中背景不可见；本子功能使用现有 Lumen ink/frost 色彩令实际选中状态可见，不另建色彩或图标系统。

## 验证

- `bun test` 的 file-workspace runtime/changes/react/tree 范围：首轮 25 pass，0 fail；随后补充“diff 未结束时切导航模式不能复活 loading”回归，changes 范围 9 pass，0 fail。另有组件边界／文案／迁移清单／布局范围 10 pass，0 fail。
- TypeScript 与本子功能严格 ESLint 通过；Web 独立构建通过（保留已有 bundle size warning）。
- 新真实 Host E2E：`e2e/file-reading-navigator.spec.ts`，中英文，1440 / 900 / 390 / 320；验证导航选中、隐藏／打开与焦点、连续选文件、All / Changed 不退出预览、diff 刷新、未保存草稿返回和磁盘不被自动写入。
- 既有真实 Host Files 回归：workbench tabs / changes / tree，8 pass，0 fail。
- 实际截图位于 `artifacts/file-navigator/reader-<locale>-<width>.png` 和 `navigator-<locale>-<width>.png`；已经人工检查宽屏两栏及 320px 阅读／导航画面。该证据来自真实 Host 的生产 Web UI，不宣称已经重新编译原生桌面 exe。

完整 Goal 生命周期、侧栏刷新和设置用量不是本 Files 子功能的完成范围；总入口审计仍在进行。
