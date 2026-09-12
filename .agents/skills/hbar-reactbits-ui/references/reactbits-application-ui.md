# ReactBits Application UI 参考矩阵

本矩阵是 hbar Web 工作台布局的强制设计来源。URL 用于查阅 ReactBits Pro 的具体 block/variant；实现时借鉴结构、信息层级、交互逻辑、状态表达、密度、响应式方式和视觉语言，不复制与 hbar 数据模型冲突的业务数据。

## 使用规则

- 每个布局改动至少绑定一个结构参考和一个交互参考。结构参考决定区域关系、内容轴和面板层级；交互参考决定展开/收起、选择、键盘、状态和反馈。
- 变更记录使用 `参考：<URL> — <采用的逻辑/设计/风格>` 格式。若一个类别页包含多个 variants，优先选择下表中最接近 hbar 真实能力的 variant，并记录具体 variant URL。
- ReactBits 的渐变、玻璃、spotlight、glare 和 motion 必须通过 hbar adapter 与主题 token 实现；禁止把网页中的硬编码颜色或假数据直接复制进业务组件。

## AI Chat 与输入

| URL | 必须吸收的逻辑/设计/风格 | hbar 落点 |
|---|---|---|
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9 | provider 列表、模型详情卡、context/cost/reasoning effort 的层级；模型选择不只显示名称 | `ModelPicker`、`PromptComposer`、Settings provider/model editor |
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-7 | pinned context、消息级引用的视觉层级；当前无 citation 字段时只预留 slot，不造假引用 | `Chat` 消息头部、context strip |
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-2 | artifact side panel、代码/文档预览、带页签的窗口和版本/视图切换 | `FileViewer`、`CodeEditor`、tool result detail；无版本数据时仅实现 before/after 或现有视图 tabs |
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-5 | destructive action 的 inline approval、plain-language impact summary、风险强调 | `Chat` approval surface、`approvalImpact`、参数 disclosure |
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-6 | 多 agent identity/handoff 与 live activity rail 的分栏、工具调用列表、请求详情列表组织方式 | `ActivityPanel`、run/tool detail；当前不增加不存在的 multi-agent 协议 |
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-4 | conversation settings popover、live context、token meter 和模型上下文摘要 | `ChatSessionChrome`、composer footer、Usage surface |
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-3 | 紧凑嵌入式 assistant panel、empty state、suggested prompts、docked composer | 新会话空态、移动 chat、`PromptComposer` |
| https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1 | reasoning disclosure、live tool call、streaming answer、sources/attachment composer 的内容顺序 | `MessageView`、`ToolCallView`、`ToolResult`、附件消息 |
| https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-3 | hero prompt launcher、suggestion chips、recent prompt history 的空白会话组织 | `Chat` 无消息空态；建议 chip 必须触发真实 composer draft |
| https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1 | autosizing composer、slash-command menu、attachment tray、send/stop 控件互斥 | `PromptComposer`，保持 IME-safe Enter |
| https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-2 | model selector、tool toggle、live token counter | `ModelPicker`、`PermissionSelector`、composer footer |
| https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-5 | drop zone、逐附件上传进度、失败重试、transfer summary | `PromptComposer` 附件拖拽/上传；保持 Host 的大小和数量限制 |
| https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-6 | `@` context picker、scoped source pills | `GitContextSwitcher`、workspace/context strip |
| https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-7 | ask/agent/edit mode switcher、键盘提示 | Goal/Plan/Budget tags、slash actions；模式必须来自 Host |

## Agent Activity、工具调用、审批、计划与用量

