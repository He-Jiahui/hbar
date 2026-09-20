# 页面设计：AIChat、PromptInput 与 Usage

上级：[UI 总计划](index.md)。任务范围 R3；复用清单见[组件整治](component-remediation.md)。

## 1. 页面组合

```text
PageHeader（工程、会话、工具）
└─ SessionContent，flex column
   ├─ TimelineViewport，flex 1，唯一消息滚动区
   │  ├─ 更早消息加载入口
   │  ├─ 用户消息 / 助手 Markdown
   │  └─ 所属消息的 Activity、ToolCall、Approval、Plan
   └─ ComposerRegion，内容高度，有上限
      ├─ 当前待处理交互定位入口（仅有待处理项时）
      ├─ PromptComposer（附件、输入、控件、发送/停止）
      └─ UsageSummary（最多两行）
```

外壳负责页头后，Conversation 不再自行重复“Session: …”标题。增加可选 header slot/嵌入模式；保留原 title 作为 aria-label。Timeline 与输入框居中到同一阅读宽度，右侧工具打开时一起收缩。

## 2. 消息与富内容

| 内容                | 视觉设计                                        | 行为与数据                                                       |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 用户消息            | 柔和背景、适度圆角；不把作者、时间重复多次      | 附件是实际资源引用；复制只复制当前消息                           |
| 助手 Markdown       | 左对齐、自然段落；标题层级受消息区约束          | 继续 GFM、安全渲染；不因模型文本产生可执行审批 UI                |
| 长代码/表格         | 局部横向滚动，代码操作在块标题旁                | 不撑宽会话；复制/打开文件捕获所属资源目标                        |
| Thinking / Activity | 一行运行摘要和按需展开详情                      | 展示实际队列、运行状态；结束后转为完成摘要                       |
| Tool Calls          | 显示工具名、目标、状态、耗时；输入/输出按需展开 | 与真实 attempt/intent ID 关联；长输出分页/截断标记               |
| Agent Approval      | 清楚的动作、目标、影响范围和允许/拒绝操作       | 回调绑定 approvalId；未知结果显示核对/重试；禁止空薄条           |
| Questionnaire       | 当前问题、选项、自定义输入、提交状态            | 答案由 runtime 持有，切换会话不丢；未完整输入时禁提交            |
| Agent Plan          | 所属 Run 内一行摘要，按需展开步骤与说明         | 读取实际 Plan/turnId；无归属时显示会话级计划；不从 Markdown 推断 |

默认收起冗长已完成日志，但当前运行与待审批摘要始终可达。在查看历史时收到审批，不强制跳到底部；输入区上方出现定位到待处理项的简短入口。审批卡在自己的时间线位置执行，不能把全部历史审批堆到输入区。

## 3. 输入组件

继续使用 `HbarAppUiPromptComposer`，不替换成另一个 textarea 业务实现。

- 输入区从短输入自然增长；上限使用视口相关 cap，之后内部滚动。保持输入法、Shift+Enter、键盘选区、粘贴的正常行为。
- 工具行左侧放附件与权限/模式，右侧放模型、思考等级、发送/停止。能力不可用时显示原因，不能给一个无行为按钮。
- 模型与思考等级是有标签的短控件；长名称省略或自然换行，选择详情在菜单中展示完整值。
- 附件以紧凑 chip 显示，预览/文件名/移除都绑定稳定 ID；长名称不能挤掉移除按钮。上传状态在附件附近展示。
- 提交中、上传中、停止中和断线各自使用已有状态，禁止将所有状态合并为一个笼统 loading。
- 发送失败保留文本和附件，错误在输入框附近；新输入不被旧提交回执清空。

2026-09-19 已完成组件自包含样式修复；随后会话页完成单一 PageHeader、消息时间线、运行/审批/问卷、PromptComposer 与 inline Usage 的生产组合，并通过 1440/1024/390 真实 Host 截图。模型当前以只读状态显示，完整选择控件仍由设置/命令负责。2026-09-20 又用 180 条真实持久消息验证长历史分页、虚拟化、锚点、快速切换、断线重连和失败运行重试，并用真实 `update_plan` Run 验证 Plan 的实时归属、刷新恢复和窄屏展开；R3.2 与 R3.5 均已关闭。

## 4. 用量摘要

为 `HbarAppUiCompactUsage` 增加公开 inline 密度，或从其受控内容契约抽出同族摘要组件。保留完整模式给 Monitoring；不要使用页面 CSS 隐藏内部标题、图表和进度。

常驻内容：已用 token / 预算余量、输出速率、预计费用。无预算时不显示伪造剩余量；速率暂无样本时显示未知；预计费用与已结算值区分。输入/输出细分、模型分布和曲线通过“查看用量”进入 Monitoring。

桌面尽量一行，窄屏最多两行；不为摘要设置独立大卡片或大标题。短输入、无审批时，ComposerRegion 与 Usage 合计不超过会话可用高度约 25%。多行/附件场景允许增长，但必须保有可读消息区。

## 5. 状态所有权与命令

