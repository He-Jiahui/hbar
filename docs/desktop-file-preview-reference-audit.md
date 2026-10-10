# Desktop 多文件预览入口：原组件证据审计

日期：2026-09-26。参考仓库 `D:/Git/cc-haha`，HEAD `e28d0a653481ef41b7a329411eeb2f0fd5656731`；开始时 hbar HEAD `cdf2b49`。本单元只新增本审计和忽略目录中的夹具/证据，不实现 hbar 产品、不修改参考源码、不暂存或提交；两仓已有未提交文件均保留。

## 结论与证据边界

值得迁移的是**会话拥有的多个文件预览、单项时省略标签条、逐项关闭、就近批量关闭、返回来源**，不是照搬原实现全部行为。原参考只有 `file`、`diff` 两种身份；`diff` 是 `git diff HEAD`，并非分别比较工作区/暂存区。因此 hbar 已有 document/worktree/staged 的身份必须保持不同。原多标签没有看到数量硬上限、Arrow/Home/End roving、Delete、中键关闭、拖动排序、文件重命名入口；不能以参考为由声称这些能力已有。

本次运行原 `ActiveSession → WorkbenchPanel → WorkspacePanel` 和 `TabBar/WorkbenchTab`、原 Zustand stores、原全局主题与字体。没有复制私有预览 DOM 或增加参考 exports。人工 typed sessions/GET 响应、屏蔽 WebSocket 和非 loopback 请求；仅用浏览器 Host 的不可用能力加 `isDesktop` renderer guard，不是原 Electron、原服务端或完整 App。没有 provider、Run、真实文件读取/写入。

- [夹具入口](../artifacts/file-preview-tabs/reference/fixture/reference-app.tsx)、[typed API 样本](../artifacts/file-preview-tabs/reference/fixture/api-data.ts)、[完整验证脚本](../artifacts/file-preview-tabs/reference/verify.ts)。
- [最终 observations](../artifacts/file-preview-tabs/reference/evidence/observations.json)：中英 × 1440/900/320，共 6 个原组件场景、84 PNG、`errors=[]`；记录请求、store 身份、几何和字体。
- 原公开 [workspace-diff.webp](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/docs/images/app/en/workspace-diff.webp) 可以证明展开工作台、单个 diff、右侧 Changed navigator；它没有证明多标签。名为 [workspace-preview.webp](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/docs/images/app/zh-CN/workspace-preview.webp) 的图片实际是 Browser 网页预览，不能当文件标签条证据。多文件标签行与关闭菜单由本轮原组件实际渲染证明。
- Inter 字体已加载，原 `globals.css` 保留，非默认 Times。人工 notice/reopen 行明确标记夹具，未把其作为产品导航。

## 入口 / 目标 / 反馈矩阵

下表“实测”仅指本隔离原组件；“源码”不冒充已跑真实业务流程。

