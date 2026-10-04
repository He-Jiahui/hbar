# 会话页签与工作台：参考证据和受控视图

本单元只负责参考审查与独立 UI；打开集合、持久化、运行核对、停止回执、关闭及工作台来源由 app-runtime 拥有。组件不读取 Host、不复制会话数据、不自行关闭真实 Run。

## 真实参考

已查看 `D:/Git/cc-haha/docs/images/app/zh-CN/session-new.webp` 与 `workspace-changes.webp`：页签是主内容顶部的文档导航，活动项与内容相连；工作台为右侧面板，不是另一个全屏设置页。

为核对截图无法证明的操作，`artifacts/reference-ux-v2/reference-tabs.tsx` 直接导入未修改的原 `TabBar`、`WorkbenchPanel`、`WorkbenchTab`，沿用真实 tab/panel store action。只替换会话内容与远端 I/O 的隔离夹具，不连接参考 Host、不修改参考库。`verify-reference-tabs.ts` 在独立 44650 服务实际驱动确认、批关、拖拽、滚动、展开和返回；`reference-tabs-observations.json` 记录状态与空 browser-error 列表。

该 fixture 加载原 `theme/globals.css`。已核对 computed body/tab 字体链为 `Inter, -apple-system, PingFang SC, Microsoft YaHei, sans-serif`，本地 Inter/Material Symbols 字体已加载。原 Modal 的标题刻意使用 `--font-headline` 衬线体（`Modal.tsx:111`，`globals.css:694`），不是未加载样式的 Times 回退。fixture 中额外说明文字不是产品参考。

| 区域与入口   | 原行为与证据                                                                                                                                                 | hbar 视图/运行时边界                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 活动页签     | `TabBar.tsx:539` 的侧栏底色条；`TabItem:795` 最小 46px、宽 140–200px、仅顶部圆角，活动项描边及纸面色；正常会话没有重复气泡图标，运行时出现圆点               | 使用共享 Lumen 原语组合文档页签，不新增装饰性页签数据；标题来自 item，running/unknown 来自宿主事实                       |
| 单项关闭     | `TabBar.tsx:390` 固定目标后检查活动 chat/background 状态；右端 X 不冒泡选择行（861）                                                                         | 只回调原 id + `one`，不读稍后变化的 activeId                                                                             |
| 运行中确认   | `716–751` 取消、保持运行、停止并关闭；保持运行不 disconnect，停止分支调用 stop 后立即清理（360–387）                                                         | 保留三种意图；不可照抄原实现不等停止回执。受控 checking/stopping/unknown/failed 分开呈现，unknown 只核对，不提供再次停止 |
| 批量关闭菜单 | `413–435` 当前、其他、左侧、右侧、全部；右键菜单 `676–713`                                                                                                   | 同一作用域集合，菜单绑定触发 item。另提供显式菜单入口和 Shift+F10，边缘空集合禁用                                        |
| 溢出         | `229–337` 条内横向滚动，75% 可视宽度步长；active reveal 经 ResizeObserver 修正，手动滚动后不抢回                                                             | 横向 pane-owned scroll，显示所有有效项；运行时上限 32，视图测试 33 项仍不丢弃。激活后包括右端关闭按钮的整项可见          |
| 拖拽         | `438–535` 鼠标 4px 阈值、冻结目标中心、抑制拖拽后的误点击                                                                                                    | 原生拖拽返回稳定 `id/beforeId`；不在视图保存重排集合。Alt+Shift+方向键提供键盘替代                                       |
| 键盘         | 原 TabItem 是 div，无 tab role/tabIndex（787），并非完善键盘页签                                                                                             | 补原生按钮的 tablist/roving、方向键/Home/End、Delete、Shift+F10。不是声称原实现已有这些能力                              |
| 工作台展开   | `WorkbenchPanel.tsx:49` 保存 sourceSessionId/sourceTurnKey/sourceElementId，打开工作台主内容页签并关闭侧面板                                                 | 视图预留真实 workbench kind，不生成假页签；主线运行时接线来源与生命周期                                                  |
| 返回 vs 关闭 | `WorkbenchPanel:65` 的返回调用 `tabStore.ts:236`，激活仍存在的来源会话再关工作台；`WorkbenchTab.tsx:26` 的 X 仅关闭该 tab，回退由 tabStore 相邻项规则决定    | 返回必须绑定原来源，不能用当前会话代替；关闭和返回保留不同动作含义                                                       |
| 刷新恢复     | `tabStore.ts:424` 的 saveTabs 排除工作台/terminal/subagent 等临时视图；detached 视图恢复到源会话；restore（462）向服务端核对会话存在性并拒绝覆盖较新本地操作 | 由单一运行时/布局描述负责，受控组件不自行访问 localStorage                                                               |

原组件截图均位于 `artifacts/reference-ux-v2/`：

- `29-reference-tabs-initial-1440.png`、`running-close-dialog-1440.png`、`multiple-close-dialog-1440.png`、`context-menu-1440.png`、`drag-preview-1440.png`（均带 `29-reference-tabs-` 前缀）。
- `29-reference-tabs-overflow-{1440,390,320}.png` 与 `overflow-scrolled-{1440,390,320}.png`。
- `29-reference-tabs-workbench-{panel,expanded,returned}-1440.png`。

来源返回的消息滚动逻辑另见 `MessageList.tsx:3378`；本 fixture 没有挂载真实 MessageList，因此只验证来源元数据与选中会话，不声称截图证明了消息滚动恢复。

## 组件契约

`HbarWorkspaceTabs` 输入 `items/activeId/busy/labels`，仅输出 `onSelect(id)`、`onRequestClose(id, scope)` 和 `onMove(id, beforeId)`。items 包括 session/workbench kind、title/detail 和 idle/running/unknown；重复 id 保留第一项，失效 activeId 不伪造选中项。唯一局部状态为菜单、滚动与焦点。

`HbarWorkspaceTabsCloseDialog` 输入 fixed targets、status、已本地化 error 和 labels，仅发出取消、保持运行、停止并关闭、核对回调。真实回执及可重放规则由运行时负责。列表保持内容顺序并允许有界滚动；按钮自然换行。

宿主适配器为 `apps/web/src/workspace-tabs-copy.ts`，`workspaceTabsCopy(choose)` 返回 `{ tabs, close }`，包含中文/英文与复数处理。所有产品 DOM 使用 Lumen。现有 LumenButton/Frame/Text/Icon/Dialog 已足够，不改共享组件库；菜单使用原生 top-layer popover 避免被页签滚动容器裁剪。flow guard 的例外仅允许该文件中的菜单根容器，跨文件、普通页签、菜单内容仍禁止坐标布局。

## 验证范围

- `tests/workspace-tabs-react.test.tsx` 覆盖空/1/4/32/33 项、重复 id、失效 active、unknown 事实与不可再次停止的呈现。
- `e2e/workspace-tabs-view.spec.ts` 通过真实 Vite 构建独立受控 fixture，验证键盘选择/重排/关闭、原 item 菜单、鼠标拖拽、busy、1440/390/320 溢出和完整活动项可见、人工滚动不抢回、双语长标题/关闭状态。截图在 `artifacts/reference-ux-v2/tabs-view-results/`。
- 此独立 DOM 测试不等价于真实 Host 的多会话关闭与恢复；主线接入运行时后另行执行生产 E2E。尤其不能用静态 running item 证明停止已成功。
