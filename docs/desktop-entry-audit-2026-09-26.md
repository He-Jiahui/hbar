# 桌面交互入口继续审查

本页是 cc-haha 参考体验迁移的剩余工作记录，不是完成声明。审查由会话、导航和设置三个独立方向进行，主线核对代码、测试与截图。已有产物与本轮新验收分开，不以旧截图证明当前完整体验。

## New Session 入口语义复核

后续逐源码复核纠正了一个容易混淆的说法：**cc-haha 并非所有“新会话”入口都延迟创建**。当前跟踪源码有两条不同路径，不能只看相似的欢迎页就合并成一个流程。

| 入口                         | cc-haha 当前跟踪实现                                                                                                                | hbar 当前实现                                                                                                                                                                | 仍需对齐的体验                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 侧栏 New Session／项目行入口 | `desktop/src/components/layout/Sidebar.tsx` 的 `createSessionForWorkDir` 立即调用 `createSession`，然后打开标签并连接。             | `lumen-workspace-shell.tsx` 的 `newSession` 在有有效当前项目或显式项目行目标时立即调用 `app.createSession`；无有效当前项目时先显示项目选择器。                               | 两者都是 eager 创建；差别在默认目录与项目选择、空会话关闭清理、窄屏入口位置。不得把侧栏按钮改成“首次发送才创建”来追求错误的参照。            |
| 无活动标签的落地页           | `ContentRouter.tsx` 渲染 `EmptySession`；文本、附件、目录和权限先留在本地草稿，Run 时检查认证，再创建 Session、转移模型选择并发送。 | `apps/web/src/App.tsx` 现在渲染独立 `WebPreSessionLanding`；文本、工作区和模型使用真实客户端 `draftId`，首次发送才创建 Host Session。已创建 Session 的欢迎页仍是另一种视图。 | 纯文本首发已闭环；附件、提及、斜杠、permission、Plan/Goal、模型努力等级、分支/工作树和跨刷新未知结果恢复尚未达到参考体验，不得称为完整迁移。 |

参考证据是 cc-haha 跟踪源码 `desktop/src/components/layout/Sidebar.tsx:459`、`ContentRouter.tsx:29`、`pages/EmptySession.tsx:289-403` 与 `pages/EmptySession.test.tsx`；hbar 的 `packages/app-react/src/lumen-workspace-shell.tsx:708-714`、`workspace-navigation-actions.ts:64-158`、`apps/web/src/App.tsx`、`packages/app-runtime/src/pre-session-drafts.ts`、`navigation.ts:87-117` 以及 `e2e/workspace-session-entry.spec.ts`、`e2e/session-empty-hero.spec.ts`、`e2e/pre-session-landing.spec.ts`。cc-haha `docs/images/app/en/session-new.webp` 是旧文档图，Stitch 空会话图是静态设计稿，均不是当前软件的同条件实时截图。hbar 原有 empty-hero E2E 图只证明已创建 Session 的欢迎页；新的 `artifacts/desktop-experience/pre-session-*.png` 是真实 Host 的无标签草稿页截图，仍不能冒充 cc-haha 当前同条件实时截图。

无活动标签的落地页现在有独立客户端 `draftId`、明确工作区/模型选择、首发固定创建键与独立 Run 键；容量满时在 Host 写入前拒绝。创建结果未知可在当前 runtime 以原键核对，已确认 Session 的文本移交真实会话 Composer；迟到结果不抢回新导航。`e137f4b` 提交流式视图与宿主文案，`68b6225` 提交运行时/契约，`8905cc4` 接入真实 Web 路由。8 项运行时测试、5 项视图相关测试、3 项真实 Host 新 E2E 和原 eager/空欢迎等回归已通过；中英 1440/900/390/320 与 320px 101 项滚动及行非重叠有截图/几何证据。初次组合运行的 archive-tabs 6 项因测试声明的 44925 端口未传入而在鉴权前连接失败；用该端口重跑 6/6 通过。根 `bun run lint` 本次仍 exit 1，唯一报错位于并行任务的未跟踪 `apps/hbar-app-ui-preview/src/forms9PreviewFixtures.ts` 未使用 `intervalNumber`，本单元局部 ESLint 与根 typecheck通过。这个本地草稿与未知结果键尚未按 Host 隔离持久化，刷新/重启恢复、附件来源再选择等仍需独立闭环；不能把当前窗口同键恢复写成跨刷新可靠性。

