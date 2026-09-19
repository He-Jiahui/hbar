# 命令优先重构实施记录

本文件只记录已核验的实施进度，不替代总计划的完整目标。起始代码为 `857206a`；旧 Web 行为从 `7ae9740` 查证，当前外壳由 `6ec3b46` 提供。2026-09-17 起逐里程碑实施。第一阶段 A0–A15 已完成，当前进入 B1–B7 工作台重建。

## A0：基线、功能映射与包依赖门禁（完成）

功能迁移入口见 [implementation-inventory.json](implementation-inventory.json)。每个当前 RPC 在一个领域下登记；未重命名的 RPC 暂定保持原 ID，`renames` 明确记录规范命令名变化；具体读写/参数/输出目前以 `packages/contracts/src/index.ts` 中的 rpcSchemas/RpcResults 为历史契约。正式命令定义在迁移该领域时替代该历史契约。自动检查会在增加/删除 RPC 或终端入口而遗漏清单时失败。

每个领域记录 handler 所有者、状态所有者、分类、实施里程碑与已有测试位置。测试位置表示回归证据入口，不表示其已经验证命令架构。所有领域初始 pending；子 Agent 与监控聚合明确标记为新能力。

| 旧 UI 入口（历史 `7ae9740`）                                                   | 目标 command/模块                                                  | 状态与目标                              | 迁移验收                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------- | -------------------------------------- |
| App/Sessions：选择工程/会话、新建、改名、归档、分支、历史导出                  | app.setWorkspace/setSession；workspace/session 领域                | Host 实体；runtime 当前 ID              | 重名、归档、分页、两个窗口、原目标回调 |
| Chat/ModelPicker/PermissionSelector：发送、模型、思考、权限                    | run.submit；session.setModel/setThinkingLevel；settings/permission | Host 规则；runtime 草稿                 | 提交捕获目标/版本；继续输入不丢失      |
| DecisionPanels：审批、问卷回答                                                 | approval.resolve；questionnaire.answer                             | Host approval/request ID                | 过期、重复、拒绝、断线核对             |
| BudgetPane/GoalPane/PlanPane/SessionTools：预算/目标/计划/模式编辑             | budget、goal、plan、settings                                       | Host 事实；runtime FormState            | 校验、冲突、保存失败、运行约束         |
| ComposerMenu：图片/文件附件、预算/目标/计划编辑器、扩展动作                    | attachment.*；app.openCommandForm；扩展 command                    | draft/artifact ID、sessionId            | 上传取消/限制、草稿保留、扩展停用      |
| Settings/AppearanceSettings/PathSettings：供应商/模型/凭据/插件/权限/路径/外观 | settings/provider/plugin/paths；preferences                        | Host settings vs device profile         | 来源、分层冲突、凭据排除、restart 状态 |
| Files/CodeEditor：文件树、读取、编辑、附件下载                                 | file.*；attachment.query                                           | workspace/path/artifact ID              | 路径权限、分页、保存冲突               |
| ActivityPanel/SessionCapabilityDialog：事件、运行取消、能力表单                | query/run.cancel；app.openSettingsEditor                           | session/run/operation ID                | 原对象反馈、隐藏时订阅释放             |
| BrowserPanel：导航、历史、快照、动作、关闭                                     | browser.*；app.openPanel/closePanel                                | Host context/page/session ID            | 原目标、权限、取消、生命周期           |
| TerminalPanel/CommandPalette：slash、补全、分类、开关                          | commands；terminal adapter；app.openPanel/closePanel               | runtime 与规范 command ID               | 不再保留 UI handler 闭包或第二套业务   |
| Pairing/设备/托盘：配对、撤销、窗口与退出                                      | connection/pairing/device；app.openWindow/closeWindow              | connection generation、device/window ID | 认证、撤销、定向、无 GUI 不可用        |
| App 布局、Modal：工具面板、侧栏、状态/设置、关闭图标、Escape                   | app surface commands；layout.commit/restore                        | runtime panel/window instance           | 显式开关、同实例幂等、恢复描述         |

