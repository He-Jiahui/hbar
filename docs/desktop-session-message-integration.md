# 会话消息局部组件接线说明

本单元将当前参考原组件的层级迁入独立消息组件，并接入生产 `HbarSessionWorkspace` 与 Host 中文/英文 copy。它不改变共享 Lumen rail；模型/权限选择也不属于本单元。

## 公共接口

`@hbar/app-react` 导出 `HbarMessageBlocks`、`HbarMessageActionBar`、两组 typed labels，以及 `projectSessionMessages`。所有可见 copy 由 host 提供，测试示例只在 `tests/session-message.fixtures.ts`。

- `HbarMessageBlocks` 接受显式 `sessionId`、`messageId`、公开 `ContentBlock` 派生的 `blocks`、可选 `results`、`streaming` 和 labels。每个目标有独立的本地展开状态。
- `projectSessionMessages(timeline.messages)` 在当前已分页快照中匹配 `sessionId + runId + callId + toolName`，把另条 tool message 的结果与原调用聚合。被消费且没有其它内容的结果消息才消失；孤立结果仍可读。它是 O(blocks) 纯投影，没有第二套历史缓存，也不替代父层分页/虚拟化。
- 完成的连续思考/工具默认折叠为计数摘要；运行中展开；手动开关后固定用户选择，不因下一次状态更新反复自动切换。仅一个步骤直接呈现其行，不额外嵌一层摘要。
- `describeTool(call)` 可由 host 提供语义图标、可扫描摘要、经过验证的文本/命令输入。未知工具保留安全 JSON fallback，不在 View 内硬编插件目录。它目前不是通用 diff renderer，未声称复制了参考的所有工具专属详情。
- 工具输出/参数初次展开最多渲染 12,000 字符；长内容有显式完整展开/收起，不静默丢弃。展开内容使用有最大阅读高度的实际滚动区。正文不使用固定高度。
- `HbarMessageActionBar` 接受原消息 `content`、目标 ID、typed labels、可选 clipboard 端口和 metadata。缺省使用浏览器剪贴板，显式 `null` 用于不可用平台。只复制 text 正文，原始 Markdown 保留，不含思考、工具输入/结果或附件元数据。
- 复制状态在系统写入确认后才变勾；失败显示本地原因与同按钮重试；目标切换重置状态，旧异步结果不污染新消息。正文改变也不保留旧成功状态。本单元不新增 fork；hbar 已有 `session.fork` Host 契约，消息级入口及恢复接线需另行验收。

共享 `LumenMessage` 新增两个 opt-in props：

```ts
appearance?: 'card' | 'transcript' // 默认 card，不改变既有调用
actions?: React.ReactNode        // undefined 沿用旧 onCopy，null 明确不显示旧动作
```

`transcript` 使用原生 article、作者 aria-label、assistant/tool 无重复头像/卡片，user 保留靠右的紧凑背景；普通内容仍在正常 flex 流中。它没有改变 `LumenConversation` 的窗口化与阅读锚点行为。

## 生产接线

1. 在 host copy 中提供 `HbarMessageBlocksLabels` 与 `HbarMessageActionLabels` 的中文/英文适配，不把测试 fixture 导入生产。
2. 使用 `projectSessionMessages(timeline.messages)` 替代原 messages 直接 map；`message.id`、role、createdAt 等身份仍取原记录。
3. 对每项设置 `appearance: 'transcript'`，children 传 `HbarMessageBlocks` 的 `blocks/results`。对于 active stream，使用 stream 自己稳定的目标 ID，传入公开格式的 thinking/text blocks 和 `streaming: true`。
4. 收尾可复制消息的 actions 传 `HbarMessageActionBar`；使用原 `message.content`，不要用包含聚合工具结果的构造字符串。只给真实完成状态的消息传完成 metadata。父层决定哪些 role/回合收尾拥有操作行；组件不猜“所有 assistant 文本都是最终回复”。
5. 不再同时传旧 `onCopy` 来制造第二个按钮；提供 actions 后优先渲染 actions，旧调用未提供时继续兼容。
6. 如果 tools schema 能提供文件/命令等语义，注入 `describeTool`；未知工具用 fallback。实际 diff、审批、问卷的按步骤关联仍是后续独立子功能，不能认为这一层组件已完成这些闭环。

