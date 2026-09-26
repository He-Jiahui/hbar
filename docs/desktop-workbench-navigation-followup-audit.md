# 会话、Files 工作台与设置导航的后续审查

2026-09-26 的独立只读审计。hbar 读码基线为 `c6c2e52`；cc-haha 为 `e28d0a65`；共享 UI 子仓 HEAD 为 `d270795aa2`，其既有 dirty 保留。已读项目四项 UI/工程技能、工程前端/后端/质量参考、preview evidence，以及 cc 根、desktop、components 的 AGENTS。本页不实现产品、不改已有文档/索引、不把下面的建议写成已完成能力。

本次优先审查完整的 **会话 → 上下文工具 → 展开工作台 → 来源返回/关闭 → 设置往返**。之前的页签、文件草稿、All/Changed/diff、阅读导航器、Files Add to chat、语言、Settings handoff、归档保留视图均已有独立交付；不能按早期总矩阵里的历史基线重复报缺失。当前进度以 `desktop-entry-audit-2026-09-26.md` 和对应交付文档为准。

## 证据等级与本轮实际运行

1. **已发布参考画面**：`D:/Git/cc-haha/docs/images/app/en/workspace-changes.webp` 是会话与右侧 Files 并排，Files/Browser、展开入口同属文件区；`D:/Git/cc-haha/docs/images/app/en/workspace-diff.webp` 是展开后的工作台，顶部 Back to conversation / Files / Browser / X，当前文件标题旁 Add to chat / 刷新 / 导航器 / 关闭。`D:/Git/cc-haha/docs/images/app/en/workspace-preview.webp` 证明 Browser 的位置，但不证明 hbar 已有嵌入 Browser。原图不是 900/320 响应式证据，也不是新的真实后端测试。
2. **本轮原组件实际挂载**：`D:/Git/hbar/artifacts/workbench-navigation-followup/reference/main.tsx` 直接导入原 `TabBar`、`ActiveSession`、`WorkbenchTab`，用人工 typed stores、原主题和 mock 空文件读取；没有原 App/Sidebar 壳、Host、native WebContents 或 provider。两语言 × 1440/900/390/320 共 8 个组件场景。非 fixture origin、未允许的 API 和所有 WebSocket 都被阻断。这里的 390/320 是 H5 路径，不冒充 cc 的原生窄窗口。
3. **hbar 生产 UI + 真实临时 Host**：独立 preview 45053、临时 demo Host 45055，en-US/zh-CN × 1440/900/390/320，共 8 个浏览器场景。最终每个场景实际 script URL 都为 `index-BUjyaW7Q.js`；未重新构建、覆盖共享 dist，未连接用户实例，未提交 Run，未配置或调用商业 provider。真实目录内由既有 Host fixture 创建两个会话并配置 local-fixture；这些是 UI/导航数据，不是商业模型能力证据。probe 与观察 JSON 在 `D:/Git/hbar/artifacts/workbench-navigation-followup/`。
4. **上一轮真实原生证据**：`D:/Git/hbar/artifacts/session-execution-access/native/hbar-native-session-execution-jIrHA8/verification.json`、`archived-retained-files-zh-CN-900.png`、`archived-controls-zh-CN-1440.png`、`restored-retained-zh-CN-900.png`。900×600 的 Files 覆盖了模型入口；验收诚实地分为 900 保留 DOM、真实 resize 到1440做恢复、再回900，没有 force click 或先关 Files 冒充同 DOM。首轮 `.../hbar-native-session-execution-lYIeZW/verification.json` 的 pointer interception 红证据保留。本轮不重跑 native。

最终 probe **16 场景，pageerror 0**；这是审查观察，不是“差距已修复”或完整桌面验收。前几轮 harness 先后误等已展开项目的 Expand、把 contenteditable 当 input、猜错中文 separator 名、在已折叠 sidebar 中点击 Settings；修正这些定位假设后最终运行完成，没有据此改产品。没有执行重型 root check。

## 完整入口及来源路径