上述旧 View 已移除，后续按历史功能补齐而不恢复可写 store。UI 内部 hover/选区/IME/拖拽过程/树展开/ComboBox 弹出为清单内豁免；持久布局、共享草稿和逻辑窗口/子页面不豁免。

权限沿现有认证、作用域检查与执行/审批链保持。每个领域迁移时必须细化能力字符串、目标权限、预期版本和取消/恢复行为，不能将历史“连接已认证”当作新命令按目标授权完成。删除条件统一为替代命令 + CLI + 投影 + 对应领域权限/恢复测试全部通过。

`scripts/architecture/workspace-boundaries.ts` 解析 TS 源码导入、导出、类型导入和动态导入，检查跨 workspace 私有入口、基础框架的反向依赖与包级循环。框架不允许计算出的动态 import 绕过规则。测试既扫描实际源码，也注入非法边验证门禁会拒绝；后续按真实包增加生命周期与只读快照行为测试。

初始验证：`bun run check` 通过 lint、typecheck、174 个测试。当前已有 153 项其他任务/用户工作树改动，包含组件预览、UI 组件、Cargo 配置、package script 及旧计划路径删除；未还原、stash 或夹带。根 package.json 的既有变化仅增加 integrations 验证脚本，本里程碑不修改它。

交付验证：`bun run check` 通过 lint、typecheck、178 个测试（50 个文件）；新增门禁/清单测试 4 项通过。30 个相对文档链接有效。此里程碑未改 UI 或桌面行为，不运行 build/E2E/desktop smoke。原始日志位于忽略目录 `artifacts/command-first-a0-check.log`。

实施顺序：A1 命令包 → A2 runtime/会话选择 → A3 预算 Host/CLI 闭环 → A4 参数表单；A5–A15 与 B1–B7 继续按 [P6](06-migration-validation.md) 执行。

## A1：独立命令包（完成）

新增 `@hbar/commands` 与 `/protocol` 公开出口；使用独立 counter 测试领域验证，框架不导入 hbar contracts、React、Zustand、Host、数据库或平台 API。根 workspace 只增加该包的依赖，保留已有 integrations script 改动。

已实现规范 camelCase ID、显式 alias、命名空间注册/注销、执行域检查、分类/分页目录与补全、可序列化并冻结的描述、typed client、结构化 invocation、输入/输出校验、稳定框架和领域错误。REPL/argv 区分解析，覆盖空串/Unicode/Windows 与 UNC 路径、重复/未知 flag、类型/范围和容量。

内存执行有明确并发/超时限制及 authorize 端口；取消/注销传递 AbortSignal，未真正结束的 handler 不释放并发占用。已进入写 handler 后中断返回 RESULT_UNKNOWN。输入受 UTF-8 JSON 字节限制，循环数据先拒绝。

持久/外部写与 required idempotency 在未安装 journal adapter 时明确不可用；A3 实现业务事务和回执后启用。长任务、动态可用性、跨域目录合并与旧 terminal/RPC 兼容仍按 A5/A6/A11 实施，A1 不代表 P1 全部完成。使用说明见 [commands README](../../packages/commands/README.md)。

交付验证：最终 `bun run check` 通过 lint、typecheck、189 个测试（51 个文件、1490 个断言）；命令包新增 11 个行为/依赖测试。公开包及 protocol 子入口导入 smoke、31 个文档相对链接、变更格式和暂存差异检查通过。日志为 `artifacts/command-first-a1-final-check.log`。未改 UI/桌面行为，不运行其 E2E/smoke。

## A2：只读运行时与真实 Host 目录查询（完成）

新增 `@hbar/app-runtime`，按目录查询投影、导航命令、私有 Zustand 与组合根拆模块。View handle 只读状态并执行命令；生命周期归组合根。已贯通 app.setWorkspace、app.setSession 及 workspace/session list/get，支持明确 ID、当前工程内名称、歧义候选、归档/缺失/跨工程错误、较新导航优先、失效选择清除与订阅释放。

