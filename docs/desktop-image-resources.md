# 图片回看的读取、解码与资源归属

这是 [原组件图片审计](desktop-image-viewer-entry-audit.md) 的基础实现记录，**尚不是产品图集交付记录**。原参考交互仍包括草稿缩略图、独立移除、发送后回看、左右环绕、关闭还焦和窄屏可达；本文的 Client、纯 owner、预检及浏览器资源 adapter 为这些入口提供真实能力。当前尚未完成 composer/message 接线、完整 UI 截图和 native WebView 验收。

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

adapter 提供 invalidate/dispose 来撤销本地 URL 和旧请求；产品组合根还须把这些动作接到运行时和连接生命周期。服务端没有发来撤权通知之前，已显示本地图不会凭空消失；本地 URL 撤销也不能收回用户已经看见或保存的信息。

caption 来自原 ArtifactRef，不以 Content-Disposition 作为身份。同 hash 多次出现仍有不同 occurrence key。原上传 unknown 回执继续由上传 owner 处理，预览成功不能当作 upload 确认或偷偷修改草稿。

## 实际验证记录

- Client：15 tests / 196 assertions，包含真实隔离 Host 的缺失/错误/撤销凭据、精确 bytes 和断开重连；0 Run。对应提交 `ba8ec98`。
- 纯 gallery owner：40 tests / 231 assertions，包括 100 次快速切换、A-B-A、晚成功/失败、来源移除、校验回调重入和释放；0 写。对应提交 `ca07618`。
- 预检：15 tests / 7,920 assertions，包括八个本地生成真实样本的每一个截断前缀、预算边界和确定性变异。对应提交 `8036536`。
- 浏览器资源测试：10 tests / 140 assertions，覆盖 lease 计数、总字节、实际单飞、24 个等待、优先级、取消/超时、失效、晚返回、预检先于 decode 和方向交换。测试中的 pending Promise 先注册普通结果观察，再触发 abort/resolve，最后断言；避免 Bun 的 pending `.rejects` matcher 阻塞触发它的后续语句。
- `bun scripts/verify-image-resources.ts` 真正构建并运行浏览器 Worker，不把 mock decode 当成功。8 个格式样本全部可显示；GIF/APNG/animated WebP 的截图哈希分别实际捕获 2 帧。16 个创建 URL = 16 个撤销，17 个 Worker = 17 个终止，最大 live Worker 1，结束时 0，pageerror 0。

本资源单元最后一次 scoped strict ESLint、根 TypeScript、Prettier、浏览器 probe 均通过；Web production build 通过（3076 modules，已有大 chunk 提示仍在）。这里没有运行或宣称完整仓库 check、产品 gallery E2E 或 native smoke 已通过。资源接线完成后仍需执行这些门禁。

可复现 probe：[脚本](../scripts/verify-image-resources.ts)、[隔离入口](../e2e/fixtures/image-resources/main.ts)、[原创红/绿像素 fixture](../tests/fixtures/image-resource-fixtures.ts)。结果在 ignored [observations.json](../artifacts/image-resources/observations.json) 和同目录逐帧截图。该页面**没有 Host、配对 token、完整产品 UI、native WebView 或模型执行**，不能拿它替代最终“上传→打开→发送→刷新回看”的验收。

此次恢复了一个连续未更新、为空且无人独占的 `.git/index.lock`：重复检查后移动为 `.git/index.lock.image-client-20260926-1632.bak`，未删除其内容或清理其它任务状态。测试里一次错误的 pending matcher 排序造成停滞，仅在核对 PID、parent、启动时间与完整 argv 后停止自有 PID 820，修正测试顺序后通过；不是产品取消逻辑失败。保护进程没有被停止，既有禁止清理的临时目录保留。