| 入口/路径                                     | cc-haha 当前真实行为与证据                                                                                                                               | hbar 当前实际行为与现有契约                                                                                                                              | 本轮结论/验收落点                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 会话右上 Files / 再点隐藏                     | `desktop/src/components/layout/TabBar.tsx:644-670` 以当前 session 为键，在 workspace mode 时关闭，否则设 workspace mode 并打开；语义 Folder 图标与选中态 | `packages/app-react/src/lumen-session-workspace.tsx:461-473,1210-1220`，`app.openPanel/closePanel`；Files workspace 目标与其它 session-only 工具分开判定 | 已有真实入口，不缺 Folder 按钮；但900/窄屏打开后同一工具栏部分被覆盖，不能再用“看得到 DOM”证明 pointer 可达                                       |
| 侧栏项目 → Files                              | 参考工作台主要是 session-owned；原 Sidebar/TabBar 的项目上下文与 session workDir 明确                                                                    | `lumen-workspace-shell.tsx` 的 workspace menu，`app.openPanel` 显式 workspace-only/pinned；项目 Files 不假借当前会话                                     | 已有；展开后没有 sourceSessionId 时应 Back to workspace，不造返回会话。已有 `e2e/file-workbench-tabs.spec.ts:138` 覆盖                            |
| Files dock 的 X                               | `WorkbenchPanel.tsx:58-64,133-142` 只关原 session panel，不归档、不关来源 session                                                                        | `lumen-file-workspace.tsx:284` 调 `app.closePanel({instanceId})`，Files docs owner 保留文件草稿                                                          | Pointer X 在本轮四宽可用，但关闭后两语言四宽 activeElement 都是 BODY；这是焦点闭环缺口，不是丢草稿/Host 删除                                      |
| Files ↔ Browser                               | `WorkbenchPanel.tsx:21-44,95-126` 同一 session 工作台切模式；已发布 preview 图可见                                                                       | 当前只有真实 Files；Host `browser.*` 是自动化，尚无安全内嵌 Browser 公共桌面契约                                                                         | 不新增无行为 Browser tab。公开边界见 `desktop-browser-preview-boundary.md`                                                                        |
| dock 展开                                     | `WorkbenchPanel.tsx:47-55` 捕获 origin，`openWorkbenchTab` 后 closePanel；顶部独立工作台 tab                                                             | `apps/web/src/App.tsx:510-554` 将原 Files panel pin 到原目标，再 `workspaceTabs.openWorkbench`，同一个 panelInstanceId，独立 file owner                  | 数据闭环已存在；本轮四宽展开成功，但焦点落 BODY。不能只把旧 Expand 当“放大窗口”，它是视图导航                                                     |
| 展开的 Back to conversation                   | `WorkbenchPanel.tsx:66-74`、`tabStore.ts:232-243`：来源 tab 存活才选它，再关工作台                                                                       | `workspace-tabs-runtime.ts:986-1021` 捕获 id+instanceKey，Host 验证来源；不存在/归档时安全关闭到有效邻项；`App.tsx:384-417` 返回后聚焦存活 tab           | 本轮 hbar 四宽 Back 均回原会话 tab、草稿保留；cc 原组件 Back 回 composer。两者都是明确有效焦点，不能把 hbar 聚焦 tab 当 bug                       |
| 展开的 X / 标签 X / 批量关闭                  | cc `WorkbenchTab.tsx:22-29` / `tabStore.closeTab` 关闭原工作台，选邻项，不强制选来源                                                                     | `App.tsx:391-402` close coordinator，捕获 exact tab refs；view-only file target sessionId:null，不取消来源 Run                                           | 已交付，不把 X 改成 Back，亦不以 Archive 代替关闭视图；新布局需保留该区别                                                                         |
| 文件内 Back to files                          | 原 WorkspacePanel 的预览标签/导航器在同一文件工作区，不等于返回对话                                                                                      | `lumen-file-workspace.tsx:281-283` → `fileWorkspace.showBrowser`，工作区/草稿仍原目标                                                                    | 必须和工作台 Back / dock X 分开。已有真实入口，不应加一条泛化“返回”来合并职责                                                                     |
| 文件导航器、All/Changed、当前文件 Add to chat | `WorkspacePanel.tsx` 原路径搜索、文件预览、navigator 与当前文件标题行；发布 diff 图清楚显示 Add to chat                                                  | hbar 已有 All/Changed/diff、可折叠 reader navigator、原 sourceSessionId+revision CAS 的 `fileWorkspace.addToComposer`，不导航、不用 clipboard 假引用     | 这些已完成，不重复列成下一单元。待布局变更后回归 dirty/unknown、不误保存、原引用归属                                                              |
| 切 Monitoring / Agents / Goals 等其它工具     | 原 Activity、Files 在各自上下文；参考没有 hbar这五个同名工具的全部一一对应能力                                                                           | 会话 header 的五个具名入口都通过公开 typed app commands；同一 LumenAppShell tool outlet                                                                  | 900px 同一 header 右侧落在 drawer覆盖范围，按源码影响其它工具切换；本轮直接量的是 Files/model，不冒称已逐个实点其它面板                           |
| A 开 Files → 点从未开 Files 的 B → 回 A       | 原 `workspacePanelStore.ts:73,242-292` 保存每 session isOpen/mode；B 不因 A 开面板就自动打开                                                             | `surfaces.ts:245-281` followActive panel 更新为 B，但 presentation 保留 toolInstanceId；本轮同 workspace 两会话真实观察 B 继承打开 Files，回 A 草稿仍在  | **交互归属差异，不是 Host 写错会话的证据**。考虑后续 per-session 工具可见状态，尤其不同 workspace；不得把已有 workspace-scoped Files 自动认作错误 |
| Files → 全局/会话 Settings → Back             | 参考 Sidebar Settings `Sidebar.tsx:1461-1475` 开稳定 settings tab；原 session panel状态仍保存在 session store                                            | `surfaces.ts:112-160,185-201` 保存 returnContext并隐藏 tool；Back 恢复仍有效工具；startup/语言 owner 已修                                                | 本轮900真实 Settings往返两语言都保留 Files/原稿，返回named session region。主要余差是恢复后仍有覆盖背景 focusable targets，不是设置丢页/丢稿      |
| 页签切换、关闭来源/归档来源后 Back            | 参考 sourceSessionId 存活检查；workbench不是新会话                                                                                                       | hbar exact工作台 ref、来源Host校验、关闭/归档版本fence、32tab上限、明确错误；归档只读能力已另交付                                                        | 不能为了响应式导航重建runtime、偷选来源、复活退休tab；失败不应消费草稿。用现有tab/archive suites继续验收                                          |
| Command palette / Status 等离开工具上下文     | 参考稳定tab/store保持来源；Terminal全局/会话dock有各自真实生命周期                                                                                       | hbar `app.openCommands` modal、`app.openStatus` page、`app.back`，有现成呈现与返回契约                                                                   | 下一容器单元应完整回归而不新增命令目录假入口。Terminal缺公开PTY，不把“列表挡路/没有Terminal”当这个布局bug                                         |