Host 使用同源 command 定义注册目录查询服务，Controller 只做 RPC 适配；Storage Worker 直接进行稳定 ID 分页，最大 200 项，不依赖 bootstrap 的 2,000 条总列表限制。Client 的目录适配器仅允许四种读取，runtime 不依赖 Client 实现。实体 DTO 改由独立 Schema 推导，现有 contracts 根导出兼容。

测试覆盖同一真实 Host 上两个 runtime 的选择隔离、分页/过滤/归档刷新、查询 SQL 参数绑定；无 React 测试覆盖嵌套不可写快照、迟到与 dispose、错误观察者隔离、相同查询的独立消费者及 1,001 条记录下的 1,000 条缓存上限/选中项保留。包导入图包含 Zustand vanilla，不包含 React/Client/Host/存储实现。

运行时当前是有界目录查询投影；完整业务流、事件游标恢复、持续订阅与跨连接 generation 在 A11/P2.5 完成，CLI 命名上下文与正式 exec/REPL 在 A6 完成。使用说明见 [runtime README](../../packages/app-runtime/README.md)。

交付验证：最终 `bun run check` 通过 lint、typecheck、198 个测试（52 个文件、1544 个断言），补充的并发查询和基准脚本也通过定向 lint。新增代码/文档格式与差异检查通过；未修改 Web 呈现或原生桌面，不运行相关 E2E/desktop smoke。日志为 `artifacts/command-first-a2-final-check.log`。

可重复基准：`bun scripts/benchmark-app-runtime.ts` 创建临时 Host/数据目录，20 次预热后各采样 200 次，零模型请求。本机 Windows、Bun 1.4.0、Ryzen 7 7700X/16 逻辑处理器，已认证回环 WebSocket + Storage Worker：会话选择 p50/p95/max = 0.52/0.71/0.92 ms，分页查询 = 0.39/0.55/1.88 ms，均低于本切片 p95 100 ms 预算。报告为 `artifacts/app-runtime-benchmark.json`；这是本机两个 Session 的基线，不是所有网络/数据规模的延迟保证。

## A3–A15：命令、设置、Host 能力与无 GUI 封口（完成）

A3–A10 交付预算持久回执、Schema/Form、可恢复 Run operation、CLI/TUI/REPL、逻辑 surface、分层 settings、动态 callback 和 Host 原子设置服务。A11 按领域迁移 workspace/session、审批问卷、目标计划、模型配置、文件附件、子 Agent、browser/computer、系统/插件/设备/路径与 Git；A12–A14 完成 Usage、Performance 和 Git 来源/统计数据闭环。

A15 将无头 CLI 的最后一条 Run 写路径迁到 typed command，随后把全部 deprecated mutation RPC 收敛为 canonical command 的输入/输出 adapter，并增加消费者禁用旧写 RPC 的架构守卫。真实无 GUI 综合测试贯通 runtime 会话选择、模型/思考等级、预算、设置、文件、目标计划、审批工具、取消/重试、子 Agent、Usage、Performance、Git、系统/扩展与重连事实核对；无 GUI 的 surface 操作返回明确 capability unavailable。

第一阶段完成后，View 可见业务修改只经 command；状态同步保留 session/operation/metrics follow/watch 端口，组件内部 hover、IME、拖拽与普通展开保持 renderer 本地。完整 React Schema renderer、新工作台视觉组合和最终删除兼容 RPC 属于 B1–B7。

## B1：React 绑定与生产工作台外壳（完成）

新增独立 `@hbar/app-react`，提供 runtime provider、基于 `useSyncExternalStore` 的只读状态订阅和 `HbarWorkspaceShell`。该包只依赖 app-runtime、受控 hbar-app-ui 与 React，不包含 Client、Host、Storage、catalog 或 preview fixture；schema-core 将随 B3 的真实 renderer 接入。工作台的 Workspace → Session 树从真实目录 adapter 分页加载；展开属于局部 UI，选择会话及命令、状态、设置入口只执行应用命令。Host 状态只读，断线后由明确的重连操作重新连接。

