# 会话入口收口审查：当前差距与材料回看闭环

本轮为只读产品审查，不是“全部迁移完成”声明。2026-09-26 核查 hbar `a62f098`（含 `0ee3099` 文件多预览、`cdf2b49` 会话工具所有权），cc-haha `e28d0a65`。遵守 hbar-engineering、reference-flow-layout、content-contract、icon-scale；参考仓库 AGENTS 已读。仅新增本文件及 ignored evidence；没有修改产品、维护测试、索引或提交。问卷 AskUserQuestion 的布局与答案输入由主线审查，此处不重复。

后续状态：本次审计发现的图片 P1 已完成 composer / 历史消息接线和真实原生验收，见 [图片交付记录](desktop-image-resources.md)。下文矩阵与缺口描述保留审计基线，不表示修复后的界面仍只有名称。

## 本轮最高优先级结论（审计时点）

**P1：已上传图片没有发送前内容确认，也没有发送后原位回看。** 这不是旧“工具结果缺 Copy”问题：`cb4a241` 已完成工具输出复制，本轮不再将它列为缺口。

新证据使用同一张 `layout-a.png`：

- 原未修改 `ChatInput` 在正文上方显示图片缩略图；原 `AttachmentGallery` 的 message variant 也显示图片。Enter 打开真实 `ImageGalleryModal`，ArrowRight 从 1/2 切到 2/2，Esc 关闭。中英 1440/320 均实际渲染、检查；不是依据源码想象。
- 当前 hbar 真正配对的临时 Host 已接收该 PNG。composer 仅有文件图标、名称与 Remove；DOM 为 **0 个 img、1 个移除按钮**。发送给本地 fixture 后，消息中的图片仅为 **SPAN 文本、0 个 img、0 个 button/link**。因此用户无法确认“同名图片是否是想发的图”，刷新后也没有历史图片打开入口。
- Host 已有经鉴权的 artifact GET，不能写成“缺图片后端”。缺少的是宿主/客户端安全读取 seam、资源所有权，以及 composer/message 的同目标预览闭环。不要把裸 `artifactUrl` 直接当跨 origin / WebView 鉴权方案，也不要只加一张没有打开能力的装饰缩略图。

当前优先顺序：先补图片回看这个已有事实支撑的纵向闭环；再评估普通文件阅读/下载。参考“排队编辑、立即引导”“选中文本加入会话”“磁盘回退”需要额外语义核对，不以按钮占位冒充已支持。

## 新渲染证据与范围

| 证据                    | 原组件                                                                                                                         | 当前 hbar                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 中文320输入与材料       | [reference-composer-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/reference-composer-zh-CN-320.png)       | [hbar-composer-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/hbar-composer-zh-CN-320.png)           |
| 英文1440材料打开/已发送 | [reference-image-open-en-US-1440.png](../artifacts/desktop-final-entry-audit/conversation/reference-image-open-en-US-1440.png) | [hbar-message-en-US-1440.png](../artifacts/desktop-final-entry-audit/conversation/hbar-message-en-US-1440.png)           |
| 中文320材料打开/已发送  | [reference-image-open-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/reference-image-open-zh-CN-320.png)   | [hbar-message-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/hbar-message-zh-CN-320.png)             |
| 英文1440模型菜单        | [reference-model-en-US-1440.png](../artifacts/desktop-final-entry-audit/conversation/reference-model-en-US-1440.png)           | [hbar-model-en-US-1440.png](../artifacts/desktop-final-entry-audit/conversation/hbar-model-en-US-1440.png)               |
| 中文320思考档位         | [reference-thinking-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/reference-thinking-zh-CN-320.png)       | [hbar-thinking-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/hbar-thinking-zh-CN-320.png)           |
| 中文320执行选项         | [reference-execution-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/reference-execution-zh-CN-320.png)     | [hbar-execution-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/hbar-execution-zh-CN-320.png)         |
| 中文320持久Plan选中     | 原菜单上行图片，未伪造原业务ACK                                                                                                | [hbar-plan-selected-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/hbar-plan-selected-zh-CN-320.png) |
| 中文320 Goal准备态      | 原 `/goal` 命令入口见下表；没有制造不存在的参考Goal chip                                                                       | [hbar-goal-intent-zh-CN-320.png](../artifacts/desktop-final-entry-audit/conversation/hbar-goal-intent-zh-CN-320.png)     |
| 英文1440输入工具加号    | [reference-plus-en-US-1440.png](../artifacts/desktop-final-entry-audit/conversation/reference-plus-en-US-1440.png)             | 当前加号直接选文件，见当前 composer 图                                                                                   |