## 可复现的几何与键盘事实

原参考的普通内容是 flex flow：`SessionChatSurface.tsx:117-142` 的 chat-column与 sidePanel 为并排兄弟；`ActiveSession.tsx:759-769` 的 separator/aside 也是 flow。宽度为 store 默认860、有界420–1120，aside max62% / min(min420,54%)；`ActiveSession.tsx:165-231` 的 separator 可用 ArrowLeft/Right，以实际渲染宽度增减32。

**不能把原参考900也描述为完美。** 本轮不含Sidebar的原组件900场景，默认aside rect为 x401 / width558，右缘959，超出900视口；聊天列 min400造成内部裁切。按 ArrowRight 后 store860→526（实际558减32），仍有轻微右缘裁切，Close rect x883,width28,right911，但中心仍可点击。参考1440默认 x580,width860；一次ArrowRight860→828。因此应迁移“有界并排/可调宽/明确展开返回”的逻辑，不机械复制其最小宽度、62%或截断状态。

hbar 的覆盖是**明确已设计的真实 overlay**，不是本轮偶发 CSS：共享UI `workbench.tsx:48-112` 的注释、`workbench.css:377-386` 的 `<80rem` fixed right drawer，历史 `fa0b2b9d9b` 明确写“bounded overlay below80rem”；宿主描述 `apps/web/src/shell-layout.json:28-34` 也声明 medium drawer / narrow page。现在宿主只传preferred width (`App.tsx:860-863`)，没有落实窄屏page的背景交互协议或拖拽/键盘调宽。

