# Desktop 操作体验迁移记录

本轮迁移以 cc-haha 清楚的目标归属、稳定的入口位置、局部反馈和渐进披露为目标。参考仓库 `D:/Git/cc-haha` 保持只读，审查基线为 `e28d0a65`；参考包括仓库真实界面截图、用户提供的 Goal/Plan 图，以及直接渲染原组件的隔离证据。隔离组件预览不代表真实后端执行。

较早的底座修复、原生增量打包背景与被替代的首轮方案保留在 [首轮历史记录](desktop-experience-initial-pass.md)。当前入口以本文所列独立交付及审计为准，不用历史“模型跳设置”等旧方案冒充已经符合参考。

## 从参考提炼出的规则

- 会话正文是阅读主线，工具、参数与运行过程不应占同等视觉重量。
- 输入区左侧组织材料与本次执行意图，右侧组织用量、模型、思考和提交动作；选择过程保留原草稿与阅读位置。
- 项目动作属于项目行，会话动作属于会话行，工具审批属于发起调用；操作携带原目标，不在异步结束后重新猜当前选择。
- 详情按需展开。错误、等待用户决定和风险确认必须就近可见，不能为了简洁藏掉。
- 菜单选项要说明实际含义。hbar 不支持的权限、终端、市场或搜索能力，不用无行为按钮或相似名称冒充。
- 视觉采用语义图标等级和正常 flex 文档流；中英文、长内容、桌面和窄窗口使用同一份交互所有权。

## 已验证并独立提交