Web 组合根现在拥有 Client、Host generation、runtime 生命周期、版本化布局和类型化中英文内容。它不读取或清除旧 workbench localStorage，损坏旧数据不影响安全默认布局。生产构建及 Playwright 覆盖无 Host 降级、Ctrl+K 命令入口、设置入口、中英文、桌面/窄屏、无横向溢出、刷新和遗留数据隔离；目录与两个 runtime 的状态隔离继续由 app-runtime/Host 集成测试覆盖。

交付验证：`bun run check` 通过 lint、typecheck、300 个测试（82 个文件、2375 个断言）；`bun run build` 完成 188 个模块的生产构建；`bunx playwright test e2e/web-shell.spec.ts --reporter=line` 的 4 个中英文桌面/窄屏场景通过。无 Host E2E 中 Vite 代理记录预期的 `ECONNREFUSED 127.0.0.1:4317`，应用稳定显示未连接并停止自动重试。

## B2：会话工作区（完成）

### B2a：只读 Session timeline 与可靠增量恢复（完成）

app-runtime 新增每实例独立的 timeline 投影。选中 Session 后先读取最多 60 条消息的 Host 快照，再从确切 cursor follow；只读状态包含有界 messages、runs、approvals、userInputs、legacy usage、live streams 和最近事件。事件按稳定 ID 合并，stream 按独立 text/thinking offset 与连续 version 应用；缺帧、Host resync、跨 Session 迟到结果或返回错误 Session 的快照会触发恢复或拒绝，不能静默拼接错误正文。切换 Session 和 dispose 释放原 follow，不停止 Host 上仍在运行的任务。

Client adapter 将现有 `session.snapshot/follow/unfollow` 和 reconnect 通知转换为 timeline port；Web 组合根只注入该 port，React View 仍不获得 Client。定向测试覆盖快照、增量正文、消息提交清理 stream、畸形事件、Session 切换、重同步、通知过滤和精确释放。草稿、发送/取消、审批和可靠 Usage 投影继续按 B2b–B2d 独立交付。

交付验证：`bun run check` 通过 lint、typecheck、302 个测试（83 个文件、2390 个断言）；定向的 timeline、app-runtime 与真实 Host 测试 15 项通过，workspace/Web 依赖边界 4 项通过。此切片只接数据投影，未新增可见会话页面，因此不重复运行 B1 的视觉 E2E。

### B2b：Session 草稿、发送与取消命令（完成）

contracts 新增内部客户端命令 `draft.setText`、`draft.setAttachments` 与 `draft.reconcileSubmission`，app-runtime 为最多 100 个 Session 保存互相隔离且只读的草稿投影。`run.submit` 仍是规范 Host 命令；runtime adapter 在调用前捕获原 Session、草稿 revision、附件与幂等键，提交期间允许继续输入。成功回执只清除完全未变化的已提交草稿，新输入保持；普通失败保留原文和附件，断线/超时进入 unknown 并只能以原键查询受理回执。`operation.cancel`、retry、operation query 和 compact 继续委托同一个 Run command port。

Client 将 `run.submit` / `run.retry` 的断线或超时统一映射为 `RESULT_UNKNOWN`，避免 UI 误报失败后用新键重复执行。定向测试覆盖在途编辑、unknown 后继续输入、回执核对、附件去重、失败保留、两个 runtime 隔离、取消委托、传输丢失和真实 Host 完整提交。B2c 继续接模型/交互/Usage ViewModel，B2d 再组合可见 AIChat、PromptInput 与 AIUsage。

交付验证：`bun run check` 通过 lint、typecheck、306 个测试（84 个文件、2407 个断言）；草稿/Run/真实 Host 定向测试 19 项及命令/依赖边界 16 项通过。Web 仅增加 Run port 注入，没有改变可见布局；生产构建通过，视觉 E2E 留到 B2d 可见会话工作区一起执行。

