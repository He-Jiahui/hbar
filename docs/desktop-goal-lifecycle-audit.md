# Goal 生命周期时间线：参考证据与最小公开读取合同

本文件保留 2026-09-25 的**实施前审计与合同设计**；其中现状差距表是当时状态，不是最新产品缺口。此后的 Host `7c6e6e9`、runtime `3e2d02b`、UI `bea70a7` 及真实浏览器／原生验收见 [Goal 生命周期交付](desktop-goal-lifecycle.md)。参考截图仍由原 MessageList／ActiveSession 的隔离 fixture 生成，不启动业务 Host/provider；它们证明参考表达，不代替 hbar 业务验收。参考 HEAD 为 `e28d0a65`，按 hbar-engineering、reference-flow-layout、content-contract、icon-scale 审查。

## 实施前结论与交付边界

`a336682` 已交付的是自动续作 **Run 边界**：根据已持久化 `Run.input.source === 'goal'`，在该 Run 的已加载消息/流前放一条只读分隔。它不证明历史目标、预算、暂停、恢复、完成或清除，也不补取分页范围外的 Run。完整 Goal 生命周期尚未实现。

Host 的 canonical log 已保留 `goal.created`、`goal.updated`、`goal.accounted` 的事件时目标快照，以及 `goal.cleared`。这些事实足以重建本文件列出的中性生命周期状态；不需要为 UI 再创建一套 Goal 真相。需要新增的是 **适合历史时间线的有界、带锚点及前置状态的类型化读取合同**，并接入 runtime 的分页、恢复与合并。不能从当前 `goal.get` 倒推历史。

必须区分已有能力：typed `session.export` **已经**是公开、只读、有界的原始事件分页 query，`after` 正向游标、每页最多 500 条。它可以从零顺序读出 canonical log；不是“完全没有公开历史读取”。但它没有 Goal 类型过滤、逆向历史页、一致性锚点或前置 Goal 状态；当前 timeline 也未使用它。加载几个稀疏 Goal 卡片不应扫描整份会话日志。旧 RPC `session.export` 固定返回前 100000 条，与 typed query 不是同一个分页使用方式。

## 参考入口、布局与证据

| 区域         | cc-haha 当前行为                                                                                                                                                                                   | hbar 当前行为与必要差距                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 设置入口     | `/goal <condition>` 是本地命令，命令输出进入 transcript；SlashCommandMenu 用 Target 图标，命令 description 是设置完成目标。清除用 `/goal clear`。                                                  | composer 的 Goal chip 是“下一次草稿创建目标”的本地准备态，发出才创建；Goals 工具入口进入当前目标编辑面板。二者不等于已提交历史卡。不得伪造用户 `/goal` 消息来补齐外观。                             |
| 当前目标摘要 | `ActiveGoalStrip` 在 **SessionChatHeader 元数据下面、MessageList 上面**；目标、状态点、objective 一行；大屏可见 budget/elapsed/continuations。没有暂停/清除/编辑按钮。完成后隐藏。                 | `HbarComposerGoal` 在 **session footer 内、composer 上面**，含暂停/恢复/清除/展开。将当前目标摘要迁到标题下是独立视觉闭环；已有控制能力不必删除，但应保留唯一入口、就近反馈，不能再画两条同义摘要。 |
| 窄屏摘要     | ActiveSession 的整个 SessionChatHeader 被 `!isMobileLayout` 包住，所以 mobile layout **不渲染**该 strip；非 mobile 的窄 header 隐藏 metrics，objective 截断。                                      | 不能声称参考在 320px 也有相同 header strip。hbar 若保留窄屏摘要/控制，需明确这是可访问性适配，验证换行/展开及功能可达，不照搬截图固定高度或坐标。                                                   |
| 生命周期卡   | `GoalEventCard` 默认展开；整行标题按钮可折叠，chevron + Target + 事件标题 + 可选状态；下层 objective/message 与可换行的状态、budget、continuations 小标签。设置/状态/暂停/恢复/完成/清除同一家族。 | 当前消息投影只有 message、stream、goalContinuation，没有这些历史卡。需用真实事件时快照，组件只接 typed row 与 host labels；卡片是历史事实，不提供对旧 Goal 的暂停/恢复按钮。                        |
| 自动续作     | `action=status && status=continuing` 使用轻量左右细线 divider，不套普通卡。                                                                                                                        | `a336682` 已有独立分隔；保留 Run 身份与现状，不把一次 continuation 解释成 Goal 创建/完成。新生命周期卡不得重复同一续作边界。                                                                        |

