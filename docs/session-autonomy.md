# Session 自主执行：语义、恢复与验证

本说明记录 2026-09-24 的 Goal / Agent Plan / Workflow 修复及验收边界。结论是：确定性异常恢复闭环通过，真实模型可以自行修订错误范围；尚不能声称所有真实模型任务都能在给定预算内自主完成。

## 三类状态的职责

- **Goal** 是会话持续追求的结果，保存身份、状态、用量与续跑意图。未完成目标不能被 `create_goal` 覆盖；显式替换需要匹配 `expectedGoalId`。
- **Agent Plan** 是唯一的执行步骤清单，由 agent 更新，界面只读展示。清除保留 revision 墓碑，重建不能复用旧版本。
- **Workflow** 是当前 Plan 步骤的执行范围、验证和验收约束，不是第二套竞争的计划。默认 `completionPolicy=agent`；只有明确配置的 `user` 流程才等待人工验收。

所有完成入口都检查当前 Goal 身份、Plan 完成状态和 Workflow 验收状态，并在版本锁内提交。CLI、Client、模型工具和 UI 不能通过不同入口绕开完成规则。

## 预算与停止

Goal budget 与 session budget 独立计量；有效余量取已设置限制的较小值。调用参数只能收紧 Host 上限，不能提高它。

Host 在每个模型步骤结算后幂等记账，并在下一次模型请求前检查额度。这里的上限是**请求准入限制，不是最终消费绝不超额的保证**：已发出的请求仍可能返回超过剩余额度的实际用量，该用量必须如实记录。预算耗尽不会自动提额、宣告完成或伪装成任务阻塞。

`ThreadGoal.executionBudget` 提供两种余量、有效余量和限制来源。`ThreadGoal.continuation` 说明正在等待、排队、执行或停止，以及具体原因。`Run.failure` 区分预算、取消、暂时错误、未知结果等类别。

## 续跑规则

- Host 空闲调度统一处理普通续跑、reviewer 返回、修订和预算恢复。意图持久化并绑定 Goal 身份，同一 session 不重复入队，用户排队消息优先。
- `maxContinuations` 默认 `null`，不再固定八轮停止；显式配置的上限仍有效。
- 只有有效工具结果、实质 Plan / 焦点变化、Evidence 或验收推进才算进展。只查询、重复相同失败或相同计划不会无限续跑；无工具自动轮次停止并记录 `no_tool_calls`。
- 同一原因连续三个不同 Goal 轮次无进展，才确认模型报告的 blocked。进展、原因变化和显式恢复重置审计。
- `needs_revision` 自动进入受限修订，只开放 Goal / Plan / Workflow 的七个查询与修订工具；相同焦点连续三轮修订失败停止。普通工具依旧检查范围和权限。
- 可识别暂时错误默认最多重试两次并退避。暂停、取消、替换、清除和用户新消息使旧自动意图失效。
- 重启恢复计量和明确的持久意图；未知写入结果不盲目重放，旧版本没有续跑意图的 Goal 不因升级自动运行。

## 本轮额外发现的缺陷

| 缺陷                                                                                       | 修复                                                                                              | 对应提交  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------- |
| Goal 编辑器刷新后把旧草稿绑定到新 Goal，或回写已经过时的系统状态                           | 捕获草稿身份与基线，只保存真正修改的字段；异步回调绑定原目标；清除增加身份校验                    | `6929757` |
| Goal / Plan 面板只在打开和手动刷新时更新                                                   | 增加带实体序号的快照和增量通知；订阅先于快照；处理乱序、重连、清除墓碑与草稿保留                  | `dc0d2e0` |
| 范围拒绝后 `get_workflow` 返回 revision=2，查询结算却变成 3，导致随后的修订立即过期        | 查询不清除拒绝事实、不修改返回的 revision                                                         | `7217d0b` |
| 范围拒绝只说“不允许”，缺少可以直接修订的身份和版本                                         | 返回已提交的 item ID / revision 及有界修订指引，不扩大用户权限                                    | `cbe3c49` |
| 模型工具顶层联合 schema 缺少对象 properties；真实兼容供应商重复给 `workflow_update` 空参数 | 对外声明对象参数，Host 保留分支校验；已声明但属于其他 action 的字段不进入实际命令，未知字段仍拒绝 | `7afc5bf` |
| 旧 E2E 仍要求手动编辑 / 清除 Plan                                                          | 改为 agent 发布计划、面板只读、实时状态和 Goal 清除关联 Plan 检查                                 | `958d852` |

