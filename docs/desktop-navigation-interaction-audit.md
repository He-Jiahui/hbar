# Desktop 导航与对象操作体验审计

起始审计日期：2026-09-24。参考工作树：`D:/Git/cc-haha`（HEAD `e28d0a65`）；hbar 起始基线为 `b0a1d77`。第 2–4 节保留起始问题与迁移依据，第 7–9 节记录实施结果，第 10–11 节按 **`e855123`** 的阶段状态复核，后续项目快捷入口与错误恢复见第 12 节。Provider/会话等并行单元的最新提交与总门禁见 [迁移总记录](desktop-experience-migration.md)。这是入口、交互链和证据清单，不是“全部迁移完成”的声明。行号对应当时源码，后续修改应按组件/符号重新定位。

本报告覆盖 Goal/Plan、项目与会话对象、页签与来源返回、文件浏览/预览/编辑。模型、权限、附件、Agent、设置、监控、终端与浏览器的完整审计由其他功能单元补充，不能用本报告替代全产品验收。

## 1. 证据等级与关键区分

| 证据                                           | 已核对内容                                                                 | 可以证明什么                                                         | 不能证明什么                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 当前 reference `desktop/src`                   | 实际入口、组件、事件处理、store                                            | 当前源码实现及动作意图                                               | 未运行分支的真实渲染、运行时服务可用性                              |
| `docs/images/app/zh-CN/session-new.webp`       | 已打开图片                                                                 | 项目→会话树、项目行快捷动作、新会话 composer、顶部文档页签、底部设置 | 项目编辑弹窗内部、错误恢复是否正确                                  |
| `docs/images/app/zh-CN/session-main.webp`      | 已打开图片                                                                 | 会话旁任务活动卡的分组、进度与完成样式                               | 持久 Goal 控制条；它不是 Goal 页面截图                              |
| `docs/images/app/zh-CN/workspace-changes.webp` | 已打开图片                                                                 | 文件/浏览器工作台、已更改文件、过滤、聊天并排布局                    | 文件编辑/保存流程                                                   |
| `docs/images/app/zh-CN/workspace-preview.webp` | 已打开图片                                                                 | 浏览器地址栏/前后导航/刷新、工作台展开与关闭                         | 文件编辑器、目标文档编辑器                                          |
| `img_preview` 六幅 Goal/Plan 图                | 已逐图查看，目录未跟踪，文件时间为 2026-09-07                              | 用户额外保存的视觉/交互意图                                          | 当前 reference 源码已经实现这些界面；图像所在目录不等于产品来源证明 |
| reference 定向测试                             | ActiveSession 目标 2 项；ProjectEditorModal 5 项；WorkbenchPanel 11 项通过 | 对应测试覆盖的行为约定仍成立                                         | 端到端、原生外壳或截图视觉验收                                      |
| hbar 纯内存文件 probe                          | 真实 FileWorkspace ViewModel + 只读 fixture port                           | 草稿返回后重开被重新读取覆盖的可重复症状                             | 用户磁盘内容已被修改；probe 没有执行 file.write                     |

`img_preview` 六图具体含义：

- `goal.png`：Goal 意图 chip，已选后有取消标记，提示为“明确目标”。
- `goal2.png`：贴在 composer 顶部的窄 Goal 条，展示“已暂停的目标”、摘要、耗时及删除/恢复/展开图标。
- `goal3.png`：同一 Goal 条与右侧目标/方案 Markdown 文档并排，箭头标出展开关系；文档有撤销、保存。
- `plan.png`：composer 内的“计划”入口，与权限和模型处于同一操作上下文。
- `plan2.png`：选中后的计划 chip 带取消标记，图内写明“可取消”。
- `no_goal.png`：红框标记“不需要”的大面积目标表单，目标内容与最大轮次占据会话检查器上方。不能据此删去 hbar 真实预算/运行约束，只能调整入口和默认信息密度。

当前 reference tracked 源码与这些图不一致。搜索实际 `src`、`desktop/src` 没有找到图中 composer Goal chip 或带暂停/恢复/清除的 composer 控制条；会话标题区域确有 `ActiveGoalStrip`，见第 2 节，不能将两者混为一谈。`hbar-goal-extension.js` 出现在 `desktop/src-tauri/binaries`、旧 target/build-artifacts 中，是构建产物，不是当前桌面源码的入口证据。不得据这些产物推断当前 UI 已具有相同能力。

## 2. Goal / Plan 的不同路径（起始基线）

| 功能路径              | reference 入口与展开                                                                                                               | 提交、取消与反馈                                                                    | 当前 hbar 差距                                                                                     | 必要迁移及不应混淆的语义                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 持久 Goal 创建        | `components/chat/composerUtils.ts:105` 注册 `/goal`；SlashCommandMenu 使用 Target 图标；ChatInput 的 slash combobox 搜索和键盘选择 | 作为命令提交；结果进入历史 GoalEventCard                                            | 工具栏“目标与计划”→综合侧栏→创建→大表单，离输入行为较远                                            | 按附加截图增加 composer 草稿 Goal 意图；提交当前文本形成目标。取消 chip 只取消草稿，不删除现有目标                                         |
| 持久 Goal 当前状态    | `pages/ActiveSession.tsx:104` ActiveGoalStrip，位于 SessionChatHeader `:827`；状态、目标摘要、预算/耗时/续作次数                   | complete 隐藏；当前源码 strip 本身没有暂停/恢复按钮                                 | 只有打开目标侧栏才看到主要 Goal 状态                                                               | 主路径移到 composer 顶部窄状态条，显示重要状态与摘要；暂停/恢复/清除/展开就近。blocked、usage/budget limited 不假装成 paused               |
| Goal 历史             | `components/chat/MessageList.tsx:295` GoalEventCard；`:368` GoalContinuationDivider                                                | 事件卡可折叠；续作是轻分隔线，非每轮重复大卡片                                      | 当前 Goal 与 Run 信息分散，不能把管理表单当运行反馈                                                | 保留历史事实与实时状态的区别；实时条来自 Host Goal snapshot/feed，不由历史字符串猜测                                                       |
| 协作 Plan 模式        | `controls/PermissionModeSelector.tsx:114` Plan 菜单项，ChatInput `:1419`；EnterPlanMode/ExitPlanMode 工具                          | ExitPlanModePermissionDialog `:303` 展示 Markdown、请求权限、反馈框；批准或继续计划 | hbar 已有真实只读 Plan 后端，但 composer 未表达；通用侧栏只显示结构化步骤                          | composer Plan chip→本次 `input.mode='plan'`；取消不 `plan.clear`。后续提议方案的审阅/继续规划/按计划执行需要独立闭环，不能用更新 TODO 冒充 |
| 结构化 Agent 任务计划 | TabBar `:194` 仅有活动时展示 SessionActivityButton `:617`；SessionActivityPanel `:700` 右上卡片                                    | task rows、完成数/总数、细进度条、完成删除线；来自 TaskCreate/TaskUpdate/TodoWrite  | hbar RunActivity 已消费 timeline.plan；目标侧栏又有计划列表与 WorkflowOverview，主要信息重复且混合 | 将当前进度留在会话，就近展开任务详单；Agent Plan 与协作 Plan 模式、Workflow 验收各自命名，不合并为一个“Plan”编辑器                         |