新证据边界：

- [原 fixture](../artifacts/desktop-final-entry-audit/conversation/reference/main.tsx) 直接挂载未修改的 `ChatInput`、`AttachmentGallery`、`ImageGalleryModal`，复用原全局主题与字体，周围 header/容器是明确标出的 fixture；人工会话/catalog/store 和无业务 IO stub。原仓库未改，所有 API/跨 origin HTTP 拒绝；没有 Electron、原 Host 或实际付费模型。原 DOM 使用 Inter/PingFang SC/Microsoft YaHei，非遗漏主题后的默认 Times。不是完整 cc App截图。
- [原截图脚本](../artifacts/desktop-final-entry-audit/conversation/capture-reference.ts) 与 [观察结果](../artifacts/desktop-final-entry-audit/conversation/reference-observations.json)：中英×1440/320四组，图集真实键盘开/切/关、模型/思考/权限/加号菜单，页面宽度等于 viewport，pageerror 0。fixture中两张图同源，用于验证翻页身份，不证明两个不同原文件的业务加载。
- [hbar脚本](../artifacts/desktop-final-entry-audit/conversation/capture-hbar.ts) 与 [观察结果](../artifacts/desktop-final-entry-audit/conversation/hbar-observations.json)：真实临时 Host、真实上传、两个 local-fixture echo Run（每个 locale 一次），未使用商业 provider；两locale共享这个隔离session，中文图可见上一次英文历史，这是有意保留历史而非两个清空空态。使用当前 App 生产构建，**独立 outDir** `artifacts/desktop-final-entry-audit/conversation/web`，3069 modules，`index-fbz8IPGL.js` / `index-BBy3EzVG.css`；未写共享 dist。四组还实际切换 Goal准备/取消、持久 Plan进入/退出；没有重测断线未知、完整Goal生命周期或P3文件多预览。
- 所有截图在当前构建下新生成；未把旧交付图当作新资源图。审查期间其他agent改了 App/sidebar相关文件，未覆盖他们的变更；上述固定产物不声称包含稍后 sidebar 在建修改。

## 有界逐入口矩阵

分类：**对齐**＝本入口主要位置/动作已实现，不表示像素/所有故障用例完全等价；**适配**＝有意依 hbar 权威合同保留不同语义；**缺口**＝当前真实可复现的用户路径断点；**合同待定**＝不能只改 View 补出。新图只证明所列状态，未新渲染的分支明确写“源码/既有验收”。