| URL | 必须吸收的逻辑/设计/风格 | hbar 落点 |
|---|---|---|
| https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-7 | run detail 的 input/output/error/retry attempts 信息面板 | `ActivityPanel` run detail；缺少 retry 数据就不显示伪造次数 |
| https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-6 | parallel agent lanes、queue depth、throughput 的并行工作可视化 | Activity 的 lanes/queue 视觉；当前只绑定真实 runs |
| https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-5 | terminal log stream、severity filter、autoscroll pin、JSON context 展开 | Activity trace、Diagnose、Terminal output |
| https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-4 | 历史请求表格：status、duration、cost、重新运行入口 | Activity 历史 run 列表；重新运行只能复用真实 run/input 入口 |
| https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-3 | compact status rail、current action、progress、stop control | Chat 状态、Activity rail、Sessions 状态点 |
| https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-2 | 可折叠 run timeline、nested sub-step、duration bar | `SessionEvent` 的 run/step timeline；无法确定层级则平面显示 |
| https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1 | 每步状态点、elapsed timer、cancel control | `ActivityPanel` 当前运行时间线 |
| https://pro.reactbits.dev/docs/app-ui/tool-calls | 工具 invocation/result/diff/permission surfaces 的统一卡片语言 | `ToolCallView`、`ToolResult`、approval、PermissionSelector |
| https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2 | pending/success/failure 状态和 retry affordance | tool cards；没有单工具 retry RPC 时提供重新编辑/重发 run |
| https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-5 | stdout/stderr tabs、exit code badge、终端结果层级 | Shell/Terminal tool result |
| https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-4 | 网页访问结果的 ranked source cards、relevance metadata | Browser result；只展示真实 browser snapshot/history |
| https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-3 | patch/diff 的 add/remove 统计、before/after tabs | `ToolResult`、`CodeEditor` |
| https://pro.reactbits.dev/docs/app-ui/agent-approval | human-in-the-loop confirmation、permission、audit surfaces 的统一风险语言 | `Chat` approval、Settings permissions、Activity audit 预留 |
| https://pro.reactbits.dev/docs/app-ui/agent-plan | task plan/checklist/execution tree 的状态和进度组织 | `SessionTools` Plan、capability dialog |
| https://pro.reactbits.dev/docs/app-ui/ai-usage | token spend、quota、rate limit、per-model attribution 的 meter/card 语言 | `ActivityPanel` metrics、Chat footer、Budget/Settings；只使用真实 usage |

## App 外壳、导航和浮层

| URL | 必须吸收的逻辑/设计/风格 | hbar 落点 |
|---|---|---|
| https://pro.reactbits.dev/docs/app-ui/app-shell | navigation/header/content 的完整 frame 和稳定区域关系 | `App.tsx`、FlexLayout、default layout |
| https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-4 | 三栏 frame、可切换 context panel、主内容与辅助上下文并排 | FlexLayout editor/main/right tool panel |
| https://pro.reactbits.dev/docs/app-ui/app-sidebar | shell/sidebar/rail/mobile navigation 的组合方式 | `WorkbenchNavigation`、`Sessions`、移动导航 |
| https://pro.reactbits.dev/docs/app-ui/command-menu | command palette、quick search、action menu 的搜索优先和键盘交互 | `CommandPalette`、`ComposerMenu` |
| https://pro.reactbits.dev/docs/app-ui/navbar | top bar、breadcrumb、segmented tab、scope switcher 的布局语言 | `WorkbenchHeader`、`ChatSessionChrome`、Settings header |
| https://pro.reactbits.dev/docs/app-ui/mobile | bottom tab、floating dock、bottom sheet、全屏移动菜单 | `MobileNavigation`、mobile more sheet、工具面板 |
| https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-9 | 模型 picker、pinned/recent threads、full-width composer 的 AI frame | Chat + Sessions + PromptComposer |
| https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-8 | mobile tab bar → icon rail → full sidebar 的自适应切换 | desktop/mobile shell |
| https://pro.reactbits.dev/docs/app-ui/app-sidebar | workspace switcher、scoped search、pinned item、inline row action | `Sessions`、workspace header |

## 数据、文件、编辑器、表单和反馈