reference 的 GoalEventCard 当前缺少完整的 `aria-expanded` 等属性，PermissionModeSelector 的风险确认/会话绑定值得保留，但不能原样复制所有实现瑕疵。其固定像素尺寸也不是 hbar 布局依据；hbar 应按自身 flow-layout/icon/content 技能实现 flex、语义尺寸和宿主本地化。

### hbar 已有能力与真实缺口

- `packages/contracts/src/index.ts:65` 定义 `RunMode=default|plan`，`inputSchema.mode` 支持单次显式模式；`packages/kernel/src/index.ts:674` 显式输入覆盖持久会话模式。
- `packages/contracts/src/commands/configuration.ts:143` 提供 `mode.get/set`。`plugins/plan/src/index.ts:275` 为 Plan 注入协作指令，`:295` 拦截非只读工具，`:324` 禁止在协作 Plan 模式使用 `update_plan`。`request_user_input` 已支持 Plan。
- 因而最小 composer Plan 实现不需要创建新后端规划模式；需要草稿状态、显式发送模式、实际状态说明和方案审阅 UI。当前没有核对到生产 Web 对 `<proposed_plan>` 的专用方案审阅/执行入口；组件样例不能当生产能力。
- `packages/app-react/src/goal-plan-workspace.tsx:171` 是 Goal 编辑表单，`:264` 目标概要，`:328` Agent Plan 只读列表，`:368` WorkflowOverview。把这整个综合检查器作为 Goal 的主入口，是层级与使用频率不匹配，不是仅缺一个图标。
- Goal 的预算、执行额度、持久暂停原因和外部验收不能因界面变轻而删除。高级信息可放详情；默认状态条只显示用户判断是否继续所需的信息。
- `plugins/goal/src/index.ts:773` 创建 Goal 不自动启动首轮；`:962` 用户恢复 active 可能排入续作，恢复后不能再次额外提交 Run。
- 同文件 `:890` 更换 objective 会生成新 Goal ID、重置该目标计数，并触发替换语义。不能把这个操作描绘成没有其他后果的普通文档保存。
- `goal.set paused` 停止续作并使旧目标运行在后续检查处失效，不等同于已经中断当前模型调用。立即停止应走已有 Run cancel；UI 必须区分“暂停已确认”“取消已受理”“运行已结束”。

## 3. 项目与会话路径矩阵（起始基线）

以下 reference 路径均相对 `D:/Git/cc-haha/desktop/src`；hbar 路径相对本仓库。

| 路径                            | reference 入口 → 展开                                                                                       | 提交 / 取消 / 错误恢复                                                                                          | 当前 hbar 实际路径                                                                          | 必要改动与证据边界                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新会话（当前项目）              | Sidebar `:1025` 全局“新建会话”；`:459` 直接创建、打开页签并连接                                             | 默认当前会话目录；失败 toast；不先索要会话 ID                                                                   | `lumen-workspace-shell.tsx:324` → 通用 `app.createSession` 参数表单 → 执行                  | 高频行为应一击进入目标明确的新会话或本地空白草稿；无项目时只要求选择项目。截图 session-new 支持结果形态，不证明所有失败路径                                      |
| 项目内新会话                    | Sidebar `:1337` 项目行 SquarePen 快捷按钮；hover/focus 显示、移动端常显                                     | 固定该项目 workDir；不被当前选中的其他项目改写                                                                  | 项目行“…”→新会话→命令表单，已显式传 workspaceId                                             | 可增加对象行直接创建动作；保持目标绑定与局部失败，不让用户重复确认已知对象                                                                                       |
| 新项目 / 打开目录               | 项目标题“+”→空白会话或使用已有文件夹；Sidebar `:549` / ProjectEditorModal                                   | 名称+DirectoryPicker；最近目录/原生选择器/远程浏览；创建/取消；名称必填且 80 字符上限；等待期间禁关；失败留表单 | 标题旁 folder-open → `workspace.open` 参数 `path` 文本 → 执行；成功只选 workspace，无首会话 | 目录选择与最近项目放入口处；按 Host 本地/远程能力选择 picker，不能把本机目录错误当远程 Host 目录。reference 成功自动打开首会话，可按 hbar 领域拆出一致的用户流程 |
| composer 项目选择               | RepositoryLaunchControls 的当前目录 pill；无目录先进入最近目录，仓库再展示 branch/worktree，分支可搜索/新建 | 选中立即反映在 pill；新分支取消返回上层；异步绑定请求目录；运行中禁改                                           | 会话页仅显示 workspaceName；创建表单可选择 workspace                                        | 应有草稿会话的就近项目选择，已运行会话显示只读归属；不能在活跃会话里无提示改工作目录。截图 session-new 可见目录 pill                                             |
| 项目折叠 / 选择                 | Sidebar `:1262` 项目行折叠；会话行选择对应页签                                                              | 目录工作空间与会话选择不是同一动作                                                                              | 项目行只折叠；会话选择已显式 workspace+session，settings 不误亮会话                         | 当前绑定修复是基础正确性，尚非完整迁移；不要把折叠误当项目上下文切换                                                                                             |
| 项目编辑 / 显示名               | Sidebar `:1517` 对象菜单 Edit；ProjectEditorModal edit 模式显示真实只读路径                                 | 保存/取消；恢复文件夹名称；错误留当前 modal                                                                     | 菜单目前只有新会话、文件、工作区设置，无显示名编辑                                          | 显示名与真实目录分离，就近编辑；不得实际移动/改名磁盘目录来完成 UI 名称修改。当前只有源码和 5 项 modal 测试证据                                                  |
| 项目置顶 / 隐藏 / 恢复          | Sidebar `:1527` Pin，`:1539` Hide；标题菜单 Restore hidden；支持组织/排序与拖拽                             | Hide 可逆，提示；隐藏不删除目录或会话                                                                           | 无可见置顶、隐藏、恢复、项目排序                                                            | 本地偏好持久化；隐藏与删除严格区分。必要操作不应挪到整个设置中心                                                                                                 |
| 打开系统文件管理器 / 外部编辑器 | 项目菜单 Open in file manager；顶部 OpenProjectMenu 选择已发现目标                                          | store 执行并记录错误；不可用不提供假按钮                                                                        | 当前文件入口是内部浏览；无同等就近外部目标选择                                              | 通过桌面平台公开能力提供，远程环境应明确不可用，不要用固定 shell 文本猜系统                                                                                      |
| 会话重命名                      | 会话右键→Rename；Sidebar `:1360` 行内 input                                                                 | Enter/失焦保存、Escape 取消；不离开所属行                                                                       | `lumen-workspace-shell.tsx:455` 菜单→命令表单，sessionId/title 可编辑，还出现通用执行元信息 | 改为固定目标行内编辑或小型命名 dialog；pending/错误留本行；避免照搬 reference 的 Enter/blur 重入风险                                                             |
| 会话删除 vs 归档                | reference 右键 Delete→ConfirmDialog `:1627`；成功断开并关闭页签                                             | 危险确认；批量有 shift 选择、数量与前 5 项预览、部分失败处理                                                    | hbar 菜单是 Archive→通用 archived 布尔表单；archived 会话过滤隐藏                           | 两者不等价。保留 hbar 可恢复归档；提供就近确认、归档列表/恢复或 undo，不假装 archive 是 delete。无 backend delete 时不造删除按钮                                 |
| 搜索 / 刷新 / 批量管理          | Sidebar 搜索行 `:1078`、刷新、批量删除开关；设置固定底部                                                    | 搜索 modal；局部加载；批量可取消                                                                                | 主栏有 Commands/Ctrl+K、workspace/session分页；没有同等聊天搜索或批量对象管理               | 命令查找不是聊天搜索。保留高级命令入口，但不让它承包普通对象 CRUD；按真实搜索契约补入口                                                                          |

