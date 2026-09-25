# Plan 提案：真实参考、独立模块与装配说明

本单元实现“完整计划文档 → 按此计划执行 / 继续规划”的就近操作，不是 Goal 编辑，也不是 `update_plan` 任务进度。现已装配公开接口、主工作台与宿主文案，并完成真实临时 Host 生产 E2E；下文区分原组件隔离证据与生产验证。

## 依据与契约

- hbar `plugins/plan/src/instructions.ts:97` 明确要求正式计划用独占行 `<proposed_plan>` / `</proposed_plan>` 包含完整 Markdown；`:128` 限定每轮最多一个，修订必须完整替换。`:12` 明确区分 Plan mode 与 `update_plan`。
- `plugins/plan/src/index.ts` 在每个 Run 上决定 Plan 指令与只读约束。hbar 没有 cc-haha 的 `ExitPlanMode` 待审批实体，因此不能把“按计划执行”伪装成批准工具权限，也不能提供缺失的临时工具授权选项。
- 历史 `fdf59a6` 曾增加结构化计划保存指引，`5799ab3` 移除该路线以统一 Goal / Plan 事实。此单元不恢复 `save_workflow_plan`、不创建另一份计划数据库。
- `packages/app-runtime/src/composer-intent.ts` 的普通提交按当前输入意图覆盖 mode；本动作必须使用明确的 per-run mode，不能借用普通 composer 的隐式模式。
- `packages/app-runtime/src/drafts.ts` 原先按文本、附件和 revision 判断是否清空草稿。计划提交可能恰好等于当前草稿，因此新增 detached 提交方法复用单飞/回执，但强制不消费草稿。

cc-haha 源码为只读：

- `D:/Git/cc-haha/desktop/src/components/chat/PermissionDialog.tsx:303`：`ExitPlanModePermissionDialog`；反馈本地状态、批准计划、继续规划、响应后退出可操作态。
- `D:/Git/cc-haha/desktop/src/components/chat/PlanModePreview.tsx:36`：原 `PlanPreviewCard`；文档图标、标题、可选真实文件路径、Markdown。`:62` 给文档正文 `max-height: 520px` 与内部滚动，而不是固定整卡高度。

## 真实视觉证据

`artifacts/plan-proposal-v2` 下的 19 张截图由本机浏览器实际渲染并读取角色/尺寸后捕获。参考端口 44650 直接 import cc-haha 当前原组件、主题和语言资源；新组件端口 44652 直接 import 新产品组件及真实 runtime factory。仅外壳、测试数据和 Run/receipt port 是隔离夹具，拦截其他 origin，不连接真实 Host。

| 证据          | 文件                                                                            | 可见事实                                                                              |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 原版宽屏      | `01-reference-plan-1440.png`                                                    | 外层待审批标题，内层文档标题/路径，正文，反馈框，底部左右分开的主要/次要动作          |
| 原版窄屏      | `02-reference-plan-390.png`                                                     | 同一纵向语义顺序，正文自然变高，不挤走反馈或动作                                      |
| 原版反馈/继续 | `02-reference-plan-feedback-390.png`、`02-reference-plan-continue-390.png`      | 文档不跳页，继续入口使用本地反馈；响应后保留文档并退出待处理态                        |
| 原版批准后    | `02-reference-plan-approved-390.png`                                            | 原审批显示“已响应”、操作区移除；这不是 hbar 的 Run 完成事实                           |
| hbar 待操作   | `03-hbar-plan-1440.png`、`05-hbar-feedback-390.png`                             | 文档、反馈、执行与继续均在同一消息卡；宿主文案明确动作含义                            |
| hbar 已受理   | `04-hbar-accepted.png`                                                          | 只显示请求已受理，禁止重复点击，不声称执行已完成                                      |
| hbar 恢复     | `06-hbar-failed-390.png`、`07-hbar-unknown-390.png`                             | 已确认失败可重试；结果未知只允许核对原回执，不能重发                                  |
| 语言/容量     | `08-plan-{zh-CN,en-US}-{1440,900,390,320}.png`、`09-hbar-long-document-320.png` | 双语、宽/窄布局无页面横向溢出；80 段长文档可键盘滚至末端，反馈/动作不在文档滚动容器内 |

本卡采用 flex 正常流、自然高度、有限语义图标尺寸和有界文档滚动。没有截图坐标映射、绝对定位普通内容或隐藏窄屏入口。Hbar 复用既有 Lumen 主题色与控件，不把 cc-haha 的品牌字样、路径或审批状态硬编码为业务事实。

## 独立文件