| 入口 / 位置                               | cc-haha真实行为与来源                                                                                                    | 当前hbar行为、状态与证据                                                                                                                                                                                                      | 判定 / 最小后续                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 模型：composer右下名称                    | `controls/ModelSelector.tsx:236,607,824`；点击锚定列表，搜索、provider分组、选中项、关闭；窄屏标签压缩。新模型菜单图     | `composer-model-picker.tsx:395,438,456,503`；同处触发、搜索图标/清除、分组与选中，不跳全屏设置。最多60行页、搜索全catalog；loading/failed/reconcile仍由owner提供。新菜单打开/Esc实测                                          | **对齐**；60行显式分页是有界适配。无新高优先级入口缺口                                                                                 |
| 思考强度：紧邻模型                        | `ReasoningEffortPopover.tsx` 与 `ModelSelector.tsx:875`；大号当前值、离散轨道。新320原图                                 | `composer-model-picker.tsx:298,559,591`；本地预览、Host档位数、离散圆点与进度，指针释放/键盘确认/blur单提交；取消不提交、unknown只核对见67d9917及c6c2e52。新浮层图                                                            | **对齐/适配**；圆点在轨道下方不是参考嵌轨，事务与Host档位优先，不宣称像素复刻                                                          |
| 权限：左下执行菜单                        | `PermissionModeSelector.tsx:275,307`；Ask/自动编辑/Auto/Plan/Bypass五个不同语义，Bypass额外确认；运行中禁变              | `composer-permission-picker.tsx:297,388`；ask/deny/allow/inherit是本次发送快照，allow确认；pending/unknown冻结原目标。新执行菜单图                                                                                            | **适配**；hbar没有原Auto分类器/只自动编辑同义策略，不能把allow命名成原模式                                                             |
| Plan进入/退出：同权限导航面               | 原同菜单Plan，而非另开无关设置页                                                                                         | `composer-permission-picker.tsx:414`；durable `mode.get/set`，Plan选中单勾、普通approval行禁用并解释先退出；新四组进入/退出实测，草稿图片仍在。`composer-plan-mode.ts`持久模式owner与fresh-submit读取                         | **对齐/适配**；会话scope与下一次approval不同。暂停普通行是明确的安全适配，不悄改审批                                                   |
| 真正同Run计划批准                         | 原 `ExitPlanModePermissionDialog.tsx` 在工具位置展示计划/反馈/执行决定                                                   | `plan-exit-decision.tsx:21,33,69`，`plugins/plan/src/index.ts:358,375`；`exit_plan_mode`强制审批，同一session/run/call；允许转default同轮继续，拒绝带反馈继续plan，unknown只核对。7d9f0f7已有交付；本轮**未新生成该卡业务图** | **已交付，源码复核**；不要再把已实现同Run链列成缺Host能力                                                                              |
| 文本proposed_plan                         | 原真实ExitPlanMode不能用任意Markdown代替                                                                                 | `proposed-plan.tsx` / `plan-proposal-actions.ts:310` 仍是完整标记块的detached新Run动作；Implement显式default、Continue显式plan，保留composer draft                                                                            | **适配**；其Implement不自动退出durablePlan，与上行不同，当前菜单文字明确说明                                                           |
| Goal入口/退出准备                         | 原 `/goal objective`、`/goal clear`，slash命令进入transcript；不假定有Goal chip                                          | `composer-intent-controls.tsx:41`；可扫描Goal文字、按下态改变输入提示，再发送才创建；取消准备不清已有Goal。新Goal准备/取消图                                                                                                  | **适配**；保留就近入口，不伪造参考chip或假历史事件                                                                                     |
| 当前Goal摘要/暂停/恢复/清除/展开          | 原 `ActiveSession.tsx:104,805,827`：标题metadata下、消息上；mobile guard隐藏整个header，原strip无控制钮                  | `lumen-session-workspace.tsx:1288`→`HbarComposerGoal`：同层摘要、Pause/Resume/Clear带确认/Expand；移动保留可达。bea70a7、Goal生命周期交付已验证；本轮只核当前接线                                                             | **适配**；不能复制原mobile隐藏而丢hbar控制。完整生命周期不再误写成只有continuation divider                                             |
| 附件加入：左下+、拖放/粘贴                | 原 `ChatInput.tsx:1383` 加号先开“附加文件/Slash命令”，`1288` gallery；drop/paste                                         | hbar `composer-attachments.tsx:22`，workspace `1009,1018`：+直接文件picker，drop/paste到同owner；12项上限、upload/unknown/ready局部反馈，unknown不复发。真实PNG上传                                                           | **适配**；更短的常用文件路径合理。加号无“插入/命令”是发现性差异，不是没有slash能力                                                     |
| 图片确认/打开/前后切/关闭                 | `AttachmentGallery.tsx:90,235` 缩略图按钮；`ImageGalleryModal.tsx:35,58` 键盘左右、媒体modal、关闭。新图/DOM已证         | workspace `1009`仅传id/kind/name不传preview；`session-message.tsx:447`只SPAN。真实上传/发送后0图片、0打开动作                                                                                                                 | **P1真实缺口**；见下节完整读取→预览→关闭闭环                                                                                           |
| 普通文件打开/外部应用                     | 原gallery文件路径可OpenWith，`AttachmentGallery.tsx:118,131`依原desktopHost及本地路径                                    | hbar上传ArtifactRef是哈希，不是工作区path；message只名称。P3工作区Files预览不是上传artifact预览                                                                                                                               | **部分缺口/合同适配**；可做受限只读阅读/下载，不能将artifactId拼本地path或开放任意系统应用。本轮未渲染原OpenWith菜单，不宣称已视觉验收 |
| @文件提及与/命令                          | 原 `MentionComposer`+FileSearchMenu/SlashCommandMenu；新加号原图展示Commands可发现入口                                   | hbar `composer-mention-editor.tsx`、`composer-slash-menu.tsx`与runtime owner，保留结构化draft、键盘选择；实际Host能力不是所有参考commands都存在                                                                               | **已交付/适配**；本轮不重测多根目录/IME/过期搜索，不列成已新验收                                                                       |
| Send/Stop/Queue                           | 原 `ChatInput.tsx:829,1512`：运行中右端Stop、Enter可queue；原按钮/Enter不完全同义                                        | workspace `1039` runningActions：空稿仅Stop，有稿Queue+Stop；Enter排队、不停止；`session-run-activity.tsx:36`取真正执行Run优先。已有专门真实验收；本轮只发送local-fixture                                                     | **适配**；不复制参考鼠标/Enter差异，已闭环无需重做                                                                                     |
| 已排队消息编辑/删除/立即引导              | 原 `ChatInput.tsx:1180,1255`：composer上虚线待发卡，Edit/Save/Cancel/Delete/Guide now                                    | hbar是已接收Run，活动折叠可看状态/取消；`commands/run.ts:97,122,operation.cancel`无对queued input的原子edit/steer                                                                                                             | **合同待定**；源码确认差异，本轮未新拍队列态。不用cancel+new Run冒充原地编辑或同轮引导                                                 |
| header：标题/项目metadata                 | 原 `SessionChatSurface.tsx:8`层次，`ActiveSession`移动隐藏header；既有原ActiveSession完整fixture可核                     | 当前hbar新图：title+project，5个具名图标动作，窄屏仍可达；不是旧5个文字按钮。`lumen-session-workspace.tsx:1223`                                                                                                               | **适配**；本轮可见性已证，不能称参考原header也有相同5工具                                                                              |
| header Files                              | 原工作台/Files导航，不等于消息附件                                                                                       | 当前图标按钮→`sessionTools.open`，已完成P2 session ownership与P3多preview；返回/持稿由既有owner负责                                                                                                                           | **已交付**；本轮不重跑P3，不能用它掩盖artifact回看缺口                                                                                 |
| header Monitoring / Agents                | 原上下文用量及子Agent入口各自就近                                                                                        | hbar Monitoring读预算用量，Child agents读真实AgentRecord→子session，Back原source。header新图证明入口；详细转换已有独立交付                                                                                                    | **适配**；不存在的toolUseId→Agent映射不得猜                                                                                            |
| header Goals and plans / Session settings | 原Goal命令及右侧工具/设置                                                                                                | hbar Goals打开session-owned面板，settings捕获当前session scope；保留返回。源码`1245–1281`对应各按钮                                                                                                                           | **适配**；明确区分持久Goal、Run update_plan进度和Plan mode                                                                             |
| user/assistant Copy / Fork                | 原 `UserMessage.tsx:169`、`AssistantMessage.tsx:204`，copy正文、终结消息fork；原`MessageList.tsx:1153,3160`资格/分支导航 | 当前真实echo消息下Copy/Fork/时间均可见；`session-message.tsx:469`+workspace `504,574`；fork依据Host batch资格/receipt，精确message前缀而非伪run.settled。未知保持原key                                                        | **对齐**；新图证明入口，不把本轮未点击Fork写成新幂等验收                                                                               |
| thinking/tool折叠、输出Copy、审批         | 原ActivityGroup/ToolCallBlock逐步披露；copy工具正文，不混输入                                                            | 当前 `session-message.tsx:284` tool-output copy（完整loadedtext、1m字符上限）、callId配对、unknown工具JSON fallback；审批精确session/run/call/tool关联，不可靠留fallback                                                      | **已交付**；cb4a241已修Copy。问卷与主线分工；本轮不重验真实审批write                                                                   |
| Run状态、失败重试、返回最新/旧历史        | 原StreamingIndicator、MessageList滚动/回看；原in-conversation find另有控制器                                             | hbar `session-run-activity.tsx:100`当前状态/展开历史/20行页/取消或失败retry；`LumenConversation:235`有新内容时返回最新；workspace `820` loadOlder/错误retry                                                                   | **适配**；未新测长历史/自动滚动。参考全文搜索和选区引用不可凭普通浏览器find宣称同义                                                    |
| 选区“加入会话”、文件rewind                | 原 `MessageList.tsx:472,620` 引用 `chat://role/messageId`；文件回退另有undo                                              | hbar普通text/文件mention/fork并非带原消息身份引用或磁盘undo                                                                                                                                                                   | **合同待定**；本轮仅源码复核，未新挂选区菜单，不列视觉确定优先项                                                                       |