| 单元                  | 交付行为                                                                                                     | 本地提交                                                         | 依据与验收                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| 模型与思考            | composer 局部搜索、提供商分组、能力限定档位与键盘调节                                                        | `62ea90d`                                                        | [模型记录](desktop-model-interaction-reference.md)    |
| 深目录模型可见性      | 重新打开模型目录时，把已选且符合当前筛选的深页模型置于有界列表首位；展开后不重复、不伪造失效项               | `1db64dd`                                                        | [模型记录](desktop-model-interaction-reference.md)    |
| 思考强度确认边界      | 拖动/连续按键即时本地预览，松开/Enter/失焦单次确认，取消不写入；旧配置与未知结果不越界                       | `67d9917`                                                        | [模型记录](desktop-model-interaction-reference.md)    |
| Goal / Plan 意图      | 本轮意图切换、Goal 条、暂停/恢复/清除、目标编辑与预算披露                                                    | `9f3ee84`                                                        | [意图记录](desktop-composer-intent-reference.md)      |
| Plan 一次性范围       | 选中态直接写明“下条仅规划 / Next: plan only”，取消与发送后恢复短入口，不冒充持久权限预设                     | `2789e51`                                                        | [意图记录](desktop-composer-intent-reference.md)      |
| Goal 窄屏状态条       | 状态与目标优先，计时/预算/动作在窄窗口流式换行，保留原目标操作与就近反馈                                     | `495b678`                                                        | [意图记录](desktop-composer-intent-reference.md)      |
| 项目新建              | 目标明确时直接创建，未选择项目时使用专用选择器                                                               | `4298a8f`                                                        | [导航审计](desktop-navigation-interaction-audit.md)   |
| 新会话快捷键          | `Ctrl/Cmd+N` 与侧栏新建共用原项目选择与可靠创建路径；活动弹窗/输入法/重复键不触发新建                        | `2d1a34f`                                                        | [导航审计](desktop-navigation-interaction-audit.md)   |
| 对话阅读              | 助手正文优先、工具调用与结果对应、过程披露及确认后的复制反馈                                                 | `c49412b`                                                        | [消息记录](desktop-session-message-integration.md)    |
| 文件草稿              | 跨导航保存、共享文件事实、冲突/丢回执后保留原稿与核对                                                        | `05d8030`                                                        | [导航审计](desktop-navigation-interaction-audit.md)   |
| 用量入口              | 模型旁的小入口、真实预算含义与未知状态、告警仍可见                                                           | `2af5d12`                                                        | [用量记录](desktop-usage-interaction-reference.md)    |
| Plan 提案             | 原消息旁执行或反馈继续讨论，绑定原提案版本，不消费普通草稿                                                   | `e3b27a1`                                                        | [提案记录](desktop-proposed-plan-integration.md)      |
| 行内重命名            | Enter 保存、Escape 取消、标题原子比较、冲突与未知恢复                                                        | `11d93f5`                                                        | [导航审计](desktop-navigation-interaction-audit.md)   |
| 本次权限              | 输入区四种真实策略、自动批准确认、捕获到原 Run、失联核对                                                     | `8329581`                                                        | [权限记录](desktop-composer-permission-reference.md)  |
| 会话工具栏            | 五个直接可达的具名图标入口，标题缩短，保留键盘与选中状态                                                     | `a65825e`                                                        | [标题栏记录](desktop-session-header-reference.md)     |
| 运行摘要              | 当前状态与恢复动作可见、20 条按需历史、停止优先真实执行任务                                                  | `002671c`                                                        | [运行记录](desktop-run-activity-reference.md)         |
| 归档恢复              | 原行确认、项目归档分页、恢复不导航、未知只读核对                                                             | `e855123`                                                        | [归档记录](desktop-session-archive.md)                |
| 原生入口回归          | 隔离 WebView、首次选项目、直接新建、重命名、模型/意图及原生附件                                              | `a39ca7c`                                                        | [验证说明](testing.md)                                |
| 工具旁审批/问答       | 唯一调用关联、实际参数/片段、明确决定、持久回答与断线事件核对                                                | `092e408`                                                        | [决定与恢复记录](desktop-session-decisions.md)        |
| Provider 渐进编辑     | 基础/高级分层、草稿取消、原入口焦点、未知保存和凭据边界                                                      | `c332ffe`                                                        | [Provider 记录](desktop-provider-progressive-edit.md) |
| 排队与停止            | 空草稿保留停止，有稿明确加入队列；Enter 不误停，停止绑定真实执行 Run                                         | `c240ec0`                                                        | [运行输入动作](desktop-composer-running-actions.md)   |
| 输入材料              | 选择/拖放/文件粘贴、12 项批量预约、原会话所属与未知只读核对                                                  | `84f91b7`                                                        | [附件记录](desktop-composer-attachments.md)           |
| 路径错误恢复          | 无效目录在写入前明确失败，保留错误码并允许修正；未知写入不洗成失败                                           | `b3fbd45`                                                        | [项目入口验证](desktop-project-shortcut.md)           |
| 项目快捷新建          | 项目行直接入口、菜单去重、键盘顺序与窄屏点击区、原草稿保留                                                   | `1d3801a`                                                        | [项目快捷记录](desktop-project-shortcut.md)           |
| 项目置顶              | 侧栏原行置顶/取消，按稳定工程 ID 保存、首屏外有界恢复；未知写入就近核对，不阻塞会话启动                      | `84d8102`                                                        | [导航审计](desktop-navigation-interaction-audit.md)   |
| 会话工程/分支上下文   | 输入区旁投影实际会话工程与只读 Git 分支；切换、断线和晚响应清旧值，窄屏正常流布局                            | `6fbfcee`                                                        | [上下文记录](desktop-session-project-context.md)      |
| 插件详情              | Extensions 列表就近展开真实 Host 插件详情、键盘返回与缺省反馈                                                | `73295a9`                                                        | [设置审计](desktop-settings-interaction-audit.md)     |
| Changed / diff        | Files 中查看真实工作区/暂存差异、只读比较与明确编辑入口                                                      | `cc87a9e`                                                        | [文件审计](desktop-navigation-interaction-audit.md)   |
| All 文件树            | 按需展开目录、已加载路径筛选、分页上限与失败重试                                                             | `f02f61b`                                                        | [文件审计](desktop-navigation-interaction-audit.md)   |
| 会话页签              | 32 项上限、关闭活动核对、右键批关、独立草稿与刷新恢复                                                        | `96e782f`                                                        | [页签集成](desktop-tabs-host-integration.md)          |
| Files 工作台页签      | 原面板展开为临时中央页签、Back 返回来源、X 选邻居、保留文件草稿                                              | `c6c2e78`                                                        | [页签集成](desktop-tabs-host-integration.md)          |
| 子 Agent 返回来源     | 从详情打开真实子会话页签，保留父会话及来源关系；断线就近重试，Back 仅在原父页签有效时显示                    | `3947a8a`、`34f8cfa`、`04b0d02`、`9a2b23a`                       | [剩余入口审计](desktop-workbench-remaining-audit.md)  |
| 只读系统诊断          | 设置中的真实 Host/runtime/storage 概况、刷新与失败时保留旧数据，未提供清理或修复假按钮                       | `bcfaf1f`                                                        | [设置审计](desktop-settings-interaction-audit.md)     |
| 工作区路径与 `@` 提及 | Host/CLI 有界路径发现；composer 从真实文件结果选取路径，保留草稿中的结构化引用，键盘浏览及失联反馈就近可见   | `9f25f77`、`45e082e`、`5a3cd62`、`ab5ddcf`、`8ca1592`、`3d9f19a` | [提及记录](desktop-composer-mentions.md)              |
| 消息旁 Fork           | 幂等 Host 命令从已完成用户消息或最终助手回复复制精确历史；原消息旁资格查询、创建、丢回执核对及子会话页签入口 | `3e5e16b`、`7d79aa3`、`9829e57`、`2726679`、`ad9dadb`、`ff5607c` | [Fork 记录](desktop-message-fork-integration.md)      |
| Composer `/` 本地入口 | 输入框上方搜索与键盘补全；只有完整 `/model`、`/settings` 且无附件时才打开真实本地目标，失败保留草稿          | `e153489`                                                        | [斜杠边界](desktop-slash-command-boundary.md)         |
| Files 加入原会话      | 当前文本文件或真实 Git diff 在原文件操作处加入结构化 `@` 路径；保持 Files 打开、保留原草稿与其他会话内容     | `37ce66e`、`6828374`                                             | [文件引用记录](desktop-files-add-to-chat.md)          |