页内早期“本轮”统计是对应提交时点的历史记录，不是后续并行任务仍在编辑的最新全仓结果。最新独立交付如下；全量最终工作树门禁另行记录。

## 继续审查的新进展

- `80861aa`：Settings → General 的真实设备语言入口，中英/环境三选项即时切换，不按 locale 重建 runtime；保留原会话、Files returnContext、未保存 Appearance，独立保存与失败恢复焦点。30项定向测试/325断言、3项真实Host生产E2E、26条原组件矩阵与原生900通过。[交付与边界](desktop-device-language.md)、[原参考与旧问题复现](desktop-language-entry-audit.md)。没有native广播或OS实时语言变化的虚假声明。
- `a56414a`：语言变化只重建当前命令搜索索引，不改查询、参数稿、进行中操作／unknown 锁或结果。10项测试/107断言、2项真实Host生产E2E通过；模型、paused Goal、Plan与单次审批选择、原输入、唯一连接在中英×四宽保持。[复现、截图和边界](desktop-language-search.md)。
- `a373f93`：插件详情摘要之后增加就近启停，复用原Host命令与共享有界action owner；读当前值不解锁未知写，A迟到ACK不回滚B，容量失败不冒充Host运行忙碌。59项测试/470断言、4项真实Host生产E2E通过，人工检查桌面/390/320和unknown/BUSY/required截图。[交付与限制](desktop-extension-plugin-action.md)。这不是安装／更新／卸载或跨runtime持久receipt能力。
- `1e0c910`：旧通用导航材质门禁已定位到观察对象错误：真实原生 canonical LumenIndicator 有选中状态、2px竖条与halo，而旧 dirty smoke 读取不存在的 `button::before`。独立断言和截图通过；保留他任务该hunk，仍不把整个通用smoke标绿。[诊断](desktop-navigation-marker-audit.md)。
- 三agent逐入口审查继续：插件/Skills/MCP/市场原组件70张只读参考图；详情就近启停已按上述独立单元闭环，安装/卸载的可靠恢复、市场更新/MCP/技能正文仍需要对应事实合同。[逐入口矩阵](desktop-extensions-entry-audit.md)。不把没有Host能力的功能做成占位按钮。
- `35a2852`：确认归档只退役原Session tab，保留B选择/草稿/Files，恢复不导航、刷新原空工程不暗选邻居。短期有界版本fence封住跨工程缓存驱逐后的旧读取、页、Roster、选择/restore与旧归档ACK，原独立consumer DTO仍可完成。110项测试/582断言、6项真实Host生产E2E和封口资源后的原生900通过；容量拒绝是明确failed而非Host Run BUSY或unknown。[参考、实证红测与交付](desktop-navigation-archive-audit.md)。
- 启动入口只读审计又复现了 pending Host identity → confirmed identity 的设置丢页与临时namespace保存问题：中英×1440/320×四场景16/16，实际hello回复延迟326–676ms后原样释放，Run/pageerror均0；只读文档不是修复或通过的导航验收。[复现、历史与最小方案](desktop-startup-entry-audit.md)。不能仅删除hostId依赖或等connected后才点击来掩盖。
- 上述启动问题已进入独立修复验收：同 endpoint 首次确认保留全局 Settings 实例、已知分类、Appearance 草稿和正常焦点；pending runtime 无持久化端口，真实 Host 偏好读回后才可保存。分类描述加载不移除原导航按钮，后台旧页签恢复不能抢页，旧导航存储失效也不回退刚才的分类。最新生产真实 Host 27/27、真实原生900×600 4/4通过；原生原有Goal/语言/归档回归同次通过。完整串行门禁结果以本单元[交付与验证记录](desktop-startup-settings-handoff.md)为准。
- 外部归档保留视图已接入 exact Session／workspace 执行准备能力：历史、草稿、原附件与 Files 保留，新发送／Retry／附件／模型／思考／Plan／Goal 准备受限；旧操作核对与 Stop 等能力独立。新增模型持久回执纯读与 Retry 纯读核对，Restore 前置读取不再清原观察视图。最终真实 Host 10/10、真实原生分视口场景通过；根 lint/typecheck通过，完整Bun1909 pass/1 fail，唯一外部通知控件边界失败仍保留，详见[交付记录](desktop-session-execution-access.md)。原[差距审计](desktop-external-archive-readonly-audit.md)保留为历史红测，不冒充新实现证据。
- `75763f9`：工具输出就近 Copy 的下一入口审计已独立提交。重新挂载 cc 原 ToolCallBlock 与 hbar 当前消息组件，中英1440/320及真实剪贴板明确证明差距；仅建议下一实现，不声称按钮已补齐。[对照与验收要求](desktop-next-conversation-entry-audit.md)。
- `2c68156`：工作台容器导航的独立后续审计，原组件／生产真实 Host 共16场景，复核14条跨版面入口。明确900／390／320抽屉背景仍能Tab、关闭／展开焦点丢失，同时保留已正确工作的Back与Settings往返；参考900也有自身裁切，不机械照搬尺寸。下一优先级是完整自适应容器与进出焦点，然后会话显隐归属与多文件预览标签。[实证与边界](desktop-workbench-navigation-followup-audit.md)。这是审计，不是布局修复。
- 工具输出 Copy 已按原参考入口落地：输出标题旁独立复制完整已加载结果、局部成功／失败重试、1m UTF-16明确容量、按原目标及内容版本失效迟到回执；不扩展正文Copy、不执行工具，归档历史仍可用。最终生产真实Host2/2＋受控DOM2/2、原消息阅读回归1/1及新资源真实原生中英900/1440通过。根串行门禁1931/1931全绿。[交付及各层证据边界](desktop-tool-result-copy.md)。
- 工作台容器 P1 已实现：Files／Monitoring／Agents／Goals 按扣除侧栏后的真实空间使用有界并排或完整工具页，分隔条键鼠调宽接入原布局 CAS；背景原 DOM inert 保稿，关闭、展开、来源 Back、native dialog 与 Ctrl+K 取消都有明确焦点返回。新真实 Host 中英6/6覆盖48工具宽度状态，64项定向回归全绿，最终新资源真实原生16工具案例＋2条Files完整链＋6条命令面板返回链通过。共享实现独立提交 `7c3ed8f962`；定稿门禁和旧回归明细见[本单元交付](desktop-workbench-navigation-presentation.md)。不复制参考900自身裁切，也不把 P2/P3 或通用 desktop smoke 算作完成。