## 4. 页签、文件与返回路径矩阵（起始基线）

| 路径                               | reference 入口 → 展开                                                             | 提交 / 取消 / 错误恢复                                                | 当前 hbar 差距                                                                  | 必要改动                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 多会话切换                         | TabBar 文档页签，溢出滚动、拖拽；Sidebar 保持对象树                               | 选中页签与正文连成一体；非活跃运行有状态点                            | hbar 主 presentation 只有 session/settings/status 页面，没有可见会话页签条      | 由布局描述与稳定 session ID 维护页签生命周期；不只加视觉 tab 而丢掉草稿/运行归属                                                                    |
| 关闭页签                           | TabBar `:675` 当前/其他/左/右/全部菜单                                            | 运行中有取消、保持运行并关闭、停止并关闭三路                          | hbar 工具关闭和 session archive，不等于关闭运行中的视图                         | 视图关闭、Run cancel、会话归档分开；批量关闭必须先聚合受影响运行                                                                                    |
| 工作台展开                         | WorkbenchPanel `:55` Expand→独立 workbench tab，并记录 sourceSession/turn/element | `:70` / tabStore `:236` 返回源会话、关闭 workbench tab                | 工具侧栏只有 close；settings/status 有 returnContext，但不是文件工作台展开/返回 | 定义来源 session/file/scroll anchor，展开与返回不重置文件/草稿。当前 reference returnFromWorkbench 源码仅明确激活源会话，不能声称已证明滚动锚点恢复 |
| 文件工作台入口                     | 顶部文件按钮→共享右侧 Files/Browser 分段；WorkbenchPanel `:73`                    | 当前模式有明确选中态，关闭可回到聊天                                  | hbar 已有会话工具 Files 和项目菜单 Files、显式 target/pinned                    | 目标绑定保留；后续统一文件/浏览器等工具工作区与展开能力，不让点工具改变主会话                                                                       |
| 文件导航                           | WorkspacePanel `:2070` Changed/All，下方过滤；All 支持树和搜索结果                | 目录按需加载、失败/空态；选文件后导航可收起/再展开；搜索支持焦点移动  | `lumen-file-workspace.tsx` 单层目录分页，parent/refresh，文件打开后替换列表     | 有界树/路径导航、搜索与改动视图，不能用无限预加载换便利；目录与当前编辑文档保留关系                                                                 |
| 文件 / diff / 图片 / Markdown 预览 | WorkspacePanel `:1790` 预览头、路径、diff增删；多文件 tabs `:1939`                | refresh 错误就近，旧预览仍在；close current/others/left/right/all     | hbar 单个 textarea 文档，不区分预览与编辑，无 diff/文件页签                     | 保留参考的类型化预览与清楚标题。当前 reference 源码是只读预览，没有文件保存；不能把 img_preview/goal3 的方案编辑器当作 WorkspacePanel 能力          |
| 文件加入会话                       | 预览头 Add to chat；文件菜单加入/复制路径；文本选择/行批注 `:1496` 起             | 添加引用回原 session；diff comment 后聚焦该 session composer          | 当前生产文件面板没有相同引用路径                                                | 使用结构化附件/引用公开契约，保留 path/行/引用文本和原 session，不能只复制隐式文本到当前 active 会话                                                |
| 文件编辑与保存（hbar 已有）        | reference WorkspacePanel 没有对应编辑；附加目标图有文档保存意图                   | hbar 有 dirty、saving、saved、sha256冲突、unknown对账、丢弃并重载确认 | 返回列表再打开同文件会重新读盘覆盖未保存草稿；切其他文件同类风险                | 必须先保护草稿：有界 workspace+path 文档事实源、关闭/切目标可恢复、显式丢弃。未知写入不能改为新保存重放                                             |
| 回到来源                           | reference workbench Back to conversation；文件navigator toggle不丢预览tabs        | 操作落点与来源一致                                                    | hbar Back to files 只改view保留document，但随后openEntry无条件重置document      | Back、重开同文件、切文件、关再开、切workspace都应是同一受保护文档生命周期，不能仅修按钮                                                             |