| 文件                                                | 责任                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/app-runtime/src/proposed-plan.ts`         | 无副作用解析器；忽略 fenced / 引用 / 行内示例；拒绝空、嵌套、多块、未闭合、超界计划；SHA-256 仅作过期内容标识 |
| `packages/app-runtime/src/plan-proposal-actions.ts` | Reader + 有限命令 DTO；从已完成 assistant 文本重取实际计划、验证原 session/message/run/seq/指纹后发一个 Run   |
| `packages/app-runtime/src/drafts.ts`                | `executeDetachedRun` 与只读 `getSettledReceipt`；沿用唯一 pending/receipt owner，保持原普通发送行为           |
| `packages/app-react/src/proposed-plan.tsx` / `.css` | 受控 `HbarProposedPlan`；宿主提供内容、标签、状态与回调；仅反馈文本属于局部 UI 状态                           |
| `tests/plan-proposal-runtime.test.ts`               | 实际 CommandRegistry 路径与 receipt/切换/容量/普通提交回归                                                    |
| `tests/proposed-plan.test.tsx`                      | 文案、语义、安全 Markdown 与 disabled/unknown/accepted 契约                                                   |

## 主线装配

### Runtime factory 与公开端口

`createPlanProposalActions(local, options)` 需要 timeline / controls 的公开 reader，以及现有 drafts 的方法。示意代码中的变量名应按 runtime index 的现有装配命名替换；不在 View 发 Host RPC：

```ts
const planProposal = createPlanProposalActions(local, {
  timeline: timeline.reader,
  controls: controls.reader,
  executeDetachedRun: drafts.executeDetachedRun,
  getSettledReceipt: drafts.getSettledReceipt,
  reconcileRun: (sessionId) => draftClient.execute('draft.reconcileSubmission', { sessionId }),
  onSubscriberError,
  requestText: copy.planProposal.requestText,
})
```

上述 factory 已在 runtime index 装配：`view.state.planProposal`、公开 typed commands 与 dispose 均已接入。`RuntimeOptions.planProposal?: { requestText: PlanProposalRequestText }` 为可选能力；宿主若提供该能力则 formatter 必填。未提供时保持 reader/commands 形状稳定，出现计划时 availability 为 `capability_unavailable`，提交抛同码，绝不使用默认英文请求或发 Run。无 UI 的 runtime 创建方无需增加配置。以下值/类型已从公开入口导出：

- 值：`planProposalCommands`、`planProposalActionKey`；若 View 装配需独立解析，可同时导出 `parseProposedPlan`，不要重复实现字符串切割。
- 类型：`PlanProposalTarget`、`PlanProposalSubmit`、`PlanProposalRequestText`、`PlanProposalDocument`、`PlanProposalActionState`、`PlanProposalState`、`PlanProposalOptions`、`ProposedPlanParseResult`。
- app-react 入口导出 `HbarProposedPlan`、`HbarProposedPlanProps`、`HbarProposedPlanLabels`、`HbarProposedPlanTarget`。

两个客户端命令均是严格 DTO，不能从 View 传任意 modelId / 计划正文：

```ts
type Target = {
  sessionId: string
  messageId: string
  sourceRunId: string
  sourceSeq: number
  fingerprint: string // 64 位十六进制 SHA-256
}
// proposedPlan.submit: Target & { action: 'implement' | 'continue'; feedback?: string }
// proposedPlan.reconcile: Target
```

`requestText` 是宿主本地化函数，输入 `{action, markdown, feedback, target}`。必须把 runtime 传入的完整 Markdown 当内容放入请求，不能从视图重新读取编辑过的 DOM，不把计划文本当指令模板代码。实现动作的文字应明确“按以下计划执行”；继续动作应明确“继续规划并结合反馈”；两者总长度受 200,000 字符限制，计划上限 180,000，反馈上限 4,000。

运行输入：implement 固定 `mode: 'default'`，continue 固定 `mode: 'plan'`，`source: 'user'`，使用原会话已确认模型/思考值，附件为空。**不**设置 `approval`、不读取/消费 composer “仅本次发送”的权限选择，不调用 mode.set / Goal / update_plan。Host 的既有权限边界照常生效。

### 消息呈现

将 reader 中 `proposal` 绑定到 `proposal.target.messageId` 对应的原 assistant 消息，不能把卡片放到当前滚动末尾或换会话后错误的最新消息上。只对匹配的文本替换 `<proposed_plan>` 标记，显示 `before`、提案卡、`after`，保留该消息其他公开 blocks 和既有工具投影。不要把整个 assistant 消息替换成计划，从而丢失其他说明/工具内容。未完整解析、来源 Run 未完成、旧版本提案均不可出现可执行入口。

```tsx
const document = proposalState.proposal
const action = document
  ? proposalState.actions[planProposalActionKey(document.target)]
  : undefined