| hbar宽度（两语言一致） | Files rect / position | 模型入口中心实际hit                   | 从Files Close开始24次Tab，落到“工具区外且中心被遮”控件数 |
| ---------------------- | --------------------- | ------------------------------------- | -------------------------------------------------------- |
| 1440                   | x1056,width384,static | 自身文字，pointer可达                 | 0                                                        |
| 900                    | x516,width384,fixed   | `hbar-file-tree-scroll`，不是模型按钮 | 7                                                        |
| 390                    | x6,width384,fixed     | `hbar-file-tree-scroll`               | 16                                                       |
| 320                    | x0,width320,fixed     | `hbar-file-tree-scroll`               | 17                                                       |

计数是这个24步 probe 的观测，不是完整页面全部不可达控件数量。900被遮焦点包括 tab actions和 Files/Monitoring等会话工具按钮；390/320包括显示侧栏与会话tab。Files打开后焦点仍在原Files trigger；dock X与展开后焦点均为 BODY；Esc 不关闭 Files。这里 `aside` 既没有modal/inert/focus containment，也没有把背景改为不活动单页。**覆盖本身是可接受的容器策略；让 Tab进入不可见背景操作、pointer入口被遮却仍表现为活动控件，才是需要完整解决的问题。**

不是“所有功能完全不可达”：本轮四宽 Files X/Expand 仍真实可点；关闭后模型/其它会话工具恢复可操作；900可经展开进入中央工作台。上一轮native还证明1440恢复后回900保留Files DOM。新的修复不应强制关 Files或 forceclick穿透来宣称保留/一致；也不应把一切覆盖层一律改为无条件并排。

原组件也没有一律完美的焦点恢复：本轮cc Close/Expand均落BODY，Back通过ChatInput重挂回composer。不能宣称已发布静态图证明其Escape/focus trap，更不能照抄一个缺口。

## 有据优先顺序与真实契约

### P1 — 完整工具容器与进出焦点闭环，最高影响

首先解决所有上下文工具的中/窄窗口可操作性，而非单独补Esc或缩一个图标。建议一个独立单元定义并实现三种语义：空间足够时有界flow split；空间不足时明确单面板tool page或完整drawer协议；展开仍是既有独立workbench tab。判定应以可用主区宽度/侧栏状态为准，不能仅以900硬分或照抄参考min400+420。Files关闭、来源Back、tab X仍不同动作。

现有公开 `app.openPanel/closePanel/back/setSidebarVisible`、`workspaceTabs.openWorkbench/returnToSource` 足以支撑导航，无需新增Host安全能力。只需宿主/共享UI明确容器presentation、active区域与focus返回契约；不可越层改Runtime私有store。候选文件：`apps/web/src/shell-layout.json/.ts`、`App.tsx`、`packages/app-react/src/lumen-workspace-shell.tsx`、`lumen-file-workspace.tsx`，以及共享UI公开 LumenAppShell的props/`workbench.tsx/.css`。共享UI现有dirty不在本审计授权范围，实施前须独立协调所有权。可复用现有semantic sm/md图标；普通内容始终flow，不加坐标补丁。

验收应覆盖：

- en/zh，1440/1280/1279/900/390/320，侧栏开/关，及真正native900×600；模型/权限/发送/Stop与工具入口按已选策略可见可达，不让“肉眼被盖的背景按钮”仍接收Tab。若选择真正modal drawer，modal与背景inert必须配套；若选择单页，不能伪造aria-modal。
- Files、Monitoring、Agents、Goals同一容器都测；原来会话稿、附件、文件dirty/unknown、已打开文件path不丢、不自动保存；Stop和原run审批/核对的安全职责不被整块disabled隐藏。
- keyboard打开时focus落到工具的有效首控件/具名区域；Close返回捕获且仍可见的来源trigger，否则named会话区域；Expand聚焦新workbench；Back/X保持原来源/邻居区别。晚到A关闭/展开结果不能抢B当前focus。
- 可用空间不足必须有明确可点退出/返回；无整页横溢；长路径/中文按钮不遮X。Esc只在明确活动drawer/page且无更高modal/IME交互时生效，不能误关闭modal或丢草稿。
- Settings/Status/palette往返、切会话/切工程、断线、archived retained view、source关闭、32/33tab、mixed bulk-close一并复用既有测试；不能靠等connected或刷新重建消除状态。

