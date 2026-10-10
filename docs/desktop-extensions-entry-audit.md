# Extensions、Skills 与 MCP 逐入口审计

2026-09-25，只读产品审计。目标是从 cc-haha 的真实组件、公开截图和实际浏览器渲染中提取可迁移的操作路径，不把插件声明、按钮占位或一个命令面板入口算成完整管理能力。

## 结论与下一独立子功能

hbar 已经实现 **设置 → 扩展与技能 → 插件列表 → 详情 → 返回原筛选行**，有真实 Host 查询、键盘焦点恢复、20 项分页、失联后重读和必需插件说明。该层级无需推倒重做。最大、最容易独立闭环的操作差距是：**用户在插件详情读完状态和作用域后，不能就地启停，必须返回列表**。参考把状态、作用域、启停、更新、应用和卸载放在同一个详情决策区域；hbar 当前详情明确写“启用或禁用请返回列表”。

优先候选 P1：为已存在的插件详情接入同一 `extensionWorkspace.setEnabled` 事实与回执状态，在摘要后放就近启停／核对／失败重试。不要顺带仿造“更新”“MCP 管理”“技能文件”按钮。真实安装与卸载是后续独立生命周期单元；市场、更新、MCP、技能正文需要额外公开契约，不能用现有 `plugin.inspect` 的声明数据替代。

## 证据边界与运行环境

- 核对时 hbar HEAD：`9bccaf9c999f81f5f6757c5178f1b512fe5ea471`；参考 HEAD：`e28d0a653481ef41b7a329411eeb2f0fd5656731`。后续父代理提交不在此审计范围内。
- 适用四项 hbar 技能及 engineering 的 frontend/backend/quality、flow 的 preview-evidence 均已完整读取。参考 root/desktop/components 的 AGENTS 已读取。
- 两仓存在用户／并行任务 dirty；没有回退、暂存或提交，也没有修改任何生产源文件。hbar 的 kernel/plugin-sdk、共享 hbar-ui 与 `e2e/web-shell.spec.ts` 仍由原任务拥有。
- 新隔离 fixture：[main.tsx](../artifacts/desktop-entry-matrix/extensions/main.tsx)、[类型化数据](../artifacts/desktop-entry-matrix/extensions/fixture-data.ts)、[捕获脚本](../artifacts/desktop-entry-matrix/extensions/capture.ts)、[观测报告](../artifacts/desktop-entry-matrix/extensions/observations.json)。直接导入原 `Settings`、`PluginList`、`PluginDetail`、`SkillList`、`SkillDetail`、`McpSettings`、`Market`；**原 stores、API 读取动作和主题均保留**，没有复制私有实现、增加参考 export 或替换 store 模块。
- 浏览器只给确切 GET 返回本地合成 typed DTO；外部请求、WebSocket 和所有 API 写操作被拦截。没有运行商业 provider、真实 marketplace、真实 MCP 服务或真实插件安装。503 读取失败会触发原 diagnostics POST，已阻断。合成数据的英文正文是 fixture 内容，不是参考产品翻译缺失。
- 原主题 `desktop/src/theme/globals.css` 与全源码 Tailwind source 已加载。报告记录真实 body font；标题采用原 `--font-headline`（globals.css:694），不是浏览器漏载主题的 Times 默认字体。
- 原组件只读路径：en-US/zh-CN × 1440/320，共 **70 张截图、4 条完整操作序列、0 pageerror、0 mutation submit**。1440 挂载整个 Settings；320 首先保留完整 Settings 的限制画面，再直接挂公开面板组件验证其正常流。**320 的 panel 截图不是完整 App 的移动导航证据。**
- hbar 另外用既有 [extension-plugin-detail.spec.ts](../e2e/extension-plugin-detail.spec.ts) 在独立生产 dist、44937 Web / 44935 临时 Host 上重跑：**2/2 cases 通过**，每个涵盖 1440/320、真实插件 DTO、注入 `DISCONNECTED` 详情读错误、重读、分页、键盘返回、必需插件和无匹配项。唯一安装只发生在测试自己的临时数据目录并由既有 fixture 清理，未连接用户 Host。这验证本轮构建时点的产品行为，不是原组件 fixture 的业务成功证据。
- hbar 截图／E2E 于本机 Vite 日志 13:24 完成；随后主线发现外部 `hbar-ui/.../notifications.tsx` 引入尚未创建的 `notifications-activity-reference.css`。该外部构建阻碍不修、不覆盖；**上述照片不是该后续编辑完成后的当前 bundle 证明**。待外部模块完整后需要重新构建，不能拿本轮已建 dist 证明后续产品已通过。

