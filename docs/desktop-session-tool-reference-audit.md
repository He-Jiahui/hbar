# 会话工具可见性归属：cc-haha 原组件复核

日期：2026-09-26。只读参考审计，不是 hbar P2 已实现声明。参考版本 `e28d0a653481ef41b7a329411eeb2f0fd5656731`；hbar 起始版本 `090fc0e`。两仓现存其它 dirty 均保留，本文与独立 ignored fixture 之外未编辑产品；未 stage/commit。

## 结论

参考的 **面板开关、Files/Browser 模式、文件预览属于 sessionId，不属于 workspace**。同一工作区的 A、B 也各自记住开关/模式：A 打开 Files，切 B 不会继承；B 打开 Browser，切 A 仍是 Files。

“记住”的生命周期必须分开：

- **切到别的页签再回来**：同一 renderer 内保留该 session 的工具开关和 mode。
- **关闭工具再开**：普通 `closePanel` 只将 `isOpen=false`，不清 mode/preview；但真实 TabBar 的文件夹入口是明确的 Files 动作，重开会强制 `mode='workspace'`，不是泛化的“恢复最后工具”。
- **从真实 TabBar X 关闭会话再重开**：`clearSession` 清 workspace 开关、mode、tree、preview、origin；重开是 closed/default Files。不能只调用 `tabStore.closeTab` 来推导真实 UI 关闭语义。
- **renderer reload**：会话页签恢复，但工具 open/mode/preview 不恢复；detached Workbench 不持久化，若来源页签仍有效则恢复来源。已直接执行原 `saveTabs/restoreTabs` 并真实 reload 验证。**没有运行完整 Electron 退出/重启**，不把 renderer 证据冒充原生进程重启验收。

hbar 本 P2 最小应迁移“切换会话不会继承另一会话工具，返回原会话恢复其视图归属”，而不是复制参考 900/320 的裁切、非持久缓存或删除策略。Browser、terminal 与 hbar Monitoring/Agents/Goals 不是一对一能力对应，不能用占位按钮声明等价。

## 证据层级与 fixture 边界

1. **静态发布画面**：已查看 [中文 workspace-changes.webp](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/docs/images/app/zh-CN/workspace-changes.webp)。它证明页签右端文件夹入口、dock 顶部 Files/Browser 分段及右上 Expand/X；单张画面不证明 A/B、关闭或重启行为。
2. **当前源码和历史**：实际读取 `workspacePanelStore`、`browserPanelStore`、`tabStore`、`TabBar`、`ActiveSession`、`WorkbenchPanel/Tab` 与相关 tests。`1d9f4c9c` 引入 per-session unified mode，`6c6d3c51` 加入 source/Back 与 detached 持久化 fallback；`bb74c924` 收紧空占位会话关闭时的自动删除前提，不能将“关闭页签”泛化为删除普通会话。
3. **本轮渲染**：直接挂载未修改的原 `TabBar + ActiveSession + WorkbenchTab`，原 `WorkbenchPanel/WorkspacePanel/BrowserSurface` 经真实生产组件树到达。不是复制私有组件片段。原主题 `globals.css`、Tailwind source 及自托管字体正常加载；observations 的 body font 为 Inter 系列，Inter/Noto Serif 检查成功。标题 serif 来自原主题，不是漏载 CSS 后的 Times 默认值。
4. **隔离部分**：A/B/C 是 typed synthetic SessionListItem；A/B 共 `project-one`，C 为 `project-two`。消息为人工内容；替换 chat connect/disconnect I/O，workspace/session-list 只读响应由 loopback fixture 返回，其余 API、WebSocket 和外部请求拒绝。没有原 Host、Sidebar 完整 App、provider、Run 或原生 WebContentsView。
5. **桌面 guard**：fixture 用原 `browserHost` 能力全 false，只把 typed host 的 `isDesktop` 设 true，以走原 ActiveSession desktop 分支；这是 renderer guard fixture，不是 Electron 原生截图。Browser 地址条/选择状态是真实原组件，但页面区没有实际 native webpage，空白不代表已加载网页。
6. **H5 对照**：另以原 browserHost 和真实 mobile guard 渲染 320；已证明 store open=true 时 dock 不挂载。直接 store 打开的 detached Workbench 仅用于查看原组件窄屏，不是证明 H5 有可见 Expand 入口。