结构示例（copy/metadata 全部由现有 host 提供）：

```tsx
const items = projectSessionMessages(timeline.messages)
const messages = items.map(({ message, blocks, results }) => ({
  id: message.id,
  role: message.role,
  author: labels.author[message.role],
  avatar: labels.avatar[message.role],
  copyLabel: labels.messageActions.copy,
  appearance: 'transcript' as const,
  children: (
    <HbarMessageBlocks
      sessionId={message.sessionId}
      messageId={message.id}
      blocks={blocks}
      results={results}
      labels={labels.messageBlocks}
    />
  ),
  actions: isCompletedReply(message) ? (
    <HbarMessageActionBar
      sessionId={message.sessionId}
      messageId={message.id}
      content={message.content}
      labels={labels.messageActions}
    />
  ) : null,
}))
```

`isCompletedReply` 是上例策略占位，不是新增工具函数。实际工作区给同一 Run 最后一条有正文的 assistant 消息提供复制，queued/running/waiting_approval 时不提供；metadata 仅显示原消息时间，不给缺少 Run 记录的历史消息虚构“完成”。空的 Goal continuation envelope 不再渲染空用户气泡，真实工具/思考保留。活动与原分页/流式投影共用一个数据源。

## 本轮验证与证据

- 单测：`tests/session-message.test.tsx`、`tests/message-copy.test.ts`、既有 `tests/lumen-message-appearance.test.tsx`；覆盖配对/孤立/跨run与session/重复ID/0、1、100、101条、sanitized正文、未知工具、安全fallback、兼容外观和异步复制。
- 浏览器：隔离 preview `127.0.0.1:44651`，源码与脚本位于忽略目录 `artifacts/session-message-v2/`。没有生产 Host、真实模型或真实工具调用。截图只是这一组件单元，不是整工作区迁移完成证据。
- 实测键盘 Enter/Space，复制失败重试，等待确认时切换目标，正文更新清除旧反馈，不可用剪贴板，自动折叠与手动固定，两语言 × 1440/900/390/320，窄屏长 label/错误，以及长输出显式展开和真实滚动。
- [折叠态](D:/Git/hbar/artifacts/session-message-v2/01-transcript-collapsed-1440.png)、[展开详情](D:/Git/hbar/artifacts/session-message-v2/02-transcript-details-1440.png)、[复制失败](D:/Git/hbar/artifacts/session-message-v2/04-copy-failed.png)、[320 宽](D:/Git/hbar/artifacts/session-message-v2/05-transcript-zh-CN-320.png)、[未知工具长输出](D:/Git/hbar/artifacts/session-message-v2/06-long-unknown-tool-320.png)。

生产接线验证记录：

- 聚焦消息/复制/外观/设计边界/时间线：25 tests、134 assertions 通过；包含空 Goal envelope、孤立/跨会话工具结果、分页边界与恢复。
- 全仓 `bun run typecheck`、本单元严格 ESLint、隔离 production build 通过。
- 既有真实 Host 长历史浏览器回归通过：60/120/180 条分批、阅读锚点、新消息手动跟随、跨会话恢复、断线/重连保留草稿、390 宽。新增消息 footer 后，服务状态断言收窄到侧栏，未取消恢复检查。
- 真实 Host 工具消息/复制浏览器用例在 light/dark × 1440/900/390/320 验证；最终截图位于独立的 `artifacts/desktop-experience/final-browser-evidence/`。工具调用和结果配成一个披露区，原始 Markdown 复制写入系统剪贴板后才显示成功。Windows clipboard 的 CRLF 与源 LF 在断言中规范化，正文内容不改。
- 共享包常规 `pnpm -F @lumen/app-ui typescript`、`pnpm proptypes`、`pnpm docs:api` 被环境 pnpm 11.19.0 / 项目要求 12.3.4 阻止，不能记为通过；没有修改环境版本或配置。
- 实际共享包 `pnpm --config.engine-strict=false --config.manage-package-manager-versions=false --config.verify-deps-before-run=false exec tsc -p packages/lumen-app-ui/tsconfig.json` 通过；这仅是单次 CLI 覆盖，不代表上述常规文档生成通过。

审批、问卷、工具专属 diff、消息 fork 和整体页头/用量层级仍是独立单元。该提交不表示全部会话交互已与参考一致。
