# 图片回看：原组件证据与有限读取/资源契约

这是下一子功能的**实施前设计审计**，不是已经交付的图片查看器。基线：hbar `ea0e3a5`、cc-haha `e28d0a65`（2026-09-26）。本轮只写本文件与 ignored evidence，没有产品、维护测试或索引修改，没有 native/付费模型执行。

后续已完成的基础实现、产品图片入口和真实 WebView2 验收见 [图片读取、解码与资源归属](desktop-image-resources.md)。下文保留实施前审计的时间语境；实际预算与已验范围以交付记录为准，不把本审计曾经的提议或缺口当作当前状态。

本文件深化 [会话入口收口审查](desktop-conversation-final-entry-audit.md) 的图片P1，不重复其全入口矩阵；[附件加入与恢复](desktop-composer-attachments.md) 已明确图片仍是 named chip、预览单独交付。原数据加入/unknown回执owner不得被预览重新实现。

## 已证实的原交互，不多推一步

| 入口与状态     | 原实现与实际观察                                                                                                                                               | hbar需要迁移/明确适配                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| composer缩略图 | `AttachmentGallery.tsx:235`：小图、独立移除；在原`ChatInput.tsx:1288`正文上方。打开图像与移除是两个按钮                                                        | 打开不移除、不发送；移除仍由现有expected draft revision动作负责                                                                 |
| 已发送图片     | 单图可读大预览；多图紧凑排列。原`previewableImageCount`用原附件集合决定布局，避免一个失败让另一个突然放大                                                      | 同一条消息的图片入口，不把上传artifact混成工作区文件path或生成物猜测                                                            |
| 打开放大       | 点击或Enter进入原`ImageGalleryModal`；顶端计数/关闭、中间contain图、左右箭头、底部缩略图。媒体覆盖层有独立语义                                                 | 主体flex，只有实际modal可覆盖；使用已有Lumen对话框公共能力，不在View堆自制全局modal管理                                         |
| 前后切换       | ArrowLeft/Right与箭头环绕。两张时1→左→2，2→右→1；底部按钮可点选。单图无左右及缩略导航                                                                          | 绑定item identity而非仅数组index，必须在重复名字/相同hash的多个出现位置仍正确                                                   |
| Esc/关闭/Tab   | 新原组件实测8次Tab仍在modal；Esc还焦到原打开按钮；关闭钮同样关闭                                                                                               | 移除或换会话后原trigger不存在时要有有效fallback，不能只对仍connected节点focus                                                   |
| 移除           | 新fixture实际Enter激活composer移除：2→1；message仍2；没有误开图集；剩余composer图打开为1/1                                                                     | 移除不删除Host artifact、历史消息或其它同hash出现位置                                                                           |
| 读取失败       | 损坏PNG触发原onError，原image变为具名文件卡；composer仍可移除，message没有假打开动作。原卡没有“重试读取”                                                       | hbar应显示短错误和只读Retry（类型/容量硬拒绝不无限重试），不得重新upload冒充重试                                                |
| 320窄屏        | 2张图集、中间图、关闭及左右仍可达。12张人工fixture均可Arrow环绕，但底部按钮压缩到约16.5px宽                                                                    | **不要复制压瘪触摸目标**：hbar的短有界缩略列表保持hit area并由横向pane滚动，自动露出选中项；不是普通内容绝对定位                |
| 权限/来源      | 原`attachmentImageSource`优先previewUrl/data，再将绝对本地PNG/JPEG/GIF/WebP路径送`/api/filesystem/file`。原服务做canonical允许目录检查，路径之外403、上限50MiB | hbar是paired-device＋hash artifact，不复制原path-based权限。此fixture没有原Host、真实磁盘或原Electron能力，不能证明业务授权通过 |

原引用（相对 `D:/Git/cc-haha`）：

- [AttachmentGallery.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/chat/AttachmentGallery.tsx)：70状态、90来源、104布局计数、235打开、286移除、363文件能力gate、458图集接线。
- [ImageGalleryModal.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/chat/ImageGalleryModal.tsx)：25 overlay登记、35键盘、58主体；[Modal.tsx](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/components/ui/Modal.tsx)：34聚焦/还焦、50 Tab/Esc、89 portal和media布局。
- [attachmentImages.ts](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/desktop/src/lib/attachmentImages.ts)：14四类inline图、26路径URL、45来源顺序；[filesystem.ts](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/src/server/api/filesystem.ts)：78目录allowlist、114真实路径检查、140文件/容量。
- 原历史 `b09e252f` 修复single/multiple image大小及不安全Markdown图片；`b1ecce78` 保持Markdown图片原文位置。后者涉及`InlineImageGallery`/assistant path extraction，**不是本次上传artifact scope**，不得仅靠正则扫描assistant任意URL就宣称对齐。

