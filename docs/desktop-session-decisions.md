# 会话工具旁的审批与问答

## 参考与实现范围

本单元迁移 cc-haha desktop 的就近决定方式：工具摘要后直接出现需要用户行动的内容；参数细节可展开；决定完成后保留明确结果。不是将所有工具调用伪装成审批，也不把缺少原文件内容的写入请求渲染成完整 diff。

实际参考为 `D:/Git/cc-haha/desktop/src/components/chat/PermissionDialog.tsx` 与 `AskUserQuestion.tsx`。原组件运行截图保存在本地忽略目录：

- `artifacts/reference-ux-v2/14-decisions-pending.png`
- `artifacts/reference-ux-v2/15-questionnaire-selected.png`
- `artifacts/reference-ux-v2/16-decisions-resolved.png`
- `artifacts/reference-ux-v2/21-decisions-narrow.png`

这些是原组件预览证据；它们不是 hbar 生产 Host 验收。hbar 的独立组件测试截图为 `22-hbar-decisions-*` 至 `26-hbar-decisions-long-320.png`，生产 Host 截图为 `artifacts/plan-proposal-v2/decisions-results/` 中的 approval/questionnaire 系列。

## 位置、动作与事实来源

| 区域             | 用户动作                         | 所属目标与事实                                                                     | 反馈与边界                                                                                                       |
| ---------------- | -------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 工具摘要后的审批 | 允许这次、拒绝                   | 捕获原 session、approval ID；只向唯一匹配的 assistant session/run/call/tool 关联   | 提交中禁止重复；确认后保留 Allowed/Denied/Cancelled；不提供无契约的“本会话始终允许”                              |
| 参数摘要         | 查看/收起完整输入                | `approval.args`，即实际进入审批的参数，而非可能被前置钩子更改的原始 tool_call 参数 | shell 显示待执行命令；edit_file 显示请求中的原/新片段；write_file 明示“不是完整文件差异”；其他工具安全 JSON 降级 |
| 问答卡           | 标签切换、单选、自定义回答、提交 | 原 request/session/question ID；真实请求的 1–3 个问题                              | 箭头/Home/End 切换标签；全部问题有回答才可提交；秘密值使用 password，完成后隐藏                                  |
| 未确认结果       | 核对结果                         | 原动作开始的 cursor，以及原 session/run/call/tool/target                           | 只读取 `session.follow`，绝不再次 resolve/answer；无事实或 reset 保持未确认                                      |
| 无可靠关联       | 原 Run 区展示                    | 未找到唯一调用，或调用不在已加载历史页中                                           | 不猜测消息位置；同一决定不重复显示                                                                               |

正常文字、工具、附件顺序不变。需要决定的工具行不被折叠进活动汇总，卡片位于工具 disclosure 的外侧。旧计划、当前计划与普通消息均使用相同投影。

## 公开接线

- `projectSessionDecisions` 产生 `byMessage` / `fallback`，`sessionDecisionAction` 按原目标取状态。
- `HbarSessionDecision` 接收 typed `labels`、decision、action、answers 和显式目标回调；不发 RPC、不读 Host 私有实现。
- `HbarMessageBlocks.toolDecisions` 只负责把已投影内容放在原工具行之后。
- 可选 `RuntimeOptions.interactionRecovery` 由组合根注入 `createInteractionRecoveryClient`；UI 只调用 `interaction.reconcile({ sessionId, actionId })`。
- `interaction.reconcile` 是 client-local command，因为它更新应用状态；它在 Host 侧只读既有事件，不写入或重试决定。

## 可靠性与容量

已确认的旧问题可追溯至 `57e5e7c` 的交互 action 初始实现与 `cbbbf09` 的问答草稿接线，并仍出现在 `d8df0d9`：pending 从快照消失会被推为 succeeded，accepted:false 未校验，只有 RESULT_UNKNOWN 被视为不确定，切会话时的草稿过滤会移除另一会话的回答。

当前实现修正为：

- 本地校验失败与已经派发后的不确定结果分开。plain Error / CONNECTION_CLOSED / EXECUTION_FAILED / TIMEOUT 等派发后错误保持 unknown，不把可变错误消息当稳定 code。
- `accepted:false` 是明确未接收；`accepted:true` 仅显示“已提交，等待工具确认”。问答完成需要相同调用的已验证 tool_result；取消需要明确取消事实。
- 原动作保存目标、请求、开始 cursor 和原答案；晚到异常或旧读取不能覆盖明确 resolution；切换会话不清理未确认答案。
- action 记录最多 100 项；观察新请求不得驱逐跨会话 unknown。问答草稿最多 40 项，超界返回 BUSY，不静默丢失。
- 宿主 `session.follow` 单次最多返回 2,000 个事件，超过窗口返回 reset。恢复命令只做一次有界读取，校验 session、顺序与原目标；reset、错误或缺少明确事件均不构成成功。
- 1–3 个问题属于内容自增长列表；标签条在窄屏可横向滚动。参数 preview 高度有界且可实际滚动，卡片/按钮/长文案正常 flex 换行，不用截图坐标或固定卡片高度。

## 明确未覆盖的持久恢复

Host 的 `session.snapshot.approvals` 明确只返回 pending。当前运行时可保留已收到的审批事实；若它保留了原 action/cursor，断线漏事件可只读核对恢复。但是关闭/刷新整个应用会丢失这些非持久 action，不能仅凭工具执行结果猜测历史审批是 allowed 还是 denied。本单元不改变 snapshot、不声称刷新后恢复全部历史审批。

问答的成功回答可以从持久化的 request_user_input 调用与结果恢复只读卡片。历史取消若只剩一般 tool error 而缺少明确取消事件，则不伪称已回答或已取消。恢复窗口过期仍需更完整的后端历史/receipt 契约，不能靠重复写入绕过。

## 验证记录

- 定向 runtime、组件、Host、消息、workspace 与 DOM 边界测试通过；增加了派发后四类不确定失败 × 审批/问答、晚到事实、accepted:false、跨会话、40/100 容量、2000/2001 事件与问题数量边界。
- 真实 Host 专项分别制造 allowed、denied、cancelled、answered 后断线/丢回执与漏事件。重连时 pending-only 快照为空，原 runtime 没有收到结果，单次 follow 核对成功；没有重复决定写入。
- 新生产浏览器 E2E 中英文通过，1440/390/320 截图已查看：原消息唯一位置、真实修改文件、双问答、原生键盘、重复点击、切会话草稿、完成态和刷新后的问答结果。
- 既有 composer-permission-entry 中英文与 production-session-interactions 回归通过；包括真实附件、停止、重试、允许与拒绝。
- 独立组件在 1440/900/390/320、中英文与刻意加长中文标签下通过无溢出、单选文字可见、秘密值隐藏和本地 unknown 核对检查。独立预览使用测试回执，未冒充真实 Host 证据。
- 根 TypeScript、定向 ESLint、Prettier、内容/图标/flow guards 与 design-system-boundaries 检查通过；生产 Vite 构建通过。完整仓库检查由主线另行汇总，不把本单元定向验证称为全仓通过。