可核对的参考源码：

- [ActiveSession.tsx](../../cc-haha/desktop/src/pages/ActiveSession.tsx)：104 为 strip 定义；114 完成隐藏；119 运行/暂停/active 文案；124 metrics；148 窄宽度隐藏 metrics；805 desktop guard；827 实际 strip 位置；854 MessageList。
- [MessageList.tsx](../../cc-haha/desktop/src/components/chat/MessageList.tsx)：296 GoalEventCard；298 默认展开；301 metadata；308 card flow；335 body；367 continuation divider；3866 goal_event 分支。
- [types/chat.ts](../../cc-haha/desktop/src/types/chat.ts)：308 GoalEventAction；367 goal_event DTO。
- [chatStore.ts](../../cc-haha/desktop/src/stores/chatStore.ts)：3860 live goal_event；4587 归一化；4615 activeGoal 归并；4643 历史重建；4682 本地命令输出映射；5768 本地 Goal 命令 transcript。
- [goal/index.ts](../../cc-haha/src/commands/goal/index.ts)：Goal 本地命令定义；[goal/goal.tsx](../../cc-haha/src/commands/goal/goal.tsx)：设置/清除的实际命令路径。
- [ActiveSession.test.tsx](../../cc-haha/desktop/src/pages/ActiveSession.test.tsx)：519 strip；571 完成隐藏；637 活动面板不放 composer 区。 [MessageList.test.tsx](../../cc-haha/desktop/src/components/chat/MessageList.test.tsx)：1307 设置卡、1333 unlimited、1364 续作。

已实际查看的画面及其证明范围：

