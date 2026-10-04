# 中文回复链接与会话连续性

CC `e28d0a65` 的 `desktop/src/lib/urlBoundary.ts` 和 `markdownAutolink.ts` 针对中文正文中的裸 HTTP(S) URL 使用独立边界；`MarkdownRenderer` 注册 `cjkAwareAutolink`。中文逗号、句号和 authority 后的文字不成为 URL，合法中文路径/查询保留。参考 `ba7e3b00` 和 `d7081c42` 的源码目的为链接可用性；本切片不迁移 CC 的文件引用或 workbench browser 路由。

在 hbar `346269ff` 的真实本地模型截图中，用户 literal 链接正确，但助手 Markdown 将 `https://example.invalid/docs，然后继续。` 整段变成 URL。新增渲染测试与真实浏览器断言都先复现失败，目标含 `%EF%BC%8C%E7%84%B6%E5%90%8E%E7%BB%A7%E7%BB%AD%E3%80%82`。历史 `ec6556c0` 建立的 `remark-gfm`/sanitize 共享渲染与 Find 管线保留了上游宽泛 autolink 边界；不能归因于上一轮用户 literal 修复。

新增 `session-markdown-autolink` 在 sanitizer 前通过 HAST 的来源偏移识别裸 HTTP(S) autolink，将其按已验证的字面 URL 模型拆成 anchor 与原文节点。来源以 `[` 或 `<` 开始的显式 Markdown/角括号链接不重写；代码、链接内部、原始 HTML 及文件路径不变。HTML sanitizer 仍在最终边界，非法协议不升级为可点击地址。密集子节点一次线性重建，不逐项 splice；2,000 连续链接保持完整文本。Find 传递原始 VFile source 并共用该管线，保留完整 UTF-16 DOM 文本映射，不引入另一个索引。

共享 `MessageMarkdown` 的 HTTP(S) anchor 同时使用 `target=_blank` 与 `noopener noreferrer`，避免普通外链导航离开 Web 聊天页面。非 HTTP(S) 和 fragment/footnote anchor 沿原导航语义，code/Plan 的组件组合保留。没有新增宿主文案、图标、网络请求或固定布局。本切片是可点击目标与 Web 会话连续性修复，不声称已提供原生系统浏览器、CC localhost 内置预览、inline-code/file link 路由。

## 证据与验证

`artifacts/prose-url-v22/cc-original-prose-url-320.png` 与 `reference-report.json` 来自直接导入未修改 CC MarkdownRenderer/原主题的隔离 fixture，正文包含中文裸 URL、authority 后紧邻中文、中文路径与纯命令。原 link callback 捕获 `https://example.invalid/docs`，而后续标点在 anchor 外，无页面错误。该 callback 是夹具，不是 CC 真实 Host/系统浏览器；只允许自有 localhost 请求，无 profile/paid-provider/参考源修改。

生产 Web `index-B1YPQdzx.js` 与未变 CSS `index-D-gDr7-e.css` 上真实临时 Host 流程通过：原文发送/复制/Find→助手正确 href→窄屏点开外链→关闭 popup→仍在原页且未发草稿保留（5.9s）。目标 `example.invalid` 由 Playwright route 在本地应答，没有网络访问。原富文本 Find 工具/模态/流式事实、表格滚动和代码尾部流程也通过（17.6s），组合 2/2（33.3s）；截图位于 `artifacts/prose-url-v22/final/`。将截图移到实际 click、关闭外页并恢复链接焦点之后，再跑原文与链接完整流程通过（6.2s），该焦点截图位于 `artifacts/prose-url-v22/click-final/`。

20 个链接边界/原文/复制/引用模型测试通过，92 assertions，包含中文标点/路径、多链接、显式目标不变、脚本协议、代码不链接和 dense 内容。修改范围严格 TypeScript、零警告 ESLint、Prettier、内容/图标 guard 与 diff 检查通过；无 CSS/布局修改。旧全体 Lumen SSR 仍受只读 submodule 缺少 `prop-types` 限制，未安装或改变依赖；本轮纯 ReactMarkdown 渲染测试可运行。Web build 保留已有大 chunk 警告。未运行全仓/native 门禁，未写主工作区或推送。自有 Host 与 49169/49170 均已停止，停止 Host 产生的 Vite `ECONNRESET` 与页面错误分开记录。