// 仅在对应原 assistant 消息的内容位置渲染
<HbarProposedPlan
  target={document.target}
  markdown={document.markdown}
  labels={copy.planProposal.labels}
  state={{
    status: action?.status ?? 'idle',
    canSubmit: proposalState.availability === 'ready',
    error: action?.error ? copy.planProposal.error(action.error) : null,
    unavailable: copy.planProposal.availability(proposalState.availability),
  }}
  onSubmit={(target, action, feedback) => {
    void commands.execute('proposedPlan.submit', { ...target, action, feedback })
      .catch(reportCommandError)
  }}
  onReconcile={(target) => {
    void commands.execute('proposedPlan.reconcile', target).catch(reportCommandError)
  }}
/>
```

`availability` 为 `none | ready | busy | incomplete | model_unavailable | capability_unavailable`；`ready` 映射 null，其余给短的本地化原因。异常也必须按 code 映射文案，不直接显示英文内部异常。反馈编辑状态按 session/message/fingerprint 重新挂载，不会串到另一个版本或会话；仅可用性变化不会重挂载同一文档或丢掉反馈。

建议宿主标签如下，实际采用已有 typed i18n 框架，不复制模块级演示数据：

| 字段                  | 中文                       | English                                    |
| --------------------- | -------------------------- | ------------------------------------------ |
| title / document      | 计划提案 / 计划文档        | Proposed plan / Plan document              |
| implement             | 按此计划执行               | Implement this plan                        |
| continuePlanning      | 继续规划                   | Keep planning                              |
| feedback              | 规划反馈（用于继续规划）   | Feedback for further planning              |
| feedbackPlaceholder   | 说明需要完善的内容         | Describe what should change                |
| submitting / accepted | 正在提交请求 / 请求已受理  | Submitting request / Request accepted      |
| unknown               | 提交结果尚未确认，请先核对 | Result unknown. Reconcile before retrying. |
| reconcile             | 核对提交结果               | Reconcile request                          |

### 回执、切换与边界

- `executeDetachedRun` 不是旁路 Host 提交。它使用 drafts 的同一 pending map、同一 idempotency key、同一 unknown 状态与 receipt 查询；普通发送 unknown 时提案必须 BUSY，反向亦然。
- detached 的唯一草稿差异是 `matchesDraft=false`，内部标记不上传 Host wire。即使请求与当前草稿完全相同，也不会清掉正文、附件或 revision；新的草稿编辑继续保留。
- 已确认受理回执缓存在 drafts owner 中，最多 100 条，按 session/key 取副本。两个入口乱序核对时 proposal 可读取同一已确认回执，不会给它另建 request key 或再次发送 Run。缓存不是持久存储；淘汰/重启不应被解释为“请求失败”，未知状态仍必须保守处理。
- pending 提案和 action feedback 有界 100，过多未决请求拒绝新增。快切会话、原文被替换、来源 Run 未完成/正在流式、模型读取失败均在实际提交前复验。返回晚到回执只写原 target 的 feedback。
- `accepted` 仅代表 Host 受理，不代表执行完成；完成、取消与失败仍看现有 Run 投影。本单元不实现会话分支；现有 `session.fork` 后端契约存在，缺的是独立 UI/runtime 接线。

## 验证记录

- 生产 `e2e/proposed-plan-entry.spec.ts`：2 passed（最后重建版本 11.9s），真实临时 Host + local-fixture，中文/英文 × 1440/900/390/320。12 张截图位于 `artifacts/plan-proposal-v2/production-results`。验证原 assistant 位置、前后说明、旧提案只读、真实附件/草稿不丢、双触发单 Run、implement/default 与 continue/plan，持久 mode、全局 approval、Goal 和任务进度不被此动作改写。
- 原消息多 text block 按统一偏移插入计划卡，保留其他工具/附件顺序；历史计划只读，不虚构执行目标。主线 35 个聚焦测试、239 个断言通过；覆盖跨块、空块、CRLF、安全 Markdown 与普通路径畸形/错目标回执保持 unknown。
- WeakMap 缓存后 25 个定向测试、161 个断言通过；以不可变原消息及 content identity 失效，不在每次 stream/controls 更新时重读全文。该缓存不拥有第二份历史分页。
- 最终 root TypeScript、scoped strict ESLint、Prettier、content/icon/flow guards 和 diff check 通过。原生 smoke 仍属于整体验收，未在此单元运行。

- `bun test tests/plan-proposal-runtime.test.ts tests/proposed-plan.test.tsx tests/prompt-drafts.test.ts tests/app-runtime.test.ts tests/design-system-boundaries.test.ts`：35 tests / 200 assertions，通过；包含真实 Host 的普通草稿提交回归、无 UI runtime 的兼容性、公开 Plan reader/typed commands 路径与打包架构边界。
- `bun artifacts/plan-proposal-v2/verify.mjs`：8 组浏览器检查、19 张截图、page errors 为空；只连接两个本地隔离 origin。
- 上述隔离浏览器检查不替代全仓回归，未声称完整全仓检查或原生 smoke 已完成。
