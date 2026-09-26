# 会话内查找：参考证据与实现边界

2026-09-26，参考 cc-haha `e28d0a65`，模型基础为 hbar `702d67f`，UI 接线基于 `567417c`。本闭环是当前会话内的只读查找：入口、键盘、可读正文投影、高亮、离屏定位与范围提示。全局跨会话搜索是另一项能力，不以此替代；也不意味着整体 Desktop 体验迁移已经完成。

## 已实际渲染的参考

隔离 fixture 直接挂载原 `MessageList`、`FindInPageModal` 与快捷键，用合成的已加载历史驱动；没有原 Host、Electron 或真实模型。

- Ctrl/Cmd+F 打开右上方非模态查找条；输入、计数、上一项、下一项、关闭在一个横向语义行内。250ms 输入等待，Enter/Shift+Enter 与上下按钮循环定位。
- 会话索引查找当前已加载 user/assistant 正文及流式正文，不包含工具输入输出或 thinking；DOM 虚拟化之外的正文也能定位。不会为搜索自动请求更早历史。
- 已可见工具面板的 DOM 匹配在原版有优先级，它与会话索引不是合并的全局结果。hbar 的会话入口必须明确范围，不能暗示查了侧栏、编辑器、隐藏工具或所有历史。
- 切换会话保留查询，重新计算新会话结果；关闭清空查询与高亮。内容变化约 80ms 刷新。

证据：[英文 1440 首项](../artifacts/session-find-reference/first-en-US-1440.png)、[中文 320 空查询](../artifacts/session-find-reference/empty-zh-CN-320.png)、[观察数据](../artifacts/session-find-reference/observations.json)。来源为 `desktop/src/components/search/FindInPageModal.tsx`、`components/chat/MessageList.tsx` 和 `hooks/useKeyboardShortcuts.ts`。

原实现存在不能照搬的缺陷：查找条固定 382px，320 视口的左端为 -74px；文档 scrollWidth 仍为 320，所以只检查根溢出会漏掉裁切。原 Esc 后焦点到 BODY；再次 Ctrl+F 不重新聚焦已打开的输入。原索引匹配原 Markdown，查找 `**markedneedle**` 显示 1/1，但渲染正文没有相应高亮。这些是实际复现，不是建议凭空增加的功能。

## 产品入口与布局

- 会话标题区增加一个具名查找图标，Ctrl/Cmd+F 保持为快捷入口。参考原版只有快捷键；显式图标是本次有意的可发现性改进，不声称原版也有该按钮。
- 紧凑非模态查找条包含输入、计数、上一处、下一处和关闭。Enter/Shift+Enter 循环；再次 Ctrl/Cmd+F 重新聚焦并选中查询；Esc 清空并回到同一会话仍有效的原焦点或查找按钮。
- 查找条作为 conversation header 的正常流内容，靠右、宽度有界；窄屏标题与六个工具按钮自然分成两行，不挤掉命中区域。初次 overlay 候选在真实 320 视口拦住“加载更早消息”并遮挡首项，因此改为预留自身内容高度，未使用固定高度或截图坐标。
- 入口只服务当前可见会话。Files 编辑器、设置、非活动标签、原生弹窗、菜单和输入法组合优先；查找不会把 Esc 变成关闭旁边工具的动作。切 A→B→A 保留查询并重新索引，旧会话不能回写焦点或定位。
- 所有文案、提示和格式化计数由 Web Host 的具名中英文契约提供；复用 `sm` 图标等级。查询过长、部分历史失败、容量限制、目标不可用或高亮不能精确映射均就近显示，不暗示完整搜索成功。

## 可读正文与定位

`session-find-text.ts` 复用实际 Markdown 渲染的 GFM、remark→rehype 和 sanitize 配置，生成可读文本、精确 DOM 文本流及两者的偏移映射。普通文本按显示方式合并空白，代码保留空白；表格和块边界使用不可高亮的分隔符。链接地址、图片 alt、生成的脚注导航、工具、thinking、输入草稿、计划反馈与动作按钮不进入索引。历史计划正文及前后说明仍可搜索。

`session-find-source.ts` 从公开 timeline 派生已加载正文，不依赖虚拟列表里恰好挂载的 DOM，也不隐藏渲染整个历史。按不可变消息/流对象缓存投影；查询变化不重新解析正文。来源预算在解析前检查，超长 Markdown 按整行跳过并提示限制，不截断 fence/HTML 后假装它是另一段显示文字。解析异常清除该行旧投影并提示范围不完整；这不宣称修复了原 Markdown renderer 对任意深度输入的既有限制。

