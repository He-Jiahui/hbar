# ReactBits 生产界面组合计划

本文件记录参考组件如何进入 hbar 的真实工作台。参考页面只提供公开 HTML/CSS/JS 的结构证据；生产组件使用 hbar 的 Zustand 快照、Client 契约和主题 token，不把 fixture 数据或私有 Code-tab 源码带入运行时。

## 组合原则

- 每个生产表面同时标记 `data-reactbits-skill="$hbar-reactbits-ui"`、具体参考 URL 和（可用时）typed adapter。视觉回归可以据此把工作台截图与参考矩阵对应起来。
- `GlassSurface` 负责玻璃层，`SpotlightCard` 负责列表/指标卡的指针高光，`GlareButton` 只用于发送、批准、保存等决定性动作，`AnimatedList` 负责长列表进入和滚动边缘，`FloatingSurface` 负责菜单/弹层。业务组件仍拥有数据、错误、取消和恢复动作。
- 真实事实只来自 `Bootstrap`、`SessionSnapshot`、`SessionEvent`、`Approval`、`PlanState`、`SessionBudget`、`Usage`、`ArtifactRef` 和文件/Git/browser RPC。参考中没有对应契约的 citations、multi-agent handoff、retry attempts、时间序列、商业升级和调度字段保持 fixture-only。

## 生产落点与参考绑定

