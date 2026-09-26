# 会话内查找：参考证据与实现边界

2026-09-26，参考 cc-haha `e28d0a65`，hbar 基线 `7191ade`。本记录的当前交付范围仅为本地只读查找模型；**产品查找入口、高亮、虚拟列表定位尚未接线**，不能称 Ctrl/Cmd+F 已可用。全局跨会话搜索是另一项能力，不以此替代。

## 已实际渲染的参考

隔离 fixture 直接挂载原 `MessageList`、`FindInPageModal` 与快捷键，用合成的已加载历史驱动；没有原 Host、Electron 或真实模型。

- Ctrl/Cmd+F 打开右上方非模态查找条；输入、计数、上一项、下一项、关闭在一个横向语义行内。250ms 输入等待，Enter/Shift+Enter 与上下按钮循环定位。
- 会话索引查找当前已加载 user/assistant 正文及流式正文，不包含工具输入输出或 thinking；DOM 虚拟化之外的正文也能定位。不会为搜索自动请求更早历史。
- 已可见工具面板的 DOM 匹配在原版有优先级，它与会话索引不是合并的全局结果。hbar 的会话入口必须明确范围，不能暗示查了侧栏、编辑器、隐藏工具或所有历史。
- 切换会话保留查询，重新计算新会话结果；关闭清空查询与高亮。内容变化约 80ms 刷新。

证据：[英文 1440 首项](../artifacts/session-find-reference/first-en-US-1440.png)、[中文 320 空查询](../artifacts/session-find-reference/empty-zh-CN-320.png)、[观察数据](../artifacts/session-find-reference/observations.json)。来源为 `desktop/src/components/search/FindInPageModal.tsx`、`components/chat/MessageList.tsx` 和 `hooks/useKeyboardShortcuts.ts`。

原实现存在不能照搬的缺陷：查找条固定 382px，320 视口的左端为 -74px；文档 scrollWidth 仍为 320，所以只检查根溢出会漏掉裁切。原 Esc 后焦点到 BODY；再次 Ctrl+F 不重新聚焦已打开的输入。原索引匹配原 Markdown，查找 `**markedneedle**` 显示 1/1，但渲染正文没有相应高亮。这些是实际复现，不是建议凭空增加的功能。hbar 接线应约束条宽、可靠还焦，并让正文文本投影与可高亮内容一致。

## 已实现模型

[conversation-find.ts](../packages/app-runtime/src/conversation-find.ts) 是基于 Zustand 的只读 ViewModel，公开输入仅是具名 scope、row、正文 segment 和已加载历史边界。它不读取 Host、DOM、文件或凭据，没有 Run、上传或持久化写能力。

- query 等待 250ms；正文刷新最多合并到一个 80ms 定时任务，连续流式内容不会反复推迟到永远不执行。
- scope 变化保留查询、重置当前项，旧 scope 的输入/步进被拒绝。真正离开会话传 null 才清空查询；切换期间仍须提供新 scope，不能以 null loading 误清查询。
- 匹配是非重叠的、转义字面量、locale-independent Unicode simple case-insensitive；保留原 UTF-16 offsets，不先 lowercase 后把扩展字符偏移错误映射回正文。不提供正则或完整 Unicode case folding 选项。
- 选中位置用 row/segment ID 与 offsets 识别；补入更早消息不把当前项跳到别处。仅明确导航或目标改变递增 navigationRevision，流式更新不要求 UI 重新滚动。
- 查询改变立即撤下旧计数和可执行目标，晚回调、关闭、dispose 与订阅重入均不能恢复旧结果。重开为空查询。
- 搜索最多 1,000 matches，1,000 rows、4,096 segments、8,000,000 UTF-16 units；查询最多 256 units。超额明确 truncated / QUERY_LIMIT，不伪装为完整的“没有匹配”。保留的超额查询也只到 257 units。
- 来源先捕获到有界派生集合；重复 row ID 或同 row 内重复 segment ID 失败并清理歧义目标。它不是第二份 canonical 会话历史，宿主仍负责将真实可读正文投影到该输入。

## 验证与后续必需项

`tests/conversation-find.test.ts` 14 tests / 104 assertions；与 `tests/session-timeline.test.ts` 联跑为 17 tests / 138 assertions。覆盖空/一项/多项、双向环绕、Unicode 原偏移、字面量 metacharacter、重复身份、原 source 被修改、快速输入/晚回调、切会话、流式合并、历史 prepend、三种内容预算及 query/match 边界、订阅关闭与 dispose 重入。严格 scoped ESLint、根 TypeScript 和 Prettier 通过。此模型提交没有运行完整 Web 或原生验收，因为尚未接入产品；此前全仓的认证控件失败不被此次单测结果覆盖。

下一闭环仍必须完成可读正文投影、独立 View、入口与键盘上下文、CSS Highlight 生命周期、通过共享 viewport 的稳定 message ID 定位、当前消息范围和已加载历史提示。不能以 DOM-only find 代替离屏消息查找，不能为了搜索关闭虚拟化或展开/重挂整个会话。中英宽窄屏、长历史、流式更新、换会话、Esc/还焦、无副作用以及真实原生窗口须重新验收。