共享 `LumenConversation` 公开 `scrollTarget` / `onScrollTargetResult` / `followLatest`：以会话 key、稳定 message ID 和独立 request ID 定位，包括未挂载的目标行；不把搜索结果序号当作实际列表下标。查找期间关闭自动追随末尾，流式计数变化不反复跳回选中项。显式上一处/下一处才产生新的定位意图。请求、来源、关闭、卸载或用户滚动会取消有界定位。

CSS Highlight 只映射已挂载且完整文本流核对通过的正文；每次绘制每段只建立一次文本节点索引，再二分映射有界匹配。它不改写 DOM 或把正文包成大量 mark。定位就绪后，仅滚动当前 conversation 内的匹配祖先，包括确实横向溢出的表格；不会滚动 document 或旁边工具。关闭/卸载撤下自己拥有的 Highlight、observer、定时器和帧；缺少浏览器支持时显示真实提示。

## 已实现模型

[conversation-find.ts](../packages/app-runtime/src/conversation-find.ts) 是基于 Zustand 的只读 ViewModel，公开输入仅是具名 scope、row、正文 segment 和已加载历史边界。它不读取 Host、DOM、文件或凭据，没有 Run、上传或持久化写能力。

- query 等待 250ms；正文刷新最多合并到一个 80ms 定时任务，连续流式内容不会反复推迟到永远不执行。
- scope 变化保留查询、重置当前项，旧 scope 的输入/步进被拒绝。真正离开会话传 null 才清空查询；切换期间仍须提供新 scope，不能以 null loading 误清查询。
- 匹配是非重叠的、转义字面量、locale-independent Unicode simple case-insensitive；保留原 UTF-16 offsets，不先 lowercase 后把扩展字符偏移错误映射回正文。不提供正则或完整 Unicode case folding 选项。
- 选中位置用 row/segment ID 与 offsets 识别；补入更早消息不把当前项跳到别处。仅明确导航或目标改变递增 navigationRevision，流式更新不要求 UI 重新滚动。
- 查询改变立即撤下旧计数和可执行目标，晚回调、关闭、dispose 与订阅重入均不能恢复旧结果。重开为空查询。
- 搜索最多 1,000 matches，1,000 rows、4,096 segments、8,000,000 UTF-16 units；查询最多 256 units。超额明确 truncated / QUERY_LIMIT，不伪装为完整的“没有匹配”。保留的超额查询也只到 257 units。
- 来源先捕获到有界派生集合；重复 row ID 或同 row 内重复 segment ID 失败并清理歧义目标。它不是第二份 canonical 会话历史，宿主仍负责将真实可读正文投影到该输入。

## 验证

`tests/conversation-find.test.ts` 14 tests / 104 assertions；与 `tests/session-timeline.test.ts` 联跑为 17 tests / 138 assertions。覆盖空/一项/多项、双向环绕、Unicode 原偏移、字面量 metacharacter、重复身份、原 source 被修改、快速输入/晚回调、切会话、流式合并、历史 prepend、三种内容预算及 query/match 边界、订阅关闭与 dispose 重入。严格 scoped ESLint、根 TypeScript 和 Prettier 通过。此模型提交没有运行完整 Web 或原生验收，因为尚未接入产品；此前全仓的认证控件失败不被此次单测结果覆盖。

UI 定向七组测试为 **116 pass / 882 assertions / 0 fail**：模型、键盘、正文投影、查找条、历史计划、计划卡和消息正文。正文测试核对实际 SSR 文本流，覆盖空白、实体、Unicode、GFM、脚注、代码、分段计划、流式替换、来源容量及深层解析失败；键盘测试覆盖作用域、组合键、IME、编辑器/按钮与取消滚动意图。

真实 Edge 的独立 painter 调度探针 **5/5 pass**：基准确实滚动，随后证明 reveal→用户滚动→cancel→下一帧只绘制不拉回；更换 query/scope 后旧请求不能滚动；dispose 清理排队帧，人工投递已取消的晚回调也不能恢复 Highlight。它导入真实 painter，但不是 Host 或原生应用，不能把它描述为自然键盘事件精确复现了一个帧间竞争。[调度证据](../artifacts/session-find/paint-observations.json)。

最终构建为 `index-DyWvAnPw.js` / `index-P-hWc5BP.css`，3105 modules。Web 构建和 Windows MSVC 环境中的 Host/Web 资源构建成功；仍有既有大 chunk 提示，未通过放宽阈值隐藏它。使用既有 debug launcher，**未重编译 Tauri 启动器**。