## 本轮新证据

原图片组件：

- [中文320：composer与message两图](../artifacts/image-viewer-entry/reference-pair-zh-CN-320.png)、[中文320：第二张图集](../artifacts/image-viewer-entry/reference-gallery-zh-CN-320.png)、[中文320：只移除草稿图](../artifacts/image-viewer-entry/reference-removed-zh-CN-320.png)。
- [英文1440：单图](../artifacts/image-viewer-entry/reference-single-en-US-1440.png)、[英文320：损坏图具名降级](../artifacts/image-viewer-entry/reference-broken-en-US-320.png)、[中文320：12项人工容量](../artifacts/image-viewer-entry/reference-twelve-zh-CN-320.png)。12项截图为full-page捕获，包括原文档滚动位置，不将图上的modal文档坐标当布局要求。
- [原组件fixture](../artifacts/image-viewer-entry/reference/main.tsx)、[capture脚本](../artifacts/image-viewer-entry/capture-reference.ts)、[DOM/交互观察](../artifacts/image-viewer-entry/reference-observations.json)。直接import原组件、原主题/字体；只注入typed PNG数据、locale与受控移除回调，不复制组件。en/zh×1440/320四组全部通过，额外0/1/2/12与坏图，22张PNG，pageerror0，无页面水平溢出；API/跨origin请求拦截，未连原Host。完整原ChatInput位置引用[此前真实原组件图](../artifacts/desktop-final-entry-audit/conversation/reference-composer-zh-CN-320.png)，不冒称这个局部fixture是完整App。

当前hbar断点已在上一审计用真实App+Host证明：[composer](../artifacts/desktop-final-entry-audit/conversation/hbar-composer-zh-CN-320.png)、[消息](../artifacts/desktop-final-entry-audit/conversation/hbar-message-en-US-1440.png)。本轮核对这些产品路径没有新增预览接线，未把这些旧构建图标成ea0e3a5的新App截图。

本轮真实Host只读鉴权probe：[结果](../artifacts/image-viewer-entry/host-observations.json)、[脚本](../artifacts/image-viewer-entry/probe-host.ts)。45122独立临时Host先上传fixture PNG，然后GET；裸URL401、错误Bearer401、正确Bearer200、再无Bearer401。9779 bytes、SHA256与原ArtifactRef匹配，MIME `image/png`、CSP `default-src 'none'`、CORS准确为45121并允许credentials；0 Run。它证明**已有读取链路**，不证明尚未实现的浏览器/原生viewer或SDK限额读取。

## 当前权威与权限边界

| 现有能力                                                                    | 已有事实                                                             | 不能宣称的能力                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [ArtifactRef与ContentBlock](../packages/contracts/src/index.ts) :24         | 64位hash id/name/mime/size；image/file消息块已有持久ref              | 不包含owner session权限，也不是磁盘path；name不是身份                                                 |
| [Host server](../apps/host/src/server.ts) :1021、1040                       | 每个`/api`请求先authenticate，GET以hash找artifact、发送原bytes       | 这是**paired-device Host范围**，不是session ACL；UI绑定session防串台不是新的服务端授权                |
| [Auth](../apps/host/src/auth.ts) :51、61                                    | bearer或`hbar_device`cookie，每次读校验device有效                    | 裸URL无法附Bearer；token不能放query、alt、DOM或日志。已显示内容不能靠撤销凭据从用户记忆中收回         |
| [HbarClient](../packages/client/src/index.ts) :247、271                     | upload已有AbortSignal与credentials/header；artifactUrl只有字符串方法 | 没有bounded bytes read、hash/response校验、pixel预算或lease释放API                                    |
| [Kernel upload](../packages/kernel/src/index.ts) :93、96、1410              | 1byte–10MiB，PNG/JPEG/WebP/GIF签名检查                               | 压缩10MiB不是解码内存/尺寸/动画帧上限；签名检查不是完整图像解码验证                                   |
| [Storage artifact](../packages/storage/src/worker.ts) :1112                 | content hash存储，`INSERT OR IGNORE`保留首份metadata                 | 同bytes重新上传不同name不应靠GET Content-Disposition名称验证原消息caption；hash/size/MIME校验各自处理 |
| [composer接线](../packages/app-react/src/lumen-session-workspace.tsx) :1009 | 目前只传id/kind/name；`previewUrl`公共显示prop已有但未用             | 不代表鉴权图片read/打开已存在；上传期间/unknown不应读并假装已确认                                     |
| [message显示](../packages/app-react/src/session-message.tsx) :447           | 目前image/file是具名span                                             | 工作区Files预览、Markdown外链、复制正文不等于该ArtifactRef的图片读取                                  |

