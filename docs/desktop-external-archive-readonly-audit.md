# 外部归档后的保留视图：只读能力边界审计

2026-09-26（本机 +08:00 捕获时间）。有界只读审计：只新增本文与 ignored 证据，不修改 product、index、navigation、Host contracts，不暂存或提交。工程、前后端／质量、内容／图标／参考流技能和 cc-haha 的适用 AGENTS 已重读。

## 结论

**保留 A 的历史、原稿与 Files 是正确的观察行为；缺少的是“已确认归档 → 禁止新执行准备”的类型化投影。** 不能以页签已退役／`activeId:null` 推定旧内容应被删除，也不能把整个 composer 的 `disabled` 打开：共享 `LumenPromptComposer` 会在 runningActions 存在时连 Stop 一起禁用。

最小闭环是复用 directory 的已校验、版本筛过的 Session 事实，派生当前目标的 execution access，分别限制 Send／Queue、新 Run retry、脱离原轮的 proposedPlan、Goal 新建／恢复、composer 模型／思考／Plan 写入和附件新上传。保留原稿、既有附件、历史复制／详情、Files 及原 Run 的取消／只读核对。Goal Pause／Clear 和同一 Run 的审批／问卷／Plan Exit 是既有控制决定，不要误接到“能否新建 Run”的开关上。

这是**保留 chat 观察视图的 UI/runtime 准备能力**，不是声称 Host 已有统一“所有 archived Session 都不可维护”的合同。实际 Host 仅 Run admission 明确拒绝 ARCHIVED；model/settings、mode、goal 配置仍允许维护。

## 基线与证据边界

- 检查时 HEAD `2416894`，包含插件 P1 `a373f93`。另有 dirty kernel/plugin-sdk、hbar-ui、desktop 及通用入口文件，本轮未触碰。
- navigation agent 的 directory、roster、tabs retirement／selection／restore fence 尚未提交；待其通知产品冻结、当前源 build＋6 E2E 通过后才做本轮独立生产构建。本文不是把未提交 archive 改动当成 HEAD 事实。
- 新隔离 production dist：`artifacts/desktop-entry-matrix/archive-readonly/web`。临时真实 Host 44975，生产 preview 44977；没有使用主线端口。
- [审计脚本](../artifacts/desktop-entry-matrix/archive-readonly/audit.spec.ts) 复用已有临时 Host：两个 locale 的 archive 观察测试，各有桌面原 observer 与**归档前就已加载**的 320 observer。原 observer 保留 Files，320 Files 会占据整个移动工具页；另一已加载 observer 不打开 Files，验证 composer 本身，而不是关闭原 Files 伪造截图。
- 初始四条历史由既有 fixture 的 Storage commit 生成，不是商业模型运行历史。text／attachment 是真实 composer 草稿，附件在归档前上传；归档后不点击 Send，不重放 Run，不移除原稿、附件或 Files。
- 在这两个临时 Host 中有两个明确配置探针：UI Plan 行确实调用 `mode.set`，以及 SDK 创建 `status:paused` 的 Goal。`autoContinue:false`；最终 snapshot 的 `runs=[]`。这证明当前配置合同对归档目标仍可写，**不是为它们新增只读策略**，也不是声称 UI Goal 发送成功。
- 唯一 Run 是独立取消测试：local-fixture 的 ask write_file 等待审批 → 外部 archive 返回 BUSY → 原 Stop 取消 → 实际 cancelled。没有批准工具，工具没有执行。审批／问卷在“已归档 + 活动 Run”组合下没有伪造测试事实。

## 实际画面与复现

最终 isolated browser audit **3/3，14.2s**。中英均验证原 A heading、四条历史、text 与原附件、Files、页签退役、保存偏好 `activeId:null / activeWorkspaceId:原workspace`，0 浏览器 pageerror。取消测试追加“工具目标文件不存在”断言后独立重跑 **1/1，5.1s**。

