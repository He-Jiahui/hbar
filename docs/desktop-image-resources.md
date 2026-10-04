# 图片回看的读取、解码与资源归属

这是 [原组件图片审计](desktop-image-viewer-entry-audit.md) 的实施记录。2026-09-26 已接通产品 composer 和历史消息：草稿缩略图、独立移除、发送后回看、左右环绕、关闭还焦和窄屏图集都有实际浏览器及 Windows WebView2 证据。下文分别记录底层边界与产品验收，不将组件 fixture 冒充完整 App，不表示整个 Desktop 迁移 Goal 已完成。

## 用户入口与参考适配

- 上传确认后的图片就在输入正文上方显示为紧凑的 4rem 缩略图；点击或 Enter 打开，角落的 2rem 移除按钮是独立操作。移除只改当前草稿，不删除 Host artifact，也不改历史消息。
- 已发送图片在原消息位置可直接打开。多图保持 7rem 紧凑排列，单图可用更大的 contain 预览；文本、工具与图片的原顺序不被图片列表打散。
- 图集顶端是计数、原名称与关闭；主体图片保持比例；左右按钮和方向键环绕切换，单图不显示多余导航。Tab 留在真实 dialog 内，Esc 关闭后回到精确打开按钮；来源消失时回有效会话区域。
- 底部缩略列表最多 12 项，3rem 点击区域不被窄屏压瘪，仅该列表横向滚动，并自动露出当前项。这是对参考 320 下约 16.5px 缩略按钮的明确可用性修正，不是截图坐标复刻。
- 读取失败在原位置说明原因，只读「重新读取」不再次上传，也不清文字草稿。硬性格式、容量或内容冲突不提供无效重试；真实 decode 失败仍允许显式重读和独立移除。
- 文件附件继续使用原具名条目。没有新增普通文件下载、系统 Open With、Markdown 任意路径抽取或新的上传流程。

共享控件为 `LumenImageTile` / `LumenImageGallery`，业务 View 为 [session-images.tsx](../packages/app-react/src/session-images.tsx)，中文和英文可见内容由 [宿主 copy](../apps/web/src/session-image-copy.ts) 提供。普通内容采用 flex 流；唯一新增 absolute 例外是参考已证实的缩略图角落移除按钮，布局守卫只允许该文件的精确直接子选择器。

保留 hbar 现有 Lumen 按钮指示灯与 Dialog 上下边界线，不宣称像素复刻。额外真实 Edge DOM 复核确认这些灰线不是意外滚动条：320×900 时 Dialog 的 client/scroll 均 304×884，图片区均 200×760；只有底部缩略图条有意横滚。没有通过 `overflow:hidden` 遮蔽布局问题，也没有改全局 focus 合同，见 [测量](../artifacts/image-gallery-lines/measurements.json)。

## 已实现的单向边界

- `@hbar/client` 的 `readImageArtifact` 固定读取当前 Host 的 hash 路径，保留原配对 cookie/private Bearer，只执行 GET。累计字节、MIME、声明长度、实际长度和 SHA-256 均需匹配原 ArtifactRef；不能把带凭据的远程 URL 放入 DOM。
- `@hbar/app-runtime` 的 `createImageViewer` 保存来源、occurrence identity 和可展示资源状态。每次 open/select/retry 是新请求，A→B→A 不接受旧 A；最多一个实际 acquire 和一个最新意图。关闭、换页、来源失效、dispose 及晚返回资源都由 owner 释放。它没有上传、Run、文件删除或设置写能力。
- [image-preflight.ts](../apps/web/src/image-preflight.ts) 在解码前走有界容器结构，检查画布、帧范围/数量、关键顺序及 MIME，明确拒绝超出预算或不支持的子格式。它不解压像素，也不是完整 codec 校验器。
- [image-resource-controller.ts](../apps/web/src/image-resource-controller.ts) 拥有短队列、期限和 lease；[browser-image-resources.ts](../apps/web/src/browser-image-resources.ts) 提供真实 Worker/Blob URL 适配。Worker 用 `createImageBitmap` 检查可解码的默认帧，派生小 PNG 后显式 close bitmap；完成、失败、取消或超时均终止该 Worker。完整查看保留原始已验证 bytes，因此动画不会被派生缩略图替代。

