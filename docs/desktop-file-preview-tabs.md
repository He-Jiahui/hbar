# Desktop 文件预览标签（P3）

本单元把 cc-haha 的“已打开文件留在当前会话工具中，直接切换、就近关闭”迁到 hbar，不代表整个 Desktop 迁移完成。参考为 cc-haha `e28d0a65`，hbar 起点为 `cdf2b49`；原组件、基线与新实现证据分开保存。

## 参考和原问题

[原组件审计](desktop-file-preview-reference-audit.md)实际挂载原 ActiveSession、WorkbenchPanel、WorkspacePanel、TabBar 和 Zustand stores：中英 × 1440/900/320，6场景、84 PNG、0 pageerror。人工 typed GET 响应不是完整 cc Host/native 测试，未修改参考仓库。

hbar 原宽工作台已有常驻导航器，问题并非所有情况下都必须“返回列表”。真实 Host 基线证明：打开 A、B 后没有已打开预览的标签行，返回 A 依靠再次定位树节点；正文与两种 Git 差异也没有并存的明确身份。[旧问题记录](../artifacts/file-preview-tabs/reports/baseline.md)保留旧 `index-PHHwPRy5.js`、18张截图和双语预期失败，不拿新截图回填旧结果。

| 参考意图                   | hbar 的实现和有意适配                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 单预览简洁、多预览可切换   | 单项关闭 X 位于内容头；多项为横向标签行，末项关闭回文件列表，Files 工具不关闭                                     |
| 正文与差异是不同阅读对象   | 同路径 document / working / staged 三个身份；原参考 diff 是 `git diff HEAD`，不能假称它也区分 worktree/staged     |
| 关闭靠近对象               | 每项 X、右键及 Shift+F10 菜单：当前、其他、左侧、右侧、全部                                                       |
| 切回重新读，但保留可读内容 | 干净预览重新验证；loading/error 保留上次成功内容并显示真实状态；dirty/submitting/unknown 仅选择，不自动读回或重放 |
| 回到原会话                 | Expand 后立即 Back 保持 dock closed；Workbench 内打开、切换或刷新预览后，Back 恢复相同来源 dock                   |
| 窄空间仍可操作             | 保留 P1 按实际面板宽度切换导航器；不复制原320px固定导航把正文挤成40px的缺陷                                       |

原参考没有可编辑文档的草稿保护，也未观察到 Arrow/Home/End/Delete 标签导航；这些是 hbar 的必要安全与可访问增强，不包装为参考已有能力。

## 操作与状态闭环

- 新预览获得 UUID，复用独立的 kind、规范相对路径和 diff cached key。关闭后同名重开是新 UUID，旧菜单和晚响应不能操作新标签。
- 背景关闭不切当前；当前关闭先取原位置右邻，再取左邻。返回文件列表保留引用；一个剩余引用在列表态仍保留返回入口。
- 批量关闭捕获菜单打开时的 UUID 集合。任一目标有未保存草稿、正在保存或未知保存结果，全部不关；就近解释原因并提供显式打开受保护文件的按钮，不自动选走当前文件。
- Preview/Edit 模式按预览保留。普通文本滚动位置和 diff 当前页＋滚动位置在同一 Files 视图内切标签时分别保留；每页最多400行，内容缩短会钳制并提交新页，后续增长不复活旧越界页。视觉位置是有界局部状态，不是文档副本或跨重载持久化保证。
- ArrowLeft/Right/Home/End 自动选择并聚焦，Delete 关闭，菜单支持方向键和 Escape。关闭后只聚焦仍可见、未 disabled、非 hidden/inert 的原工具控件；窄导航器展开时不落到隐藏阅读区。
- Save、setText、Discard/Reconcile、Add to chat 带原 previewId/workspace。已发出的保存结算原 canonical document，不因切标签写到别处；未知写必须明确核对，禁止重放。
- 错误由原 reader 展示一次；命令包装丢失精确错误码时按 UUID/path/kind 判断归属，不让旧 B 错误吞掉新 C 容量失败。
- 菜单是参考已证明的覆盖层，采用不透明 surface；正文、工具栏、标签和反馈均为正常 flex 流，不以截图坐标摆放普通内容。