| 证据                                                                                                                                                                                                                                         | 可见事实                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [en 1440：保留 A／Files](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-archived-en-US-1440.png)、[zh 1440](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-archived-zh-CN-1440.png)              | sidebar A 行与 tab 已消失，原 chat 标题、历史、原附件与 text、右侧 Files 留在原位置，Send／执行准备入口可用；没有归档只读说明。 |
| [zh 320：composer](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-composer-zh-CN-320.png)、[en 320](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-composer-en-US-320.png)                       | 独立已加载 observer：原草稿仍可编辑，Goal、模型、思考强度、Send 仍可用；没有页面横向溢出。                                      |
| [zh 320：保留原 Files](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-archived-zh-CN-320.png)                                                                                                                          | 320 的 Files 工具页自然占据可见面板，不能拿此图当 composer 可见证明；原 Files 没有关闭。                                        |
| [zh 模型菜单](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-model-menu-zh-CN-1440.png)、[zh 思考 320](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-thinking-zh-CN-320.png)                    | 模型 option 与思考 slider 仍可选。思考仅打开然后 Escape，未提交值。                                                             |
| [en Plan 菜单](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-plan-menu-en-US-1440.png)、[zh Plan 菜单](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-plan-menu-zh-CN-1440.png)                 | Plan row 在归档观察视图中仍可用；点击后 Host `mode.get` 确认 plan。                                                             |
| [zh Goal 草稿意图](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-goal-intent-zh-CN-1440.png)、[zh 已暂停 Goal 摘要](../artifacts/desktop-entry-matrix/archive-readonly/evidence/external-goal-summary-zh-CN-1440.png) | Goal intent 可本地切入／退出；后续临时 Host paused Goal 的摘要、Resume／Clear 出现，原草稿不丢。未点击 Resume／Clear。          |
| [活动 Run 被拒绝归档，原审批与 Stop](../artifacts/desktop-entry-matrix/archive-readonly/evidence/active-archive-busy-approval-1440.png)                                                                                                      | Host 的 BUSY 不意味着归档成功；审批卡、原 Stop 都在，Stop 真实取消原 operation。                                                |
| [en 观测 JSON](../artifacts/desktop-entry-matrix/archive-readonly/evidence/observations-en-US.json)、[zh JSON](../artifacts/desktop-entry-matrix/archive-readonly/evidence/observations-zh-CN.json)                                          | 真实 accepted Session archived fact、前后可见按钮 disabled、model/mode/goal 查询、原稿、0 Run 和 pageerror。                    |

复现顺序：启动自己的临时 Host → 生产 App 选择 A 并等 editor 可编辑 → 写原稿／加原附件／打开 Files → 另一个 Client `session.archive(A,true)` → 原 observer 仅刷新该 workspace roster → 等 A 行／tab 退役 → 在原 loaded chat 查看、打开各准备入口。没有 `app.setSession(null)`、自动选 B、关闭 Files、清草稿或重建 App。

归档后按钮仍 enabled 是本轮实际 DOM 事实；Host ARCHIVED admission 已由 navigation agent 的独立临时 Host E2E 验证，本轮不为重复证明它再发送 Run。源码中的原子拒绝点见下表。

## Host 与 runtime：事实与可用性的分界