本次集成检查的时间点需另行区分：根lint/typecheck曾通过，随后并行Lumen通知修改引入缺失stylesheet，边界suite首次12 pass/1 fail/1加载错误；文件落地后重跑13 pass/0 fail/55断言。继续的 `bun run check` 在严格lint阶段因外部通知 `Header` 未使用与fixture未完成的 `system/handler` 引用退出1；日志 `artifacts/desktop-entry-matrix/final-stable-check.log`。未进入该次typecheck/全量test，不将此串行门禁描述为通过。这些外部文件保留给原任务处理。

**上一个归档单元封口后的串行门禁** `bun run check` 已实际重跑：native build、根 strict lint 与根 typecheck通过，全量Bun为 **1789 pass / 1 fail / 13497 assertions，335文件，254.88秒**。唯一失败仍是外部 `hbar-app-ui registry > keeps notification variants split by semantic surface and free of legacy naming`；总命令exit1，日志 `artifacts/desktop-entry-matrix/final-integrated-check.log`。未改该并行组件或断言，不把本单元110项绿或生产/原生子集绿替代整个门禁通过。

**启动设置单元最新串行门禁**：定稿后的 `bun run check` **exit0**，原生工具构建、根严格lint/typecheck通过，
全量 **1854 pass / 0 fail / 13844 assertions，340文件，230.63秒**；日志 `artifacts/startup-handoff/final-check.log`。
这是启动设置单元交付时点的总回归，包含当时并行任务的既有测试；没有修改前述外部通知组件来掩盖旧失败。
该单元另有最终真实Host浏览器27/27、真实原生startup4/4和同次既有Goal/语言/归档回归。