| URL | 必须吸收的逻辑/设计/风格 | hbar 落点 |
|---|---|---|
| https://pro.reactbits.dev/docs/app-ui/card | standalone card、metric row、file tile、integration row 的统一容器语言 | Activity metrics、Git rows、PluginRow、附件和设置 cards |
| https://pro.reactbits.dev/docs/app-ui/data-table | toolbar、filter、selection、inline edit、detail panel 的表格组织 | Git commits/branches、Activity history、Settings search results；字段必须真实 |
| https://pro.reactbits.dev/docs/app-ui/dashboard | metric grid、status board、usage overview | Activity、Diagnose、Settings summary |
| https://pro.reactbits.dev/docs/app-ui/analytics | charts、metric strip、range/filter 控件的层级 | Usage/Insights；无时间序列时不绘制假图表 |
| https://pro.reactbits.dev/docs/app-ui/list | row list、feed、queue、tree、selectable collection 的密度和状态 | Sessions、queue、events、files、plugins |
| https://pro.reactbits.dev/docs/app-ui/filtering | faceted filters、query builder、refinement controls | event filter、settings search、Git/file filters |
| https://pro.reactbits.dev/docs/app-ui/file-manager | breadcrumbs、file detail、preview、upload queue、per-file progress | `FileNavigation`、`FileViewer`、PromptComposer attachments |
| https://pro.reactbits.dev/docs/app-ui/monitoring | live metrics、log tail、health/status、follow/pause、expandable JSON | Activity trace、Diagnose、Terminal |
| https://pro.reactbits.dev/docs/app-ui/empty-state | first-run、no-result、load failure、dropzone 的不同语义 | `EmptyState` 原语及所有面板空态 |
| https://pro.reactbits.dev/docs/app-ui/settings-form | settings sections、scope、search、save/reset 状态 | `Settings`、`SettingsNavigation`、scoped settings |
| https://pro.reactbits.dev/docs/app-ui/forms | sectioned form、validation、review state、sticky action bar | provider editor、path/plugin/device forms |
| https://pro.reactbits.dev/docs/app-ui/app-dialog | dialog/drawer/sheet/popover、滚动 body、sticky footer、破坏性确认 | `Modal`、`FloatingSurface`、settings and context menus |
| https://pro.reactbits.dev/docs/app-ui/notifications | notification center、banner、toast stack、delivery state | `useNotice`、inline errors、run/usage banners |
| https://pro.reactbits.dev/docs/app-ui/editor | markdown split、code editor chrome、review mode、outline | `Markdown`、`CodeEditor`、FileViewer、diff tabs |
| https://pro.reactbits.dev/docs/app-ui/onboarding | first-run stepper、checklist、completion feedback | Pairing、无模型/无 workspace 引导；不增加虚假进度 |
| https://pro.reactbits.dev/docs/app-ui/paywall | usage cap、feature gate、plan/limit explanation | Budget limit 和 capability disabled 状态；不是商业升级流程 |
| https://pro.reactbits.dev/docs/app-ui/authentication | sign-in、pairing、recovery、credential state 的表单层级 | `PairingPage`、设备/连接设置；不把 token 暴露在 URL |
| https://pro.reactbits.dev/docs/app-ui/kanban | status columns、drag/drop、grouping、detail panel | queue/plan 状态分组；拖拽操作绑定稳定 run/step ID |
| https://pro.reactbits.dev/docs/app-ui/scheduling | calendar、agenda、availability、time picker、booking surface | 仅作为未来调度插件的布局参考；当前没有调度数据时不新增占位功能 |

## 当前明确延期而非伪造

这些 URL 可以指导未来协议设计，但当前 UI 不得凭空显示其业务字段：AI Chat 7 的 citations/sources、AI Chat 6 的真实 multi-agent handoff、AI Chat 2 的 artifact version history、Tool Calls 的单工具 retry、Agent Approval 的 batch/audit 实体、AI Usage 的时间序列 sparkline、Authentication 的真实账户体系、Paywall 的商业升级流程以及 Scheduling 的日历数据。实现这些能力前，先添加有版本、校验、幂等和恢复语义的 contracts/Host/Client 契约。
