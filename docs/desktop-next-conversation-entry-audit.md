# 下一会话入口：工具结果就近复制（只读审计）

审查日期：2026-09-26。参考仓库 HEAD `e28d0a653481ef41b7a329411eeb2f0fd5656731`；hbar 审查基线 HEAD `58b678f22350561d179825ea522164584f21a1c8`，并读取当前工作树。会话消息组件本身没有本轮生产改动；外部共享样式及本轮归档执行准备在并行开发，不能用本报告宣布整仓验收完成。本文只提出下一项独立闭环，尚未实现该入口。

## 结论与优先级

在“已有 hbar 公共能力、不需要新增 Host 安全／持久化合同”的候选中，优先做 **已显示工具结果的就近复制**。它应位于展开后的“输出”标题旁，复制该调用的完整已加载 `tool_result.text`，不是消息底部“复制回复”的别名，也不执行或重试工具。

理由是：会话中代码、测试输出、命令失败信息经常需要带到下一次讨论或外部诊断。当前工具结果已经可读取，却必须手动框选；长输出还有 12,000 字符的显示窗口。已有助手回复复制特意排除工具载荷，因此用户不能用底部复制绕过此缺口。参考在同一阅读位置已有明确 Copy → Copied 反馈，且本次用原组件和真实浏览器剪贴板验证了这一动作。

它比以下候选更适合紧接当前子功能独立交付：

- 图片材料预览：已确认存在鉴权的 `/api/artifacts/:sha256` 和 `HbarClient.artifactUrl`，不是完全缺后端；但直接把 URL 填入图片不足以证明不同 origin／原生令牌鉴权、安全 MIME 与解码内存预算。需要独立 typed 读取／资源释放设计，本次不把旧图片截图当作已闭环能力。
- 消息选区“加入对话”：cc 原实现保留 `chat-selection`、`chat://role/messageId` 与 quote。hbar 现有文件 mention 或普通文本插入不能被称为同一来源引用合同。本次没有挂载该原选区菜单，不宣称已完成其视觉审查。
- 历史 rewind／磁盘撤销：Fork 已有精确消息前缀合同，但它不是原目录状态的回滚；需另行设计，不可换一个按钮名称交付。

## 原组件与当前组件的实际视觉证据

所有本轮截图在 `D:/Git/hbar/artifacts/desktop-next-conversation-entry/`。这是**实际挂载原组件／当前组件的隔离夹具**，不是原 App 或当前生产 Host 的完整会话截图。输入／结果是合成 transcript，不执行截图中的命令。所有 API 和外部 HTTP 请求被阻止，无商业 provider、Run 或真实用户资料操作。

| 证据                                                                                                                                                                                                                       | 本轮已观察事实                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [cc 英文桌面](../artifacts/desktop-next-conversation-entry/reference-tool-output-en-US-1440.png)、[cc 中文桌面](../artifacts/desktop-next-conversation-entry/reference-tool-output-zh-CN-1440.png)                         | 工具摘要先显示命令目标、输出行数、耗时；展开后的终端表面显示命令与输出，输出标题行右端有 Copy。                                                                                                 |
| [cc 英文 320](../artifacts/desktop-next-conversation-entry/reference-tool-output-en-US-320.png)、[cc 中文 320](../artifacts/desktop-next-conversation-entry/reference-tool-output-zh-CN-320.png)                           | 同一内部流在窄屏仍保留 Copy；输出不是依赖全局 toast 的隐藏动作。                                                                                                                                |
| [cc 中文键盘复制后](../artifacts/desktop-next-conversation-entry/reference-tool-output-copied-zh-CN-320.png)、[cc 英文键盘复制后](../artifacts/desktop-next-conversation-entry/reference-tool-output-copied-en-US-320.png) | 聚焦 Copy 后按 Enter，真实浏览器剪贴板得到完整三行结果，按钮变 Copied 且焦点环可见。当前参考 CopyButton 在中文页面仍沿用默认英文 Copy／Copied；这是参考缺口，hbar 不应复制其未本地化文案。      |
| [hbar 英文桌面](../artifacts/desktop-next-conversation-entry/hbar-tool-output-en-US-1440.png)、[hbar 中文桌面](../artifacts/desktop-next-conversation-entry/hbar-tool-output-zh-CN-1440.png)                               | 当前 `HbarMessageBlocks` 的“输入／输出”分别显示内容，没有工具输出复制入口；助手正文后仍有独立回复复制。                                                                                         |
| [hbar 英文 320](../artifacts/desktop-next-conversation-entry/hbar-tool-output-en-US-320.png)、[hbar 中文 320](../artifacts/desktop-next-conversation-entry/hbar-tool-output-zh-CN-320.png)                                 | 输出可读但没有就近动作。点击底部“复制回复”只得到助手正文，不含三行工具结果。                                                                                                                    |
| [结构／剪贴板观测](../artifacts/desktop-next-conversation-entry/observations.json)                                                                                                                                         | 4 个浏览器 context、8 个宽度画面、2 个复制后画面；reference／hbar 两语言无 pageerror，document scrollWidth 与 1440／320 viewport 一致。记录了 actual clipboard，Windows CRLF 仅在断言时标准化。 |