工具 schema 的对象化参考了官方 [Function calling](https://developers.openai.com/api/docs/guides/function-calling) 和 [Structured outputs 的根对象要求](https://developers.openai.com/api/docs/guides/structured-outputs#root-objects-must-not-be-anyof-and-must-be-an-object)。这些文档不证明第三方供应商遵循全部 OpenAI 行为；第三方表现以本地实验为准。

## 验收矩阵

| 要求                          | 验证依据                                                                                                 | 结果                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 完成不可绕过                  | `goal-lifecycle-integrity`、`goal-plan-commands`、CLI 基础测试、`session-goal-state` 浏览器测试          | 通过；未完成 Plan 即使尚无 Workflow 也拒绝完成                                                        |
| 身份、Plan 版本及过期结果隔离 | `goal-lifecycle-integrity`、`workflow-v2`、`goal-editor-races`                                           | 通过；覆盖清除重建、替换、reviewer 和晚到回调                                                         |
| 双预算、每步结算和重启        | `budget-step-accounting`、`goal-step-accounting`、`goal-execution-budget`、`session-accounting-recovery` | 通过；覆盖丢 ACK、重复回调、旧事件和预算恢复                                                          |
| 超过八轮的自举恢复            | `workflow-autonomous-repair`                                                                             | 通过；14 个主轮次和 2 个 reviewer 轮次，注入范围拒绝、Plan 版本冲突和 reviewer 拒绝，无人工消息或验收 |
| 停止、竞争与取消              | `goal-continuation`、`goal-blocker-audit`、`goal-transient-retry`、`goal-continuation-recovery`          | 通过；覆盖无工具、无进展、退避、用户优先、未知写入不重放                                              |
| UI 与 Host 一致               | `goal-plan-live-state`、`goal-editor-races`、`session-goal-state`                                        | 通过；桌面 / 390px 窄屏显示双预算和停止原因，Plan 只读，完成失败就近显示                              |
| 真实模型正常与恢复任务        | 临时仓库、真实 provider、每次 Goal 和 session 均 10,000-token 上限                                       | 已执行；正常任务可完成，恢复任务修订并写入后预算停止，未通过完整恢复验收                              |

最近完整基础测试：`bun test tests --timeout 20000`，**733 pass / 2 fail，735 tests，198 files，201.46s**。随后工具 schema 修复单独运行 **20 项测试全部通过**；不把它们拼成未实际运行过的全量计数。

另外通过：完整 `bun run typecheck`、本轮 53 个 Session 改动文件的严格 ESLint（最后 schema 调整再次定向 lint）、Web build、定向浏览器 E2E（1 passed，7.5s）。新增 `goal.snapshot` 在 Windows / Bun 1.4.0、loopback WebSocket、100 条 Plan 步骤、并发 1、200 个测量样本下 p95 **0.50 ms**、max **4.66 ms**，目标 p95 <100 ms；不代表公网或多用户压测结果。

未通过的仓库级门禁：

- 两个基础测试失败属于现有 Lumen Activity：兼容性测试禁止渲染 `<button>`，规范边界测试检测到 canonical Activity 中原生可见控件。
- 全仓 `bun run lint` 增加 Node 堆后仍长时间遍历大子模块，主动停止；不得把定向 lint 等同全仓通过。
- 大型 `e2e/web-shell.spec.ts` 在进入 Goal 场景前被既有布局几何断言阻断；定向 Session E2E 通过不等同全部 Web E2E 通过。
- 截图仍有共享面板标题被长 session 名挤压、Usage 区域高度异常；不属于已解决的全局视觉质量问题。
- 本轮没有重新打包 / 重启用户正在使用的 Tauri 程序，不把 Web / Host 测试冒充桌面发布验证。

## 真实模型实验

实验不改用户真实会话：每次使用独立临时仓库与数据目录，仅开放 Goal / Plan / Workflow 及单个 `proof.txt` 读写；凭据只从已有配置读取到内存，不写入报告。正常场景写入并回读指定文本；恢复场景先触发错误范围拒绝，要求模型自行修订后完成。

| 实验                        | 实际计量 tokens | 结果                                                                      |
| --------------------------- | --------------: | ------------------------------------------------------------------------- |
| GPT 正常任务                |          13,532 | 文件、Plan、Workflow、Goal 完成                                           |
| GPT 最新恢复任务            |          11,050 | 自行修订范围并写入正确文件；回读验收前 `budget_limited`，不算完成         |
| Grok 对象参数修复后正常任务 |          11,251 | 文件、Plan、Workflow、Goal 完成；最终总结请求被预算拒绝，Run 显示预算失败 |
| Grok 对象参数修复后恢复任务 |          12,215 | 自行修订范围并写入正确文件；回读验收前 `budget_limited`，不算完成         |

包括发现缺陷的前后对照共 **9 次实验，实际计量 107,718 tokens**。逐事件独立审计确认：每次 `request.started` 前累计用量都低于 10,000；最终 Goal 与 session 账本均等于去重 usage 事实之和。未自动提高额度。所有超额来自已发出的模型请求结算。

因此，当前证据支持“授权范围内的多类可恢复错误可以自动推进，合法停止有明确原因”，**不支持“任意真实任务在任意预算下保证无人介入完成”**。真实恢复任务的完整闭环仍需进一步降低上下文 / 控制工具往返开销，并在固定预算下增加重复实测；不能通过删除验收或偷偷提额获得通过。

本地详细报告和截图保存在忽略目录 `artifacts/session-autonomy/`，包括 `final-tests.log`、`live-provider-*.json`、`live-ledger-audit.json`、`snapshot-benchmark.json`、`goal-desktop.png` 与 `goal-mobile.png`。它们不是发布包的一部分。