`createImageBitmap` 对动画只产出默认图或首帧，不是完整动画播放器。因此本实现只用它验证/生成缩略图，完整图的本地 Blob 保留原动画容器，由查看用的 `<img>` 播放；DOM 仍必须处理后续图片错误。[WHATWG ImageBitmap 规范](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)

## 实施预算与边界

这些是本次明确落实的应用预算，不是对浏览器、GPU 或系统进程 RSS 的保证。

| 归属           | 有界规则                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Client 读取    | 10 MiB；2 个实际读取、12 个等候；15 秒包括排队、网络和 hash；重定向拒绝                                                         |
| 预检           | 单边 16,384；画布 32,000,000 像素；最多 256 帧；画布像素×帧数最多 64,000,000；APNG 独立 poster 另计一张画布；结构最多 65,536    |
| 浏览器 adapter | 一个实际 read/decode pipeline；最多 24 个等候；30 秒总期限，排队也计时；用户打开原图优先于尚未开始的缩略图                      |
| 完整图         | 最多 1 个 live lease；重新打开重新 GET，不跨 open 保存原 bytes                                                                  |
| 缩略图         | 最多 24 个 live lease；单边 256；单张 PNG 最多 512 KiB，总计最多 8 MiB；超限明确 BUSY/TOO_LARGE，不隐式淘汰仍被 View 引用的 URL |

预检采用 32M 画布与 16,384 单边，代替审计阶段尚未定案的 16M/8192 建议，让常见 24MP 图片和长截图仍可使用；32M RGBA 像素约为 128MB 的概念当量，不包含 codec 临时结构、色彩信息或浏览器开销。动画成本按整画布计而不是只计小变化矩形，不通过静默取首帧来回避动画预算。

同时仅有一个 **Worker pipeline**，不等于整个浏览器只能有一个底层解码活动：完整 `<img>` 可以正在播放，另一 Worker 可以派生一个缩略图。移除 DOM/撤销 URL 与 Worker.terminate 不构成对浏览器内部任务立即停止或 RSS 立即下降的承诺。实现保证应用不继续保留旧 lease、不派发无界工作，也不以 `Promise.race` 假装不可取消的任务已经释放槽位。

支持 PNG/APNG、8-bit baseline/extended sequential/progressive JPEG、GIF87a/89a、VP8/VP8L WebP 和动画 WebP。12-bit/lossless/hierarchical/DNL JPEG 与 GIF Plain Text 明确不支持。EXIF 可以交换实际解码宽高，允许这种方向变化，但不接受其它尺寸冲突。压缩流错误仍由真实 decoder 拒绝；不能把预检通过宣传为任意恶意图像的安全保证。