入口文件：[reference-app.tsx](../artifacts/session-tool-ownership/reference/reference-app.tsx)、[typed fixture-data.ts](../artifacts/session-tool-ownership/reference/fixture-data.ts)、[verify.ts](../artifacts/session-tool-ownership/verify.ts)、[observations.json](../artifacts/session-tool-ownership/evidence/observations.json)。端口仅 `45081`，不启动原生应用、不触碰受保护 PID 9572/48668。

## 逐转换结果

| 转换/入口                                   | 已验证的原行为                                                                                                                                        | 权威源码与证据                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Files → B，同 workspace                   | B 默认不挂 dock；A 的 open/mode 不被改写                                                                                                              | [workspacePanelStore.ts](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts) 73–86、242–265；[ActiveSession.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/pages/ActiveSession.tsx) 367–373；[B closed](../artifacts/session-tool-ownership/evidence/b-closed-same-workspace-zh-CN-1440.png) |
| B Browser → C，不同 workspace               | C 仍 closed；workspace 相同与否不参与工具归属 key                                                                                                     | 同上；[C closed](../artifacts/session-tool-ownership/evidence/c-closed-other-workspace-en-US-900.png)                                                                                                                                                                             |
| 返回 A/B                                    | A 仍 Files/open，B 仍 Browser/open；两者共享全局 width，但不共享 open/mode                                                                            | store 74–75、250、294；[A return](../artifacts/session-tool-ownership/evidence/a-return-files-zh-CN-1440.png)、[B Browser](../artifacts/session-tool-ownership/evidence/b-browser-en-US-900.png)                                                                                  |
| dock 内 Files ↔ Browser                     | 单一 tablist，`aria-selected`；只改当前 session mode。进 Browser 调 `ensureBlank(sessionId)`，保其已有浏览历史                                        | [WorkbenchPanel.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workbench/WorkbenchPanel.tsx) 34–47、93–118；[browserPanelStore.ts](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/browserPanelStore.ts) 81–86                                                                                        |
| 工具 X → 原 store openPanel                 | X 只关当前 session open；原 openPanel 保上次 Browser 和 preview                                                                                       | workspace store 258–290；[store reopen Browser](../artifacts/session-tool-ownership/evidence/b-store-reopen-browser-zh-CN-1440.png)。这是特意调用原 store 的行为证据，不虚构泛化重开 UI                                                                                           |
| 工具 X → TabBar 文件夹                      | 该按钮强制 Files，然后 open；已开 Files 时再点才关闭                                                                                                  | [TabBar.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/layout/TabBar.tsx) 135–141、637–656；[toolbar reopen Files](../artifacts/session-tool-ownership/evidence/b-toolbar-reopen-files-en-US-1440.png)                                                                                 |
| 消息文件引用打开预览                        | 原 openPreview 先 openPanel 并强制 Files；preview、origin 都绑定 session                                                                              | workspace store 486–507；本轮用原 action 加载 mocked 文件以验证 Expand 保持同一 preview ID，不伪称点过真实消息引用                                                                                                                                                                |
| Expand                                      | `__workbench__${sessionId}` 唯一 tab，captured sourceSession/turn/element；激活 detached tab，再 close dock。仍读同一 session preview，非另建文件副本 | WorkbenchPanel 49–55；[tabStore.ts](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/tabStore.ts) 206–233；[B expanded](../artifacts/session-tool-ownership/evidence/b-expanded-zh-CN-1440.png)                                                                                                   |
| Back，来源仍开                              | 先激活来源，再关闭 Workbench；dock 仍 closed，不自动 redock；preview/origin 保留                                                                      | WorkbenchPanel 66–73；tabStore 236–243；[Back closed](../artifacts/session-tool-ownership/evidence/b-back-closed-en-US-1440.png)                                                                                                                                                  |
| Workbench 自身 X                            | 组件的 onClose 只调 closeTab(tabId)，不调用来源 clearSession/停止 Run；按 tabStore 邻居规则选页签                                                     | [WorkbenchTab.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workbench/WorkbenchTab.tsx) 12–28；tabStore 357–387。此项为源码核对，本轮截图链使用 Back，没有新增“X 已点击”声明                                                                                                          |
| 真实 TabBar X 关闭 session → 重开           | `clearSession` 后 source workspace open/mode/preview/origin 回默认；fixture 重开按钮只调用原 openTab                                                  | TabBar 339–345、357–386；workspace store 816–845；[tab close/reopen](../artifacts/session-tool-ownership/evidence/b-tab-close-reopen-zh-CN-1440.png)                                                                                                                              |
| 来源 session X，但 Workbench 仍开           | detached 不级联关闭；source workspace cache 被清理，mode 回 Files，原 preview 消失。Back 不重建 source，关闭 detached 后选仍存在的邻居 C              | 同上；[source closed / Workbench retained](../artifacts/session-tool-ownership/evidence/source-tab-closed-workbench-retained-zh-CN-1440.png)、[Back neighbor](../artifacts/session-tool-ownership/evidence/source-tab-closed-back-neighbor-zh-CN-1440.png)                        |
| detached 激活时 reload                      | saveTabs 排除 Workbench，active 回 source；restore 请求 list limit 200；新 workspace/browser store 无持久值，open=false、mode=workspace、preview=[]   | tabStore 424–480；[reload source closed](../artifacts/session-tool-ownership/evidence/reload-detached-source-closed-zh-CN-1440.png)                                                                                                                                               |
| reload 时 source 在只读 session list 中缺失 | 原 restore 过滤该 session；不复活旧来源/Workbench，回首个合法 session A                                                                               | tabStore 484–529；[missing-source fallback](../artifacts/session-tool-ownership/evidence/reload-missing-source-fallback-en-US-1440.png)。这是 mocked missing-record，不是实际删除或归档执行                                                                                       |