主要视觉证据：

| 路径                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 直接可见结论                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [公开 skill-market.webp](https://github.com/He-Jiahui/hbar_old/blob/e28d0a653481ef41b7a329411eeb2f0fd5656731/docs/images/app/zh-CN/skill-market.webp)                                                                                                                                                                                                                                                                                                                                                                                                                           | Sidebar 的“技能市场”是独立目录页签；标题右方来源健康、已安装技能入口；搜索＋来源／安全／安装状态筛选；卡片安装状态与安装动作。公开截图不证明写入成功或错误恢复。                                   |
| [原设置插件列表，zh 1440](../artifacts/desktop-entry-matrix/extensions/reference-plugins-list-zh-CN-1440.png)                                                                                                                                                                                                                                                                                                                                                                                             | 左设置分类，标题说明；总数／启用／待处理／市场概览；刷新与应用在右；批量动作、来源市场与按状态分组。                                                                                               |
| [原插件详情，zh 1440](../artifacts/desktop-entry-matrix/extensions/reference-plugin-detail-zh-CN-1440.png) / [zh 320 面板](../artifacts/desktop-entry-matrix/extensions/reference-plugin-detail-zh-CN-320.png)                                                                                                                                                                                                                                                                                            | 返回在摘要上方；状态／安装来源与作用域先出现；其后独立启停／更新／应用／卸载行；能力分块和相应详情入口。窄屏顺序保持，按钮正常流换行。                                                             |
| [原批量确认](../artifacts/desktop-entry-matrix/extensions/reference-plugins-batch-confirm-zh-CN-320.png) / [原卸载确认](../artifacts/desktop-entry-matrix/extensions/reference-plugin-uninstall-confirm-zh-CN-320.png)                                                                                                                                                                                                                                                                                    | 多项／破坏性动作有明确目标及取消入口；没有真的执行写入。                                                                                                                                           |
| [原技能列表](../artifacts/desktop-entry-matrix/extensions/reference-skills-list-zh-CN-1440.png) / [详情 Overview](../artifacts/desktop-entry-matrix/extensions/reference-skill-overview-zh-CN-320.png) / [Files](../artifacts/desktop-entry-matrix/extensions/reference-skill-files-zh-CN-320.png)                                                                                                                                                                                                        | 本地检索与来源分组；同一个详情复用 Overview／Files，含结构化 frontmatter、正文与文件选择，不是路径字符串列表。                                                                                     |
| [原 MCP 列表](../artifacts/desktop-entry-matrix/extensions/reference-mcp-list-zh-CN-1440.png) / [编辑](../artifacts/desktop-entry-matrix/extensions/reference-mcp-editor-zh-CN-320.png) / [只读详情](../artifacts/desktop-entry-matrix/extensions/reference-mcp-readonly-detail-zh-CN-320.png) / [新增](../artifacts/desktop-entry-matrix/extensions/reference-mcp-create-zh-CN-320.png)                                                                                                                  | 分组服务行：状态、scope、连接信息、右侧齿轮和独立 Switch；编辑／不可编辑详情有各自允许动作；新增 scope／project／transport／字段／保存完整层级。                                                   |
| [原市场列表](../artifacts/desktop-entry-matrix/extensions/reference-market-list-zh-CN-1440.png) / [详情](../artifacts/desktop-entry-matrix/extensions/reference-market-detail-zh-CN-320.png) / [安装确认](../artifacts/desktop-entry-matrix/extensions/reference-market-install-confirm-zh-CN-320.png)                                                                                                                                                                                                    | 浏览、阅读与安装决策分层；确认显示来源、版本、安全状态、位置、风险和“新会话生效”。未知风险不是绿色“已审核”。                                                                                       |
| [原完整 Settings，320](../artifacts/desktop-entry-matrix/extensions/reference-settings-rail-plugins-zh-CN-320.png)                                                                                                                                                                                                                                                                                                                                                                                        | 固定 195px 分类轨道加正文 padding，主体被挤压；不能据此声称完整移动 App 可用，也不应把它移植进 hbar 的窄屏导航。                                                                                   |
| [原详情读取失败](../artifacts/desktop-entry-matrix/extensions/reference-plugin-read-failure-zh-CN-1440.png)                                                                                                                                                                                                                                                                                                                                                                                               | 503 后显示原 ErrorState；该面板没有就近 retry。捕获脚本重新加载读取恢复。写操作失败及 reload-warning 仅有源码／既有测试证据。                                                                      |
| [当前 hbar 详情 1440](../artifacts/desktop-entry-matrix/extensions/host-results/extension-plugin-detail-ex-95c4f-red-row-with-keyboard-zh-CN/plugin-detail-zh-CN-1440.png) / [320](../artifacts/desktop-entry-matrix/extensions/host-results/extension-plugin-detail-ex-95c4f-red-row-with-keyboard-zh-CN/plugin-detail-zh-CN-320.png) / [返回后的列表](../artifacts/desktop-entry-matrix/extensions/host-results/extension-plugin-detail-ex-95c4f-red-row-with-keyboard-zh-CN/plugin-list-zh-CN-320.png) | 真实 Host 来源／安装／运行范围；详情读失败后重试；声明贡献 20 项分页；详情无启停，提示返回列表；窄屏分类为 compact 控件且无页级横溢。样式包含当前外部 hbar-ui 工作树，不能归因给 extensions 自己。 |

每个原组件截图都有对应 en-US 版本；`reference-*-entry` 保留真实到达时的滚动位置，随后 `*-detail` 是显式滚动到返回按钮后的阅读截图，**不是声称原详情导航自动回顶**。完整当前 App 的原生壳及移动 App 容器不在本 fixture 中。

## 参考入口与动作矩阵

以下源码相对 `D:/Git/cc-haha/desktop/src`，行号基于上面的参考 HEAD。

| 区域／入口位置                                           | 目标与作用域                                                                                | 详情、返回、确认、反馈                                                                                                                 | 源码定位                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Sidebar 底部设置；设置分类 MCP／Skills／Plugins          | Settings 单页签；分类选中保留在 UI store；数据以当前 session.workDir 为上下文               | 分类始终可见、`aria-current=page`；选中项 `scrollIntoView(nearest)`                                                                    | `components/layout/Sidebar.tsx:1461,1470`；`pages/Settings.tsx:26,58,68,70,72,108`                              |
| Sidebar“技能市场”                                        | 独立 Market 页签，不是插件安装表单                                                          | 已安装技能从市场标题右方跳回 Settings → Skills；市场页签仍存在                                                                         | `Sidebar.tsx:1058`；`components/market/MarketHome.tsx:86,117,123`                                               |
| Plugins 顶部 Refresh                                     | 读取当前上下文插件与市场列表                                                                | 不应用变更；空列表也有 refresh；一般读取失败为 ErrorState 无 inline retry                                                              | `components/plugins/PluginList.tsx:41,163,175,219`；`stores/pluginStore.ts:52`                                  |
| Plugins 顶部 Apply changes                               | reload 当前上下文运行时，可带 activeSessionId                                               | loading；reload enabled/skills/errors 汇总与 toast，错误 toast；不是安装                                                               | `PluginList.tsx:88,228`；`api/plugins.ts:42`                                                                    |
| 插件行左侧 Checkbox；概览下方清选择／批量启停            | 仅 user/project/local 可变插件；targets 带 id+scope                                         | 对当前选择的可执行子集确认，名字／数量明确；应用后清这些选择；部分失败会 best-effort reload，不声称全量成功                            | `PluginList.tsx:61,120,275,290,376,450,509`；`pluginStore.ts:303`                                               |
| 分组内插件正文＋右箭头                                   | 选具体 plugin.id，detail query 带 cwd                                                       | 列表 →详情，详情上方 Back 清选择；有 source/status/version/errors                                                                      | `PluginList.tsx:415,465`；`pages/Settings.tsx:169`；`PluginDetail.tsx:193`；`pluginStore.ts:74,201`             |
| 详情摘要后 Enable／Disable                               | 具体 plugin.id+scope；project/local 写需 cwd；managed/builtin 无此动作                      | action loading，写后 reload，再刷新列表与详情；已写但 reload 失败为 warning，不伪装干净成功                                            | `PluginDetail.tsx:67,70,263`；`pluginStore.ts:128,141,223,246`                                                  |
| 详情 Update                                              | 可变插件，同 scope/cwd                                                                      | 使用专门 update API，后 reload；不是更换本地目录                                                                                       | `PluginDetail.tsx:285`；`api/plugins.ts:36`                                                                     |
| 详情 Apply                                               | 当前 desktop runtime，可尝试当前 session reload                                             | 汇总 toast；失败反馈；不表示更新／卸载成功                                                                                             | `PluginDetail.tsx:96,296`                                                                                       |
| 详情 Uninstall                                           | 可变插件，明确 id/scope，`keepData=false`                                                   | danger 按钮→目标确认；取消不写；确认关闭 modal 后写，成功返回列表；错误 toast                                                          | `PluginDetail.tsx:304,506`；`pluginStore.ts:181`                                                                |
| 能力 Skills 卡片                                         | plugin skill name + cwd，只有 enabled plugin 可共享导航                                     | Settings → Skills 详情；`returnTab='plugins'` 后 Back 回原插件。disabled 情况解释，不假装卡片可用                                      | `PluginDetail.tsx:121,369`；`components/skills/SkillDetail.tsx:19`                                              |
| 能力 MCP／Agent 卡片                                     | 按已报告 name 查询实际对象；MCP 读取已知项目集合；不是单凭标题构造对象                      | 到 MCP／Agents；找不到报错；Agent 记录返回来源 plugins；MCP 当前实现未保存相同来源返回字段                                             | `PluginDetail.tsx:140,167,395,434`                                                                              |
| 能力 Commands／Hooks／LSP                                | 静态报告的名称／描述／动作，不是“执行”按钮                                                  | 同详情阅读；只有确实实现的共享能力有导航箭头                                                                                           | `PluginDetail.tsx:412,455,476`                                                                                  |
| Known marketplaces                                       | 已配置市场来源、安装数、更新时间、auto-update 标签                                          | **只读摘要**，没有添加来源、编辑或 auto-update Switch                                                                                  | `PluginList.tsx:310,326`                                                                                        |
| Skills 搜索／清除                                        | 本地过滤 name/displayName/description/source/version/pluginName；来源顺序固定               | 匹配数量，无匹配清除入口；不同来源分组与估计 tokens                                                                                    | `components/skills/SkillList.tsx:25,70,148,203,215`                                                             |
| Skills 行＋箭头                                          | source+name+cwd；只有 `hasDirectory` 行可点                                                 | 不可用 inline MCP skill 禁用；有目录转 SkillDetail                                                                                     | `SkillList.tsx:260`；`stores/skillStore.ts:70`                                                                  |
| SkillDetail Back／Overview／Files                        | 已读取本地技能 DTO，文件只从该 DTO 取                                                       | Heading 主动 focus；Overview 是 markdown+frontmatter；Files 显示文件与正文、读取错误可 retry                                           | `SkillDetail.tsx:19,31,131`；`market/SkillDetailView.tsx:58,155,175`；`market/FilePreview.tsx:147,202`          |
| 本地 Skill Uninstall                                     | 仅 `marketMeta` 存在时显示，不给普通 repository／plugin skills 假卸载入口                   | 名字＋目录删除确认；成功清 detail/market cache、刷新 skills；失败 toast                                                                | `SkillDetail.tsx:85,118,153`                                                                                    |
| MCP 页面 Add server／各行齿轮／Switch                    | server identity 实际包括 name+scope+projectPath；scope 分组                                 | 齿轮可编辑→编辑，不可编辑→只读详情；Switch 只在 canToggle 时可用                                                                       | `pages/McpSettings.tsx:406,454,460,529,1100`；`lib/mcpIdentity.ts`                                              |
| MCP create/edit Back／scope卡／目录选择／transport tabs  | local/project/user；project/local 必须显式选目录；stdio/http/sse；编辑时名称、transport锁定 | Back 到列表；字段仍为本地 draft，非每键保存；scope→目标项目说明→transport→对应字段→Save                                                | `McpSettings.tsx:144,265,529,849,909,921,949,970,1086`                                                          |
| MCP STDIO args/env 增删／HTTP headers 增删／OAuth/helper | 匹配对应 transport 的结构化 payload                                                         | 成行的字段和删除；空集合保留一行方便填写；敏感值展示脱敏，不应复制 raw 配置                                                            | `McpSettings.tsx:327,730,1009,1045,1059`                                                                        |
| MCP Save                                                 | captured server + previous project path / 新建 name                                         | 合法且不 busy 才可写；成功 reread known projects 返回列表，失败保留 draft、toast                                                       | `McpSettings.tsx:701,1086`；`stores/mcpStore.ts:174`                                                            |
| MCP Reconnect／Uninstall                                 | canReconnect／canRemove 的确切 server                                                       | Reconnect checking→真实 connected/warning，失败恢复原 server；删除 modal 成功回列表、失败不清目标                                      | `McpSettings.tsx:609,651,684,799,888,894`                                                                       |
| MCP passive status                                       | enabled＋当前 context＋checking；最多2 worker                                               | 非当前项目只“已配置”，不错误计作当前 connected；被动错误静默，明确 reconnect 才反馈                                                    | `McpSettings.tsx:518,553`；`stores/mcpStore.ts:42,121`                                                          |
| Market search/clear／source/security/installed筛选       | source目录；query 300ms debounce、每页24                                                    | 原 Dropdown；输入／筛选重置读取，目录状态与错误可重试；滚动末尾读取下一页，失败保留已有页不自动反复重试                                | `market/MarketHome.tsx:54,67,142,210,250,277`；`market/FilterBar.tsx:55`；`stores/marketStore.ts:17,25,166,190` |
| Market 卡片／详情 Install／Uninstall                     | 具体 normalizedSkill.id，有 installState，不可安装有原因                                    | 卡片正文是独立可访问 overlay button；详情→风险确认，不直接写；Uninstall另删除确认                                                      | `market/SkillCard.tsx`；`market/MarketSkillDetail.tsx:156`；`pages/Market.tsx:24,77,99`                         |
| Market安装确认 Cancel／Install                           | 原 skill 的来源、版本、风险、安装位置                                                       | unknown/flagged有不同风险说明；installing阻止关闭/重复确认；效果文案“新会话生效”；失败分类、原详情 banner、toast；不是现有会话即时应用 | `market/InstallConfirmDialog.tsx:34,44,83,104`；`marketStore.ts:19,267`                                         |

参考的插件管理页本身**没有安装按钮**；此处不可把技能市场安装误记成插件安装。reference mutation queue、toast 错误和有限重读行为不是 hbar 的 durable receipt 机制；它们的外观可迁移，可靠性需要按 hbar 契约验证。

## hbar 当前实现及公开能力

| 能力                   | 当前入口／事实                                                                                                                                                                                                                                                      | 是否能独立实现参考路径                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 列表／筛选／详情／返回 | `packages/app-runtime/src/surfaces.ts:168` 把 legacy Extensions panel 路由到全局 Settings。`apps/web/src/App.tsx:334` 挂 `HbarExtensionWorkspace`；`packages/app-react/src/extension-workspace.tsx:66,108,169,291` 读列表、打开详情、返回并恢复筛选／焦点。         | 已实现主层级；未把静态贡献当可执行导航，属于正确边界。                                                                                                                          |
| Host插件状态与细节     | `plugin.list/inspect`（`packages/contracts/src/commands/extensions.ts:79`）；`apps/host/src/extension-commands.ts:30` inspect 从 Host 列表查精确 id；DTO 有 active/disabled/failed、required、installScope/runtimeScope/projectId、命令/面板/renderer声明。         | 可直接展示的 facts；DTO **没有 reference 的 plugin→skill/agent/MCP 所有权映射**，不能据相同 name、service string 或路径猜可导航对象。配置不应默认输出。                         |
| 启停                   | `extensionWorkspace.setEnabled` → plugin.enable/disable，列表 footer、required不给disable（`extension-workspace.tsx:216`）。runtime unknown冻结重发，以刷新 plugin.list 得当前事实（runtime:213-248）。                                                             | Host已支持；详情仍只有 Back/Reload/read-only hint（`extension-plugin-detail.tsx:96,167`）。这是优先 UI/runtime seam，不需要新 Host 写。                                         |
| 插件运行中的策略       | `Kernel.changePlugin/installPlugin` 调 assertIdle（`packages/kernel/src/index.ts:1443,1495,1507`）；remove组合根也 assertIdle（`apps/host/src/server.ts:116`）。                                                                                                    | Host global 操作，不是用户选择 session 的设置。不要显示“当前会话立即应用”或照搬 reference 的 activeSession reload。运行中被拒绝需就近说明真实错误。                             |
| 安装                   | `plugin.install {path,projectId?}`；Host 本地目录／zip／tgz／tar.gz；manifest 决定 global/project，project需精确projectId。`packages/kernel/src/plugins.ts:597`、`plugin-package.ts:59,143` 限制链接／穿越／10k entries／100MiB，并对已安装同名报 PLUGIN_CONFLICT。 | SDK/CLI/Host能力已有；**桌面无安装流程**。可做“从此 Host 的本地路径安装”的独立单元，不能假设浏览器文件选择的客户端路径就是远程 Host 路径，更不能叫商店安装／自动更新。          |
| 卸载                   | `plugin.remove`公开；required不能移除，active必须先disable，managed path有校验（plugins.ts:629）。                                                                                                                                                                  | SDK/CLI/Host能力已有；**桌面无卸载**。先状态确认，禁用和卸载是两步，不是事务；unknown不得盲发第二步。                                                                           |
| 更新／Apply／市场来源  | 没有 plugin.update/reload/catalogue/install-source query；scan现实现只是 dependencies.list（`apps/host/src/extension-commands.ts:43`）。                                                                                                                            | 不可通过“重新安装”、remove+install或重读按钮宣称更新。需要可核对版本/来源/副作用/receipt的新公开能力。scan不是扫描按钮等价。                                                    |
| Skills                 | `skill.list`仅 `{id,path,scope:'global'}`，server仅列 `layout.skills/global` 目录（`apps/host/src/server.ts:126`）；hbar skills行是不可点击的路径/Discovered状态（`extension-workspace.tsx:260`）。                                                                 | 已有只读目录，不是有效SKILL内容确认或插件能力归属；不能据目录存在显示“可用”、预览、执行、卸载。无正文/frontmatter/files/read契约。workspace file.read不授权任意global技能路径。 |
| MCP                    | 本轮在公开 `packages/contracts/src/commands`、Host注册与plugins目录未找到 MCP list/status/upsert/toggle/reconnect/remove能力。                                                                                                                                      | **不支持当前参考管理路径**。Provided service strings、tools或Browser automation不是MCP服务管理；需新增按name/scope/workspace identity的Host服务、安全配置和OAuth边界再做UI。    |
| 系统命令入口           | Extensions头部 Open system commands 实际打开 palette 并筛选 `system.`（`extension-workspace.tsx:94`）。                                                                                                                                                             | 是探索命令入口；并不证明 install/remove/update/skill管理有可操作、具参数、确认和回执的桌面页面。                                                                                |

## 视觉、导航与容量准则

1. **先识别再行动**：状态与scope在摘要，具体操作在紧邻区域；详情正文无需读完再回列表找开关。hbar已有host-owned typed labels和细节查询，下一步复用，不新建另一份插件真相。
2. **阅读与副作用分开**：卡片正文打开详情，右端arrow表达层级；破坏性动作有名字＋范围＋确认。Shared capability只有可以精确解析时才有箭头。将任意provided service包装成“进入MCP”会制造假契约。
3. **稳定返回**：hbar真实E2E已验证Back恢复filter、原row焦点和`aria-current`，比参考插件 Back 仅clearSelection更完整；应保留。原技能详情heading focus、来源返回plugins值得复用。
4. **清楚区分 scope**：reference使用user/project/local/managed/builtin与workDir；hbar是Host-wide目录、global/project安装与host/workspace/session/run/client运行范围。两者不可一对一翻译；需要原Host facts和当前操作captured scope。
5. **将错误放在动作附近**：hbar详情读有localized code、Retry/Back；reference读失败PluginList只ErrorState无retry，MCP则有retry。写后refresh失败也不是写失败；unknown只核对事实，不把消失的pending当完成。
6. **密度与留白从语义流来**：原大摘要、小badge、分组heading、卡片浅面/细边框、主要按钮反差形成层级；hbar当前标题和详情信息均更紧凑、动作匮乏是功能问题，不能只扩大字号宣称迁移。字体不是必须复制的产品准则。
7. **窄屏不牺牲功能**：hbar320分类compact控制、列表/详情button可换行，仍保留功能；不要移植参考Settings固定195rail。原MCP窄屏行name仍truncate，齿轮/Switch在右；需保留title/accessible name和完整目标详情，不能凭短名识别。
8. **有界列表而非无限DOM**：hbarHost schemas插件4096、skills10000；每个列表/详情20项，query≤200、page≤499；detail read≤8并发，已关闭面板cache最多4（runtime:15,37,66,157；model:4）。reference本地Plugins/Skills/MCP整体map，没发现显示分页；Market24 cursor页但累积DOM没有本模块硬上限。可迁移布局，不应回退hbar容量控制。特别记录：hbar `MAX_PANELS` 当前只逐出关闭面板，不等于允许4个以上开放surface被安全限流。

## 可独立提交的候选与验收

### P1：详情就近启停（优先，现有Host事实足够）

Own files建议：`packages/app-react/src/extension-plugin-detail.tsx`、相关 `.css`、extension-workspace传state/actions的小hunk；`packages/app-runtime/src/extension-workspace.ts` 仅补同panel/sameplugin事实核对及inspection更新；host labels在 `apps/web/src/extension-detail-copy.ts`。以该单元专用runtime/DOM/E2E测试独立提交，不触共享hbar-ui。

最小完整行为：详情摘要后可变插件显示 Enable/Disable；必需插件disabled路径显示解释；pending只有当前插件忙；确定失败可重试；unknown只出现读取核对，不再发write；查询plugin.list/inspect确认当前状态，详情与列表一致。列表启停仍可用，两个入口共享同一action owner，不能拥有两份pending。Back保留筛选、页面和焦点；离线仍可Back。

验收矩阵：

- 真实Host en/zh 1440/390/320；active→disabled→active，Host inspect与详情/list相同。
- required无Disable；run busy拒绝而非假成功；非当前面板不得污染新面板，同id重绑身份不能接收旧结果。
- 丢写回复但Host已变→unknown→read确认；读失败仍unknown，拒绝重复write；Host没变时只说明当前事实，不伪称先前动作未到达或自动重试。
- A→B快速详情切换；Back过程中慢读；启停过程中页面切换／卸载或详情missing；只更新原plugin/action，不抢当前目标／焦点。
- Copy/detailed errors绝不输出敏感config；所有labels宿主typed传入；键盘Enter/Space/Tab、focus回退和长name/copy正常流。
- 4096插件、10000skills、>20详情贡献、筛选reset页、空匹配、边缘page、无capability、dispose及8并发读取限制。

### P2：Host本地插件安装与卸载（Host部分已有，桌面尚缺）

独立Host-path输入/可选确切workspace、manifest范围预读或明确不能预读说明、确认、install pending/unknown/current list核对。浏览器upload、远程catalogue不在此单元。先落实Host path安全，不把客户端目录选择包装成Host选择器。卸载先要求已disabled，或分别展示“停用成功→确认卸载”；无atomic contract不得单按钮暗示原子两步。

重要可靠性前置：现有 extension mutations 在注册时标 `durable:true`，但 metadata 仍默认 `idempotency:'none'`；client只发送requestId，未把固定幂等键或只读operation receipt公开给该流程（`apps/host/src/extension-commands.ts:32`；`packages/commands/src/protocol.ts:43`；`packages/client/src/extensions.ts:11`）。因此“Host支持install/remove”不等于桌面可安全自动恢复重复安装／删除。仅list当前状态不能证明旧请求不会迟到；插件同名／同path也不能自动解释为同一次安装回执。该单元需先补明确preflight身份或窄receipt合同，或诚实保持unknown只读核对、不自动重发。已有启停设置目标值的事实读取也只证明当前值，不证明原操作exactly-once。

Own files应新建runtime lifecycle模块与controlled form/confirm组件、typed命令/状态；只必要index与Host copyhunk。测试临时package目录/zip、scope缺失/错误workspace、path traversal/symlink/容量、active|required、HOST_BUSY、丢回复与只读核对、panel关闭/重绑、失败保留输入。不要先做bulk或update。

### P2/P3：技能详情、安全市场、MCP（先合同后UI）

- 技能最小public read：global skill id→bounded summary+SKILL/frontmatter+文件目录、按精确skill/id/version读允许文件；内容限制、取消、路径安全、revision/失效；不靠原path越层读取。该查询落Host/SDK，随后独立读详情UI，安装市场另单元。
- 更新最小需要新 `plugin.update` 或受控replacement事务，真实安装来源/可更新版本、冲突和rollback事实、fixed key/receipt；remove+install不等价。
- MCP最小先只读管理集合/status，身份至少Host+scope+workspace+server id；连接状态与配置存在状态分离。再独立批准config写/开关/reconnect/delete，密钥脱敏与OAuth说明；每步可取消、有界读取、明确unknown。没有这些就不显示管理按钮。
- 技能市场需要真实catalogue分页/source-health/security/installability和安全install pipeline；“未知安全状态”不意味着已检查。reference安装后新会话生效，hbar实际何时mount/生效必须Host权威，不默认复制文案。

## 历史核对、复现和检查记录

历史已查源码差异，不仅标题：`a463b51` 把Extensions移到Settings；`12e2758` runtime拥有扩展状态；`af453e5`公开插件生命周期；`73295a9` 已落list→detail/back、typed query和页容量。当前缺详情启停是该详情单元明确的read-only范围，而非丢失的legacy按钮；不把新gap强归因给最近外部样式提交。

复现原组件：

```powershell
bunx --no-install vite build --config artifacts/desktop-entry-matrix/extensions/vite.config.ts
bunx --no-install vite preview --config artifacts/desktop-entry-matrix/extensions/vite.config.ts --host 127.0.0.1 --port 44927 --strictPort
bun artifacts/desktop-entry-matrix/extensions/capture.ts
```

原1440打开 `http://127.0.0.1:44927/?locale=zh-CN&tab=plugins`；320完整rail限制同URL；窄屏公开panel用 `&layout=panel`。`tab=skills/mcp`切相应原组件，`tab=market`原Market。程序拒绝外部API/write；安装确认只打开并取消，**不要把fixture的合成商品当真实可安装内容**。

当前 hbar 最小入口路径：Settings→Extensions and skills→filter `detail-fixture`→键盘Enter→真实Host详情读失败→Reload→21贡献第2页→Back。独立执行：

```powershell
$env:HBAR_E2E_HOST_PORT='44935'
$env:HBAR_E2E_PORT='44937'
bunx --no-install vite build --config artifacts/desktop-entry-matrix/extensions/hbar.vite.config.ts
bunx --no-install playwright test e2e/extension-plugin-detail.spec.ts --config artifacts/desktop-entry-matrix/extensions/hbar.playwright.config.ts
```

本轮实跑：原隔离Vite build通过（先一次fixture相对路径错误已修，再build通过）；原capture最终4序列/70截图通过；hbar生产build通过；真实临时Host E2E2/2通过。初轮捕获失败分别是原字体图标混入按钮可访问名、320完整Settings无正文宽度、market卡片真实overlay按钮拦截文字点击；脚本后改为正确button键盘路径及清楚区分panel容器，没有改参考源或force click。读取503、无匹配、disabled skill、managed只读、确认Escape均为本轮真实渲染证据；启停／安装／删除／update成功失败是源码/已有测试审查，未在reference写服务中执行。

告警：原Vite配置的 `__dirname` future loader提示、原/本轮hbar大chunk告警；临时Host关停时ws proxy ECONNRESET告警，2 cases均通过、无pageerror。未跑参考完整业务测试、真实商业market/provider、原生MCP连接或全仓门禁；本轮是审计与隔离证据，不是已实施功能或完整迁移验收。doc Prettier、26个相对文件链接、`git diff --no-index --check`通过；fixture content/icon/flow guards通过（初轮flow发现banner的1px边框，改成等价rem后重跑通过）。自己的参考preview已停止；Host/E2E fixture自动清理。无stage/commit。