- [公开 session-main.webp](../../cc-haha/docs/images/app/zh-CN/session-main.webp)：完整应用的标题、消息区、底部 composer 层级；该画面没有 Goal，**不能证明 Goal 卡或 strip 的实测样式**。
- [原 MessageList 1440 续作隔离截图](../artifacts/goal-continuation/reference-zh-CN-1440.png) 与 [320 续作隔离截图](../artifacts/goal-continuation/reference-zh-CN-320.png)：旧 fixture 只有“上一回复 → continuing divider → 下一回复”；不是完整应用或真实服务，**不包含设置/完成卡与 ActiveGoalStrip**。[旧 fixture main.tsx](../artifacts/goal-continuation/reference/main.tsx) 可核对输入，旧证据未被修改。
- 新增 **原 MessageList GoalEventCard 隔离证据**：[英文 1440 展开](../artifacts/goal-lifecycle/reference-en-US-1440-expanded.png)、[中文 1440 展开](../artifacts/goal-lifecycle/reference-zh-CN-1440-expanded.png)、[英文 320 展开](../artifacts/goal-lifecycle/reference-en-US-320-expanded.png)、[中文 320 展开](../artifacts/goal-lifecycle/reference-zh-CN-320-expanded.png)。7条人工 typed `goal_event` 覆盖 created/replaced/status/paused/resumed/completed/cleared；直接 import 原 MessageList，**没有复制 GoalEventCard 源码**。这些输入不是 Host 产生的真实业务历史，不证明生命周期后端已接线。
- 原 pane 在320宽度需要正常垂直滚动：[英文 320 尾部](../artifacts/goal-lifecycle/reference-en-US-320-expanded-tail.png)、[中文 320 尾部](../artifacts/goal-lifecycle/reference-zh-CN-320-expanded-tail.png) 可看到完成与清除卡；不是隐藏末项或按截图硬缩高度。折叠态：[英文 1440](../artifacts/goal-lifecycle/reference-en-US-1440-collapsed.png)、[中文 1440](../artifacts/goal-lifecycle/reference-zh-CN-1440-collapsed.png)、[英文 320](../artifacts/goal-lifecycle/reference-en-US-320-collapsed.png)、[中文 320](../artifacts/goal-lifecycle/reference-zh-CN-320-collapsed.png)。截图视口高度1280，只有 fixture header 与 MessageList，不模拟完整 App chrome。
- [新 fixture main.tsx](../artifacts/goal-lifecycle/reference/main.tsx)、[typed fixture 数据](../artifacts/goal-lifecycle/reference/fixture-data.ts)、[Vite 配置](../artifacts/goal-lifecycle/reference.vite.config.ts)、[自动浏览器脚本](../artifacts/goal-lifecycle/capture-reference.ts) 与 [DOM 观察](../artifacts/goal-lifecycle/reference-observations.json) 可复现上述10图。原 `theme/globals.css`、自托管字体与 Tailwind source 均实际载入；DOM body 为 Inter/PingFang SC/Microsoft YaHei 的原字体链，Inter加载确认，不是浏览器 Times 默认字体。独立production build与4组浏览器fixture检查通过：每组7卡默认展开、点击折叠、Enter/Space原位切换且焦点保留、单卡独立展开、无页面水平溢出、无pageerror。未接Host或provider，脚本拒绝API与跨origin请求。
- 后续已实际挂载**原 ActiveSession 整页**补顶部条，而非复制私有函数：[中文1440 active](../artifacts/goal-lifecycle/header-reference-zh-CN-1440-active.png)、[英文1440 active](../artifacts/goal-lifecycle/header-reference-en-US-1440-active.png)、[中文900 paused](../artifacts/goal-lifecycle/header-reference-zh-CN-900-paused.png)、[中文1440 completed](../artifacts/goal-lifecycle/header-reference-zh-CN-1440-completed.png)。原标题/metadata下方是Goal strip，再到MessageList，原ChatInput留在底部；900的strip metrics隐藏，completed的strip移除而完成卡保留。
- 原mobile guard实际截图：[中文390 active](../artifacts/goal-lifecycle/header-reference-zh-CN-390-active.png)、[中文320 active](../artifacts/goal-lifecycle/header-reference-zh-CN-320-active.png)、[中文320 paused](../artifacts/goal-lifecycle/header-reference-zh-CN-320-paused.png)。原ActiveSession通过`useMobileViewport(max-width:767px)`不挂header和strip；消息与原composer仍可见。这不证明完整App壳的mobile导航，也不是hbar删除已有工具header/Pause/Clear能力的依据；hbar移动Goal摘要紧凑正常流属于保留能力的明确适配。
- [header fixture入口](../artifacts/goal-lifecycle/header-reference/main.tsx)、[typed stores输入](../artifacts/goal-lifecycle/header-reference/fixture-data.ts)、[复现与边界](../artifacts/goal-lifecycle/header-reference/README.md)、[捕图脚本](../artifacts/goal-lifecycle/capture-header-reference.ts)、[DOM观察](../artifacts/goal-lifecycle/header-reference-observations.json)记录en/zh×1440/900/390/320×active/paused/completed共24组，高度900，独立port44907/build目录。body与Goal text使用原Inter字体链；header h1用原`--font-headline` Noto Serif SC/宋体/Georgia链（globals.css:694），其衬线外观是原设计，不是漏载样式。桌面是明确non-touch浏览器profile、mobile是touch profile；未挂Electron preload或App导航壳。原ActiveSession/Header/strip/MessageList/ChatInput未被替换，API/health/跨origin HTTP及全部WS被拒绝，pageerror为0、无页面水平溢出；所有Goal状态仍是人工store注入，不证明真实业务迁移或持久恢复。
- [hbar 真实临时 Host 1440 截图](../artifacts/goal-continuation/host-zh-CN-1440.png) 与 [320 截图](../artifacts/goal-continuation/host-zh-CN-320.png)：续作 divider 已存在，暂停目标 strip 当前位于 composer 上方。

因此，生命周期卡与“标题元数据 → Goal strip → MessageList”的**原页面实际渲染**证据均已补齐。`ActiveGoalStrip`虽是私有函数，已通过挂载原ActiveSession而得到，不需复制或改公开export。还未验证完整App导航壳、Electron环境、真实Goal业务状态转换、Host持久刷新与回执；隔离fixture必须与这些能力明确区分。