### 文件草稿问题的具体复现

只读临时端口固定返回 `one.txt = saved`，未调用任何磁盘写入：

1. `fileWorkspace.openEntry(one.txt)`。
2. `fileWorkspace.setText('UNSAVED DRAFT')`。
3. `fileWorkspace.showBrowser`；snapshot 内 draft 仍为 `UNSAVED DRAFT`。
4. 再次 `fileWorkspace.openEntry(one.txt)`；snapshot 内 draft 变为 `saved`。

原因是 `packages/app-runtime/src/file-workspace.ts:129` 的 openEntry 无条件生成新 document 并 file.read；`:178` 的 showBrowser 仅修改 view。已有测试只检查步骤 3 保留草稿，未覆盖步骤 4，因此不能以原测试通过说明完整返回流程安全。

## 5. 迁移组织与验收

推荐把“交互基本一致”按用户流程验收，而不是统计新增按钮数：

1. **Composer 意图与实时反馈**：Goal/Plan 草稿 chip、取消、发送、目标控制条、目标详情；实时模型 picker；错误仍在触发位置。
2. **项目与会话对象操作**：直接新会话、目录选择、固定目标命名、可恢复归档、项目菜单与偏好。普通用户不先进入通用命令参数表单。
3. **文件文档生命周期**：先修草稿保护与未知写入恢复，再做树/搜索/预览/多文件/引用/展开和返回，不能只复刻外壳。
4. **会话与工作台导航**：页签、来源恢复、运行中关闭策略，全部由显式绑定和可序列化布局描述承载。

每单元应至少验证：桌面/窄屏、长标题与路径、键盘/焦点、空态、待处理、防重复、已确认、失败、未知结果、取消、快速切会话/项目、晚到响应、关闭再开、断线再连。截图应记录实际操作前后状态，不用组件示例图替代生产流程。

### Composer runtime 接入约束

独立 `composer-intent` factory 提供每 session 的 `default|goal|plan` 草稿状态、明确模式提交、Goal 控制、当前 session 的 sequenced facts 和对账动作。它复用 GoalPlanFeed、Host goals snapshot/watch 以及既有 Drafts Run receipt，不自编目标状态或模拟启动。

- Goal 提交是“创建确认→Run 受理”的可恢复两阶段操作，不宣称存储原子提交。
- Goal 已确认而 Run 确定失败：保存 preparedGoalId；同稿重试只提交 Run。更换模型/effort 可修复确定失败并使用新的 Run 幂等键，不重建目标；修改目标文本/附件则要求先取消原草稿意图。
- 创建结果未知：只读 snapshot 对账；确认符合本次目标后进入 partial，仍由用户明确重试发送。未确认时不盲重建。
- Run 结果未知：委托既有 draft.reconcileSubmission；未受理确认前不清文本或重放。
- Goal pause/resume/clear 带 expectedGoalId；目标被其他端替换后返回冲突，不能把原动作作用于新目标。
- 若要求“首轮 Run 必须与刚创建的目标原子绑定”，现有 Run 契约尚无 expectedGoalId 与 compound receipt，需要单独的 Host 用例/事务改造；前端检查不能伪称实现了这项保证。
- 草稿状态可跨组件/会话切换保留，不宣称当前实现支持浏览器/进程重启恢复。

## 6. 已运行的检查

- reference：`bun run test -- --run src/pages/ActiveSession.test.tsx -t goal`，2 passed / 30 skipped。
- reference：`bun run test -- --run src/components/layout/ProjectEditorModal.test.tsx src/components/workbench/WorkbenchPanel.test.tsx src/components/workbench/WorkbenchTab.test.tsx`，实际发现并执行 2 个文件共 16 passed；没有对应 WorkbenchTab 测试文件，不把未发现文件计入通过数。
- hbar：FileWorkspace 纯内存 probe 确认返回后重开覆盖草稿；只读 port，没有写磁盘文件。
- hbar：`bun test tests/composer-intent-runtime.test.ts`，13 passed / 66 assertions；目标/模式隔离、两阶段恢复、未知结果、精确目标、订阅生命周期、模型修复及并发草稿保护。
- hbar：新增 factory/tests 的 focused ESLint 与 root `tsc --noEmit` 已通过；生产 UI、E2E、构建与提交由主线整合后验证，不能用这些单元测试替代。

## 7. 文件草稿闭环的后续实现与浏览器验收

本节是上述基线审计后的实现结果，不回写矩阵、也不表示文件树/搜索/diff/多页签等其余差距已消失。

- `file-workspace-documents.ts` 使用 workspaceId+规范化相对路径作为唯一文档事实源。返回、切文件、关闭重开、切工程只改变视图与引用；未保存及未知写入文档不会被重新读取覆盖。
- 缓存限制为 32 个文档、8 Mi UTF-16 code units 的源文/草稿/在途文本；只淘汰未引用的干净文档。容量不足返回 BUSY，不静默丢弃受保护内容。
- 多面板引用同一路径时共享文档。保存期间的新编辑保留；晚到响应只更新原目标。明确丢弃需要原 workspace/path、确认时 draft 与源文件 hash 都匹配。
- 文件写入目前没有 Host 持久 receipt/idempotency 契约。unknown 状态保留原提交关联 ID、待保存内容、基线和原 hash；不能新保存重放或丢弃。只在读回内容等于原提交内容时确认成功；其他结果保持 unknown，无法证明未写入时不会伪称失败可重试。
- 缓存仅属于当前 runtime 生命周期，不保证浏览器/原生应用重启后恢复。

已实际运行：