| 路径                                                                                           | 精确规则／目前缺口                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/state/directory.ts:10`                                                 | Session DTO 已有 exact id、workspaceId、archived、seq、updatedAt；不需要新 Host 合同。                                                                                         |
| `packages/kernel/src/workspace-session-commands.ts:51`                                         | archive 若 `kernel.active.has(sessionId)` 返回 BUSY，否则 updateSession；并不是“归档必然取消所有 Run／Goal”。                                                                  |
| `packages/storage/src/worker.ts:832`、`packages/kernel/src/run-commands.ts:87,117`             | 新 enqueue 在事务内检查 archived 并拒绝 ARCHIVED；Run 命令先 lookup 原 key，已有 receipt 可返回，不可把归档当未知旧提交必定未发生。                                            |
| `packages/kernel/src/run-commands.ts:134,188`                                                  | retry 最终也是新 submit／enqueue，应门禁；operation.cancel 绑定已有 operation，不以 archived flag 拒绝。                                                                       |
| `packages/kernel/src/index.ts:1349`、`packages/storage/src/worker.ts:876`                      | requestCancel 可取消 queued，或给 running/waiting Run 提交取消事实；不是新 Run，也不需要清 chat。                                                                              |
| `packages/kernel/src/interaction-commands.ts:25,76,94`                                         | PlanExit／普通审批绑定原 session＋approval／run／call；questionnaire 必须 still pending。`resolvePlanExit` 还核原 active Run (`kernel/index.ts:1298`)。没有统一 archive 禁用。 |
| `packages/kernel/src/settings-service.ts:199`、`model-commands.ts:89,91,121`                   | archived Session 仍存在，settings scope 仍有效；读模型合法，模型／思考设置没有 archive 判定。本轮只打开菜单，不写模型／思考。                                                  |
| `packages/kernel/src/configuration-commands.ts:203,205`、`plugins/plan/src/index.ts:276`       | mode.get/set 仍工作；本轮 UI set plan 的 ACK 与 Host 读取一致。                                                                                                                |
| `packages/kernel/src/goal-plan-commands.ts:23,33,43`、`plugins/goal/src/index.ts:782,837,1052` | Goal 可以读取与维护，没有 archive 统一判定；本轮 paused Goal 配置探针被 Host 接受，不产生 Run。                                                                                |
| `packages/app-runtime/src/directory.ts:101,241`                                                | mergeSessions 仅发布已接受的校验 Session facts；当前 selected 受 1000 条 cache 保护。roster absence/loading 不是 archive，旧 DTO 不应解除新 archived fact。                    |
| `workspace-tabs-runtime.ts:299`、`app-runtime/index.ts:278`                                    | 新退役观察仅移除 confirmed archived tab refs，不关闭 navigation／草稿／Files／Run；activeId 派生为 null。该选择保留语义无需推倒。                                              |
| `lumen-session-workspace.tsx:945,962,996,1031,1082`                                            | Send／Queue、权限／Plan、Goal、模型入口只看 configured、连接、pending、unknown 等，没有 accepted archived guard。                                                              |
| `lumen-session-workspace.tsx:426,943`                                                          | 附件 intake 也无 archive guard；原附件移除是本地 draft 动作，新 intake 会上传到 Host，两者应分开。                                                                             |
| `composer-intent.ts:323,457,480`                                                               | Goal submit 先创建 Goal 再 submit Run；只在 drafts 最后封 Run 不够，可能已经建立无法运行的 Goal。                                                                              |
| `drafts.ts:276,279,302`、`plan-proposal-actions.ts:310`                                        | 普通／detached Run 复用 owner；已有 receipt 核对不能被新的 archive guard 禁用。proposedPlan 是新 detached Run，与同轮 PlanExit 的不同能力必须保留。                            |

这些行号对应审计时当前工作树；directory／tabs 的最终提交会移动行号，模块和符号是更稳定的核对点。并发代理的在建变更未由本审计暂存。

## 最小 typed accepted-fact → composer guard 方案（未实现）

不维护第二份 Session archive 真相，也不以 `workspaceTabs.activeId === null` 当归档证据。向需要执行准备的 owner 注入同一个**派生的目标能力端口**，由 navigation identity 与 canonical directory 事实计算：

```ts
type SessionExecutionAccess =
  | {
      readonly kind: 'ready' | 'archived'
      readonly sessionId: string
      readonly workspaceId: string
      readonly seq: number
      readonly updatedAt: number
    }
  | {
      readonly kind: 'unverified'
      readonly sessionId: string
      readonly workspaceId: string | null
    }