### B2c1：审批与问卷交互 ViewModel（完成）

app-runtime 将 `approval.resolve` 与 `questionnaire.answer` 纳入同一个 application command facade，并按原 approvalId/requestId 保存有界操作状态。提交成功、明确失败与传输未知分别呈现；未知审批在 timeline 出现终态、未知问卷从待答请求中移除后，自动收敛到成功。100 项容量只淘汰已结束反馈，全部仍在途时拒绝新操作，避免静默丢失原位结果。Client 对断线/超时返回 `RESULT_UNKNOWN`，Web 组合根只注入 typed interaction port。

定向测试覆盖未知审批的 timeline 收敛、问卷失败与重试、目标绑定、Client 超时映射，并复用真实 Host interaction 测试验证跨 Session、重复和相反决定规则。B2c2 接入模型、预算与可靠 Usage 投影。

交付验证：`bun run check` 通过 lint、typecheck、308 个测试（85 个文件、2415 个断言）；interaction/timeline/真实 Host 定向测试 5 项及依赖边界 4 项通过，193 模块 Web 生产构建通过。可见交互卡片与浏览器 E2E 随 B2d 一起交付。

### B2c2：模型、预算与可靠 Usage 投影（完成）

app-runtime 新增当前 Session controls 投影，并行读取 `session.getModel`、`usage.query` 与 `session.getBudget`。状态保留模型能力、思考等级、来源 revision、预算余额，以及 A12 的 token、价格、缓存、速率、延时、模型分布、时间序列、gap 与 availability；任一来源失败只形成 partial 状态，不把 null/unavailable 画成零。选择切换使用 generation 拒绝迟到结果，timeline 重同步和 usage/run/budget 事实触发有界刷新，stream delta 不会产生遥测查询风暴。

`session.setModel` 与 `session.setThinkingLevel` 仍经 Host command，runtime 为 UI 调用生成单次幂等键并在成功后刷新权威配置。Client 将模型写入的断线/超时映射为 `RESULT_UNKNOWN`；runtime 立即尝试查询核对，同时保留未知错误供断线界面显示。定向测试覆盖旧 Session 迟到、模型/Usage/预算组合、事实触发刷新、写入幂等键和未知传输映射。B2d 只需把这些只读 ViewModel 映射到受控组件。

交付验证：`bun run check` 通过 lint、typecheck、310 个测试（86 个文件、2419 个断言）；模型/Usage/预算定向与现有领域测试 10 项、依赖边界 4 项通过，194 模块 Web 生产构建通过。B2d 将执行会话页面的浏览器交互与截图验收。

### B2d1：问卷草稿与取消反馈（完成）

为保证可见组件仍然只有命令写入口，新增内部客户端命令 `questionnaire.setAnswer` 与 `questionnaire.resetAnswers`。app-runtime 验证原 Session、requestId、questionId 与可选 revision，按最多 40 个请求保存只读答案；timeline 的 resolved 事实自动释放对应草稿。`operation.cancel` 现在另有按 operationId 的 submitting/unknown/failed/succeeded 投影，同一目标的在途或未知取消不能被重复触发，容量满时也不会淘汰未核对动作。

定向测试覆盖问卷答案命令、resolved 清理、取消反馈及既有草稿/窗口隔离。B2d2 将这些状态映射到 hbar-app-ui 的受控会话组件，不再需要 React useState 保存业务表单或取消状态。

交付验证：`bun run check` 通过 lint、typecheck、310 个测试（86 个文件、2422 个断言）；交互/草稿/runtime 定向测试 14 项及命令/依赖边界 14 项通过。该切片无可见布局变化，浏览器验收随 B2d2 执行。

### B2d2：受控会话工作区与真实浏览器闭环（完成）