上表 cc 路径相对 `D:/Git/cc-haha/desktop/src/`，hbar组件路径相对 `packages/app-react/src/`，表中另注的全路径除外。每行只描述该入口的已证范围；不将源码存在等同于所有状态的业务验证。

## 图片回看的最小可独立交付纵向单元（建议，尚未实施）

事实与可复用合同：

1. [ArtifactRef](../packages/contracts/src/index.ts)：24起包含内容哈希id、name、mime、size；image/file ContentBlock已有持久ref。没有必要为显示图片复制一套材料事实。
2. [Host artifact读取](../apps/host/src/server.ts)：1020鉴权、1040匹配64位hash GET、返回MIME/受限CSP；不是任意文件路径读取。[HbarClient](../packages/client/src/index.ts)：271只有URL便捷方法，目前没有携带token的bounded bytes reader。普通 `<img src>` 无法携带Bearer，所以跨origin与native不能仅靠猜测cookie。
3. [Kernel上传](../packages/kernel/src/index.ts)：1410，1 byte–10MiB，PNG/JPEG/WebP/GIF签名校验；不允许把“≤10MiB压缩数据”当成解码内存有界，仍需像素/并发预算。新增渲染策略应继续拒绝SVG/HTML内嵌执行。
4. [composer接线](../packages/app-react/src/lumen-session-workspace.tsx)：1009仅id/kind/name；共享 `LumenComposerAttachment.previewUrl` 已存在（`hbar-ui/.../session-components.tsx:253,370`），但只有展示能力，不能假设已有完整安全gallery动作。消息 `session-message.tsx:447`目前只文本。