原组件 fixture 使用 cc 完整 `theme/globals.css` 和原 Tailwind 配置，正文字体观测为 Inter／系统中文 fallback；hbar 使用当前 `LumenProvider`、CssBaseline、公开样式及 Web document 样式，字体观测为 Segoe UI／Microsoft YaHei。首轮 hbar 夹具缺 Provider 时曾出现 Times 与额外宽度，不作为最终证据；已按实际宿主组合修正后重新拍摄。外层说明、内容宽度和合成数据属于夹具，不据此推导 App 总体几何等价。

此前确有相同参考入口的旧证据：[工具详情](../artifacts/reference-ux-v2/12-message-details.png)。本轮重新挂载当前参考与 hbar 源码，不只沿用旧文档结论。

## 可核对源码与历史

参考源码均在 `D:/Git/cc-haha/desktop/src/`：

- `components/chat/ToolCallBlock.tsx:587`：`ShellOutput` 区分成功、错误、空输出；成功显示可折叠窗口，错误不被成功窗口隐藏。
- `components/chat/ToolCallBlock.tsx:621`：输出标题右侧 `CopyButton text={output.full}`；`:633` 的正文用 `output.visible`，明确证明复制来源不是截断窗口。
- `components/chat/ToolCallBlock.tsx:774`：其他工具的结果渲染；`:792`、`:821` 的结果标题也有 Copy；`:879` 是原始输入的复制，不混为本次输出动作。
- `components/ui/CopyButton.tsx:31`：等待真实 clipboard 写入，成功才 `setCopied(true)`；`:25` 约 1.5 秒恢复。失败只复位，没有就近错误文案；hbar 应保留自己更完整的失败反馈。

hbar 源码均在 `D:/Git/hbar/`：

- `packages/contracts/src/index.ts:43`、`:473`：公开 `ContentBlock.tool_result` 带 `callId/name/text/isError`；`Message` 带 `id/sessionId/runId`。复制已有文本不需要新 Host 读取或工具执行合同。
- `packages/app-react/src/session-message-model.ts:176`、`:225`：`buildMessageRows` 与分页消息投影已按 callId＋tool name 合并，跨消息匹配绑定 session＋Run，不按文本猜关系。应沿用已解析 `SessionToolRow.result`。
- `packages/app-react/src/session-message.tsx:198`：`DetailText` 只有 `<pre>` 和长内容展开；`:223` 的 ToolRow 在 `:267` 输出标题下传 `row.result.text`。可直接核到工具详情没有复制按钮。
- `packages/app-react/src/message-copy.ts:5`：公开 `MessageClipboardPort.writeText`；`:22` 的 `messageCopyText` 只读取 authored `text`，正确排除 thinking、tool payload 和材料 metadata。不能为补工具复制把这个策略扩大。
- `packages/app-react/src/session-message.tsx:412`、`:443`：现有回复复制的局部等待／成功／失败反馈与浏览器剪贴板适配；`:406` 的 message key 保持原 session/message 身份。
- `packages/app-react/src/lumen-session-workspace.tsx:623`、`:637`：父容器分别渲染消息内容与回复动作；当前普通／历史 Plan／提案消息均复用消息模块。新的输出动作应该随这个模块出现，不能只接普通消息而漏掉其他承载路径。

历史检查：`c49412b` 引入消息主线／正文复制和工具配对；`092e408` 后续把原工具旁决定接线；`9c6336f`、`ff5607c` 增加 Fork seam 与父容器。当前 DetailText 没有输出复制是**已明确保留的迁移缺口**，没有证据证明某个最近提交删除了该入口，不归因为回归。

## 最小独立闭环建议（未实施）