`@hbar/app-react` 新增 `HbarSessionWorkspace`，将选中 Session 的消息、流式正文、thinking、工具调用与结果、附件、Run 活动、审批、问卷、PromptInput 和紧凑 AIUsage 组合进生产工作台。Markdown 使用 GFM 并在渲染前按安全策略清洗；全部可见文案、格式化器和状态说明由 Web 宿主的类型化中英文 bundle 提供。会话组件只依赖 app-runtime 的只读状态与 command facade，不导入 Client、Host、Storage 或领域写入服务。

草稿、附件删除、发送、取消、审批决定及问卷填写/提交均执行规范 command；问卷提交前要求每个请求项都有非空答案。发送沿用捕获原 Session/revision 的 B2b 语义，取消与交互结果在原操作位置显示。AIUsage 只消费 A12 的可靠 Host 报表及预算，不按正文估算；token、费用和速率不可用时保持明确 unavailable。页面使用正常 flex 流和 pane-owned scroll，在桌面与窄屏不依赖截图坐标或固定正文高度。

交付验证：`bun run check` 通过 lint、typecheck、311 个测试（87 个文件、2433 个断言）；`bun run build` 完成 2335 个模块的生产构建；`bunx playwright test e2e/web-shell.spec.ts --reporter=line` 的 5 个场景通过。四个无 Host 场景覆盖中英文、桌面/窄屏、键盘和断线降级；真实临时 Host 场景完成 Session 选择、发送、可靠 Usage、审批、取消和溢出检查。人工检查 `artifacts/web-b2/session-workspace.png` 确认正常内容流、独立滚动和无横向溢出。

## B3：Schema renderer 与分层设置工作台（完成）

### B3a：独立 React Schema registry 与标量 renderer（完成）

新增独立 `@hbar/schema-react`。ComponentRegistry 一次注册版本、字段类型、multiple、动态内容 kind、交互模式和 React renderer，同时向 schema-core 暴露兼容性注册表；卸载或整体 dispose 会同步撤销两边能力。EditorRegistry 以相同的版本和生命周期规则承载 `ProviderDialog` 一类 dialog/panel 子编辑器，但不拥有打开、保存或传输行为。

`HbarSchemaForm` 只消费编译后的 Schema、不可变 FormState、动态内容报告、宿主 labels 和 `onIntent`。标准 TextField、NumberField、CheckBox、ComboBox 保留数字输入中间态，并明确显示 loading、ready-empty、unavailable、error 和 selected-invalid；组件缺失时显示宿主诊断，不静默遗漏字段。所有可见文案与动态 i18n/literal 转换由宿主传入，新包不依赖 app-runtime、Client、Host、Storage、Zustand 或 hbar 领域定义。当前 schema-core 仍只编译标量字段，因此 multiple 注册会明确拒绝；List/keyed item 与 ProviderDialog 数据契约在后续 B3 切片扩展。

交付验证：`bun run check` 通过 lint、typecheck、314 个测试（88 个文件、2450 个断言）；新增 registry、标量渲染、动态选择状态和 Editor 生命周期 3 项测试，workspace 依赖门禁同步覆盖新包。

### B3b：版本化设置描述与真实动态 callback（完成）

Host 新增只读 `settings.describe` command，发布 `hbar.settings@1` 的分组、稳定 SchemaPath、标量类型、nullable/default、数值范围、允许层级、applyMode、i18n key、component 和动态内容元数据。SettingsService 由这份描述生成 settings-core definitions，避免 UI 描述与 Host 校验分别维护。描述在注册时拒绝类型不匹配的默认值/选项、重复层级或路径、未知分组/依赖及动态依赖环，并以深冻结对象公开。

Kernel 正式注册 `settings.getModels` 与 `settings.getThinkingLevels`。模型候选来自真实 provider/model 目录，按 stable ID 排序，支持搜索与 200 项游标分页；思考等级只按当前模型能力返回。两者都带依赖 fingerprint 和基于实际能力的 revision，缺失或失效模型分别报告 unavailable，不生成伪选项。schema-react ComboBox 在 ready 时采用动态报告覆盖静态允许域，因此模型能力缩小时能显示 selected-invalid，而不会自动替换用户值。