新查看器只读已确认材料。保持原上传owner不变：upload unknown仍由原`attachment.query`恢复，不能用“图能读到”自动接受新草稿、更不能发送。归档已加载历史的只读图片应继续允许；不要用新Run preparation guard挡住查看。

## 可直接实施的有限契约（建议，尚未实现）

### 1. Client读取seam，不新增重复RPC或新凭据协议

建议在 `@hbar/client` 的现有HTTP owner中新增如下方法；View不自行fetch，token仍只在Client实例内：

```ts
interface ArtifactReadOptions {
  readonly signal?: AbortSignal
}
interface ArtifactBytes {
  readonly artifactId: string
  readonly mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  readonly bytes: Uint8Array
}
interface ImageArtifactReadPort {
  readImageArtifact(ref: ArtifactRef, options?: ArtifactReadOptions): Promise<ArtifactBytes>
}
```

输入clone/校验后捕获，不在await后重新读可变ref。固定GET当前Client baseUrl的hash路径、`credentials:'include'`、私有Bearer；不接受任意URL、不跟随跨origin redirect。只允许四类已支持图片MIME，拒绝SVG/HTML/任意Data URL。

建议固定规则（新预算，必须实现/测试后才能称能力）：

- `MAX_IMAGE_BYTES = 10 * 1024 * 1024`，与Host已有上限一致；ref.size必须1..上限。HTTP失败只取有界安全code，不把HTML/raw错误正文渲染。
- 15秒读取截止、总并发2。读取ReadableStream累计限制；不先对未知长度调用无界`arrayBuffer()`。Content-Length若存在不符可早拒，缺失仍按实际bytes计数；最终size、hash、safe MIME必须与目标相符。reader.cancel/releaseLock在失败/abort时执行；提前abort零请求。
- 同hash不同caption可以复用已验证bytes，但本单元建议**不持久化bytes，不跨Host/client-generation缓存**。caption永远来自原目标ref；Content-Disposition不是目标身份。同hash而MIME冲突不能盲目重解释，给明确`CONTENT_MISMATCH`/unsupported，保留原名称。
- GET无副作用，失败是`failed`可显式重读，不应沿用upload的“unknown写回执”状态。Retry只能GET，不能upload/query后偷偷改draft。
- 不必为本单元新增Host session ACL；如果产品要求“设备只能读某session的artifact”，现GET并不提供，须另立Host授权合同，不能由View补假安全。

### 2. 解码边界必须在允许图片进入浏览器解码器前决定

建议首版 `MAX_IMAGE_PIXELS = 16_000_000`、单边≤8192、同时完整解码1。它们是**提议的产品安全预算**，不是现在已有规范或测量结果；与10MiB不同维度。实施前需结合已支持输入、平台能力和边界测试定案，不能把提议当作已批准的产品限制。

仅在`img.onload`/`decode()`后检查naturalWidth是**事后拒绝**，不能宣称防住首次巨图解码；`object-fit`也不节省原图解码。应由有界header/container parser在解码前校验尺寸、结构、动画标记，再交给decoder。仓库目前未发现现成image-size/probe-image依赖，不要假定已存在安全parser。

静态图可以形成独立实现步骤，但不应将其重新定义为全部图片体验的完成条件。若阶段性遇到APNG、animated WebP、多帧GIF而尚未有安全解码能力，应具名降级说明，不静默只看第一帧并声称等价；动画仍是待完成差距。完整对齐需要额外帧数/总解码成本限制与可终止decoder测试，不能通过10MiB掩盖。即使通过header检查，浏览器decoder仍有实现/额外内存开销，不能对进程RSS给硬保证。

不要在快速A→B→C时并发启动三个不可取消`HTMLImageElement.decode()`。decoder port有明确dispose；若底层不能真正中止，最多保留一个实际在途解码和一个latest候选，过期结果丢弃/close bitmap。超时不意味着底层解码已停止，不能超时后无限新建解码器。必要时使用经实际WebView验证的worker/可终止decoder；不假定所有平台有ImageDecoder。

### 3. ViewModel/资源owner与controlled View

建议目标及动作边界如下；只保存少量resource状态，不mirror完整Session或复制消息事实：

```ts
type ImageSource =
  | { readonly kind: 'draft'; readonly sessionId: string; readonly draftRevision: number }
  | { readonly kind: 'message'; readonly sessionId: string; readonly messageId: string; readonly messageSeq: number }
interface ImageViewerItem {
  readonly key: string // occurrence identity, not filename; two same hashes can still be two items
  readonly artifact: ArtifactRef
}
interface ImageViewerRequest {
  readonly source: ImageSource
  readonly items: readonly ImageViewerItem[] // validate 1..12; over-capacity is explicit, never silently sliced
  readonly activeKey: string
}
interface ImageResourceLease {
  readonly url: string // only locally created validated blob URL, never an arbitrary remote URL
  readonly width: number
  readonly height: number
  release(): void // idempotent, resource owner must implement exactly once cleanup
}
```