格式依据：[PNG/APNG](https://www.w3.org/TR/png/)、[GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt)、[WebP RIFF](https://developers.google.com/speed/webp/docs/riff_container)、[JPEG T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)。

## 权限与生命周期

读取权限仍是既有 **paired-device Host 范围**，没有新增 session ACL。来源匹配用于阻止 UI 串会话、旧回执和伪造出现位置，不替代服务端授权。Client 在撤权、换凭据、Host 身份变化和显式 disconnect 时 fence 旧读取；撤权后新的有效 hello 才能重新开放读取。普通同 Host 的短暂 WS 断线不错误地禁用独立 HTTP 读取。

adapter 的 invalidate/dispose 已接到产品组合根的运行时、Host 身份与连接生命周期。Client 的 HTTP reader 可以独立于短暂 WS 断线工作，但本次产品 UI 明确要求当前连接及 Host 身份匹配：断线关闭预览并清理旧资源，重连后重新读取，不承诺离线图片缓存。服务端没有发来撤权通知之前，已显示本地图不会凭空消失；本地 URL 撤销也不能收回用户已经看见或保存的信息。

caption 来自原 ArtifactRef，不以 Content-Disposition 作为身份。同 hash 多次出现仍有不同 occurrence key。原上传 unknown 回执继续由上传 owner 处理，预览成功不能当作 upload 确认或偷偷修改草稿。

图片集合来自当前 canonical draft / message，不依据名字查找或自行复制业务事实。草稿输入文字导致的 revision 更新不会无谓关图，附件集合变化会重新核对；历史图片以 message ID、seq 和 image ordinal 关联。归档后的已加载历史仍可读，不通过新 Run 的准备 guard。未确认的上传不加入查看集合。

缩略图按可见集合加载，每集合最多 12 项，不在打开会话时读取全部历史。原生 IntersectionObserver 观察实际图片条目而非整条长消息，MutationObserver 同步历史分组变化后替换的 DOM 节点。打开图集时暂停背景缩略资源，关闭、屏外或卸载时释放。模型 retain/release 兼容 React StrictMode 的 setup/cleanup 重放；DOM 图片失败必须匹配渲染时的精确资源状态，晚错误不能伤害新的同 key 图片。

## 实际验证记录

- Client：15 tests / 196 assertions，包含真实隔离 Host 的缺失/错误/撤销凭据、精确 bytes 和断开重连；0 Run。对应提交 `ba8ec98`。
- 纯 gallery owner：40 tests / 231 assertions，包括 100 次快速切换、A-B-A、晚成功/失败、来源移除、校验回调重入和释放；0 写。对应提交 `ca07618`。
- 预检：15 tests / 7,920 assertions，包括八个本地生成真实样本的每一个截断前缀、预算边界和确定性变异。对应提交 `8036536`。
- 浏览器资源测试：10 tests / 140 assertions，覆盖 lease 计数、总字节、实际单飞、24 个等待、优先级、取消/超时、失效、晚返回、预检先于 decode 和方向交换。测试中的 pending Promise 先注册普通结果观察，再触发 abort/resolve，最后断言；避免 Bun 的 pending `.rejects` matcher 阻塞触发它的后续语句。
- `bun scripts/verify-image-resources.ts` 真正构建并运行浏览器 Worker，不把 mock decode 当成功。8 个格式样本全部可显示；GIF/APNG/animated WebP 的截图哈希分别实际捕获 2 帧。16 个创建 URL = 16 个撤销，17 个 Worker = 17 个终止，最大 live Worker 1，结束时 0，pageerror 0。

上述底层资源单元的 scoped strict ESLint、根 TypeScript、Prettier 与浏览器 probe 均通过。对应提交：Client `ba8ec98`、gallery owner `ca07618`、预检 `8036536`、浏览器资源 `3c78eb6`、可见缩略图 `ef24484`、精确 DOM 错误归属 `92e33be`、canonical 来源 `66f3c32`、React 模型 `f4e8fcf`；共享控件提交为 `hbar-ui` 的 `abe2b89406`，根 gitlink/布局守卫为 `119ce19`。

可复现 probe：[脚本](../scripts/verify-image-resources.ts)、[隔离入口](../e2e/fixtures/image-resources/main.ts)、[原创红/绿像素 fixture](../tests/fixtures/image-resource-fixtures.ts)。结果在 ignored [observations.json](../artifacts/image-resources/observations.json) 和同目录逐帧截图。该页面**没有 Host、配对 token、完整产品 UI、native WebView 或模型执行**，不能拿它替代最终“上传→打开→发送→刷新回看”的验收。

此次恢复了一个连续未更新、为空且无人独占的 `.git/index.lock`：重复检查后移动为 `.git/index.lock.image-client-20260926-1632.bak`，未删除其内容或清理其它任务状态。测试里一次错误的 pending matcher 排序造成停滞，仅在核对 PID、parent、启动时间与完整 argv 后停止自有 PID 820，修正测试顺序后通过；不是产品取消逻辑失败。保护进程没有被停止，既有禁止清理的临时目录保留。

## 产品接线验收

生产资源为 3,088 modules，`index-SEhgHp44.js` / `index-B3vi-x2q.css`，独立 Worker `image-decode-worker-nSrNOGE4.js`；已有大 chunk 提示仍在。使用现有 debug launcher 和新 Host/Web 资源，不重建 exe。

- [真实 Host E2E](../e2e/image-viewer.spec.ts)：中英各一轮，1440/900/320；同名但不同 hash/尺寸两图，左右键、Tab、Esc 还焦，503 后只重读，独立移除、显式发送、刷新与外部归档后原消息回看。每语言一次真实 local-fixture Run，没有商业模型。原 intake/unknown 回执及运行中 Queue/Stop 测试一同回归。
- [容量及晚返回 E2E](../e2e/image-viewer-boundaries.spec.ts)：真实 12 张上传、320 图集逐项环绕与自动露出；第 13 张明确拒绝但保留原稿。额外真实坏压缩流 decode 失败、具名降级和移除，延迟 GET 在关闭及切换会话后不能重新打开。该文件不发送 Run。
- [实际 React/DOM 生命周期](../scripts/verify-image-entry-lifecycle.ts)：en/zh × 1440/320，4/4。实际产品消息组件在开发 StrictMode 中经历工具结果配对、图片分组拆分及合并；canonical 集合不变，新节点仍能在旧节点完全屏外时触发读取。每场景 8 acquire = 8 revoke，0 live、0 重复释放、0 剩余订阅、0 业务命令/HTTP。它使用本地合成 Blob adapter，不能替代 Host 或原生验收。
- [Windows 原生脚本](../scripts/verify-desktop-images.ts)：en/zh × 900×600/1440×960，4/4。通过真实 Add→file chooser 上传，原图 natural size 为 480×240 / 240×360，64px 草稿图、导航/焦点、失败恢复、移除、发送与刷新后的历史 hash 均通过。共 8 uploads、4 个显式 local-fixture Run、116 GET；16 次有意注入的 503 在 native console 留有记录，pageerror 为 0，不能称 console 无错误。

原生证据及清理在 [verification.json](../artifacts/desktop-images/native/hbar-native-session-images-dClaSd/verification.json) / [cleanup.json](../artifacts/desktop-images/native/hbar-native-session-images-dClaSd/cleanup.json)，附 32 张截图。仅新建的测试 profile/workspace 已删除，自有 desktop 14208、supervisor 24052、Host 10132 按精确 PID、父进程、创建时间和 argv 确认后退出，9443 已释放；保护 PID 及旧 settings 临时目录未查询或清理。

可复现命令：先 `bun run build`，设置独立 `HBAR_E2E_PORT` / `HBAR_E2E_HOST_PORT` 后运行四个 Playwright 文件；生命周期运行 `bun scripts/verify-image-entry-lifecycle.ts`。原生先按 `using-vsdevcmd` 导入 MSVC 环境，再运行 `bun scripts/build-host.ts`，设置 `HBAR_NATIVE_EXPECTED_ASSET` 为实际当前构建 JS 文件名后执行原生脚本。脚本拒绝已有 9443 listener、旧 bundle 或不能证明归属的进程，不附着用户实例。

最终联合 Playwright **8/8 passed，40.4s**：上述两图片文件，加原 `composer-attachments` / `composer-running-actions`，使用 45131/45132；真实 Host 关闭时 Vite 输出预期 WS ECONNRESET，未当作页面错误或忽略失败断言。结果见 [final-e2e.log](../artifacts/image-viewer-product/final-e2e.log)。真实 IO/StrictMode 生命周期 4/4、原生 4/4、`git diff --check`、本单元严格 lint / 根 typecheck / Prettier 均通过。

完整 `bun run check` 已执行：native build、全仓 strict lint、typecheck 通过；**2,184 pass / 1 fail，24,135 assertions，365 files**。唯一失败仍为此前存在、且本单元未改的 `QuoteAuthentication.tsx:native-visible-control`，由 `tests/lumen-canonical-boundary.test.ts` 报告；不将其扩写成图片失败，也不能声称全仓全绿，见 [check.log](../artifacts/image-viewer-product/check.log)。首轮检查曾先停在新 E2E 的 `no-unsafe-finally`；保留精确目录安全 guard 并抽到独立 cleanup 函数后，已重新执行上述完整检查。容量测试首轮还曾因测试漏展开 320 侧栏而超时，修正真实入口后重跑通过，原失败截图保留。

共享包正式 pnpm 工作流要求 12.3.4，本机 11.19.0 被版本门禁阻止；未升级依赖或宣称正式生成流程通过。已有依赖下的直接 Vitest（33 tests）、包 TypeScript/声明构建、共享 library 构建及 8 组控件浏览器交互通过。