- `bun test tests/file-workspace-runtime.test.ts tests/file-workspace-react.test.tsx tests/file-workspace-unknown-save.test.ts`：15 passed / 101 assertions。
- 新增真实临时 Storage + LocalExecution + Host fileCommands + AppRuntime 回归：文件已原子替换后索引失效异常，以及已接受写入后 CONNECTION_CLOSED / 无 code 异常 / RPC_ERROR。四项先确认在旧分类下失败，再验证均保留 unknown、原 hash 和 pending 内容，不能再保存或丢弃，只读对账后确认成功，写入次数始终为一。
- 文件 runtime、契约、React、tests 与新增 E2E/fixture 共 8 个 TypeScript 文件的 focused ESLint 通过；content/icon/flow guards 与 scoped `git diff --check` 通过。
- 独立 Vite production build 通过，输出只在 `artifacts/reference-files-v2/dist`。Host/preview 分别使用 44717/44729，未占用主线实例端口。
- `bunx playwright test --config artifacts/reference-files-v2/playwright.config.ts`：3 passed，13.2s。中英文生产 App 验证返回、同文件重开、切文件、关闭重开、跨工程草稿、准确目标丢弃、保存到临时 fixture；桌面 1440、窄屏 390/320 检查按钮几何和根元素溢出。
- 第三项 E2E 是明确的 test-only 双面板组合，使用公开 runtime、生产 HbarFileWorkspace 与真实临时 Host。它证明同时渲染两个文档视图时共享事实、旧确认不覆盖新编辑；**不表示当前生产 presentation 已支持同时显示两个工具面板**。该测试只在显式构建独立 fixture 时启用。
- 最终 `bunx tsc --noEmit` 已通过；此前并行 `plan-proposal-actions.ts` 的 nullable 类型错误在此轮已消失。

已人工查看 `artifacts/reference-files-v2/file-draft-en-US-320.png`、`file-discard-zh-CN-320.png`、`file-twins-shared-fact.png`。窄屏确认标题会截断，因此正文另显示完整可换行文件路径；确认按钮和保留草稿按钮均在视口内。截图与构建是忽略的本地产物，不作为源码内嵌的演示数据。

## 8. 会话对象操作的补充核对

这是基线矩阵后的深入核对；归档恢复与分支不因重命名已实现就计为完成。reference 下述路径相对 `desktop/src`。

| 动作        | reference 真实入口与目标                                                                                                              | 展开、确认与反馈                                                                                                                        | hbar 公开能力与迁移边界                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重命名      | `Sidebar.tsx:399` 捕获右键会话 ID，`:1376` 绑定行，`:1480` 菜单；`SidebarTaskList.tsx:80` 也有重命名                                  | `Sidebar.tsx:886` 固定目标与原标题；`:1360` 原行输入；Enter/blur 保存、Escape 取消。源码未见显式 pending/失败保留处理，不能照搬重入风险 | `session.rename` 已存在，原 UI 通过命令表单重复选目标。新增独立行内编辑，明确 Save/Cancel，不以失焦隐式提交；原会话与原标题锁定，未知结果只能查询原目标                                                                                |
| 删除        | `Sidebar.tsx:764` 固定待删 ID；`:1628` ConfirmDialog                                                                                  | 确认后删除、断开并关闭页签；批量 `:815` 有忙碌守卫、前五项摘要与部分失败保留                                                            | hbar 没有对应公开删除契约，不做假删除。现有 `session.archive` 可逆；应做明确目标的归档确认与恢复列表，而不是改文案冒充删除                                                                                                             |
| 归档 / 恢复 | 当前 reference 的会话菜单只有 Rename/Delete；`Sidebar.test.tsx:1280/:1332` 明确没有 Archive Conversations                             | `Sidebar.tsx:685/:1917` Restore 是恢复隐藏项目，不是恢复会话                                                                            | hbar `session.archive({archived:false})` 已支持恢复；会话列表当前隐藏 archived，缺少可见恢复入口。`session.list(includeArchived:true)` 是全部会话，不是仅归档：必须有界分页并允许继续扫描，不能因首屏无归档就宣称列表为空              |
| Fork / 分支 | `MessageActionBar.tsx:83` 是消息旁 GitFork，不是会话行菜单；`MessageList.tsx:1152` 只收录已提交 user/assistant 的 transcriptMessageId | `:2360` 活动运行/准备/工具等状态禁用；`:3160` 捕获源会话+消息创建分支→新页签→连接；成功提示，失败保留可重试入口                         | hbar `session.fork` 有持久幂等 receipt，Host 支持 `atSeq`，但 Storage 要求该 seq 是 `run.settled` 边界，不是任意消息 seq。要先提供公开消息→已结算边界映射，或仅提供“从当前完成位置分支”；不能把 reference 的 message ID 随意当 `atSeq` |

reference 补充检查：Sidebar 中 rename/delete/archive/restore 相关定向测试 3 passed / 90 skipped；MessageList branch/fork 相关 2 passed / 178 skipped。这些仅证明选中的测试行为，不能替代菜单截图或完整原生交互。

视觉证据另核对了 `artifacts/ui-reference/cc-haha-runtime/current/session-tool-complete-1440x900.png` 及其 `capture-metadata.json`：它来自 repository smoke preview、隔离项目与确定性 provider；可证明页签/侧栏/内容工作台的真实层次，**未展开的菜单内容仍只属于源码证据**。原 hbar `artifacts/ui-redesign/shell/session-rename-1440.png` 则显示普通重命名进入完整命令表单，属于被替换的入口证据。

最明显的布局阻碍不是坐标差值，而是信息组织：

1. 已知对象的普通重命名被升级成全局命令参数表单，编辑会话名要重新处理 sessionId 和执行元信息。应在原行完成，并把失败、冲突、保存结果留在该行。
2. 侧栏每个会话同时使用图标、缩进、双行标题/时间和菜单，窄栏的有效标题空间偏少；reference 依靠紧凑行、就近动作和弱化元信息提升扫描效率。后续应调整流式密度与信息优先级，而不是照截图写死行高。
3. 工作台工具目前缺少 reference 的展开/返回来源与多文档页签；新增侧栏按钮不能代替文档生命周期。原常驻大面积使用量区也挤占内容，此项正由另一独立单元改为就近展开，不应重复实施。

### 行内重命名已实现的限定闭环