聚焦测试建议：新增 `tests/workbench-navigation-presentation.test.tsx` 与独立 `e2e/workbench-navigation-presentation.spec.ts`；复用而不弱化 `file-workbench-tabs.spec.ts`、`file-reading-navigator.spec.ts`、`workspace-tabs-host.spec.ts`、settings-context和session-execution-access。不要编辑当前外部dirty `e2e/web-shell.spec.ts` 来掩盖差异。

### P2 — 工具显隐按会话保留，而非跟着当前导航继承

cc `panelBySession` / `modeBySession` 是真实来源语义，本轮hbar A打开→此前未开工具的B也显示Files已经真实复现。此项影响不同会话/不同工程来回阅读，不是“增加一个tab”可解决。可按稳定sessionId保存有界客户端工具显隐/最近类型，项目pinnedFiles仍独立作用域；不要自动把项目Files归当前Session，亦不要用语言/Host重建runtime清面板。现有surfacecommands可以实现，不缺Host命令，但需要新增typed runtime owner，而不是组件setState镜像domain；应作为P1后另一个独立单元，不能混成一个巨型布局修改。

验收：A/B同/不同workspace，A各自Files文件稿、B从未打开/已开另一工具、A的expandedWorkbench、项目pinnedFiles、settingsBack、archive和source关闭；快速切换与旧响应不得把A的open/mode/path套B。若产品选择保留workspace-global Files行为，应明确该差异，不能宣称已经等同reference session-owned模式。

### P3 — Files内真正多文件预览标签

发布diff画面与 `WorkspacePanel.tsx` / `workspacePanelStore.ts:34-49,81-83` 有每session多文件preview tab、active preview与定向关闭，区别于顶部会话/工作台tab。hbar目前只有一个current document/diff + 32文档草稿缓存，不是同等可见多文件preview标签（`desktop-tabs-host-integration.md` 已明确边界）。现有file.read/git.diff与document owner可复用，仍需新增有界typed preview-tab/active/close/reopen契约；关闭视图不能当discard/save、unknown不得失去核对。它不需新的图片/artifact授权，也不能先加一排假tabs就宣称完成。

验收：普通file与cached/uncached diff身份，重复路径不重开、不同path长label、A→B→A阅读位置、dirty/unknown、Close current/others/left/right、超过容量就近反馈、来源会话被关闭/归档；中英1440/900/320键盘。此项优先于装饰性改名，但应晚于容器可操作性。

Browser、PTY Terminal、Teams、图片artifact预览仍按既有独立安全/能力文档处理；不得用命令目录的名称、automation screenshot或无数据占位页把它们算作迁移完成。当前root的工具结果Copy是另一独立任务，本页不重复或修改它。

## 可复核证据路径与收尾

- [全部观察](../artifacts/workbench-navigation-followup/observations.json)（几何、hit-testing、实际assets、24步focus walk、close/expand/return、SettingsBack和A/B显隐）。
- [原参考900实际flow](../artifacts/workbench-navigation-followup/reference-dock-en-US-900.png)；[原展开](../artifacts/workbench-navigation-followup/reference-expanded-zh-CN-1440.png)。这些无Sidebar/Host/native，不能和完整原生900截图做像素等价声明。
- [hbar900实际覆盖](../artifacts/workbench-navigation-followup/hbar-dock-en-US-900.png)；[320当前Files单视图外观](../artifacts/workbench-navigation-followup/hbar-dock-zh-CN-320.png)；[展开](../artifacts/workbench-navigation-followup/hbar-expanded-zh-CN-320.png)。图表与source表明320外观虽像单页，背景仍可Tab，不能只凭静态图说page交互已完成。
- 真实native旧证据：`D:/Git/hbar/artifacts/session-execution-access/native/hbar-native-session-execution-jIrHA8/`，视口/实际操作边界见上述说明。

本轮只有这份新文档是tracked新增；其余fixture/日志/截图位于ignored目录。未改产品或既有docs/index、未为此只读单元运行全仓check/新的native。临时Host和隔离browser contexts结束时释放、临时workspace删除；本次reference/preview服务已停止，45051/45053/45055无监听。不占45045/45047/9443，不触碰受阻旧原生进程或用户实例。主线复核文档、观察JSON与截图后按独立审计单元提交；不把建议当作修复交付。