交付验证：`bun run check` 通过 lint、typecheck、315 个测试（88 个文件、2457 个断言）。真实认证 Host 测试通过 `settings.describe` 编译内容图，经 schema callback 网络 bridge 查询 fixture 模型与思考等级；既有 callback 取消测试改用独立测试 ID，验证内置注册和插件生命周期不会互相覆盖。

### B3c1：分层设置 FormState 与命令保存（完成）

app-runtime 新增设置工作区只读投影。`app.openSettings` 的逻辑 panel 决定 global/workspace/session 和确切 target；runtime 自动加载 `settings.describe`、目标快照与父级快照，再编译 scope 相关的标量 Schema。每个 scope/target 保存独立草稿，切换后不会互相覆盖；最多保留 32 个表单，只淘汰无编辑、无未知提交的非活动项，容量内全部受稳定 formId 约束。

字段编辑、重置、恢复继承、刷新、提交和核对分别使用 internal `settingsForm.*` application commands。恢复继承生成 `unset` 并预览父级 effective/default；不允许覆盖的 scope 编译为只读字段。提交只包含 dirty/unset 路径，捕获原 scope、版本向量、revision 与幂等键；提交期间的新编辑继续保留。断线未知只能用原 input/key 核对，成功回执仅确认原提交。Client 将 settings 持久命令的断线/超时统一映射为 `RESULT_UNKNOWN`。

交付验证：`bun run check` 通过 lint、typecheck、318 个测试（89 个文件、2471 个断言）；分层 runtime 定向测试覆盖三层草稿、在途编辑、显式继承、scope 只读、未知核对及 Client 丢失响应映射。`bun run build` 完成 2337 个模块的生产构建。该切片只注入 settings/schema content ports，没有新增可见页面。

### B3c2：动态内容只读投影（完成）

app-runtime 现在从 Host 设置描述编译 callback DAG，并通过注入的 `SchemaCallbackPort` 建立有界 resolver。每个动态字段在 `view.state.settings.forms[formId].content` 中公开 idle/loading/ready/unavailable/error；初次加载查询全部动态字段，后续只刷新依赖于本次变更路径的节点。依赖原始输入无效时不会继续使用旧已解析值，缺少 callback capability 显式报告 unavailable。

每次请求绑定 Host、runtime identity、scope、formId、form revision、Schema version 和依赖 fingerprint。依赖改变时 resolver 取消旧 generation；即使旧 callback 忽略取消并迟到返回，runtime 也核对最新 revision，不允许覆盖当前内容。提交回执重新基线化后会刷新动态能力，dispose 取消并释放全部查询与缓存。

交付验证：`bun run check` 通过 lint、typecheck、319 个测试（89 个文件、2472 个断言）；动态设置定向测试覆盖初始模型 options、缺模型 unavailable、依赖切换、忽略取消的迟到旧结果，以及最终内容仍对应最新模型。该切片只新增运行时只读投影，没有新增可见页面。

### B3d：可见标量设置工作台（完成）

app-runtime 为每个 scope/target 表单增加命令拥有的当前分组；`settingsForm.selectGroup` 只接受 Host 描述中的稳定 group ID，切换 global/workspace/session 后分别保留草稿与分组。`@hbar/schema-react` 支持按有序字段集合投影一个分组，并为宿主提供只读来源和操作插槽；renderer 仍不取得 runtime、Host 或可写 store。

`@hbar/app-react` 新增 `HbarSettingsWorkspace`，在正常 flex/grid 流中组合 scope 切换、可滚动分组栏、Schema 表单、动态模型/思考等级、来源与 applyMode、只读层级、恢复继承、刷新、保存和 unknown 核对。字段、分组和约束全部来自 Host 描述；中英文文案、选项格式和错误说明由 Web 组合根提供。scope、group、field、inheritance、submit/reconcile 全部执行 application command，React 只订阅读取状态。