两个不能掩盖的细节：

- `tabStore.closeTab` 自身不清 workspace。上述会话重开清理结论来自真实 `TabBar.closeTabWithCleanup`，不是低层 store 函数。Sidebar delete 是另一条链：[Sidebar.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/layout/Sidebar.tsx) 768–773 在 delete ACK 后 disconnect+closeTab，不能套用相同 cleanup 假设。
- `TabBar` 清 workspace/terminal/activity，但未清 `browserPanelStore.bySession`。本轮 source close snapshot 中 browser state 仍存在，只是 workspace mode 回默认。不能宣称“会话 X 会清掉所有工具数据”，也不建议将这种残留照搬到 hbar。

## 归档、关闭与重启不得混淆

普通会话 [SessionListItem](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/types/session.ts) 21–36 没有 archived 字段；[sessionsApi](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/api/sessions.ts) 412 的路径是 DELETE。[sessionStore](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/sessionStore.ts) 178–187 等待删除后移除 session。源码另有 Agent Teams 历史归档和未使用的 `sidebar.archiveAllChats` 译文，但不能据其单词推出普通会话与 hbar `session.archive` 同义。

因此本轮不生成假的“参考 archive”截图，不调用真实删除服务。hbar 的外部归档保留历史/草稿、只读与 Run receipt 恢复属于现有 hbar 合同，P2 不能借参考 tab cleanup 擅自清数据或取消来源 Run。

关于重启：原 workspacePanelStore/browserPanelStore 没有 persist/localStorage seam，默认字典为空；tabStore 明确只保存可恢复页签。真实 renderer reload 与这些源码事实一致；**完整 Electron 进程 restart、原 Host 重连、磁盘真实文件丢失没有实测**。若产品要求重启保留工具 mode，需要 hbar 明确新的布局偏好合同，不能说是本参考已证实的行为。

## 布局、样式与窄屏

原组件顶部顺序为 TabBar → 当前会话 metadata → 消息/composer；dock 在消息/composer 右侧，顶部 Files/Browser 分段，Expand/X 在同一 normal flex row 尾端。静态公开图包含 Sidebar；本 fixture 不含 Sidebar，其上方另有明确标注的 fixture 控制区，不用于推导原 App 标题高度。

原主题已加载并检查字体；本轮视觉证据没有修改原字号、边框、图标或宽度以让截图看起来正确。工具模式图标与短标签并列，来源与操作位置清楚；不把原数值图标尺寸直接转成 hbar 新尺寸层级。