**归档执行准备单元最新串行门禁**：`bun run check` 的原生工具、根 strict lint/typecheck通过；完整Bun **1909 pass / 1 fail / 14208 assertions，344文件，242.98秒**，总exit1。唯一失败为并行未提交 `hbar-ui/packages/lumen-app-ui/src/notifications.tsx` 的原生按钮违反canonical控件边界，独立边界重跑仍2pass/1fail。未改或夹带该外部文件，不把本单元真实Host10/10及原生通过替代全仓全绿。日志 `artifacts/session-execution-access/final-check.log`。

**工具输出Copy单元最新串行门禁**：`bun run check` **exit0**，原生工具构建、根 strict lint/typecheck通过，完整Bun **1931 pass / 0 fail / 14343 assertions，345文件，248.52秒**。日志 `artifacts/tool-result-copy/final-check.log`。外部通知功能已经有它自己的后续提交，本单元未改或夹带；不把前一时点失败写成本轮失败，也不将本轮全绿回填成旧单元当时已绿。

**工具容器 P1 定稿串行门禁**：`bun run check` **exit0**，原生工具、根 strict lint/typecheck通过，完整Bun **1976 pass / 0 fail / 14587 assertions，348文件，249.92秒**。日志 `artifacts/workbench-navigation-presentation/final-frozen-check.log`，对应最终 `index-CnyYjy-U.js` 源码。最终真实 Host 新矩阵6/6、既有五suite22/22、原生16工具案例＋2条Files链＋6条palette链通过。旧工作台测试的启动Expand竞态经历史与重复红测核实，只修初始化定位，保留后续断言，首轮失败不回填成绿。共享子仓标准pnpm命令仍有工具版本阻断，直接TS/声明/build通过，分别记载，见[交付](desktop-workbench-navigation-presentation.md)。

## 已验证并提交的子集

- `7d9f0f7`：原请求的 Plan 审批、同 Run 的模式切换、反馈和刷新回看。[边界与参考](desktop-plan-exit-reference.md)。没有把完成后的旧提案动作冒充同轮审批。
- `a336682`：从持久 Goal-source Run 生成续作分隔。[边界与参考](desktop-goal-continuation-reference.md)。不是完整 Goal 设置/状态/完成事件卡。
- `e5153a1`、`157540e`、`819a912`：Files 阅读时保留可折叠导航、当前路径可见、窄容器切换、原 dirty/unknown 文档保护及原生验证。[行为与证据](desktop-file-reading-navigator.md)。
- `9ee4935`：设置原位 Token 用量，真实 Host-global summary/activity/model 读取，窗口／面板失效、缺价格和超时边界。[行为与证据](desktop-settings-usage.md)。
- `3080c71`：侧栏就近会话刷新，双 Client 更新、前台 focus/visibility/周期／重连、有界扫描和缓存容量反馈，不导航或消费草稿。[行为与证据](desktop-session-roster-refresh.md)。
- `7c6e6e9`、`3e2d02b`、`bea70a7`：Goal 历史公开有界查询、同 watcher 的窗口恢复、header 当前摘要与事件时历史卡；中英文真实 Host、Goal-only 分页、消息窗口失败恢复和独立原生 1440／900×600 已验证。[最新交付与验收边界](desktop-goal-lifecycle.md)。
- `0247687`：真实消息窗口恢复 en/zh 2/2、独立原生 Goal 验收脚本与原组件视觉证据。最新根严格 lint/typecheck 通过；最终全量 Bun 1692 pass / 2 fail，剩余失败位于并行 notifications 控件边界和 decision-laya 安装 symlink，见上述交付文档与 `artifacts/goal-lifecycle/final-unit-suite.log`。不把上轮1648全绿结果套用于此工作树。
- 本轮稳定工作树全量 Bun 测试 **1648/1648、0 fail、12353 assertions**；该稳定版本的根严格 lint/typecheck、生产构建通过。首轮曾有三项失败，已通过具体断言修正／稳定版本重跑闭环，不把首轮描述为绿。日志：`artifacts/desktop-followup-tests.log`。
- 后续复查曾因新的并行未提交变更短暂失败：通知组件增加必填 copy 字段，fixture 尚缺 `all/none/saving/saveFailed/saveUnavailable`。原任务随后补齐 fixture，根 `typecheck` 重跑恢复通过。本轮 Files／设置用量／侧栏没有修改这些并行文件，全部保留；全量1648结果对应上述稳定版本，不自动覆盖随后其他任务仍在变化的通知功能。
- 新 Files 真 Host E2E 2/2，已有 Files 回归 8/8；设置用量与 provider landing 4/4；增强双 Client 侧栏 2/2；最新模型／permission／Plan／Goal 续作回归 8/8，结果位于 `artifacts/desktop-followups/entry-results`，复核了新截图。
- 本轮原生 Files（1440、900×600）、设置原位空用量与侧栏草稿保护（900×600）均用独立临时 profile 验证通过，使用现有 debug launcher 加本轮新构建 Host/Web resources。上轮原生 Plan 定向通过仍是独立旧证据。没有重新编译桌面 exe 的声明；上轮 exe 被用户进程占用、通用 smoke 在导航材质检查处失败，仍不能把这两项标绿。本轮构建仍有既有大 bundle warning。

