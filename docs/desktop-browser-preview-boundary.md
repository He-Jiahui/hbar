# 会话内置浏览器的迁移边界

本审查记录 2026-09-25 的只读代码和视觉证据，供下一独立子功能确定契约；它**不是已实现能力的说明**。证据等级：`画面` 指 cc-haha 已发布截图可见，`源码` 指相应仓库实现，`推断/建议` 指 hbar 迁移设计，尚须真机验证。

## 参考体验与当前能力

| 证据                                                                                                                                                                                                     | 可确认的行为与边界                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 画面：[workspace-preview.webp](../../cc-haha/docs/images/app/zh-CN/workspace-preview.webp)                                                                                                               | 同一会话右侧工作台有 Files/Browser 切换，Browser 工具栏有后退、前进、刷新、地址、截图、元素选择；页面真实渲染，底部有缩放。截图不足以证明任意 URL、权限或下载均可用。                                                  |
| 源码：cc-haha `desktop/src/components/workbench/WorkbenchPanel.tsx:20-147`、`WorkbenchTab.tsx:13-29`、`desktop/src/stores/browserPanelStore.ts`                                                          | Browser 与 Files 共用会话工作台；展开为带 `sourceSessionId` 的工作台标签，返回原会话；URL、历史、缩放和选择状态按会话保存。                                                                                            |
| 源码：cc-haha `desktop/src/components/browser/BrowserSurface.tsx:77-179,215-294,302-489`、`BrowserAddressBar.tsx:22-86`                                                                                  | 桌面桥创建/导航/调整原生视图边界、覆盖弹窗时隐藏、卸载关闭；选取草稿有撤销、清空、发送与导航前确认；地址输入有导航工具，截图与缩放是独立动作。                                                                         |
| 源码：cc-haha `desktop/electron/main.ts:289-308,659-669`、`services/preview.ts:155-244,266-400`、`services/previewSession.ts:18-107`、`services/navigationGuards.ts:74-88`、`ipc/previewMessage.ts:1-95` | 一个随当前页面切换的原生 Electron `WebContentsView`；随机非持久 partition、沙盒、禁 Node、权限请求拒绝，弹窗和非 HTTP(S) 导航拒绝；截图尺寸与页面消息有界，并只转发当前预览内容的消息。平台专属，并非普通 DOM iframe。 |
| 源码：cc-haha `desktop/src/lib/desktopHost/browserHost.ts:16,280-300`                                                                                                                                    | 网页宿主报告 `previewWebview:false`，预览桥不可用；参考截图代表 Electron 桌面能力，不代表其 H5 版有同等预览。                                                                                                          |
| 源码：hbar `apps/desktop/src-tauri/src/main.rs:35-46,223-254`、`apps/desktop/src-tauri/capabilities/main.json:5-17`                                                                                      | 目前只有加载 Host 回环地址的 `main` WebView，主视图顶层导航限制在 Host 同一 origin；取连接凭据的自定义命令还核查 `main` label/origin。尚无独立不可信页面的子 WebView/隔离 profile。                                    |
| 源码：hbar `packages/app-runtime/src/workspace-tabs-runtime.ts:52-94,245-267`、`apps/web/src/App.tsx:279-326,446-492`、`packages/app-react/src/lumen-file-workspace.tsx:65-205`                          | 已有会话所属的临时工作台标签、返回原会话和 Files dock。文件工作区的 `browser` 视图只是文件列表，不是网页浏览器。适合复用**容器归属与返回语义**，不可误用文件 browser 视图。                                            |

## 不可复用为内嵌浏览器的现有自动化

hbar 的公开 `browser.status/navigate/snapshot/click/type/press/screenshot/evaluate/close/history` 是 Host 命令（`packages/contracts/src/commands/browser.ts:20-124`），后端插件另起 Playwright Chromium（默认 headless）或使用只会抓取文本的 fetch 回退（`plugins/browser-use/src/index.ts:16-34,156-190,212-219`；`playwright-backend.ts:21-56,102-149`）。它不共享 Tauri WebView 的页面、cookie、焦点、历史或像素；其 `pageId/contextId` 不是内嵌视图 ID。可以继续作为 Agent 的自动化工具，却不能拿自动化截图冒充用户正在看的预览页面。

尤其不可把现有 origin 配置直接当成新视图的导航安全策略：`plugins/browser-use/src/index.ts:329-370` 对 `deny` 抛错，但 `ask` 仅返回 `requirement`；直接 `navigate` 没在这里发起用户授权，重定向后的最终 origin 是 backend 已访问后才检查。这是所引代码路径的事实；是否另有 Agent 工具审批不改变桌面新视图必须独立守门的要求。

## 最小公开契约（推断/建议，未实现）

第一阶段先限桌面平台建立一个 `PreviewPort`，不把 Host 的 `browser.*` 对象泄漏给 UI：