`host/client generation`由组合根opaque identity注入，不含token。每次open/select/retry另增request generation，捕获source/key/ref；异步回执同时匹配这些值，防A→B→A复用相同id误接旧回执。消息key建议含messageId+seq+block occurrence；draft来源从当前owner捕获，文字编辑无需强制关图，但附件已移除/替换须让来源验证失效。revision是校验线索，不能把“键入文字”错当图片变质。

单一owner提供`open(request)`、`select(key)`、`retry(key)`、`close()`、`dispose()`及reader；app-react只接状态/typed labels/回调。parent每次仍从canonical draft/timeline验证source membership，不接受任意`artifactId`伪装成当前消息。切到其它session/Host关闭旧viewer，不追随新active去重绑定旧请求；外部归档不改变已有历史图片身份。

建议状态：`closed → loading → ready | failed`，select/retry产生新generation；任何时点close/dispose进入closed，晚返回只release不publish。**不需要提交态、unknown写态或Run receipt**。失败保留目标、名称和关闭能力；capability缺失不显示假可用Open。

lease创建与撤销归浏览器资源adapter，纯runtime不创建DOM URL。只在安全bytes/尺寸检查后创建Blob URL，不将全量bytes/dataURL放Zustand/持久化。当前完整图最多1个live lease；旧图换页时先清理URL/bitmap，再接新图。缩略图需有界、小分辨率派生，不让12个full-resolution Blob URL常驻；最多12个当前gallery缩略lease，总bytes/pixels预算单列。先按需渲染屏幕内材料，不因为timeline有1000条就全量读取。

对于消息中超出12图的异常/扩展输入，不能默默截成12；显示明确容量状态或后续设计分页面接口。现Run用户输入最多12，不意味着所有未来assistant ContentBlock集合都有相同后端上限。关闭后重开默认重新鉴权GET，减少跨open缓存授权窗口；Client失效/pairing/Host切换时清理leases。没有撤销通知就不能保证服务端撤权后立即清掉已显示本地图；要如实承认观察窗口。

View文案由typed host bundle提供：open(name)、remove(name)、close、previous、next、position(index,total)、loading(name)、retry、error(code)、unsupportedAnimation、capacity、alt(name)。图名不得通过innerHTML渲染。复用Lumen语义icon tiers；关闭/左右是可访问按钮，缩略strip是短有界横向滚动、不压成16px目标。不要新增Zoom/Download/OpenWith占位，原图集本身也未显示这些能力。

## 独立提交与验收边界建议

1. **Client只读bytes单元**：新增reader文件/公开export、现有HbarClient最小装配、专用transport与真实Host测试。覆盖401/撤销/错误MIME/size/hash/redirect/提前abort/中途abort/超长stream/timeout；不碰upload状态机或Host数据表。
2. **纯owner＋浏览器资源单元**：source/generation状态、scheduler、preflight尺寸/动画策略、lease释放，测试实际创建/撤销次数、strict remount、A-B-A、remove/切Host/late decode/失败重读，所有写计数0。声明模型内无Blob/bytes持久化。未实现可安全终止前不得宣称解码取消。
3. **composer/message UI闭环**：公共controlled gallery与宿主copy、source wiring；中英1440/900/320、0/1/2/12/13、同名不同hash/同hash不同occurrence、long label、坏图、键盘/焦点、message只读与draft移除；先做真实paired浏览器，再现有exe+fresh资源原生验证。关闭/打开不改变原稿、Goal、Plan、Run或文件。

最终纵向验收必须同时看到：选取并确认上传→缩略图可辨→打开准确原图→切换/关闭还焦→原稿保留→发送后的同图可回看→刷新从持久ArtifactRef恢复→未知/归档/失效凭据边界不假成功。仅截图里出现img或SDK返回URL，均不算这个闭环完成。

## 本轮操作与清理

未发现同等深度的既有图片契约文档，因此新增本文件；前两份审计/附件交付文档保持原样。当前kernel/plugin-sdk等外部dirty只读保留，reference仓库既有untracked内容亦未碰。Host probe只写自有临时fixture的一张图，没有Run。

[Host cleanup](../artifacts/image-viewer-entry/host-cleanup.json)记录PID19444与`hbar-image-viewer-probe-BEDEr7`；[服务清理](../artifacts/image-viewer-entry/service-cleanup.json)记录45121/45122释放。保护PID9572/48668未查询/停止，9443未占用。本轮不是hbar viewer产品验收，未运行全仓check、native或商业模型。文档格式/本地链接核对不代替未来实现门禁。