表中提交为本地交付，不代表已经推送、发布或安装到用户正在运行的窗口。各单元的精确测试数量、截图位置与边界以对应记录为准。

## 尚需继续核对的体验差异

完整逐入口审计见 [会话](desktop-conversation-interaction-audit.md)、[导航与文件](desktop-navigation-interaction-audit.md)、[设置](desktop-settings-interaction-audit.md)。它们保留起始基线与交付复核的区别。
Terminal、Browser、子 Agent 与 Team 的证据等级及公开能力边界另见 [剩余工作台入口审计](desktop-workbench-remaining-audit.md)。子 Agent 来源返回已完成，但它使用真实子 Session，不是参考产品中依据 tool-use ID 的独立 run 投影；不能把设计稿的 Team 图或 Terminal 架构图当现行软件画面。

Browser 的同窗 child ACL 测试已通过，但隔离 WebView2 的资源红测发现 WebSocket 仍能触达模拟 Host；当前不能把资源回调当任意不可信网页的网络沙盒。[浏览器安全边界](desktop-browser-preview-boundary.md) 区分已验证的权限前提、失败证据及尚待产品选择的有限本地预览范围。没有 Browser 产品 UI 可交付。

Files 的 All/Changed/diff、会话/文件工作台页签、子 Agent 来源返回、`@` 路径提及、从 Files 加入原会话、消息旁 Fork 和有限的 `/` 本地入口已形成上述闭环；这不等于参考的 Browser、Terminal、Team、任意文件全文搜索或 `@` 行范围引用也已具备。`@` 当前引用的是工作区路径，不自动读取文件正文；Fork 只作用于已完成且已加载的用户消息或最终助手回复，不承诺任意中间消息。`/` 菜单只展示 `/model`、`/settings`；未列出的 `/compact`、技能/MCP 等并非 hbar 的本地命令。诊断只读入口已落地。材料预览、技能详情和存储入口仍需逐一核对真实公开契约；不以模型工具或命令目录里存在某个名称代替完整应用能力。[浏览器安全边界](desktop-browser-preview-boundary.md) 和 [斜杠行为矩阵](desktop-slash-command-boundary.md) 区分已知参考、可迁移范围与未实现能力。