交付验证：`bun run check` 通过 lint、typecheck、322 个测试（90 个文件、2491 个断言）；生产构建包含 2344 个模块。Playwright 的 5 个场景通过，四个断线场景验证中英文桌面/窄屏的单一失败状态，真实临时 Host 场景加载 Session 设置动态内容、恢复继承并成功保存；截图保存到 `artifacts/web-b3/settings-workspace.png`。

### B3e：稳定 List 与 ProviderDialog（完成）

schema-core 新增独立 keyed List 描述与不可变状态转换，按稳定条目 ID 处理容量、增改、删除、重排和重置；schema-react 的 `HbarSchemaList` 只发出窄 intent，Provider、命令和保存知识不进入框架包。标量 renderer 新增受 host revision 控制清空的 SecretField；密钥正文只存在 DOM 临时值和 app-runtime 私有缓冲，任何公开状态、Provider query 或测试快照都不包含明文。

Host 新增 `provider.describe` 与 `provider.list`，前者发布版本化字段/component 描述，后者返回完整非敏感配置和 `hasKey`。app-runtime 以 `app.openSettingsEditor` 的确切 entry/instance 建立 ProviderDialog FormState；列表刷新、字段、保存、删除和 unknown 核对均经 command。Web 设置页由 Host 的 providers group 组合稳定 List 和定制 Dialog，返回后用 section command 恢复原分组；中英文长文案与协议选项均由宿主 bundle 提供。

交付验证：`bun run check` 通过 lint、typecheck、326 个测试（93 个文件、2530 个断言）；生产构建包含 2350 个模块。Playwright 5 个场景通过，真实临时 Host 场景从全局设置进入 Providers、新建含凭据的供应商、确认保存事实并返回列表；截图保存到 `artifacts/web-b3/provider-dialog.png`。

## B4：分类命令目录与通用参数表单（完成）

`@hbar/commands` 新增 UI/TUI-neutral descriptor 参数编译器。它从同一 input JSON Schema 与 CLI argument metadata 产生有序字段、类型、必填、默认值、枚举、数值/长度约束和 `writeOnly` 敏感标记；不可变草稿将 string/number/integer/boolean/JSON 恢复为结构化 input，并在 Host 最终校验前给出稳定 field issue。框架仍不依赖 hbar 领域、React、Zustand、传输或平台；敏感字段禁止发布默认值。

app-runtime 新增只读 command palette 投影，将 Host 分页目录与本地 client/platform descriptor 合并到最多 1,000 项，拒绝冲突、畸形页、循环 cursor、过期 refresh 和不可用执行域。搜索、选择、键盘移动、参数设置/清除/重置及执行全部通过 internal `commandPalette.*` command；当前 workspace/session 以可见参数预填。持久命令自动生成 request/idempotency key；结果文本有界，unknown 与 failure 分开。敏感参数只保存在私有草稿，公开 Zustand 仅报告已填写字段，成功后清空敏感值并保留本次普通参数。`@hbar/client` 的通用 catalog adapter 只执行 Host descriptor，并核对执行域、版本和必需幂等键。

`@hbar/app-react` 复用 `hbar-app-ui` 的受控、可虚拟化命令列表，按正常 grid/flex 流组合分类搜索和 descriptor 参数区；React 只保存搜索焦点与密码 DOM 值。Web 组合根注入 catalog transport 和类型化中英文命令/分类/字段文案。Ctrl/Cmd+K、刷新、选择、参数、执行、Escape/关闭都映射到应用 command；断线时仍可浏览本地命令，Host 命令明确不可用。

交付验证：`bun run check` 通过 lint、typecheck、332 个测试（96 个文件、2596 个断言）；生产构建包含 2356 个模块。Playwright 5 个场景通过，覆盖中英文桌面/390px、离线本地目录、关闭后继续导航，以及真实临时 Host 上搜索 `session.setBudget`、预填 Session ID、填写 120000 Token、持久执行并显示回执。人工检查 `artifacts/web-b4/command-palette.png` 后修正成功回执旁参数被异步目录活动重置的问题；最终截图保留确切提交参数且无必填伪错误。