| 操作               | 所属现有模块                   | UI 规则                                                                                    |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| 编辑/添加/移除附件 | app-runtime drafts             | 回调捕获 sessionId；UI 不复制草稿                                                          |
| 发送/重试/取消     | run 命令与回执                 | 提交捕获 draft revision；重试绑定原 operationId 并复用未知回执的幂等键；取消只针对当前 Run |
| 加载/重试时间线    | timeline 内部命令              | UI 只调用 `timeline.loadOlder` / `timeline.retry`；runtime 验证目标与游标后合并            |
| 模型/思考/预算     | session-controls、budget-forms | 从现有 catalog 绑定，不在控件中写供应商规则                                                |
| 审批/问卷          | interactions                   | 捕获原 request/approval ID；错误原位展示                                                   |
| 跳转工具/设置      | presentation / surfaces        | 命令打开明确目标与作用域                                                                   |

消息滚动锚点按 sessionId 保存；回到底部是局部视觉行为。用户已在底部时流式跟随，否则保留阅读位置并显示新消息提示。切换工具不重新挂载整个会话 timeline。当前实现按首个可见消息 ID 与其视口相对偏移恢复锚点，动态测量期间用短期 `ResizeObserver` 修正；切换会话时只读取已保存锚点，不在旧组件 cleanup 中覆盖新值。

## 6. 复用与验收

复用 Conversation、Message、PromptComposer、RunActivity、ApprovalRequest、Questionnaire 与 Usage 受控组件；时间线 Plan 使用 RunActivity 的只读 plan contract，完整编辑继续使用 Goal/Plan 工具中的 PlanEditor。消息/运行格式化留在 app-react；包内不能 import Web locale。

必须看图的场景：空会话、短问答、长历史、长代码/表格、运行中、等待审批、问卷、长输入、多附件、错误、断线、工具打开。行为检查包括 IME 不误发、发送原草稿、晚到附件不串会话、失败重试幂等、旧消息回看不跳动。长历史使用已有分页/虚拟化，确认流式更新不让外壳持续重绘。

## 7. R3.5 已实现的容量与恢复边界

- runtime 每次加载 60 条消息，最多缓存 8 个会话、每会话最多保留 1,000 条；更早页按当前最小 seq 查询，错误页可重试，错误目标、错误 cursor 和旧 generation 结果不会污染当前会话。
- `HbarAppUiConversation` 在消息数超过 40 时使用动态虚拟列表，保留 `list/listitem` 语义和可访问消息总数。旧页前插不改变首个可见消息的位置；180 条记录实测 DOM 消息节点保持少于 50。
- 用户停留在历史位置时，新消息不抢滚动位置，只显示紧凑的“查看最新消息”；点击后回到底部。按 sessionId 快速往返会恢复各自偏移。
- WebSocket 中断时，已有记录、草稿和附件继续显示；Composer 禁止离线发送，显式 Reconnect 后重新订阅并保留输入。刷新/重连错误只改变状态，不清空已呈现内容。
- `HbarAppUiRunActivity` 对 failed/interrupted Run 显示带文字的重试动作。React 只发出 `run.retry { sessionId, operationId }`；app-runtime 在 `RESULT_UNKNOWN` 时保存同一幂等键，恢复后重试不会重复创建运行。

视觉证据包括[两页历史](../../artifacts/ui-redesign/session/after/long-history-page-1440.png)、[加载旧页锚点](../../artifacts/ui-redesign/session/after/long-history-anchor-1440.png)、[历史中新内容](../../artifacts/ui-redesign/session/after/long-history-new-1440.png)、[回到最新](../../artifacts/ui-redesign/session/after/long-history-latest-1440.png)、[断线](../../artifacts/ui-redesign/session/after/disconnected-1440.png)、[重连](../../artifacts/ui-redesign/session/after/reconnected-1440.png)、[失败运行](../../artifacts/ui-redesign/session/after/run-failed-1440.png)、[重试后](../../artifacts/ui-redesign/session/after/run-retried-1440.png)和[390 宽度](../../artifacts/ui-redesign/session/after/run-retried-mobile-390.png)。R3.5 验证为 TypeScript、定向 ESLint、content/icon/flow guards、398 个 Bun 测试（3174 个断言）、2393-module production build 和 8/8 Playwright 场景全部通过。

## 8. R3.2 Plan 归属与折叠摘要

`SessionTimelineState.plan` 是当前 Plan 的只读事实。首次选择会话时，timeline adapter 与消息快照并行调用 `plan.get`；运行期间由持久的 `plan.updated` / `plan.cleared` SessionEvent 更新。查询失败不清空已有消息或阻断聊天，后续事件和重载仍可恢复。

Plan 的 `turnId` 是创建或更新它的 Run ID。若该 Run 仍在有界运行投影中，`HbarAppUiRunActivity` 把 Plan `<details>` 放在同一个 Run article 内；若 `turnId` 为 null，或原 Run 已超出投影，只显示为会话级 Plan。展开/折叠是组件局部 UI 状态，不写 Zustand，也不执行命令。步骤、说明、状态标签和进度文案均由 Host 数据与 Web i18n 提供。

视觉证据为[折叠摘要](../../artifacts/ui-redesign/session/after/plan-summary-1440.png)、[桌面展开](../../artifacts/ui-redesign/session/after/plan-expanded-1440.png)与[390 展开](../../artifacts/ui-redesign/session/after/plan-expanded-mobile-390.png)。真实 E2E 发送 `update_plan` 工具调用，断言 Plan 位于创建它的 Run article，刷新页面后通过 `plan.get` 恢复，再在 390px 检查卡片边界。最终验证为 398 个 Bun 测试（3185 个断言）、2393-module production build（221.70 kB CSS / 962.08 kB JS）和 9/9 Playwright 场景全部通过。