新画面同时证实源码细节：中文事件标题已翻译，但fixture传入的status仍按原组件原样显示 `active/paused/complete`；elapsed虽在typed事件中提供，GoalEventCard没有渲染它；标题按钮支持原生键盘，但当前未设置aria-expanded。hbar实现时应使用typed host status文案与展开语义，不把这些参考缺口复制成目标要求。旧续作divider证据仍只是已交付子集；新fixture也不是hbar生产生命周期能力或完整应用验收。

## 实施前的 hbar 事实来源与读取缺口

| 来源                                                                                                                                                                                                                                                                                      | 权威与限制                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [plugins/goal/src/index.ts](../plugins/goal/src/index.ts):51、124、533                                                                                                                                                                                                                    | persistedGoal 有稳定 goalId、事件时 objective/status/budget/usage/time/continuationCount；`eventGoal` 识别 created/updated/accounted；persist 先 append 再 notify，通知只有最新 public goal，不是原事件/action。 |
| 同文件 :740                                                                                                                                                                                                                                                                               | `goal.cleared` 数据仅 `{sessionId}`，没有旧 goalId/快照。必须使用同 session 的紧邻前置 Goal 状态，不能用当前目标填充。                                                                                           |
| 同文件 :782、837、892、935                                                                                                                                                                                                                                                                | create 正常写 created；`goal.set` 在没有 Goal 时也可写 **updated**；替换 objective 创建新 goalId，写 created，另发的 `goal.replaced` hook **不是持久事件**。不能机械按事件名判断所有 created/replaced。          |
| 同文件 :994、1067                                                                                                                                                                                                                                                                         | blocked/complete 经领域校验；accounted 可将取消目标置 paused、用量受限置 usage_limited；预算投影可置 budget_limited。Run completed 不等于 Goal complete。                                                        |
| 同文件 :85、345                                                                                                                                                                                                                                                                           | publicGoal 不包含 continuationCount；goal.run_bound 是 Run accounting 关联，不是给用户画的生命周期卡。新 public history 必须显式选择允许公开的事实字段，不能泄露整份内部 Goal 对象。                             |
| [contracts/commands/goals.ts](../packages/contracts/src/commands/goals.ts):14、20、26                                                                                                                                                                                                     | goal.get/snapshot 只有当前 Goal 与游标；通知投影 `GoalPlanChange` 只有最新值，不带 eventId/前值/生命周期动作。                                                                                                   |
| [contracts/commands/workspaces.ts](../packages/contracts/src/commands/workspaces.ts):147；[kernel/workspace-session-commands.ts](../packages/kernel/src/workspace-session-commands.ts):109                                                                                                | typed session.export 正向原事件分页，limit≤500，有 cursor/nextCursor。可作为诊断/有限小历史复用，但不适合稀疏 Goal 卡的逆向按需加载。                                                                            |
| [storage/worker.ts](../packages/storage/src/worker.ts):535、613                                                                                                                                                                                                                           | internal events 按 seq 正向；snapshot 仅 messages 页、最近 40 Runs、approvals/usage/cursor，无 Goal 历史。                                                                                                       |
| [host/server.ts](../apps/host/src/server.ts):718、761                                                                                                                                                                                                                                     | follow 超过 2000 待回放事件或无效 cursor 返回 reset；旧 export RPC 固定大列表。不能把 follow 当完整历史 API。                                                                                                    |
| [app-runtime/session-timeline.ts](../packages/app-runtime/src/session-timeline.ts):20、87、263、325                                                                                                                                                                                       | current messages 上限1000、Runs80、tail events1000、缓存8会话；fresh snapshot 的 events=[]；loadOlder 只翻 messages/关联 approvals，不翻旧 events/Runs。刷新、>40 Runs、空消息 Goal、清除后无法完整展示历史。    |
| [app-react/session-message-model.ts](../packages/app-react/src/session-message-model.ts):33、44；[lumen-session-workspace.tsx](../packages/app-react/src/lumen-session-workspace.tsx):779；[composer-intent-controls.tsx](../packages/app-react/src/composer-intent-controls.tsx):41、102 | 现序列仅 message/stream/continuation；Goal chip 和 footer 控制基于当前 facts。历史不能复用这份当前 snapshot 作为目标内容。                                                                                       |

### 可以从持久事实显示什么