原先全仓 `check` 的九项失败已修复：`7379632` 明确区分 composer 与面板的 Goal 消费者并补监听释放，`357c9a7` 补齐漏登命令。当时稳定产品代码的 `bun run check` 已全部通过：严格 lint、TypeScript、**1,304 tests / 10,025 assertions**，269 个测试文件，测试阶段 242.81s；这是较早基线而非本次新增 Files/页签后的全仓结果。完整输出在忽略目录 `artifacts/reference-ux-v2/integrated-check-final.log`。

本轮 Files/页签功能后的全仓 `bun run check` 初跑发现两条旧命令目录断言漏了 `73237c0` 新增的 `session.activeOperations`；`68bbbe8` 按实际命令目录修正。复跑通过原生工作区查询模块构建、严格 ESLint、根 TypeScript 与 **1,402 tests / 10,583 assertions**（280 个测试文件，测试阶段 217.10s）。这不替代运行中 Stop→终态的专门 Host 故障注入验证。

Agent 来源返回提交后的本轮 `bun run check` 已通过原生查询构建、严格 ESLint 与根 TypeScript，测试为 **1,419 通过、1 失败 / 10,678 断言**（282 个测试文件）。唯一失败属于并行、尚未提交的 `tests/hbar-app-ui-app-shell-chat.test.ts`：它期望旧的 `placeholder="Message Halden"`，当前共享组件渲染结果不同；单独运行该文件复现为 5 通过、1 失败。该测试与组件均不属于本轮 Agent 提交，因此不能声称全仓测试通过，也没有修改那组文件。Agent 自身的 16 项定向测试、103 个断言以及生产 Web + 真实 Host 的中英文打开/返回、断线重试 3 项 E2E 均通过。

最新 Windows x64 debug 构建通过（本轮 Rust 编译 6.36s），隔离 WebView 的原生 smoke 再次通过，包含真实文件选择上传、默认/最小窗口的会话及文件工具、900px 下侧栏与主区尺寸、隐藏与 Host 生命周期，以及独立 SDK 运行取消。忽略目录中的本轮 smoke 扩展还实际点击了 Files→中央工作台→返回对话，核对原生页签选中与无整页横向溢出；截图 `artifacts/ui-redesign/tauri/workbench-default-window.png` 已人工查看。此前另有首次项目选择、新建/重命名/模型与意图入口的原生 smoke。未覆盖/重启用户正在运行的桌面进程；原生 smoke 未测工作台草稿与批关，这些由真实 Host 生产浏览器 E2E 核验。共享 hbar-ui 的普通 API 生成命令仍受 pnpm 版本不匹配阻止，Send/Stop 所在源文件还有八项与修改前完全一致的共享 lint 历史违规；不能把根仓库门禁通过外推为这些共享检查已通过。

Agent UI 提交后的 Windows x64 debug 桌面再次构建成功，隔离 WebView smoke 通过原生文件选择、会话/文件面板尺寸、隐藏及 Host 生命周期；该原生 smoke 未专门创建子 Agent，子会话来源路径由上述真实 Host 浏览器 E2E 验证。没有重启或覆盖用户正在运行的桌面窗口。