推荐单元包含以下五步，完成后才称“图片可回看”：

1. 宿主/Client提供可取消、经真实凭据鉴权的 `readArtifact(ref, signal)` seam，返回受限bytes/Blob或由宿主管理的lease，不向View暴露token。先校验hash身份、MIME/size、响应大小；读取失败不影响原稿/上传事实。
2. 单一预览owner捕获 `{sessionId, messageId? / draftRevision, artifactId}`；仅打开当前目标时读取，少量并发、有限缓存，切换/关闭/移除/dispose abort并release ObjectURL。晚A不得覆盖B，A→B→A必须用generation判定，不能只比id。归档保留历史仍可读，不走新Run preparation guard。
3. composer有安全缩略图/“打开图片”与独立移除；message有相同打开入口。预览loading/失败/重新读取是就近状态，不伪造可见成功。原文件名称仍能辨认，长名不扩页。
4. 真实modal提供关闭、计数、多图上一张/下一张及键盘左右/Esc；打开时记focus，关闭回精确触发器，源触发器不存在则回有效composer/消息区域。正常flex布局，只有媒体modal是已证覆盖层。不将整个会话重挂载以显示图片。
5. 完成后确认照片看得到、退出看图时文字/mentions/附件/selection/scroll不丢；禁用任何隐式上传/Run/file写入。普通file阅读/下载可以另一个独立单元，不扩大成系统OpenWith或磁盘编辑。