interface SessionExecutionAccessPort {
  // Uses accepted canonical facts; no RPC or new mirror in the React View.
  readonly get: (sessionId: string) => SessionExecutionAccess
  readonly assertCanPrepareRun: (sessionId: string) => void
}
```

- `ready` 仅来自 exact session＋workspace 的 accepted `archived:false` fact；`archived` 来自 accepted true。缺 cache、列表分页缺席、loading、读失败均为 unverified，不能伪装已归档或已恢复。
- selected A 的完整事实本来受 directory cache 保护；若后续采用 accepted-fact 订阅来驱动 reader，只保留状态／版本投影，不另建 full Session cache。旧 seq／旧 updatedAt 的 unarchived 读取不能解除锁。
- Guard 从组合根装配，业务 owner 不导入 React，也不越层访问 navigation agent 的私有集合。UI 读 typed state，只交 commands；localized 只读说明由 host labels 提供。
- 普通 `composerIntent.submit` 应在 Goal／permission／mode 准备之前检查，并在 await 后进入具体写前再次核 captured session。drafts 的所有新 submit／retry／detached 分支也做相同 guard，避免程序化命令绕过按钮。**只有 accepted archive fact 已被该 owner 观察、且具体写尚未 dispatch 时**，该检查才能保证不派发这笔新 Goal／配置／Run 写，不新增或消费这笔尚未捕获的 approval choice。
- composerModel 写、composerPlanMode.setMode、Goal create／resume／编辑、附件新 intake 同目标检查；读取与原 key 的 unknown reconcile 不受新写门禁影响。迟到 ACK 仍归原目标，不改变 archived 投影，不抢另一会话。
- 上层错误区应直接说明“此会话已归档，原稿与历史已保留；恢复后可发送”，并提供现有目标 workspace 的归档列表入口。不要点一次就自动 restore／导航／清草稿；restore 是独立显式用户意图。
- 若用户显式恢复且有更新的 accepted false fact，原保留 observer 可以解除准备门禁，仍保留原稿。不得据 mode/model 读取成功推定恢复，也不得自动重开已退役 tab 或替换当前用户选择。

### TOCTOU：派发前检查不是 Host 原子策略

Goal／model／mode 写**已经 dispatch** 后，后来被观察到的 archived fact 不能撤销原请求。当前这些 Host 合同没有归档原子前提，也不接收上述 UI fact version；前端检查无法承诺零 Goal／零配置写，更不能自动补发 rollback／clear／反向 mode.set。必须保留原捕获目标、原 key／payload、直接 ACK、unknown 和可能的 partial 反馈；如果 Goal 已经创建而后续新 Run 被 ARCHIVED 拒绝，明确展示已创建 Goal 与尚未运行，不能抹为“什么也没发生”。已经捕获的 permission／receipt 生命周期仍由原 owner 完成，不据 archive 强行 reset。

Run 是另一条已有权威边界：Storage `enqueue` 在同一事务视图检查 archived。**归档事务先提交、新 enqueue 后执行**时，Host 原子拒绝新 Run；若原 Run 在归档前已经入列／有 receipt，不能声称总 Run 数为零、删除旧 receipt 或用新 key 重放。UI guard 不新增或替代这条 Host 策略。

因此测试必须明确分“dispatch 前已观察归档”与“dispatch 后归档／回执迟到”两路，不能用前者的零写断言覆盖后者。

### 能力分组，不能一个 disabled 包办

| 归档后能力                                                           | 建议                                                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 历史正文／复制／工具详情、model/mode/Goal 读取、旧回执核对           | 保留；不发送新写。                                                                                                                                   |
| 原未发送文本／原附件                                                 | 原值保留。最小修复可允许本地 scratch 编辑／移除，禁用发送和新上传；若要编辑器本身只读，应另用明确 editor 能力，不能借 Prompt.disabled 把 Stop 封掉。 |
| 新 Send／Queue、run.retry、detached proposedPlan Implement／Continue | 禁用＋就近说明，runtime 门禁；本轮没有伪造旧 proposal 来验证按钮。                                                                                   |
| composer 的模型／思考／持久 Plan、Goal 新建／恢复／编辑              | 作为新执行准备禁用；Host 配置维护 API 并未改成全局归档拒绝，Global Settings 等别处维护能力不是此单元扩张范围。                                       |
| Goal Pause／Clear                                                    | 可以按原 goalId 保留显式安全控制；不把它们当停止当前 Run，不自动执行。                                                                               |
| 原 Run Stop／Cancel、审批 Allow／Deny、问卷回答、同轮 PlanExit 决定  | 按原 Run／call／pending／unknown 合同决定。接受 archive 不等于 Run 终态；即使通常 active archive 是 BUSY，也不应从 UI 毁掉取消或只读恢复路径。       |
| Files                                                                | workspace／document 作用域不因 Session archive 自动只读；保留原 instance、文件草稿与已有合法功能。不得被 composer 门禁关闭或清空。                   |

共享 `packages/lumen-app-ui/src/session-components.tsx:461` 的 Stop 禁用条件包含 `runningActions && props.disabled`。因此最小宿主修复应设置 `canSubmit`／`canAddAttachments` 与准备控件 disabled，不给整个 Prompt 追加 archived disabled。若需要更细的编辑器只读 API，留作独立共享契约，不用 CSS 隐藏按钮或以 aria 文案选择器代替能力。

## cc-haha 对照：不是 Archive 同义迁移

cc-haha 普通 Sidebar Session 管理没有与 hbar `Session.archived` 等价的 restoreable archive 合同。locale 中有历史 `archiveAllChats` 和 Agent Teams 的 archived execution 文案，不能据此说普通 Session 已有本功能。原 delete 是不同破坏性语义：

- `desktop/src/api/sessions.ts:412` 调 DELETE `/api/sessions/:id`。
- `desktop/src/stores/sessionStore.ts:178` 成功后删列表记录、清 runtime selection、当前 activeSessionId 置空。
- `desktop/src/components/layout/Sidebar.tsx:768` delete 成功后 disconnect 原 session、closeTab，再关闭确认；失败不会先做这一步。
- `desktop/src/stores/tabStore.ts:357` 当前 tab 关闭后选择同位置邻居／最后一个／null，并保存 tab state。

原 [running close dialog](../artifacts/reference-ux-v2/29-reference-tabs-running-close-dialog-1440.png) 与 [tabs initial](../artifacts/reference-ux-v2/29-reference-tabs-initial-1440.png) 是此前**原组件隔离 fixture**的 tab close 视觉，不是 delete 或外部 archive 的业务截图。本轮没有新增 cc delete 真实删除实验，不能把这两图包装为 archive UI。迁移应借鉴“目标与反馈明确、已关闭不可误发”，不复制 delete 后清空当前视图来丢掉 hbar 原稿。

## 下一垂直子功能的验收矩阵

1. en／zh、1440／320：external accepted archive A 后原历史、草稿、附件、Files 不变；无新 Send／Queue／Goal prepare／model/mode 写；就近只读说明可见，Enter 同样不写。
2. A／B 快切、旧 read／ACK、缓存边界：仅 exact accepted A archive 影响 A；B 可继续发送；旧 A false 不能解除门禁；missing/cache absence 不是 archive。
3. dispatch 前：async Goal snapshot／model／mode 准备尚未发出具体写，owner 已观察 accepted archive，再做写前复核；该笔新 Goal／配置／Run／attachment upload 派发数为 0，原稿不丢，不新增该笔尚未捕获的 permissions choice。dispatch 后：分别延迟已派发的 Goal／model／mode ACK，再接受归档；原 captured 写可能仍提交，保留真实 ACK／unknown／partial、原 key 与 choice 生命周期，禁止自动 rollback、伪报零 Goal 或迟到反馈串到 B。Run 则按 archive／enqueue 的事务先后验证 ARCHIVED 或原既有 receipt，不伪报总 Run 为 0。
4. 原 unknown submit／附件／model／mode 操作：保留原 key／payload／目标，只读核对不被门禁阻断；archive 不是原写从未发生的证明。
5. 一个安全 local-fixture active／waiting Run：archive BUSY 不产生 false archived；原 Stop 可用并确认 cancelled；原审批只按目标／pending 与决议事实展示，不造 success。
6. updated accepted restore false：原稿保留、准备能力恢复；不自动导航／重开 tab；restore unknown／失败不解除已归档门禁。
7. proposedPlan detached 新 Run 与 PlanExit 同一 Run gate 分别测，不能用同一 canSubmit 判断两者；Goal Pause／Clear 与 Resume 的能力分别测。

此清单是下一实现的要求，**不是本轮全部已通过能力**。本轮验证的是当前差距、观察保留和 active BUSY／Cancel 的真实边界；没有实施 guard，没有全仓 check、原生 smoke、delete 实验、已归档 pending questionnaire／PlanExit、取消 unknown 故障注入或 restore E2E。审计脚本 scoped strict TypeScript、本文 Prettier 与 17 条本地证据链接检查已通过。Vite 生产构建退出 0，既有大 chunk 提醒仍在；临时 Host teardown 有代理 ECONNRESET 日志。