| 事件与同 session 前置状态                                             | 可以显示                                                     | 禁止推断                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 第一个有效 created，或无前置 Goal 的 updated                          | 已设置目标，使用该事件 goal 快照                             | “updated 必然是修改”；任意更早、未读取目标内容                          |
| goalId 改变，前目标未完成                                             | 目标已替换；可带 previousGoalId 关联                         | 非持久 hook 自己的时间/原因/actor                                       |
| 前目标已 complete 后出现新 goalId                                     | 新目标已设置                                                 | 默认说“替换未完成目标”                                                  |
| 同 goalId 的 tokenBudget/objective 等实际改变                         | 设置已更新；只列有证据的前后值                               | 未改变的 accounting 也画一次“编辑”                                      |
| 同 goalId 状态进入 paused/active/blocked/usage_limited/budget_limited | 暂停/恢复/受阻/用量受限/预算受限，依 status 与前状态归类     | 谁点击暂停；失败 Run 必然暂停；预算受限必然用户操作                     |
| 同 goalId 首次进入 complete                                           | 目标已完成，保留完成事件时 objective、usage、budget、elapsed | assistant 正文说完成、Run completed、pending 消失就是完成               |
| complete 后再有 accounted，status 未变                                | 更新同目标的已确认 accounting 事实，默认不多画“完成”卡       | 将较晚总量无标识地冒充完成时总量；使用全 session usage 代替 Goal 使用量 |
| cleared                                                               | 已清除，目标身份来自前置状态；该事件 goal=null               | 当前新 Goal 的 objective；clear 的 command 返回之前就画已清除           |
| run_bound、纯 usage/accounting/continuation phase 更新且状态无变化    | 只维护投影/计数，不刷屏制造卡片                              | 每个内部计费/重试事件都变成用户生命周期操作                             |

完整状态史是“Host 确认了目标状态的变化”，不是操作审计。现有事件没有稳定保存每次变更的 actor/用户意图或清除原因；若以后要求这些字段，需单独新增领域事实，不能从日志文案或 Run failure 反推。

## 建议的最小 `goal.history` query

以下是**待实施 v1 合同**，名称可在实现前调整，但身份、边界与恢复语义不可省略。只读、session scope；鉴权及 session 存在性沿用公开命令链。规则放 kernel/Goal service 与 StoragePort，不放 WS Controller，不由 View 直接调用 RPC。

```ts
type GoalHistorySnapshot = {
  goalId: string
  objective: string
  status: GoalStatus
  tokenBudget: number | null
  tokensUsed: number
  timeUsedSeconds: number
  createdAt: number
  updatedAt: number
  continuationCount?: number // 仅历史中实际存在且校验通过的值
  executionBudget?: ExecutionBudget // 原事件已保存的预算事实，不实时重算
}

type GoalHistoryFact = {
  eventId: string
  sessionId: string
  seq: number
  time: number
  runId: string | null
} & (
  | {
      type: 'goal.created' | 'goal.updated' | 'goal.accounted'
      goal: GoalHistorySnapshot
    }
  | { type: 'goal.cleared'; goal: null }
)

type GoalHistoryInput = {
  sessionId: string
  anchorSeq?: number // 首页省略时在同一读事务捕获 session.seq
  beforeSeq?: number // exclusive；省略表示读到 anchorSeq，绝不越过 anchor
  limit?: number // 默认50，1..100
}

type GoalHistoryPage = {
  sessionId: string
  anchorSeq: number
  items: readonly GoalHistoryFact[] // page 内按 seq 升序
  preceding: {
    seq: number // 紧邻首项之前的 canonical Goal 状态；全历史起点为0
    goal: GoalHistorySnapshot | null // 最近 cleared 后为null
  }
  nextBeforeSeq: number | null // 有更旧项时等于本页最小seq；否则null
}
```

合同必须满足：