`@` 和消息旁 Fork 接入后，首次全仓检查的原生构建、严格 ESLint 和 TypeScript 均通过，但 app-react 的两个模块边界测试发现 `@` UI 直接依赖了 contracts 子路径（当次 1,474 通过、2 失败）；`3d9f19a` 将解析与类型移到 app-runtime 公开入口，未放宽边界测试。复跑 `bun run check` 全通过：原生查询构建、严格 ESLint、TypeScript、**1,477 tests / 11,102 assertions**（294 个测试文件，测试阶段 199.86s）。Fork 的真实 Host 中英文交互 3 项及 `@` 的 2 项真实 Host 提及流程另行通过；各自的具体边界见上方记录。Windows x64 release 桌面应用和 NSIS 安装包也已构建成功，随后使用隔离数据目录的原生 WebView smoke 验证连接、文件选择上传、默认/最小窗口布局、侧栏、窗口隐藏与 Host 生命周期、独立取消；没有安装包或重启用户当前窗口。这轮原生 smoke 没有专门操作 `@` 或 Fork，不能拿它替代两者的 Host 浏览器用例。

`e153489` 的 `/` 入口通过 30 项聚焦 Bun 测试/180 次断言、严格定向 lint、TypeScript、内容/图标/流式布局 guard、隔离生产构建及中英真实 Host 新旧 composer 回归 6/6；覆盖菜单补全与执行分离、原会话设置/模型入口、附件保留、IME、未知命令普通提交、`@` 和模型选择器回归。`5c0e58e` 将桌面权限从整个 `main` 窗口收窄至 `main` WebView，定向测试 2/2、Windows MSVC Rust 构建及隔离原生 smoke 中的主视图连接/窗口命令/认证 Host 查询通过。另在受 Git 忽略的同窗 main/child 原生 fixture 中核验 child 对测试连接命令和 core 窗口命令均获 Tauri ACL 明确拒绝；这只证明权限匹配前提，未创建产品 Browser child，也未验证远程不可信页面的实际 profile、凭据或网络隔离。两项提交后的全仓 `bun run check` 已通过原生查询构建、严格 ESLint、TypeScript 和 **1,494 tests / 11,210 assertions**（299 个测试文件，测试阶段 213.15s）。

Files 加入原会话提交 `37ce66e` 的真实 Host 中英文 2 项与既有 `@`/Files 工作台回归 2 项通过，包含 1440/320 布局、原草稿与其他会话隔离、普通文件/Git diff 结构化路径及最终 Host Run。首次全仓检查只有命令清单缺少新 client command 一项失败（1,505 通过、1 失败），`6828374` 只补 inventory 登记，不弱化断言。复跑 `bun run check` 全通过：原生查询构建、严格 ESLint、TypeScript、**1,506 tests / 11,266 assertions**（301 个测试文件，测试阶段 212.05s）。Windows x64 release 应用与 NSIS 安装包重新构建成功；隔离原生 WebView smoke 通过连接、附件选择、窗口布局、Files 面板及 Host 生命周期，但没有专门点击新文件引用按钮，该行为以上述真实 Host E2E 为证。

后续三个会话入口提交 `2d1a34f`、`2789e51`、`495b678` 均独立验收。快捷键真实 Host 中英文 2 项通过，覆盖无项目选择、原草稿保留、窄屏与 `Ctrl`/`Meta`；Plan/Goal 真实 Host 中英文 2 项通过，覆盖 Plan 实际 Run mode、选中/复位、Goal 暂停/恢复/清除及 1440/390/320 布局。最新 `bun run check` 通过原生查询构建、严格 ESLint、TypeScript 与 **1,517 tests / 11,329 assertions**（302 个测试文件）。Windows x64 release 应用与 NSIS 包构建成功；隔离原生 WebView2 验证了 `Ctrl+N`、Plan 一次性可见文案和 Goal 意图切换。该原生 demo 未配置可发送模型，不能把活动 Goal 条的真实运行验收归于此；活动条由临时真实 Host 浏览器测试覆盖。当前并行修改中的通用 desktop smoke 在与这些入口无关的外观选中标记断言处失败，未宣称全套原生 smoke 通过。