- `session-rename.ts` 只保存一个有界编辑意图，真实会话标题仍来自目录投影；没有复制第二份已确认事实。
- 普通编辑有明确输入、Enter 保存、Escape 取消、IME 保护、160 字符限制；离开输入不会保存。切换会话不改变编辑目标，晚到结果不会切回或抢走新会话输入焦点。
- 兼容增加可选 `expectedTitle`，由 Storage 事务原子比较标题。冲突无写入、无新事件；已是目标标题则无事件幂等返回；旧调用仍可不传该字段。并发更新其他字段不会被整对象旧快照覆盖。前置 `session.get` 只改善提示，不冒充 CAS。
- 写入开始后的不明错误保留 unknown、原输入和原目标；查询结果匹配本次标题才确认，不自动重放。当前未增加持久 rename receipt，因此标题被后续改动遮蔽时不能证明本次写入是否发生，UI 必须继续显示未知，不能虚构取消或重试安全。
- 原会话被其他端归档或移除后，恢复区仍展示原目标和可复制的只读草稿。确定未写入可取消；未知结果只允许查询。不会自动清除草稿、恢复归档或改绑其他会话。
- 这属于当前 runtime 内编辑生命周期，不声明浏览器/进程重启后恢复。

已完成定向验证：runtime、真实 Kernel/Storage CAS、SSR、工作区与旧会话命令共 30 tests / 225 assertions；中英文生产 App E2E 最终 2 passed / 9.9s，覆盖 Enter/Escape、失焦、长标题、320/390/1440、并发冲突、接受后未知结果、晚到响应与归档恢复。独立 production build、focused lint、root typecheck、content/icon/flow 与 production boundary guards 均通过。已人工查看 `artifacts/session-rename/recovery-en-US-320.png`、`recovery-zh-CN-1440.png`，原目标、只读草稿与可执行恢复提示正常流式换行。完整共享 E2E 由主线整合其他并行功能后运行，本单元不把未运行检查计为通过。

## 9. 可恢复归档的实现闭环

会话行的 Archive 现在展开固定原目标的行内小确认，正文明确“不删除历史、可在原项目恢复”，不仿造 reference 的 Delete。项目菜单的 Archived 入口打开项目标题下的列表，不改变主会话，也不要求用户滚过全部普通会话后才看到操作结果。常驻会话列表继续排除 archived。

- 独立 `session-archive.ts` 保存一个有界操作意图、一个 100 条上限的页面 ID 列表及游标；已确认会话记录仍只来自 directory 投影。当前页是 `includeArchived:true` 的混合项目会话页，UI 筛出归档项。分页由用户明确 Next/First，不自动遍历所有项目数据；首混合页无归档且有后续游标时不显示项目级“没有归档会话”。
- Confirm/Restore 复用 `app.archiveSession`，先核对原 session/workspace；若已经达到目标归档状态，只确认事实、不再次写入。恢复按钮仅恢复，不包含隐式打开或切换。
- 已确认归档只在原目标仍是当前选中会话时清除 sessionId，保留 workspace；等待期间切换到另一会话，旧结果不清新选择。恢复后用户自行从常驻列表打开。
- 已开始写入后的连接关闭、未知异常等保留原目标、期望 archived 值、请求 ID 和 unknown 状态。关闭列表、换项目、原行消失都不清掉意图。只有原目标 `session.get` 读回期望状态才确认；不重复提交或伪装取消。
- 页面关闭或换项目会取消原页请求，晚到结果不能重开或改绑列表；失败保留上一页及游标，明确重新加载。超出 100、重复 ID 或循环游标响应拒绝；目录缓存淘汰导致页面 ID 暂时缺失时提示刷新，不把缺失伪称空列表。
- 这是已有可逆 archive 的 UI 闭环，未增加持久归档 receipt、删除契约或重启后意图恢复。若另一客户端在未知写入后再次改变 archive 状态，读取不同值不能证明未写入，必须继续保持 unknown。

验证：archive/runtime、rename 回归、SSR、workspace/session 共 48 tests / 323 assertions；生产 Web+真实临时 Host 的中英文归档/恢复及 101 条混合分页 E2E 3 passed / 12.6s；同一新构建再跑 rename E2E 2 passed / 10.6s。独立 production build、root typecheck、9 文件 focused lint、content/icon/flow 与 production boundary guards、格式和 scoped diff check 通过。截图已人工查看 `artifacts/session-archive/confirm-en-US-320.png`、`restored-zh-CN-1440.png` 与 `pagination-second-page.png`，确认长标题/说明正常换行、归档列表就近展开、恢复后主内容不被自动打开。

## 10. 交付复核：当前入口与剩余能力边界

本节读取 `e855123` 的已提交导航、文件、工具栏与公开契约；遇到并行修改文件时对照 `git show HEAD:<path>`，不把正在整合的界面提前计入完成。状态含义：**已实现**指对应有限闭环已有提交与实际验证；**仍有交互差异**指能力存在、入口或视图组织尚不相同；**部分能力**指有底层基础但缺少完成该交互的公开契约；**无同等公开能力**不算单纯 UI 漏入口。

### 新建、项目与会话对象