| 入口与位置                               | 目标及动作                                                                                                        | 呈现、关闭与失败语义                                                                                               | 证据                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 消息正文的 `src/main.ts:2`               | 原 `AssistantMessage` 的自动文件链接 → `openPreviewLink` → 当前 session 的 `file:src/main.ts`，附 line reveal     | 自动打开 Files 并定位；同文件再次打开不清已有 reveal；不是生成新会话                                               | 实测 [message-file-dock-en-US-1440](../artifacts/file-preview-tabs/reference/evidence/message-file-dock-en-US-1440.png)；[AssistantMessage:52](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/chat/AssistantMessage.tsx#L52)、[openPreviewLink:19](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/lib/openPreviewLink.ts#L19)                                |
| 文件 navigator 标题的 Changed / All 菜单 | 只切该 session 列表类型；All 目录/文件行打开 `file`                                                               | 原未展开 dock 中打开预览会收列表；Workbench 的 `forceVisible` 默认保留右侧列表                                     | 实测 [three-tabs-tree-en-US-1440](../artifacts/file-preview-tabs/reference/evidence/three-tabs-tree-en-US-1440.png)；[WorkspacePanel:1474](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1474)、[2082](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L2082)                          |
| Changed 文件行                           | 同 session/path 的 `diff`；正文与 diff 两个 tab 可以同时存在                                                      | 行右侧 +/−/状态；rename 是事实状态和 oldPath，不是重命名动作                                                       | 实测 [same-path-file-diff-en-US-1440](../artifacts/file-preview-tabs/reference/evidence/same-path-file-diff-en-US-1440.png)、[zh-CN-320](../artifacts/file-preview-tabs/reference/evidence/same-path-file-diff-zh-CN-320.png)；[WorkspacePanel:1644](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1644) |
| 消息的 CurrentTurnChangeCard 文件行      | 相对 workdir 路径 → `diff`，携带 sourceTurnKey/sourceElementId；工作区外路径 → file/browser，不能假定有 diff 基线 | 本轮只源码核对，未伪造已运行 checkpoint 截图；跳出原位与返回定位另有原 MessageList 管理                            | [CurrentTurnChangeCard:71](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/chat/CurrentTurnChangeCard.tsx#L71)、[MessageList:3390](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/chat/MessageList.tsx#L3390)                                                                                                                                      |
| 两个及以上预览的横向 tablist             | tab 主按钮重新调用 `openPreview(session,path,kind)`，不只是纯 setActive                                           | 活跃下划线、file badge/diff icon、basename 截断；同名正文/差异主要靠图标区分。现无 `setActivePreview` action       | 实测 [three-tabs-tree-zh-CN-900](../artifacts/file-preview-tabs/reference/evidence/three-tabs-tree-zh-CN-900.png)；[WorkspacePanel:1934](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1934)                                                                                                             |
| 标签右侧 X；单项时 preview header 的 X   | 单项 close；只关闭预览 UI，不写文件、不删除 session                                                               | 背景关闭保持当前；当前中间项关闭选右邻；尾项关闭选左邻；只剩一个时 tablist 消失，X 留 header                       | 实测 [single-tab-header-close-zh-CN-900](../artifacts/file-preview-tabs/reference/evidence/single-tab-header-close-zh-CN-900.png)；[WorkspacePanel:1844](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1844)、[store:774](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L774)                  |
| 任一标签右键                             | Close / Others / Left / Right / All，对被右键项捕获 ID                                                            | 菜单以指针位置固定 overlay；关闭背景范围可保持既有 active，若 active 被移除按存活目标/邻居落点；五项均实际调用验证 | 实测 [tab-context-menu-en-US-900](../artifacts/file-preview-tabs/reference/evidence/tab-context-menu-en-US-900.png)；[WorkspacePanel:1568](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1568)、[1997](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1997)                          |
| 关闭最后一个预览                         | 清 activePreview，previewTabs 为空                                                                                | panel 仍存在；无专门 Back-to-listing 按钮；自然显示当前 Changed/All 列表，不关闭整个 Files                         | 实测 [last-close-listing-zh-CN-320](../artifacts/file-preview-tabs/reference/evidence/last-close-listing-zh-CN-320.png)；[WorkspacePanel:1318](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1318)、[2065](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L2065)                      |
| preview header 的显示/隐藏 navigator     | 仅局部正常流/overlay 列表的可见性，预览 tabs 不丢                                                                 | 展开态右侧列固定 280px；隐藏后正文恢复全宽。打开 navigator 后 filter 接焦点                                        | 实测 [preview-navigator-hidden-zh-CN-320](../artifacts/file-preview-tabs/reference/evidence/preview-navigator-hidden-zh-CN-320.png)；[WorkspacePanel:1829](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1829)                                                                                           |
| preview header 的 Refresh / tab 激活     | 当前 exact path+kind 重新 GET，同时状态/All 树刷新                                                                | 已成功正文在读取中不清空；失败保旧内容 + 就近 alert/Retry；不是将旧内容说成最新成功。初始失败直接错误内容          | 实测 [refresh-failure-retains-content-zh-CN-900](../artifacts/file-preview-tabs/reference/evidence/refresh-failure-retains-content-zh-CN-900.png)；[store:637](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L637)、[WorkspacePanel:1874](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1874)  |
| Add to chat / 文本选择评论               | 用同 session/path 附上路径、代码选择或 diff side+hunk；不写磁盘                                                   | 路径按钮桌面文字+图标，小宽度只显示图标且保留 aria-label；本轮未实测发送或评论提交                                 | [WorkspacePanel:1511](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1511)、[1811](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspacePanel.tsx#L1811)                                                                                                                                               |

## 身份、容量、过期读取

原 [workspacePanelStore:14](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L14) 的 `WorkspacePreviewKind = 'file' | 'diff'`；[161](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L161) 直接按 `${kind}:${path}` 得 tabId，再以 session+tabId 管请求。路径名不规范化/大小写折叠不是此函数保证。顺序是首次打开时 append；重复同 id 保留位置、更新 active、重读；同一 basename 不代表同一路径。

- 没有预览条数硬上限或淘汰策略；本轮只实测 18 个，不宣称无限资源安全。全部映射到 DOM，不是虚拟列表。
- 原 [API:475](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/api/sessions.ts#L475) 没有 staged 参数；[workspaceService:1587](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/src/server/services/workspaceService.ts#L1587) 是 `git diff --no-ext-diff --binary --find-renames --find-copies HEAD -- path`；普通 tracked diff 汇总 HEAD 到当前工作树，不能与 hbar 的 worktree/staged 任一个同义替代。无 Git/无当前变化可回读原 stored diff，另有 untracked 生成差异分支（551–669）。这些是源码证据，本夹具没有运行 Git。
- 内容预算不等于 tab 容量：Host [workspaceService:16](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/src/server/services/workspaceService.ts#L16) 文本 preview 1MiB、untracked stat 256KiB、Git buffer 2,000,000 字节；[WorkspaceDiffSurface:32](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workspace/WorkspaceDiffSurface.tsx#L32) 有 2,000 行默认预览预算。未以本次少量内容证明极限文件表现。
- 每次读取带本地 request generation；关闭会使旧 request 失效，晚回复不重建关闭 tab；重开相同 ID 也不会被旧读覆盖。[store:505](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L505)、[588](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L588)、[767](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L767)；原 store tests 的关闭/重开/clearSession 回归在 [720](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.test.ts#L720)。本轮没运行原单元全套，只核代码与已存在测试。

## 宽窄、滚动与键盘的实际边界

| 当前容器                                  |        1440 |        900 |          320 | 结论                                                                                |
| ----------------------------------------- | ----------: | ---------: | -----------: | ----------------------------------------------------------------------------------- |
| ActiveSession dock 起点 / 宽度            |   580 / 860 |  401 / 558 | 401 / 198.39 | 900 右缘为 959，320 dock 在视口外；原 renderer guard 下的实际裁切，不做 CSS 修饰    |
| Workbench preview + navigator             |  1160 + 280 |  620 + 280 |     40 + 280 | 固定右侧 navigator 使 320 正文/工具头只剩 40；这不是 hbar 应复制的可用性标准        |
| 隐藏 navigator 后 preview                 |        1440 |        900 |          320 | 用原按钮可恢复内容空间；本轮窄屏是对离屏按钮 focus+Enter，不声称鼠标入口都可见      |
| 18 tabs 的 tablist viewport / scrollWidth | 1416 / 3615 | 876 / 3615 |   296 / 3615 | 不换行，横向 overflow；创建到第18项时 scrollLeft 仍0，原组件不自动 reveal 新 active |

每个 tab 主按钮 `tabIndex=0`（默认），不是 roving tablist。实际 ArrowRight 留在第一个 tab；Tab/焦点 + Enter 可激活；浏览器 focus 会把尾项滚进 overflow，实测末项 scrollLeft 分别 2199/2739/3319。中键未关闭标签，Edge 默认可能进入 autoscroll，夹具先 Escape 退出后再测 Enter；没有把浏览器默认行为说成原自定义功能。源码没有 tab 的 onAuxClick/onKeyDown/drag、Home/End/Delete handlers；hbar 若新增可访问键盘行为，应标注增强而不是原交互复刻。

- [初始 18 tabs](../artifacts/file-preview-tabs/reference/evidence/many-tabs-initial-en-US-1440.png)，[焦点移到最后一项](../artifacts/file-preview-tabs/reference/evidence/many-tabs-focus-last-zh-CN-1440.png)。
- [320 原展开拥挤](../artifacts/file-preview-tabs/reference/evidence/same-path-file-diff-zh-CN-320.png)，[320 隐藏 navigator 后](../artifacts/file-preview-tabs/reference/evidence/preview-navigator-hidden-zh-CN-320.png)。
- 本轮没有实际运行 H5 guard 场景；上一轮 [会话工具审计](desktop-session-tool-reference-audit.md) 已区分 `useMobileViewport && !isDesktopRuntime` 隐藏 dock。这里不能把 desktop guard 320 当真实手机完整 App。

## Expand / Back / 关闭 / 重启：必须保留条件分支

**原 Back 不等于总是收起，也不等于总是重新停靠。** 原 [WorkbenchPanel:49](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/workbench/WorkbenchPanel.tsx#L49) Expand 打开同 session 的 Workbench tab，然后 `closePanel`；Back 只调用 [tabStore:236](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/tabStore.ts#L236) 选择仍存在的 source session tab 并关 Workbench，不改 panel flag。与此同时，原 [openPreview:486](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/stores/workspacePanelStore.ts#L486) 无条件 `openPanel`。

1. Expand → **不进行预览读取** → 立即 Back：dock closed，preview ref 仍在。实测 [en1440](../artifacts/file-preview-tabs/reference/evidence/expand-immediate-back-dock-closed-en-US-1440.png)、[zh320](../artifacts/file-preview-tabs/reference/evidence/expand-immediate-back-dock-closed-zh-CN-320.png)。
2. Expand → 在 Workbench 点击树/标签/Refresh（走 `openPreview`）→ Back：dock **open**，同预览仍在。实测 [en900](../artifacts/file-preview-tabs/reference/evidence/expand-back-after-preview-dock-open-en-US-900.png)、[zh320](../artifacts/file-preview-tabs/reference/evidence/expand-back-after-preview-dock-open-zh-CN-320.png)。这不是 Back 自行恢复的特殊动作，是期间 panel flag 已被改回 open。它收窄了 P2 文档中“Back 后关闭”的无条件表述。
3. 仅 Workbench/dock X 关闭视图后，用原 toolbar 重开可保留预览。实测 [reopen-retains-preview-en-US-1440](../artifacts/file-preview-tabs/reference/evidence/reopen-retains-preview-en-US-1440.png)。
4. preview store 没有 persist；reload 后预览为空、dock closed，普通 session tabs 由 tabStore 自己恢复。实测 [reload-no-preview-zh-CN-900](../artifacts/file-preview-tabs/reference/evidence/reload-no-preview-zh-CN-900.png)。不声称重启保留所有打开文件。
5. 原 TabBar 关闭 source session 会 `clearSession`（包括预览），与仅 panel X 不同；Workbench 的 source missing/closed 回退沿用 P2 原组件证据。本轮未重复制造真实删除，原没有普通 Archive 契约，不将 hbar Archive 等同删除。

## 历史核对

- `d7081c42 feat(chat): link file references in message text #1146`：消息路径与行号进入原预览的依据；本轮从该实际入口点击。
- `6c6d3c51 feat(desktop): add inline diff review flow #1004`：原 diff comments、来源定位、Workbench 返回路径演化，不能只看单张工作台图推出所有行为。
- `b5161a47 fix(desktop): refresh workspace diff previews (#724)`：成功内容在刷新失败时保留，是既有错误恢复设计。
- 本轮只读比较这些 commit 的文件范围与当前实现；未 checkout/reset/stash，也未运行参考 Host。

## hbar 迁移的最小闭环验收建议（未在本单元实现）

1. Owner 仍归当前会话/现有 FileWorkspace；以完整文件 target 区分 document / worktree diff / staged diff。一个名字相同不应被当同ref；不要新建第二份编辑草稿/真实文件事实。
2. 一个预览：不占整条 tablist，header 可关闭；多个预览：正常流横向条、精确 aria 名、就近 X/五类关闭菜单。背景关闭保持当前；当前关闭可靠选存活邻居；最后一个关闭回当前列表，Files 工具还在。
3. 打开/切换/刷新沿既有 read owner，保留请求 generation 与原 target；失败保已知成功内容但明确非最新；离屏、Close→reopen、A/B 会话晚回复不能串入另一项。
4. hbar 有可编辑文件，参考 preview 本身是只读。dirty/unknown/pending 不能被参考的无确认 X 静默清除；由当前编辑能力明确阻止并就近解释，处理后再关闭。批量关闭也应按已捕获 ref/实例操作，不假装磁盘写已成功。
5. 32-session 工具 owner 和文件预览容量是不同预算。新增有界 preview refs、容量失败可见且不静默驱逐 dirty。原没有预览数量硬上限，hbar 的预算属于工程约束，不是原有特性。
6. 1440/900/320 + en/zh 真 Host：正文、两种 diff 同路径独立，重复同ref不增项；五范围关闭+Keyboard Arrow/Home/End/Delete/menu key；长同名路径与多tab滚动、active reveal；缺失/权限/刷新失败；Expand 立即 Back 与期间 openPreview 后 Back 两分支；reload 不伪称已恢复丢失草稿。
7. 窄屏应保留 hbar 已验证的自适应工具页；不能复制原固定280px navigator挤掉preview的缺陷，也不依截图坐标或固定高度实现正文。

## 复现与验证记录

```powershell
bun node_modules/vite/bin/vite.js --config artifacts/file-preview-tabs/reference/vite.config.ts
bun artifacts/file-preview-tabs/reference/verify.ts
```

使用独立 loopback 45091、独立 cache/build/evidence；运行前无 listener。脚本真实挂载原组件，使用 Edge Playwright，所有 API 请求仅 GET 人工响应、非 loopback 与 WebSocket 被阻止。双语三宽的最终 6/6、84 PNG、0 pageerror 通过；截图等待原主题字体与有限原 CSS transition，核对 active store 与实际 preview header。源组件源码、菜单与样式未改。期间修正了夹具菜单 role 定位、文本 badge 匹配和错误的 Back 一概 closed 假设；这些不是参考产品修改。

本轮不运行 hbar/native/商业 provider，不运行原项目全量 lint/test；原完整 App 的真实文件权限、Native open-with、Git 各种状态、超大载荷性能和 H5 入口不在此隔离渲染的通过声明内。产品实现和最终 hbar E2E 属于主线后续单元。

独立夹具 Vite build 退出 0（4,081 modules）；它沿用原构建配置，因此有 `__dirname` config-loader 提醒、大 chunk 提醒，以及夹具 top-level await 对原旧 target 的 tolerated-transform 提醒。实际截图运行的是现代 Edge 开发夹具，不能把本次 build 当旧 Safari/native 兼容性验收。文档与自有夹具 Prettier 通过；59 个本地证据/源码链接逐个存在。没有执行根全仓门禁或暂存操作。