`1db64dd` 修复了初始模型目录 `62ea90d` 先截取前 60 项、再判断当前选中项所致的深页模型不可见问题。先用回归测试复现第 65 项选中后重开缺失，再使符合当前筛选的选中项在同样 60 项边界内首位出现；展开后无重复，失效 ID 不被伪造。真实 Host 中英文 2 项 E2E 覆盖搜索选中、重开、320px 与草稿保留；隔离原生 WebView2 也验证深页已选项首位及原入口回归。该提交的首次全仓测试遇到并行未提交的 app-ui dialog fixture 失败；相关任务修正后重跑 `bun run check` 全通过：原生查询构建、严格 ESLint、TypeScript 与 **1,519 tests / 11,344 assertions**（302 个测试文件）。Windows x64 release 应用和 NSIS 包再次构建成功；通用 desktop smoke 仍有与此功能无关的外观标记断言失败，不以定向原生通过冒充其通过。

后续 `67d9917`、`84d8102`、`6fbfcee` 各按功能独立提交并保留真实参考/Host 边界：思考强度的中英文真实 Host E2E 2/2 与 22 项聚焦测试通过；工程置顶中英文真实 Host E2E 2/2、7 项运行时和 12 项 React 测试通过；工程/分支上下文中英文真实 Git A/B Host E2E 2/2 与 12 项聚焦测试通过，并留有 1440/900/390/320 截图。三项合并后的 `bun run check` 全通过：原生查询构建、严格 ESLint、TypeScript 与 **1,538 tests / 11,450 assertions**（305 个测试文件，0 失败）。这些验证不宣称参考视觉完全一致：思考滑轨仍缺参考的离散刻度/填充，工程/分支控件在 hbar 宽屏也位于 composer 下方，非 cc-haha 工具行内。

本次统一 Windows release/NSIS 构建已尝试，MSVC x64 环境可用，但 Web 构建阶段被并行未提交的 `hbar-ui/packages/lumen-app-ui/src/app-dialog.tsx` 对尚不存在的 `app-dialog-wizard.css` 导入阻断，未进入 Rust/打包；因此本组三项**尚无新增原生 WebView2 验收**。该共享 UI 改动及缺失样式文件不属于本单元，未覆盖、删除或代写。待其工作区一致后需重跑构建及隔离原生操作回归。

此前使用同一生产构建组合运行 15 个相关 E2E 文件：**29 passed / 2.3m**，覆盖中英文模型/思考、Goal/Plan、权限、审批/问答、计划提案、附件、排队/停止、Provider、消息/复制、重命名、归档分页、运行历史、工具栏与用量。另有项目入口三项和完整 connected 工作台回归通过；没有把重复运行次数累计成更多独立用例。组合输出为 `artifacts/reference-ux-v2/integrated-browser-final.log`。新 Files/页签组合另用真实临时 Host 运行 **12 项 E2E 全通过**，覆盖中英文与窄屏、原会话草稿、All/Changed/diff、文件草稿、Back/X、工作区无来源返回与丢失活动查询；原生和全仓门禁仍以本轮独立运行结果为准。参考、fixture、真实 Host 和原生证据分别标注，不宣称没有测试的 reference 全功能已经等价。

长历史滚动与恢复另行复核通过（1 passed / 9.1s）：180 条历史分页、有界渲染、加载更早内容后的阅读锚点、新消息不抢阅读位置、明确跳到最新以及断线恢复。其截图保留在 `artifacts/ui-redesign/session/after/long-history-*.png`。