| 生产组合 | 必须参考的 URL | 迁移的逻辑、层级和风格 | 真实绑定 |
| --- | --- | --- | --- |
| 工作台外壳、会话侧栏、顶部栏 | [app-shell](https://pro.reactbits.dev/docs/app-ui/app-shell)、[app-shell-4](https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-4)、[app-sidebar](https://pro.reactbits.dev/docs/app-ui/app-sidebar)、[navbar](https://pro.reactbits.dev/docs/app-ui/navbar)、[mobile](https://pro.reactbits.dev/docs/app-ui/mobile) | 三栏 frame、稳定 header/context/content 轴、workspace scope、pinned row action、窄屏 bottom navigation 与 sheet | `Bootstrap.workspaces/sessions/models`、`useWorkbench.layout`、`WorkbenchHeader`、`WorkbenchNavigation` |
| 会话聊天与空白会话 | [ai-chat-1](https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1)、[ai-chat-3](https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-3)、[ai-chat-7](https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-7)、[prompt-input-3](https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-3) | reasoning disclosure、streaming answer、附件顺序、hero empty state、pinned context slot | `SessionSnapshot.messages/streams`、`ComposerDraft`、`ArtifactRef`；adapter `session-chat` |
| 模型选择与 composer | [ai-chat-9](https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9)、[prompt-input-1](https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1)、[prompt-input-2](https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-2)、[prompt-input-6](https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-6)、[prompt-input-7](https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-7) | provider → model detail hierarchy、context/cost/reasoning metadata、autosize/slash/attachment tray、scope pills、mode tags | `Bootstrap.models`、`useWorkbench.modelId/thinkingLevel/approvalMode`；adapter `model-picker` |
| 审批与人机决策 | [ai-chat-5](https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-5)、[agent-approval](https://pro.reactbits.dev/docs/app-ui/agent-approval) | inline impact summary、最终参数 disclosure、风险色阶、批准/拒绝/记住三种独立动作 | `SessionSnapshot.approvals`、`permission.set`；adapter `approval` |
| 活动、历史、事件和工具调用 | [ai-chat-6](https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-6)、[agent-activity-1](https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1)、[agent-activity-2](https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-2)、[agent-activity-4](https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-4)、[agent-activity-5](https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-5)、[agent-activity-7](https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-7)、[tool-calls](https://pro.reactbits.dev/docs/app-ui/tool-calls) | compact status rail、可折叠 timeline、历史请求表、severity/filter、JSON detail、pending/success/error 卡片 | `SessionSnapshot.runs`、`session.follow` 返回的 `SessionEvent`、tool call/result；adapter `activity`/`session-events` |
| 计划、目标和预算 | [agent-plan](https://pro.reactbits.dev/docs/app-ui/agent-plan)、[ai-usage](https://pro.reactbits.dev/docs/app-ui/ai-usage)、[paywall](https://pro.reactbits.dev/docs/app-ui/paywall) | checklist/progress rail、quota meter、limit explanation、停止/恢复入口 | `PlanState`、`ThreadGoal`、`SessionBudget`、`Usage`；adapter `plan`/`usage` |
| 工具窗口与数据面板 | [tool-calls-3](https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-3)、[tool-calls-4](https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-4)、[tool-calls-5](https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-5)、[card](https://pro.reactbits.dev/docs/app-ui/card)、[dashboard](https://pro.reactbits.dev/docs/app-ui/dashboard)、[analytics](https://pro.reactbits.dev/docs/app-ui/analytics)、[monitoring](https://pro.reactbits.dev/docs/app-ui/monitoring) | before/after diff、网页结果层级、stdout/stderr、metric strip、live health、可展开 JSON | Git/File/Browser/Terminal/Diagnose 使用各自真实 RPC；无协议字段不绘制假图表 |
| 设置、表单和弹层 | [settings-form](https://pro.reactbits.dev/docs/app-ui/settings-form)、[forms](https://pro.reactbits.dev/docs/app-ui/forms)、[app-dialog](https://pro.reactbits.dev/docs/app-ui/app-dialog)、[command-menu](https://pro.reactbits.dev/docs/app-ui/command-menu)、[notifications](https://pro.reactbits.dev/docs/app-ui/notifications) | master/detail settings、sticky action bar、左对齐最高层级浮层、搜索优先命令、局部错误/全局 toast | settings catalog/snapshot/set/reset、`FloatingSurface`、`useNotice` |
| 文件、编辑器和空/加载/失败态 | [file-manager](https://pro.reactbits.dev/docs/app-ui/file-manager)、[editor](https://pro.reactbits.dev/docs/app-ui/editor)、[list](https://pro.reactbits.dev/docs/app-ui/list)、[filtering](https://pro.reactbits.dev/docs/app-ui/filtering)、[empty-state](https://pro.reactbits.dev/docs/app-ui/empty-state) | breadcrumb/tree/detail preview、before/after review、筛选计数、dropzone、恢复动作 | 文件/Git/renderer slot 真实结果；统一 `EmptyState` 与 `AnimatedList` |
| 配对与首次连接 | [authentication](https://pro.reactbits.dev/docs/app-ui/authentication)、[onboarding](https://pro.reactbits.dev/docs/app-ui/onboarding) | centered credential card、验证反馈、完成后进入工作台 | Host pairing RPC 和连接状态；不在 URL 暴露 token |

## 交付顺序

1. 组合层和 typed projection（本次建立）：`ReferenceSurface`、`ReferenceSectionHeader`、`ReferenceMetricStrip`、`ReferenceTabs`、`useReferenceProductionContext`。
2. 会话/模型/composer/审批：把聊天内容顺序、上下文、模型详情、权限决策和真实 usage 接入组合层。
3. Activity/Tool/Plan/Usage：把 runs、events、terminal/browser/diff 详情与计划/预算进度组织成可切换工具窗口。
4. Shell/sidebar/mobile/command：统一外壳、侧栏、tab/rail/sheet 和 command palette 的来源标记与响应式行为。
5. Settings/forms/dialog/notifications：统一 master/detail、保存状态、局部错误和 FloatingSurface 关闭/焦点契约。
6. File/Git/editor/diagnose 与最终 QA：统一列表/卡片/预览、空态、加载、失败、取消、恢复和长文本溢出。

每一项都在对应组件上保留真实实体 ID，执行 targeted tests、lint、typecheck、build 和相关 Playwright/CUA 视觉检查后独立提交。