## 迁移所依据的表达与交互准则

- 一级导航只承担项目、会话和稳定全局分类；上下文工具留在会话／文件／设置的当前区域，不因为点击次级按钮抢走主导航。
- 次级控制靠近它作用的对象。文件导航开关在 Files 工具栏，名单刷新靠近项目入口，用量时间窗口在用量页；异步结果回到原对象附近。
- 摘要、阅读内容、详细控制有明确层次。宽屏利用并排空间，窄容器切换视图；内容按 flex 流自然换行和滚动，不把截图坐标或固定内容高度当布局。
- 列表选择、模式切换、返回路径和可折叠状态必须可感知。当前文件有实际选中背景，打开导航聚焦筛选，切文件不隐式保存／丢弃内容。
- 不复制没有事实支持的指标或能力。Global usage 说明作用域，缺费用与截断明确提示；Commands 仍称 Commands，不冒充 Search chats；扫描上限不能宣称全量增量同步。

## 仍需实施与复核

| 单元                                 | 参考视觉/源码                                                                            | 当前差距和验收                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 完整 Goal 时间线                     | 原 `MessageList` GoalEventCard 与原 `ActiveSession` 整页已实际挂载；顶部条 24 组证据     | 本单元已完成 header 摘要、事件时卡、有锚点逆向读取、消息／Goal 分页与恢复；7 项真实 Host 浏览器测试及原生子集通过。窄屏保留控制是有意适配，不复制原 mobile 隐藏。继续纳入最终逐入口矩阵，不冒充全部桌面已完成。[交付](desktop-goal-lifecycle.md) |
| Files 阅读导航器                     | cc `docs/images/app/en/workspace-diff.webp`；`WorkspacePanel.tsx` 的 Show/Hide Navigator | 本轮已完成并验证；继续在最终逐入口矩阵中复核整体表达，不把此局部验收替代全部桌面体验。                                                                                                                                                           |
| 侧栏会话刷新                         | cc `session-main.webp` 的 Search 旁 Refresh；`Sidebar.tsx` 的 focus/visibility 刷新      | 本轮有界刷新已完成。超出1000扫描／缓存的变化仍缺 Host 名单增量事件与可恢复变更游标，明确反馈容量，不声称全局可靠增量。                                                                                                                           |
| 设置原位用量                         | cc `settings-usage.webp` 的用量分类                                                      | 本轮已完成真实只读分类，不跳 Status。未复制连续天数、头像、最长任务等没有公共事实的参考统计。                                                                                                                                                    |
| 模型、permission、Goal/Plan 入门路径 | cc `model-picker.webp`、`permission-modes.webp`，现有真实 Host 对比产物                  | 上轮双语真 Host 8/8与本轮完整 Goal 历史／顶部摘要均有证据；全部入口矩阵仍未完成，不能因局部通过宣布达到完整预期。                                                                                                                                |
| 原生通用视觉门禁                     | 当前 desktop-smoke 的选中导航标记断言                                                    | `1e0c910` 已确认旧观察器读取不存在的伪元素；真实canonical indicator独立断言与截图通过。外部dirty smoke仍未修改或完整通过，不能把整个门禁标绿。[诊断](desktop-navigation-marker-audit.md)                                                         |