1. 每页在同一只读事务视图内获取 anchor、最多 `limit+1` 条候选及最多一条前置 Goal 事实。候选只包括四种 canonical Goal 类型，SQL 按 session/type/seq 过滤、逆序取页，再升序返回；不能在每页从 seq0 重放全部 events。索引/操作数需实测。返回所有候选事实，再由纯投影过滤无语义变化的 accounting，避免页面仅因 UI 过滤而失去游标。
2. `anchorSeq` 是会话 canonical event 序号，不是 Goal 数量、Run 序号或时间戳。用户翻更旧页沿用同一 anchor；`beforeSeq` 严格变小，非空页游标必须推进。非法/future anchor、跨 session 数据和畸形事实返回稳定码，不能夹带敏感 payload。
3. `preceding` 仅用于识别首项 created/replaced/resumed/cleared 及旧 objective，**不渲染成新卡**。查询前置时包括 cleared，不能越过清除去复活旧目标；无历史是 seq0/null，不能用 current goal 补齐。坏数据不能静默跳过后还声称历史完整。
4. 快照归一化字段须有公开 Zod schema；snapshot.goalId 必须与原事实一致，threadId/sessionId 一致。删除 accounting 内部数组、trigger/retry/repair 等实现数据；budget/usage/time 不从当前预算服务或全会话 totals 重算。continuationCount 缺失就不画，不猜0或取当前累计。
5. 读取不调用 `goal.set`、不启动/恢复 Run、不写通知/计费。session fork 子会话若没有自己的 Goal 事件就返回空历史，不能继承 parent 当前目标；source RunId 仅关联显示，不要求最近40个 Run 快照里仍有该 Run。

当前类型化 session.export 可提供一个**有限原型**：限定总页数/事件数，从0正向 fold。它不能被宣告为以上查询的性能、逆向分页和一致性语义已实现；若选择该过渡方案，UI 必须明示未加载/容量边界。

## 时间线合并、分页、刷新与生命周期

- 历史事实以 `(sessionId,eventId)` 去重，按 canonical `seq` 排序；校验同 session 的同 seq 不发生矛盾身份。实体关联用 goalId，Run 关联用事件 runId；不按目标文本、翻译文案、updatedAt 或当前 Goal 状态去重。事件时快照不被同 ID 的后续快照覆盖。
- 创建/暂停/完成/清除卡的 row id 绑定造成语义变化的 eventId。将归一化 Goal facts 与已提交 message.seq 归并在同一只读时间线；未持久 stream 无 seq，仍在其原 Run 的尾部，不把正在流式输出当完成事实。沿用既有 tool pairing，不拆散消息内工具详情。
- 首次读取使用 `session.snapshot.cursor` 作为 `goal.history.anchorSeq`。先建立有界订阅/缓冲，再读首个 Goal 页；只合并 `seq>anchorSeq` 的新事实。复用现有 session watcher，不给每个卡片建立连接。
- 两种分页游标不能混用：messages 的 before 与 Goal history 的 nextBeforeSeq 分别归属原分页 owner。更旧 messages 加载时，补齐其 canonical seq 窗口内的 Goal 页；没有消息的 Goal-only 会话也可独立翻历史。未补齐的范围显示“目标历史待加载/重试”，不得把 nextBeforeSeq 仍非空解释成完整历史。
- 可以先缓存较早 Goal 页，但不要把它们越过尚未加载的消息区间插进一个看似连续的 transcript。原子合并已覆盖区间，或放明确的历史缺口/加载入口。两个集合的初页、后续页与缓存都有界，渲染仍归属消息 pane 的 scroll，不加固定高度卡片滚动箱。
- `goal.updated/cleared` 通知没有 eventId，只能作为指定 session 的失效信号；可信 raw `session.event` 经同一 schema 归一化后可增量归并。Goal 序号间隔可以是正常非 Goal 事件，不能要求 Goal seq 连号；连续性由全 session watcher 的 cursor 保障。
- 断线、follow reset、明确刷新、缓存淘汰、未知写核对后，重新取有界 history 页与锚点。重连新页若未覆盖上次已知尾部，继续有界补页或显示明确缺口，不简单取“见过最大 seq”当已完整。已确认旧卡保留为只读历史，读取失败只标 stale/error，不改成完成或清除。
- 请求捕获 Host/connection generation + sessionId + history generation。A→B 切换后 A 的旧页不得污染 B、抢滚动/焦点；dispose/隐藏不再需要的 owner 释放订阅与在途读取。单会话每种读取单飞，禁止每个流式 token 全量刷新 Goal 历史。
- 建议沿用缓存8会话，另设每会话最多1000条 Goal source facts；超界提供明确历史容量/继续读取策略，不静默丢旧事实再说“完整”。“全生命周期”表示每类事实与恢复路径闭环，**不是首屏无限加载整个数据库**。
- 当前 strip 独立订阅最新 Host Goal；历史卡仅读 history。写命令的 pending/partial/unknown 仍在原目标控制旁，由现有 command receipt/reconcile 确认；pending 不是历史事件，不出现在已确认历史卡里。clear/replaced 后旧卡保持。Goal 控制目标绑定 expectedGoalId，不能对旧卡直接操作新的当前 Goal。

