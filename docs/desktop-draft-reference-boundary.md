# Desktop 草稿参考与刷新边界

2026-10-02，当前 hbar `b1658d67`。本次两个 gpt-6-luna/max agent 只读核对
CC-haha 固定 `e28d0a65` 和 hbar 草稿实现，主 agent 再查相同源码及 Git 历史。
没有为这一核对新增持久化、修改 CC、启动 CC Host 或调用付费模型。

## 结论与准确归属

CC 的 composer 草稿是按 Session 的运行时内存，不是跨刷新／重启自动保存。
`desktop/src/components/chat/ChatInput.tsx` 的 `saveComposerDraft` 保存 text、
attachments 和 mentions 到 `useChatStore.sessions[id].composerDraft`；切标签先
保存旧 Session，再读取目标 Session；离开到 Settings 等导致组件 unmount 时也
保存。`chatStore.ts` 的 set／clear 只更新 Zustand，没有接 localStorage hydration。
`tabStore` 持久化 openTabs／activeTabId 不能证明未发送正文已持久化。

关键历史 `6ff76171` 明确是修复 Settings／Terminal 替换 ActiveSession 时的草稿
丢失，并明确拒绝为运行时草稿加入 localStorage。它的测试是组件 unmount／remount，
不是完整 page reload。e28 已包含该提交。模型／effort 的独立 session-runtime
localStorage 和 Host 会话模式也不能倒推 composer 正文或附件有持久化。

hbar 的 `packages/app-runtime/src/drafts.ts` 按 Session 保存 text／mentions／
workspaceContexts／attachments 和明确的 transfer／submission 状态。当前 runtime
内切换会话、工具、设置和执行结果阅读保留原稿；`startup-runtime` 同 Host 重连保留
runtime，不同确认 Host 切换 generation 并释放旧 runtime。普通断线重连不等于
完整刷新。`ClientPersistencePort` 目前只接 layout／preferences，不读写草稿。

## 验证范围与产品选择

既有 `prompt-drafts.test.ts`、会话／设置往返和实际原生 smoke 证明当前 runtime
内原稿的隔离和保留。参考 `ChatInput.test.tsx` 覆盖 Session tabs、unmount／remount、
延迟截图与 mentions；参考发布图只证明输入区入口和布局，不证明刷新恢复。本次
没有把检查源码当成重跑这些测试，也没有宣称跨窗口／跨设备恢复。

`desktop-tool-presentation.md` 的旧 28 个 reload 草稿红测记录保留为历史，但它是
当时误加的验收要求，不是 CC parity 已证明的缺陷。现有交付仍诚实说明 page reload
不恢复草稿；不能为了消除旧红测，无条件把未发送敏感内容写进本地存储。

若用户另行要求跨刷新恢复，应定义 host／workspace／Session 范围、版本、容量、
保留期限、失败可见性和多窗口冲突，以及 unknown submission 的原 receipt 核对。
文件对象、临时 sourceId、上传中的 transfer 和凭证不能直接恢复；已确认 artifact
也需重新鉴权查询。这是新的产品／持久化任务，不为本轮 UI 一致性擅自实施。

CC e28 空 Session 替换项目路径还只复制 text／attachments，没有复制 mention
metadata；该边界来自参考自身，不要求 hbar 复制同样的数据丢失。保持用户已选的
项目切换语义，以[项目连续性](desktop-project-selection-continuity.md)为准。