1. 在工具的输出标题行加入带 `sm` 语义图标和 typed host 文案的 Copy。按钮与标题为普通 flex 流；320 与长译文可换行，不增加绝对定位或总页固定高度。空输出／仅占位文案没有 Copy，失败工具真实错误文本仍可复制。
2. 沿用 `MessageClipboardPort`，增加只处理显式结果文本的独立 helper／局部 action，不重用会过滤 tool block 的 `copyMessageText`。不把 JSON、命令、thinking、其他消息和文件 metadata 偷偷拼入结果。首个单元只做**结果复制**；输入 JSON／专用命令复制可后续单独审查，不声称本轮已经达到全部终端表达。
3. 局部 receipt 绑定 `{sessionId,messageId,callId,toolName,kind:'output',sourceText}`。点击时捕获当前原文；等待后不再读 active session。正文结果被替换、分页把 orphan result 移到其 call、组件卸载／切消息时，旧完成不能显示新结果为已复制。无需新增共享业务缓存或 Host 第二真相。
4. 状态为 `idle → copying → copied | failed | unavailable`；只有 `writeText` resolve 才显示勾／成功。失败就在输出动作旁显示宿主本地化反馈并可人工重试；不把异常 message 或 Host payload直接显示。等待期间防重复点击，完成反馈按原目标清理；无需执行 Run receipt 核对，因为剪贴板不是 Host 写。
5. 复制完整**已加载原结果**，不复制 12k 显示窗口加省略号，不把未加载的历史假装完整。大结果必须有明确浏览器资源策略：建议下一实现单元定义有界复制阈值及超界反馈，并覆盖阈值两侧；这项策略尚未存在，不能先宣称已支持无限结果。保持现有详情 pane 滚动与逐层披露。
6. 外部归档后的保留历史仍可复制。这是观察／本地材料动作，不套“新 Run 准备”门禁，也不取消原 Run、审批或改变草稿／模式。复制不会自动插入 composer 或发送。

预计 own files：新增独立 `tool-result-copy` helper／action（若确认有实际复用），消息组件 TSX/CSS 与专用 DOM／helper 测试；宿主 copy bundle 加结果复制文案，已有 message 承载路径只做必要 typed seam。无需改 contracts、Kernel、Storage、导航、档案、Run 或 permission owner。实际文件所有权应在实施前和主线协调，本文不授权现在修改。

## 验收矩阵与未验证范围

| 边界               | 下一实施必须证明的可观察结果                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0／1／多个工具结果 | 空结果无假 Copy；每个非空结果只复制所属调用，失败结果不被省略；同 callId 但不同 tool／Run／Session 不串台。                                         |
| 窗口／长内容／容量 | 小于／等于／大于 12k 的结果复制仍等于原文；长内容显示开关不改变复制来源；定义复制预算的边界及超界反馈，不静默截断。                                 |
| 重复／替换／分页   | copying 时再点不双写；同 message 的结果替换清除旧 copied；晚 clipboard 返回、orphan 归并、A/B 切换不显示错误目标的成功。                            |
| 成功／拒绝／不可用 | 真实 clipboard 成功后才勾；权限拒绝、不可用、Promise reject 提供本地错误与人工重试；回复 Copy 的排除策略保持不变。                                  |
| 键盘／窄屏／主题   | 中英 1440／320，长标签、focus-visible、Tab／Enter／Space、强对比；标题／Copy／输出读序正常，无总页横向溢出。                                        |
| 实际 Host 会话     | 可复用 `e2e/session-message-appearance.spec.ts` 的临时 Host＋测试 transcript／真实 clipboard 机制，核对跨消息工具结果配对；不以真实付费执行为前置。 |
| 安全／只读         | 不调用任何工具／Run／settings 写；归档历史、已完成提案／普通消息承载路径均保持同样结果；不复制 hidden thinking 或其他隐藏载荷。                     |

本轮实际执行的是 ignored `capture.mjs`：原组件／当前组件渲染、真实浏览器 clipboard、局部 DOM 和两宽度截图；不是 Host 业务 E2E，不算未来实现用例通过。初轮剪贴板 LF 断言在 Windows CRLF 上失败，已仅在断言端标准化后重跑通过。没有为这份只读审计运行新业务全测、原生 App 或 PaidProvider；当前根整仓检查由主线进行。新增夹具脚本位于已忽略 artifacts，不加入 repo lint／产品入口。

复现入口：`artifacts/desktop-next-conversation-entry/hbar.vite.config.ts`（45087）与 `reference.vite.config.ts`（45089）；`bun artifacts/desktop-next-conversation-entry/capture.mjs`。这两个隔离服务只用于本轮证据，收尾后释放端口；不与 nav／native 验证共用资源。