`fileWorkspace.selectPreview`、`refreshPreview`、`closePreviews` 是有 schema 的内部 client commands，已登记[命令清单](multi-level/implementation-inventory.json)。宿主提供所有中英文文案及 formatter，React 不携带示例列表。共享 LumenFileDocument 仅增加可选 headerActions/retainContentWhileLoading，旧调用保持原 loading 行为。

| 所有者             | 限制与一致性                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 每个 Files 面板    | 最多32引用；第33个在改变选择和发起读取前拒绝，不静默淘汰                                                         |
| Canonical 文档缓存 | 原有32文档、8Mi字符预算，baseline/draft/pending计入；所有预览共享不可变快照，非活动草稿也受 owner retention 保护 |
| Diff 内容          | 整个 runtime 最多8Mi字符；单次沿用 Host diff 上限及显式 truncated，不伪造截断                                    |
| Diff 客户端读取    | 最多8个并发 request owner；列表刷新、模式切换和Back不取消独立仍打开的预览；关闭UUID、面板换目标或dispose才撤销   |
| 阅读视觉状态       | 最多32个diff UUID页码；位置按UUID＋模式保存当前segment，不按所有访问过的页无界积累；关闭与目标变化释放           |

字符预算不是字节预算。AbortSignal 和 generation/UUID fence 保证客户端投影不被旧结果复活，不是 Host 已物理停止所有底层进程的声明。既有 Git、保存与档案执行权限没有被绕过。

## 验证过程与修正

候选失败均保留在 `artifacts/file-preview-tabs/`，未使用 force click、固定睡眠或删断言冒充通过：

1. 长差异标签的动态两端按钮造成 strip宽370↔356、tab宽278.5↔266.59反复变化；24帧测量在 `final/unstable-tab-en-US-1440.json`。改为稳定宽度原生横滚和选择时 reveal，解除不可点击问题。
2. cleanup 测量已复用 DOM，把 A 的滚动位置覆盖成0。改为只由 scroll 事件记录；两份真实220行正文验证 A=670、B=310往返恢复。
3. 真实 Git diff 翻到401–800/1806，切 B 再 A 曾回1–400。分页提升到有界 workspace 视觉 owner，segment 避免跨页套像素；同页420滚动往返验证。
4. 原生菜单 alpha0.92，等待字体/动画仍透字，不是截图时机。改不透明 surface 后，最终四例均测得 `rgb(245, 245, 245)`、alpha1。
5. 补齐窄 navigator 显示时关闭非活动标签2→1的可见归焦，以及 canonical reader 与包装错误码不同的单份反馈。

旧回归按事实迁移：`e5153a1`/`f02f61b` 的重选后Preview期待改为保留Edit；`cc87a9e` 的状态断言精确到footer，保留Add-to-chat独立状态；`37ce66e` 的窄屏Back恢复dock后明确关闭Files再发送，原始两条mention、另一会话草稿和真实Run输入断言不减少。首轮旧回归8pass/8fail/1显式skip保留，候选修正后49pass/1显式skip。

首轮根 `bun run check` 为 **2022pass/3fail/14991断言/352文件**，lint/typecheck通过，整体exit1；[日志](../artifacts/file-preview-tabs/final-check.log)。两个本次接入问题是生产路径断言把所有含preview的文件误当夹具、3个新client command未登记，已修并用禁止路径反例与完整性测试复核。第三项为并行 QuoteAuthentication 的 canonical 原生控件边界失败，本单元未改其组件或放宽检查。

## 最终资源与验收

最终 Web：`index-fbz8IPGL.js` / `index-BBy3EzVG.css`，3069 modules，生产build通过，既有大bundle warning保留。Host资源在已验证MSVC环境由 `build-host.ts` 构建。使用现有 `apps/desktop/src-tauri/target/debug/hbar-desktop.exe`，**没有重编launcher的声明**。