- 输入拥有 `sourceSessionId`、一次性 `viewInstanceId/generation`、仅 HTTP(S) 的规范化 URL；动作 `open/navigate/back/forward/reload/setBounds/setVisible/close`，输出 `availability`, `committedUrl`, `title`, `loading`, `canGoBack/Forward`, `error`。异步事件必须含实例/代次，切换会话或关闭后的旧响应不可重入。URL 的凭据部分禁用，回环也必须按策略明确允许；重定向和新窗口逐次判断，不允许以初始 URL 放行为由追踪到任意 origin。
- Tauri 原生侧创建**不同 label 的 child WebView**和独立私有数据环境；不授予 Host `main` 的 Tauri capability、自定义 invoke、Host Bearer token 或文件系统桥。默认拒绝权限、弹窗、下载与非 HTTP(S) scheme，提供明确外部浏览器动作；无预览能力的平台返回 typed unavailable。仅应用层能下发导航，不可信页面消息绝不可执行 Host 命令。下载如将来支持，需要独立确认目的地/文件名/大小与取消和完成状态。
- 工作台仅持有当前会话的预览 state：dock/展开/返回原会话、关闭、切 tab、窗口 resize、缩放和 DOM 弹窗覆盖都要同步原生视图的 bounds/visibility；不要把内嵌 WebView当成可随意 CSS `z-index` 覆盖的 DOM 子树。销毁/关闭和窗口退出取消旧命令，避免后台页面继续发声或占权限。
- 本地 workspace HTML **不是** `file:` 白名单或主页面 Host 认证 token：若需要，与预览分独立子功能设计 Host 的只读、按 workspace/session 限定、短时授权、路径 canonicalize/防遍历/符号链接、正确 MIME/CSP 的资源服务。现有 `apps/host/src/server.ts:1019-1070` 只有 API/应用静态路由，不构成这种预览契约；勿把 `/api` token 注入不可信网页。
- 截图与元素选择留在后续契约：只从当前 native view、经明确用户操作获取，限制像素和 payload 大小；发送到 composer 前展示来源/确认，取消与导航清空；选择桥只接受当前 view 的有版本、限长、已验证事件，不允许网页伪造跨会话截图或文件附件。

平台可行性仍需验证：[Tauri WebviewBuilder 官方 API](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewBuilder.html) 的 `Window.add_child` 目前标注 desktop-only 与 `unstable` feature；`on_navigation`、`on_new_window`、`on_download` 可用于拦截，`incognito` 在旧 WebView2 运行时可能无效。官方还警告 Windows 中在同步 command/event handler 创建子 WebView 可能死锁，需异步/独立线程安排。这说明不能只加 React 组件，还需 Rust 平台子功能、平台兼容测试和不依赖 incognito 单一选项的隔离/清理策略。[Tauri capabilities 官方说明](https://v2.tauri.app/security/capabilities/) 指出多 capability 的权限会合并，注册的自定义 invoke 命令默认可用于所有 WebView；因此必须显式审计新 label/origin 的能力和原生命令调用来源，不能只看当前 `windows:["main"]`。上述是官方 API 文档支持的设计风险，不是已验证的 hbar 运行结果。

## 分阶段验收门槛

1. **下一独立子功能：安全原生预览纵切。** Windows 真机以固定受控 HTTP fixture 在当前会话 Files/Browser 容器打开真实页面；同屏导航、返回 Files/原会话、后退/刷新、resize/窄屏、覆盖弹窗、切 tab/关闭后的视图销毁可测试。外域/非 HTTP(S)/弹窗/权限/下载默认拒绝，Host 命令/凭据从预览页不可达；网页宿主明确不可用。失败状态与重试不制造第二个后台 view。该阶段**不称**已支持本地文件、截图或元素选择。
2. **本地预览与地址策略。** 独立 scoped read-only Host 资源租约，目录范围与过期测试、重定向/回环/外部 origin/页面子资源策略及没有 Bearer 泄漏的真实 Host 测试；地址栏和历史只据 native committed URL 更新，不以用户输入冒充已加载。
3. **截图与元素选择。** 真实 native 页面的视口/全页能力、尺寸/内存上限、元素定位/页面变更后失效、选择草稿发送/撤销、跨会话隔离和用户确认，以中英及 320/1440 宽度、键盘操作和真实桌面 smoke 验收。若某平台无法提供，则保留明确 unavailable，不用 browser-use 的独立 Chromium 截图兜底。

以上阶段需要各自通过适用的单元/Host/桌面真实测试后分别提交，且不得把尚未存在的能力写进 UI 文案或测试假设。

## 已完成的权限前提，尚非 Browser 预览

`5c0e58e` 把 `apps/desktop/src-tauri/capabilities/main.json` 从 `windows:["main"]` 收窄为 `webviews:["main"]`，保留原有主视图权限与回环来源配置。锁定版本 Tauri 的窗口级 capability 会覆盖窗口内所有 child WebView；不同 label 自身不足以隔离，这是先行修改的原因。静态测试防止未来再次授予整窗权限；Windows MSVC check/build 通过，隔离原生 smoke 验证现有主视图的 `connection_info`、窗口可见性命令与认证 Host 查询仍可使用。

该提交**没有创建 child WebView**。隔离探针虽已编译确认 Tauri/WebView2 的 child、权限/资源请求回调和实际 profile 路径读取 API 可用，仍没有运行时证明未来预览页不能调用 Tauri 命令、不能共享主视图的实际 UserDataFolder、不能访问 Host 回环子资源。WebView2 环境变量可能覆盖传入的 profile 路径；`on_navigation` 只覆盖主帧，不覆盖 iframe、图片和 fetch。上述运行时拒绝测试与先安装守门、再从 `about:blank` 导航的顺序仍是第一阶段的阻断门槛，不能把已完成的 ACL 前提写成 Browser 功能已上线。