| reference 入口/路径                          | e855123 的真实对应路径                                                                                        | 当前状态与余差                                                                                              | 能力与证据                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全局新建会话，默认当前项目                   | 侧栏 New session 直接创建并打开当前 workspace 的会话；没有目标时打开项目选择；未知创建核对原幂等操作          | **已实现**，不再要求 sessionId/通用命令表单                                                                 | `4298a8f`；`lumen-workspace-shell.tsx` 的 `newSession/runNavigationAction`；`desktop-experience/session-entry/created-zh-CN-1440.png`                                   |
| 项目行直接 SquarePen 新建                    | 项目“…”→在此工程新建会话，显式绑定该 workspace，创建后打开                                                    | **已实现基本闭环，仍有一层入口差异**：reference 是行快捷按钮，hbar 是短菜单；不再重复填写已知目标           | `session.create` 后端及持久幂等已存在；这是可选就近入口优化，不是后端缺失                                                                                               |
| 打开/新建项目，目录选择与最近目录            | 标题旁打开项目→已有项目列表或 Host 目录文本；选择已有项目只切 workspace；从新会话流程添加目录会继续创建首会话 | **已实现注册已有目录，部分能力差异**：无同等原生/远程目录浏览、创建目录闭环                                 | `workspace.create({path})` 只注册现有目录。`createBrowserResourcePicker` 仅 client-local 上传文件/目录 artifact，并非 Host 路径选择；不能直接冒充参考的 DirectoryPicker |
| composer 当前项目 pill、branch/worktree 选择 | 会话标题下显示 workspace；现有项目通过打开项目选择器或侧栏会话进入；已建立会话不静默更改工作目录              | **仍有交互差异**：新草稿上下文没有 reference 的 composer 项目/仓库 pill；已有项目切换与归属已明确           | `app.setWorkspace/app.setSession` 已有；`git.branch/git.worktree` 后端已有，但尚非 composer 就近控件。不能无提示迁移既有会话的工作区                                    |
| 项目折叠、会话选择                           | 项目行只折叠；会话行显式传 workspaceId+sessionId；Settings/Status 页面不误亮原会话                            | **已实现**目标与选中态约束                                                                                  | `c38d213`；`lumen-workspace-shell.tsx` 的 `openSession`、页面类型判断；真实跨项目测试                                                                                   |
| 项目重命名/置顶/隐藏/恢复                    | 项目菜单当前为新会话、Files、Workspace settings、Archived sessions                                            | **部分能力**：无公开 workspace.rename/update；置顶/隐藏可作为客户端偏好另建，不需要假造删除/Host 目录重命名 | `commands/workspaces.ts` 的 workspace 写命令只有 create；客户端偏好状态尚未建模。参考 Restore hidden 恢复的是项目，不是会话                                             |
| 会话右键 Rename→原行编辑                     | 会话“…”→原行输入，明确 Save/Cancel，Enter/Escape，原目标 CAS，未知查询，原行归档/移除后保留草稿恢复区         | **已实现**；保留有意差异：不以 blur 自动保存，避免 Enter/blur 重复提交                                      | `11d93f5`；`session-rename.ts`、`session-navigation-row.tsx`；`session-rename/inline-en-US-320.png`、`recovery-zh-CN-1440.png`                                          |
| reference Delete→确认                        | hbar Archive→原行可恢复确认→项目 Archived→Restore                                                             | **已实现 hbar 合理对应，而非“删除漏做”**。不删除历史，恢复不自动打开                                        | `e855123`；[归档独立说明](desktop-session-archive.md)；`session-archive/confirm-en-US-320.png`、`pagination-second-page.png`。未发现同等 session.delete 公开契约        |
| reference 消息旁 Fork                        | 当前消息动作没有 Fork；专家命令目录/CLI/API 可执行 `session.fork`                                             | **仍有交互差异；后端已支持**，不能列为无后端能力                                                            | `commands/workspaces.ts:79`、Storage `fork`；默认从当前完成位置可实现就近入口；若要任意消息分支，必须把消息映射到 `run.settled`，不能直接传 message.seq                 |
| reference 搜索聊天                           | hbar Commands/Ctrl+K 查命令，普通会话按项目分页                                                               | **无同等公开全文聊天搜索能力**；不能称命令搜索已替代聊天搜索                                                | `session.list` 仅有 title 精确过滤/游标，没有消息全文搜索或相关度结果契约                                                                                               |

### 文件、工作台与工具栏

| reference 入口/路径                            | e855123 的真实对应路径                                                                                                                     | 当前状态与余差                                                                                                                           | 能力与证据                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 顶部 Files / 项目文件入口                      | 会话标题右侧 Files；项目菜单 Files 固定目标；点当前会话 Files 不会把其他项目的 pinned 文件面板误关闭                                       | **已实现**；工具高亮按 panel+workspace，非 Files 还核对 session                                                                          | `c38d213/cfa3dd9`，`lumen-session-workspace.tsx` 的 `isToolActive/toggleTool`；项目文件保持主导航不变                                                                                        |
| 文件打开、返回、编辑、保存                     | 文件列表→文本编辑→Back to files；Save、dirty、unknown 核对和明确丢弃确认                                                                   | **已实现 hbar 自有编辑闭环**；reference WorkspacePanel 当前主要是只读预览，不应把编辑安全误称参考本来已有                                | `05d8030`；workspace+path 缓存 32 文档、8 Mi UTF-16 容量，未知写不重放；关闭/重开/切工作区不丢草稿；不承诺重启持久化                                                                         |
| All/Changed 文件树、筛选、diff                 | hbar 文件面板仍是单目录分页与单文档 textarea；Git 状态/统计在 Status→Git，专家命令有 git.diff                                              | **仍有交互差异；主要读取能力已存在**：`file.list/read` 可支撑按需树，`git.status/diff` 可支撑 Changes/diff 视图，尚未合并到 Files 入口   | 对比 reference `workspace-changes.webp` 与 hbar `reference-files-v2/file-draft-en-US-1440.png`；旧 hbar 图仅作为文件面板证据，不能用其旧标题栏/使用量区代表当前壳层                          |
| 工作区文件内容搜索                             | reference All 搜索；hbar Files 无搜索框                                                                                                    | **部分能力**：local-tools 已有 `search_text/find_files` 执行与 schema，但没有等价 `file.search` 应用查询接口                             | `plugins/local-tools/src/index.ts:338` 注册模型工具；需要明确公开只读应用查询适配与分页，不应让 UI 越层访问插件私有对象，也不能说引擎完全没有搜索能力                                        |
| 多文件预览页签、展开工作台、返回源会话         | 当前只有一个工具 outlet；文件列表与单文档互换；Settings/Status 有 returnContext，但 Files 没有 reference 的 Expand→独立 workbench tab→Back | **仍有交互差异**，是客户端视图/来源生命周期未迁移，不是基础文件后端缺失                                                                  | `apps/web/src/shell-layout.json`、`surface-manifest.ts`；reference `WorkbenchPanel.tsx:49/:72`、TabBar；文件草稿缓存已为后续复用打底                                                         |
| 多会话页签与关闭策略                           | 当前会话由侧栏选择，presentation 仅 session/settings/status；没有可见会话 tab strip                                                        | **仍有交互差异**：现有会话加载/切换/Run cancel 足以提供基础视图管理，但尚未定义标签生命周期和运行中关闭策略                              | reference `session-new.webp` 顶部标签与 `workspace-changes.webp` 多页签；hbar 当前 `activity-en-US-1440.png` 是单标题区。不得用 Archive 代替关闭视图                                         |
| 文件 Add to chat / 选中行批注                  | composer 已能上传附件；文件面板无同等路径/行号/来源引用动作                                                                                | **部分能力**：artifact 上传已有；workspace 文件引用、行范围、diff comment→原 session 的结构化意图尚未装配                                | `commands/files.ts` attachment 契约与 `draft.addAttachment`；不可把无来源普通文本拼接冒充完整引用闭环                                                                                        |
| Files / Browser 分段及嵌入预览                 | hbar 当前 surface manifest 没有 Browser outlet；浏览器自动化可通过专家命令执行                                                             | **部分能力且仍有入口差异**：`browser.status/navigate/snapshot/...` 后端已注册，但不等于具有 reference 的嵌入式浏览器呈现/地址栏/前后返回 | `commands/browser.ts`、`kernel/browser-commands.ts`；实际可用性仍须读取 browser.status，不能假设每个 Host 都可用                                                                             |
| 终端、外部编辑器/系统文件管理器                | 未发现同等生产 desktop 入口和公开交互式 PTY/外部打开能力                                                                                   | **无同等公开能力**，不列为仅 UI 少按钮。模型 shell 工具、TUI clear/close 不是可见工作台终端                                              | `commands/terminal-application.ts` 仅 TUI 清屏/关闭；不能把非交互执行器或上传目录选择器当原生终端/外部打开适配                                                                               |
| 会话标题与工具按钮                             | 标题右侧五个紧凑具名图标：Files、Monitoring、Child agents、Goals/plans、Session settings；保留可访问名称与选中态                           | **已实现紧凑工具栏闭环**，不再是旧图的整排工具说明占一行；五个动作语义不与 reference 完全相同属于产品能力分组                            | `a65825e`；`SessionToolButton` 与 `isToolActive`；当前 `activity-en-US-1440.png` / `activity-en-US-320.png`                                                                                  |
| composer 模型、权限、Goal/Plan、用量；运行详情 | 模型/推理等级局部选择、权限 picker、Goal/Plan chip、目标状态条与提案动作；用量按需展开；运行摘要紧凑、详情按需分页                         | **已实现各已提交单元**，旧“全挤在综合侧栏/常驻大卡片”的结论不能继续当现状                                                                | `62ea90d/9f3ee84/e3b27a1/8329581/2af5d12/002671c`。Goal chip 依据用户六图意图，不伪称 reference 当前 tracked 源码已有完全相同 Goal 控件；并行 decision/provider 新界面不在本次 HEAD 完成范围 |