| 检查                 | 实际结果                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 原组件参考           | 6/6，84 PNG，0 pageerror；人工API fixture，不是完整cc Host/native                                                         |
| 新真实Host生产浏览器 | 增强6/6，45.5s；中英及1440/900/390/320，保存/unknown/晚读、菜单、两Back分支、可见归焦、真实长正文/长diff                  |
| 受控浏览器           | 2/2，32/33条、长译文、重复/失效ID、菜单打开后UUID替换、滚动与键盘                                                         |
| 专项                 | 分页11、feedback3、tabs5等；最后定向35/35、384断言；runtime专项15及已有Files/owner等定向58/58                             |
| Shared Lumen         | 直接包TS、Vite build、ESLint、4个Vitest、格式和内容/图标guards通过；独立提交 `7cd4362017`                                 |
| Shared标准pnpm       | TypeScript/proptypes/docs:api均因要求12.3.4、本机11.19.0阻断；未升级依赖，未冒称标准入口通过                              |
| 最终根串行门禁       | strict lint/typecheck通过；2038pass/1fail/15142断言，354文件，251.09s，总exit1；唯一失败为并行QuoteAuthentication控件边界 |
| 最终既有生产回归     | 同fbz8IPGL/BBy3EzVG资源，49pass/1显式skip，4.0min；测试专用双pane夹具未构建，跳过不算通过                                 |
| 内容/图标/流式布局   | 通过；只为已证实菜单容器登记精确overlay例外，自测确保不泄漏到按钮或其它文件                                               |

Guard 文件既有整文件 Prettier 检查在 HEAD 原文与本工作树都失败；本单元只增加15行精确菜单例外/反例，不夹带全文件格式改写。其ESLint、guard自测和实际样式检查通过，其它本次产品、测试与交付文档按自身格式检查。

[最终串行日志](../artifacts/file-preview-tabs/final-frozen-check.log)与[浏览器最终记录](../artifacts/file-preview-tabs/reports/verification.md)对应上述结果。最终受控浏览器另跑2/2、9.8s，`final-controlled-results/`。全仓唯一失败位于并行共享提交 `c3182a595b` 的 QuoteAuthentication 原生按钮，不是本次预览实现；未修改它或放宽 canonical guard。主仓 gitlink 只推进到本次共享提交 `7cd4362017`，实际子仓工作目录仍保留后续并行提交，不通过 checkout 回退用户工作树。

提交前空索引锁阻断已独立核实：35分钟前的零字节 `.git/index.lock`、无Git进程、可独占打开，转存为 `.git/index.lock.file-preview-tabs-20260926-1350.bak`，可恢复；没有删除或重置用户数据。

### 最终原生证据

[S4ZRBD verification](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/verification.json)：**中英 × 900×600/1440×960，4/4、48 PNG、pageerror/native console=[]**。每例新会话，Run为0，未点击文件Save，原磁盘/composer保持；真实Git staged/working由隔离临时夹具准备，不用商业provider。

- [英文1440不透明菜单](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/native-keyboard-context-menu-en-US-1440.png)
- [中文900关闭拒绝反馈](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/dirty-close-rejected-nearby-zh-CN-900.png)
- [中文900立即返回，dock关闭](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/expand-immediate-back-dock-closed-zh-CN-900.png)
- [英文1440预览操作后返回，dock恢复](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/preview-operation-back-dock-open-en-US-1440.png)
- [英文1440暂存区差异](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/same-path-staged-diff-en-US-1440.png)
- [中文900工作区差异](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/same-path-working-diff-zh-CN-900.png)

短文件native验收不代替长diff页码/滚动的真实Host浏览器测试，没有把浏览器320宽当原生320窗口。[最终清理](../artifacts/file-preview-tabs/native/hbar-native-session-file-preview-S4ZRBD/cleanup.json)核对PID、parent、创建时间、argv及精确路径：44852→45404→35228均退出，9443/54979无listener，`hbar-native-session-file-preview-S4ZRBD` 与 `hbar-native-file-preview-workspace-Bcr6eR` 已删除。protected PID9572/48668未查询或终止。此前候选 `2JXYvb`、`twKv3K`、`yL6xfH` 的证据与独占清理分别保留。

## 后续范围

这是现有 Files 体验的独立子单元，不增加 Browser、PTY、计划任务、市场/MCP、二进制图片预览或磁盘rewind。全桌面逐入口矩阵及通用desktop smoke仍待继续；不得因P1/P2/P3通过就把总Goal标完成。共享变化和主仓实现分别独立本地提交，保留其它任务的修改，不push、发布或改写历史。