| 宽度              | 当前原 desktop renderer guard 测量                                   | 证据/迁移提醒                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440              | dock x=580、width=860、right=1440                                    | [中文 Files](../artifacts/session-tool-ownership/evidence/a-files-zh-CN-1440.png)。无需展开就能扫到两种工具模式                                                       |
| 900               | dock x=401、width=558、right=959，右侧动作部分被裁                   | [英文 Browser](../artifacts/session-tool-ownership/evidence/b-browser-en-US-900.png)。原 compact chat `min-width:400px` 与 panel max62% 一起超出可用宽度              |
| 320 desktop guard | dock 仍挂，x=401、width≈198.39、right≈599.39，整个工具在可见区域之外 | [中文 320](../artifacts/session-tool-ownership/evidence/a-files-zh-CN-320.png)。脚本用真实 focus+Enter 核动作，不把这些离屏按钮算作鼠标可用                           |
| 320 H5 guard      | store open=true，但 ActiveSession 不挂 dock                          | [H5 closed dock](../artifacts/session-tool-ownership/evidence/h5-320-store-open-dock-hidden-zh-CN.png)。源码 `useMobileViewport && !isDesktopRuntime`，不是状态被清理 |
| 320 detached      | 原 Workbench 可挂，但文件 navigator 挤压 preview、模式标签折成多行   | [原 expanded 320](../artifacts/session-tool-ownership/evidence/b-expanded-zh-CN-320.png)。不能将其作为 hbar 窄屏可读性目标                                            |

具体布局源：[ActiveSession.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/pages/ActiveSession.tsx) 316、367–380、759–770；[SessionChatSurface.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/chat/SessionChatSurface.tsx) 109–113。`scrollWidth<=viewport` 并不足以证明没有内容裁切：上表通过元素 rect 直接发现离屏 dock。

## hbar P2 最小闭环建议（尚未由本文实现）

只存有界 UI 归属引用，不复制 Files document draft、Goal、Agent、Run 或 Host session：

1. **工具打开意图的 owner 必须是精确 session**。A/B 即便同 workspace 也独立；无 session 的 workspace-scoped 工具保持单独 scope，不把 null 值强行归到任一活跃 session。
2. **选择会话只派生当前可见工具**，不把 A 的 followActive Files 打开状态改写成 B，也不在切回时通过重新打开服务清掉 A 的 draft/instance。原 session 目标与 panel instance 必须都可核对。
3. **显式工具 X 与会话页签 X 分离**。产品已存在的草稿/归档保护优先；参考只证明其 UI 缓存会清，未授权 hbar 删除文件稿、取消 Run 或抹 unknown receipt。
4. **Expanded Workbench 是 pinned 的独立视图**：保原 instance/source，切 A/B 不 retarget；Back/X 不取消来源 Run。来源已关/归档时按 hbar 既有安全回退，不能用参考纯 tab-ID 存在性代替 Host 身份验证。
5. **持久化只按已有显式合同**。若本单元保持 ephemeral visibility，则 reload 不自动恢复工具；文案与文档必须讲明。若增加跨 restart 记忆，需版本化、有界、Host-scoped 校验并独立验收，不能顺带假定原参考这样做。

建议验收矩阵：A Files→B closed（同 workspace）→B Goals/Agents→A Files；A/B 不同 workspace；Tools X→再开；A pending read→B→晚到只更新 A；same-id 新 instance 不受旧 close 影响；关闭页签/外部 archive 不删 draft/不取消 Run；expanded A pinned→切 B→Back；source 缺失/归档；reload 的明确策略；1440/900/320 中英保持当前 hbar adaptive split/page 及键盘可达。Browser 本身不在此 hbar 单元能力范围。

## 本轮执行结果与复现

本轮自动化实际通过：6 条 desktop renderer 全路径（en/zh × 1440/900/320）+2 条 H5 guard 对照；最终 `errors:[]`，84 张 PNG；source missing 在两种语言 1440 的只读 session-list 变体额外核对。每次 snapshot 用原 store action 后再等实际 React 选中状态及有限 CSS 动画完成，避免把 store 已更新但旧视觉过渡帧当证据。

复现命令（从 hbar 根目录，两终端）：

```powershell
node node_modules/vite/bin/vite.js --config artifacts/session-tool-ownership/vite.config.ts
bun artifacts/session-tool-ownership/verify.ts
```

地址：`http://127.0.0.1:45081/?locale=zh-CN&runtime=desktop`；H5 参数为 `runtime=h5`。新 context 使用自身 localStorage，读响应只在脚本路由范围内模拟。fixture 的 reopen 按钮明确标成测试入口；它不是参考 Sidebar。

本文不是产品改动，因此未跑 hbar 全仓 check、未构建原 Electron、未做原 Host/paid provider 测试。执行了新文档/fixture 格式检查、fixture flow guard、真实 Edge 渲染与状态断言、代表图人工查看；产品修复与当前 hbar baseline 由主线/另 agent 验证。忽略目录脚本未加入生产 lint 或根测试范围。