明确验收矩阵：

| 场景                                             | 应可核对结果                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 中英1440/320：两张同名不同hash、同hash不同位置   | 缩略图/打开内容与精确目标一致，计数与左右键一致；不能按filename缓存串图                       |
| 上传前后/发送后/刷新历史                         | 当前草稿与已提交ContentBlock皆可读；刷新从原artifact事实恢复，不依赖旧内存data URL            |
| 浏览器同origin、paired跨origin、实际WebView2     | 经公开Client/宿主凭据链读；401/断线/缺artifact显示可恢复错误，不泄token，不以mock成功代替原生 |
| A→B→A、慢响应、close/remove/dispose、换session   | 旧结果不串台，ObjectURL释放、无悬空更新，原draft不被清掉                                      |
| 10MiB边界、类型/签名不符、超像素、12附件、长名称 | 明确拒绝/降级原名称可读；有界读取/解码，非静默截断，不一次加载全会话图片                      |
| 打开→键盘翻页→Esc / 原触发器被删除               | focus恢复到有效可达位置；无页面水平溢出、正常modal背景inert，不覆盖系统titlebar               |
| 外部归档后的已加载历史                           | 看图/Copy仍可用，Send等新准备保持禁用；不自动导航或删除原稿                                   |
| 请求/副作用记录                                  | 所有preview是GET/read；Run、Goal、model、mode、文件write计数0，失败重读不重新上传             |

## 复现、失败记录与清理

独立hbar构建命令：`HBAR_E2E_HOST_PORT=45112 HBAR_E2E_PREVIEW_DIST=artifacts/desktop-final-entry-audit/conversation/web bunx vite build --config apps/web/vite.config.ts`。preview为45111，临时Host45112；原组件Vite45121。capture脚本引用现有公开E2E Host fixture并新建临时目录，不复用用户profile。

本轮审计脚本曾有三类非产品失败并已准确修正重跑：模型搜索是searchbox不是textbox；响应式sidebar在截图切宽时自动收起导致旧Hide locator失效；CodeMirror placeholder不能用 `toHaveText('')` 作为空草稿，改用既有 `expectComposerText`。另首次45113 Host已清理后被另一agent的Vite占用，下一次启动报EADDRINUSE；没有操作其PID，按主线统一换45112，45117检查占用后未启动。最终捕图均exit0，不能把这些harness失败算产品回归。

最终Host [ownership](../artifacts/desktop-final-entry-audit/conversation/host-ownership.json) / [cleanup](../artifacts/desktop-final-entry-audit/conversation/host-cleanup.json) 记录pid40156、精确临时目录 `C:/Users/HeJiahui/AppData/Local/Temp/hbar-final-conversation-audit-8mMfeI`、SIGTERM退出及目录移除；最终端口/服务复核见 [service-cleanup.json](../artifacts/desktop-final-entry-audit/conversation/service-cleanup.json)。此前失败attempt的自身临时目录由各自finally清理。保护PID9572/48668未查询、未停止。未运行native、未构建exe、未跑全仓check，亦未将只读视觉审查写成那些门禁通过。

### 后续交付更新：运行中队列引导

上述审计时记录的 Guide 缺口现已接通：composer 上方逐行「引导／编辑／删除」，通过公开 `queuedRun.guide` 将选中项送入原运行，不取消、不重开、不清草稿；未知结果只按原键核对。已完成一次真实 Host、默认 Pi、本地测试提供商的中文宽屏到窄屏连续流程。具体范围、策略限制、视觉依据和验证见 [同运行队列引导](queued-run-guidance-storage.md#public-command-and-composer-flow)。此更新不改变 Goal+Plan 与 `/agent` 的待选语义，也不代表全部桌面迁移已完成。