| 验证层                | 实际范围                                                                                                                                              | 结果           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 真实临时 Host + Edge  | 中英 1440/320、180 条 canonical fixture 历史、分页、离屏命中、Enter 环绕、IME 事件边界、重复快捷键、A→B→A、Files/设置/弹窗优先级、慢流与草稿/附件保留 | 6/6，56.8s     |
| 会话工具导航回归      | 中英各自 1440/900/390/320，六个入口均可访问，正常流、不遮挡，实际请求最终资源                                                                         | 2/2，15.5s     |
| 真实 Windows WebView2 | 中英 × 900×600/1440×960，实际窗口尺寸；121 离屏行、仅手动加入的 64 行、可见 Markdown 与原标记排除、横向表格、重复 Ctrl+F、Esc 回原草稿                | 4/4，20 张截图 |

浏览器扩展场景中，320 表格的真实宽度为 230、内容宽度为 1108，命中最右列后 scrollLeft=878；每个 Range 片段的中心实际命中原消息，所有横向裁剪祖先包含该匹配，document、composer 和相邻代码块的位置不变。普通代码块按生产 `pre-wrap/anywhere` 换行，不注入 CSS 伪造横滚。原生场景采用 192 列，内容宽度 2510，实际视口宽 853/864，命中后横移 1657/1646。

三类最终交互检查的 page errors 与 console warnings/errors 均为空。主线程亲自查看宽窄与原生截图：[中文 320 表格](../artifacts/session-find/browser/table-far-right-zh-CN-320.png)、[原生中文 900 离屏命中](../artifacts/session-find/native/hbar-native-session-find-i1bSeq/01-offscreen-121-zh-CN-900.png)、[原生中文 1440 Markdown](../artifacts/session-find/native/hbar-native-session-find-i1bSeq/02-readable-markdown-zh-CN-1440.png)。完整数值见 [浏览器事实](../artifacts/session-find/browser/stream-zh-CN.json) 与 [原生报告](../artifacts/session-find/native/hbar-native-session-find-i1bSeq/verification.json)。原生是本功能定向验证，不冒充全套 desktop smoke。

副作用边界：浏览器四个历史场景各有一次显式 fixture 附件上传、0 Run；两个流式场景各通过公开入口明确提交一次本地 demo Run。查找自身业务写命令为空。原生启动前预种四会话共 720 条合成 canonical 消息，关闭 seed Kernel 后再启动独立桌面；模型/预算设定是显式隔离 fixture 配置。原生最终 **0 Run、0 Goal、0 上传**，未调用商业模型。

安全清理：每次原生启动都核对新 PID、父链、创建时间与完整 argv，仅停止该次所属进程；三次原生尝试的临时 profile/workspace 均已清理，保护的旧用户 PID 未查询或停止。浏览器首个红候选超时遗留的 `hbar-session-find-0K63xq` 与 `hbar-session-find-Gm1pSR` 临时目录保留未额外删除，后续 fixture 正常释放。

已保存的中间红证据包括原 overlay 遮挡、旧 bundle 文案不一致，以及原生 fixture 的两处错误假设：64 列在宽窗口会换行并不必然溢出；项目树 bootstrap 自动展开会改变按钮名称。后两只修验收准备，最终依靠真实 overflow 预条件和稳定 group/aria 状态，不用强制点击或固定大等待。

根严格 lint、TypeScript、内容/图标/流布局 guard 与变更格式检查通过。原工具 SSR 的两条五按钮假设更新后，`session-workspace.test.tsx` **4/4、75 assertions** 通过；最后涉及该更新的 scoped lint 与根 TypeScript 再次退出 0。独立共享 viewport 的验证与正式 pnpm engine 阻断见[定位契约记录](desktop-conversation-target.md)。

**全仓门禁并非全绿。** `bun run check` 跑到了基础测试，发现上述两条旧按钮断言和一项既有认证边界问题；修正本功能断言后重跑完整 `bun test tests --timeout 20000` 为 **2306 pass / 1 fail / 25025 assertions，370 files，271.70s**。唯一剩余失败是 `tests/lumen-canonical-boundary.test.ts` 对 `authentication/QuoteAuthentication.tsx:native-visible-control` 的断言；该组件没有本次差异，路径最后提交为 `bf73066a56`，没有借机修改或混入提交。原生资源、查找与导航的定向验证不覆盖该认证门禁，不能以本功能通过宣称全仓 check 成功。