### 截图时效与本轮方法

本轮重新打开并查看：reference `session-new.webp`、`workspace-changes.webp`；hbar `desktop-experience/session-entry/created-zh-CN-1440.png`、`reference-files-v2/file-draft-en-US-1440.png`、`desktop-experience/browser-results/session-run-activity-curre-00165--grows-only-on-demand-en-US/activity-en-US-1440.png`、`session-archive/pagination-second-page.png`。后两项反映本轮已提交的紧凑会话壳层；前两份 hbar 过程图只证明新建/文件行为与相应面板，不能据其旧头部与用量区重报已修复问题。

本次只读交付核对未启动新服务、未修改产品代码、未重跑所有既有测试；测试数字见各功能提交及第 7–9 节，不能作为“整产品全部验收通过”。

## 11. 仍需优先处理的三项差异（不扩充成无后端功能清单）

1. **文件工作区把已有读取能力组织成“浏览 → Changes/diff → 查看文档”的就近路径。** reference `workspace-changes.webp` 实际可见 Changed/All、过滤和文件行，hbar 文件图仍显示单文档 textarea；`file.list/read` 与 `git.status/diff` 已存在。优先补按需树、Changes 与 diff 的公开应用桥接/展示，不先把搜索模型工具、任意文件图片预览都算已具备的 UI 数据接口。
2. **会话/文档页签与展开后返回来源。** reference 两张仓库截图实际可见顶部页签及独立工作台，当前 hbar 活动截图仍是单标题+单工具 outlet；现有会话、文件缓存与 surface 状态足以作为基础，但视图关闭、归档、取消运行必须分开。该项属于客户端导航生命周期，不应以“后端没有多标签命令”为由忽略，也不能只加一排装饰 tab。
3. **把已有对象/仓库能力从专家入口进一步搬到所属上下文。** reference 新会话截图明确有项目行快捷新建和 composer 项目/仓库 pill，hbar 对应行为已经能完成，但项目新建仍多一次“…”菜单，分支/导出、git.branch/worktree 仍主要在专家命令路径。先做目标明确的项目快捷新建/草稿项目上下文，再给已完成位置的 Fork 入口；消息任意位置 Fork 需先落实 settled 边界映射。Fork 的按钮内容证据来自 `MessageActionBar.tsx`，现有截图并未展开该动作，不能把源码观察写成已拍摄按钮截图。

不把 session.delete、远程目录浏览、交互式 PTY、聊天全文搜索当本次“已有后端却漏入口”的问题；它们分别没有等价公开契约或还缺平台适配。项目 pin/hide 则属于尚未建模的客户端偏好，可以另作 UI 产品范围，不与真实删除混淆。

## 12. 后续交付：项目行快捷入口与可修正路径错误

`1d3801a` 已将“在此项目新建会话”从更多菜单移到项目行右端，与 reference `session-new.webp` 和 `Sidebar.tsx` 的更多→SquarePen 顺序一致；移除菜单重复动作，保留目标绑定与本会话草稿。桌面 hover/focus 可见，窄屏常显，更多与新建的点击区均为 2.75rem。第 10–11 节中“项目新建还多一层菜单”的差距因此已关闭，文件树/diff、会话/文件页签、Fork 等其余条目仍未关闭。

回归还发现旧路径校验会把不存在目录误判成 unknown，阻止修改输入。`b3fbd45` 将写入前文件系统验证失败保留为 `INVALID_WORKSPACE`，并修复 runtime 丢失 Host typed code；不改变真实存储写入未知的保护规则。真实子进程 Host 验证错误目录/文件当目录可修正为有效目录，原选择和既有记录不被污染。

详细视觉依据、行为检查、独立提交与全仓/原生验证见 [项目快捷记录](desktop-project-shortcut.md)；最终同一生产构建的 29 项组合浏览器回归见 [总记录](desktop-experience-migration.md)。