## 可独立实施的最小纵切

1. **Host 读取合同单元**：contracts Goal history DTO/query → StoragePort 有界筛选/前置读取 → kernel/Goal service 归一化 → Client adapter。保留既有 goal.get/snapshot/export 语义，不修改 Goal scheduling 或计费。
2. **runtime 历史 owner 单元**：独立 Goal history state/typed refresh/loadOlder，接入 timeline 消息窗口与 session watcher，测试 page/reload/generation/容量；只投影既有事实，不新增另一套当前 Goal 状态。
3. **UI 单元**：独立 `GoalLifecycleCard` 与纯序列投影，typed host labels；创建/状态/完成/清除默认可折叠。把当前摘要放到 header 下，控制保持唯一且可达，完成隐藏摘要但保留完成卡。原组件截图与真实 Host en/zh 1440/390/320 对照。

可新增独立文件 `packages/contracts/src/commands/goal-history.ts`、`packages/storage/src/goal-history.ts`、`packages/kernel/src/goal-history-commands.ts`、`packages/client/src/goal-history.ts`、`packages/app-runtime/src/goal-history.ts`、`packages/app-react/src/goal-lifecycle.tsx/.css` 与各自测试；公共出口、StoragePort/worker dispatcher、composition root、workspace/host copy 只精确改必要 hunk。以上文件是建议所有权，不是已存在或已接线的能力。

## 必须完成的验收矩阵

| 层         | 行为与可观察断言                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host 事实  | create、无 Goal 时 set(updated)、替换、预算编辑、paused→active、blocked、两种 limited、complete、clear；一条 complete 只生成一完成身份；Run completed/普通 assistant“完成”不生成完成卡。                |
| 事件时内容 | G1完成→G2创建→clear 后，G1 objective/预算/使用量仍为G1事实；完成后 accounted 不伪造完成时总量；无budget、0使用、缺continuationCount正确省略；不输出accountedRuns/repair等私有字段。                     |
| 边界/身份  | clear落在第一页首项、前置状态在上一页；中间clear不能复活更早Goal；跨session/threadId/重复event/同seq矛盾拒绝；fork子会话不继承父Goal历史；无message也能显示Goal设置与清除。                             |
| 分页/成本  | limit0/101非法，1/50/100及多一条游标；只有accounting的页仍推进；>40 Runs、>2000普通events夹少量Goal、>1000 Goal facts的明确上限；有限SQL操作数/查询计划，不按目标数重复全日志扫描。                     |
| 刷新/重启  | 真实Host刷新及重启后创建/暂停/完成/清除卡与canonical log一致；重连遗漏通知、follow reset、旧页与实时事件交叠不丢/不重；空历史、加载失败、重试及capability缺失均就近反馈。                               |
| 并发/资源  | A/B快速切、旧连接回包、page加载时replace/clear；只对原session应用；隐藏/关闭/dispose后无额外listener；stream帧不触发重复history reads。                                                                 |
| UI/可达    | 原GoalEventCard与ActiveGoalStrip真实fixture截图；hbar en/zh 1440/390/320、长objective/翻译、键盘折叠/展开；title下摘要与composer无重复条；窄屏控制可达、无水平溢出；历史卡无误导旧Goal操作或Copy/Fork。 |
| 真实动作   | 设置后已确认卡→暂停确认→恢复确认→实际完成→新目标/清除确认；写回复丢失仅显示unknown与核对，不提前画成功卡；已清除当前Goal不抹旧卡/续作divider。                                                          |

本次完成源码/历史审计与合同文档，并补原MessageList卡片的4组隔离浏览器视觉/键盘检查及原ActiveSession整页的24组header/strip/mobile guard检查。未运行上述真实Host业务测试、未实施新query或hbar生命周期UI、未验证完整参考App/真实Goal流程；不得把该清单列为通过结果。