设置/导航审查还发现语言选择、插件安装管理和批量归档等候选，但应按真实现有契约独立闭环，不扩大按钮名称。`session.list.title` 是精确标题筛选，不能当全局全文搜索。

Browser、真实终端、定时任务、市场/MCP/模板、图片材料预览及历史 rewind 不是换入口即可迁移的功能：需要相应产品/安全/持久化契约。当前 `browser.*` 是自动化，不是原生内嵌 Browser；内部 wakeup 不是 schedule CRUD；Fork 不是回滚磁盘。不得用占位 UI 声称等价。

完整 Goal 生命周期、设备语言、插件详情就近启停、确认归档退役、启动设置连续性、归档视图的执行准备、[工具结果复制](desktop-tool-result-copy.md)、[工具容器 P1](desktop-workbench-navigation-presentation.md)和[会话工具归属 P2](desktop-session-tool-ownership.md)已分别实现并按各自记录验收。P2 的新原组件参考为84图，最终根检查2001/0、新真实Host7/7、既有交互28/28、原生中英900/1440四条完整路径通过；外部归档仍保留当前Files/设置返回上下文，只清后续自动展开记忆。

[多文件预览 P3](desktop-file-preview-tabs.md)已实现独立UUID标签、单/批量关闭保护、文档和两类差异并存、每标签模式/阅读位置/差异分页，以及原组件实际的两种 Workbench Back 分支。新参考84图；最终 `fbz8IPGL/BBy3EzVG` 真实Host增强6/6、既有回归49pass/1显式skip、原生中英900/1440四场景48图通过，菜单alpha1、原稿/unknown/晚响应保护均有实证。候选真实失败与最终根串行门禁、共享pnpm阻断分别记在交付文档，不把子集通过替代全仓全绿。

新的[全入口三方向复核](desktop-final-entry-audit.md)已经独立提交 `a1de923`：继续逐项核对会话、导航和设置，不以P1/P2/P3替代全桌面体验。由此确认的侧栏调宽已落实为有界拖拽／键盘／重置及原位保存恢复，同时修复调宽后20rem聊天区的实际控件交叠。新真实Host4/4、同资源P1/P2/P3旧回归19/19、原生四组与两组最小聊天区均通过；完整检查的唯一外部边界失败、共享pnpm版本阻断、真实候选红测均分开记录，见[本单元交付](desktop-sidebar-resize.md)。

设置动态选项恢复也已实现为独立闭环：失败字段附近只读重试，保留模型／思考草稿和原版本；区分未选模型、模型不可用与读取失败，后台Provider刷新保持兼容。新真实Host中英2/2及最终原生中英900/1440四组通过，包含原输入真正回到pane可视区域后继续键盘选择，而非仅检查DOM焦点。53项定向测试、同资源新旧组合35/35通过；完整门禁2068pass／1外部边界失败及候选真实可见性缺口分别记录在[交付说明](desktop-settings-content-recovery.md)。

图片回看的原组件、键盘／焦点／移除与鉴权读取证据已经独立提交 `f8fb150`，见[图片查看器实施前审计](desktop-image-viewer-entry-audit.md)。这还不是图片预览实现；缩略图、原图画廊、资源生命周期与动画边界仍需落地，不能以文档替代功能。

后续继续全桌面逐入口矩阵及通用原生视觉门禁。每个单元仍按参考流式布局、宿主文案/数据、就近目标反馈和独立验证／提交交付；不能只验收P1/P2/P3、侧栏调宽或设置恢复而把总 Goal 标 complete。
