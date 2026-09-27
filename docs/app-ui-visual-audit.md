# App UI 真实参考视觉审计

`hbar-app-ui` 的 300 个注册项不是视觉验收结果。完整验收必须使用 React Bits Pro 的真实
Application UI 预览作为参考，并保留 Lumen 的黑白、玻璃、边缘光和主题 token。颜色可以
不同，但 DOM/ARIA 结构、阅读顺序、响应式流、几何边界、内容容量和交互反馈不能被颜色差异
掩盖。

## 运行矩阵

2026-09-24 用户调整：交互改按变化机制选样，不再逐按钮、逐输入方式和逐布局切换穷举；结构覆盖仍遍及全部变体。集中检查修复结果，关键状态保存真实原版/本地截图，等价行为记录依据并标注“推断、未逐项回放”。具体选样计划与流程见 [当前审计策略](reactbits-pro-visual-audit.md)。协议 25 默认要求逐变体的已审阅选样计划；尚未配置的变体先做结构/行为分析，不自动启动旧穷举任务。

```powershell
bun run app-ui:reactbits:discover -- --output artifacts/reactbits-pro-visual-audit/all
bun run app-ui:reactbits:audit -- --output artifacts/reactbits-pro-visual-audit/all --workers 2 --strict
```

默认矩阵为 38 个分类、300 个变体、4 个视口（1440×900、1024×768、390×844、320×720）
和 dark/light 两种主题，即 2400 组静态 source/local 配对。开发期可以使用
`--variants`、`--categories`、`--viewports`、`--themes` 缩小范围；缩小范围不能代替最终全量验收。
调试单个真实动作可对 `interactions` 加 `--cases <完整案例 ID[,其他 ID]>`；报告标记为
`selected-cases`，`compare` 不把随意缩小的调试集当作已审阅选样计划的完整通过证据。
必须等待静态捕获完成后再启动交互回放，不要并发启动这两个有前后依赖的阶段。
交互重放优先读取同一输出目录的 `capture-manifest.json` 画布尺寸；若调试结果另存目录，可用
`--source-output <静态捕获目录>` 指向对应的真实 source 清单。站点重载时 iframe 高度可能变化，
动作前会强制回到静态参考画布；目录哈希、画布指纹或源/本地实现不一致时不能复用旧案例。
浏览器外窗尺寸不等于原版 iframe 内容画布尺寸（例如 390 宽外窗中的 iframe 可能只有 356 宽）。
每次 live 捕获会记录 iframe 实际宽高与参考舞台 padding，并在本地隔离预览中复用相同可用空间；
本地组件自身已有的内边距会从舞台 padding 中扣除，避免同一空间重复计算。
显式声明 `hbar-app-ui-full-canvas-owner` 的组件已经拥有整个 iframe
画布的布局和滚动，其隔离画布外层不再注入任何参考 padding；组件自身的真实留白仍保留在截图中，
不能由捕获器补齐或掩盖。其他组件继续使用已有的内边距扣除规则。缺少这些元数据的
旧 source 缓存不能用于 `--local-only` 几何验收，必须重新捕获原版。

live 参考可通过以下变量配置：

- `HBAR_APP_UI_REFERENCE_URL`：React Bits Pro App UI 目录；
- `HBAR_APP_UI_REFERENCE_ROOT`：offline 清单和静态变体缓存根目录；
- `HBAR_APP_UI_SOURCE_INVENTORY` / `--source-inventory`：仅开发期复用已校验的 38/300 URL 清单，仍实时打开各变体原版 iframe；完整 `audit` 总是重新发现线上目录；
- `HBAR_APP_UI_AUDIT_OUTPUT_ROOT`：报告输出目录；
- `HBAR_APP_UI_VIEWPORTS` / `HBAR_APP_UI_THEMES`：开发期矩阵过滤；
- `HBAR_APP_UI_AUDIT_WORKERS`：有界并发；
- 单变体交互也按此上限并行重放不同动作，每个动作仍拥有独立浏览器上下文；多变体时按变体分配工作者，不叠乘并发数。
- `HBAR_APP_UI_CHROME_PATH`：Windows Chrome 路径；
- `HBAR_APP_UI_OFFLINE=1`：只使用已保存的 source inventory/cache，不猜测缺失映射。

offline 缓存必须包含 `source-inventory.json`，并可以按 `<source-id>.html` 或
`<source-id>/index.html` 提供变体页面。缺少缓存时命令失败，不回退到伪造组件或猜测 URL。

## 证据和门禁

捕获协议 13 / 交互协议 27 起，两侧 Chrome 统一使用 `--disable-lcd-text`，避免同一段未改动的
文字在 React 更新前后切换 LCD/灰度抗锯齿，被误算为业务反馈。该参数由
[Chromium 定义](https://chromium.googlesource.com/chromium/src/+/lkgr/content/public/common/content_switches.cc)；
它不修改组件 DOM、文本、尺寸或交互。旧协议的证据保留，但不能与新协议混用或直接续跑；需用新目录重新捕获。
隔离 iframe 前先等待真实组件和字体完成加载，再观察 iframe 自身尺寸稳定 500ms；不把文档页的初始
600px 占位高度提前固定下来，也不从内容高度猜测或强制拉高参考画布。

每次运行都写入被 Git 忽略的 `artifacts/reactbits-pro-visual-audit/<run-id>/`：

- `manifest.json`：参考 URL、源目录哈希、视口/主题矩阵和静态/交互计数；
- `source-inventory.json` / `local-inventory.json`：38/300 发现与本地映射；
- `capture-manifest.json`：每个 source/local 截图、上下文截图和语义快照；
- `structure-report.json`：DOM/ARIA/几何/文本容量/溢出/截断/控件形状；
- `interaction-report.json`：已审阅选样计划中每个实际动作的操作前后状态；访问状态的完整控件清单保存在语义快照中，未回放的等价项单列推断依据；
- `interaction-run.json`：所选变体、视口、主题、源目录与本地实现代码/fixture 的续跑指纹；同一输出目录仅在指纹一致时复用。每个动作在全新浏览器上下文中重放，只有源/本地截图和快照均完整、且动作/画布指纹未变化的 `comparison.json` 才能续用；错误和残缺案例重新测试。静态清单也记录实现指纹；代码变化后的旧截图不能标记为验收通过。
- `visual-report.json`：静态和交互截图差异、尺寸差、MAE/RMSE、变化像素和反馈幅度；
- `review-ledger.json`：逐变体、逐交互的 passed/needs-fix 记录；
- `report.html`：可人工浏览的汇总表。

交互必须从 React Bits Pro iframe 真实 DOM 发现，不能只读取本地 `profile.controls`。即使
多个控件有相同 `tag/type/role`，仍保留各自稳定 ID；是否需要单独回放按行为差异判断，不仅按控件形状合并。每个选中的真实动作保存
`before.png`、`after.png`、`source-state.json`、
`lumen-state.json` 和 `comparison.json`。结果分类为 `matched`、`lumen-different`、
`missing`、`source-no-op`、`blocked`、`not-applicable` 或 `error`。旧的
`semantic-shape-representatives` 报告只可用于定位问题，不能用于全量验收。

`--strict` 至少阻断以下情况：缺失 source/local 配对、控件数量或类型不一致、横向溢出、文本
截断、未分类交互和缺少交互反馈。原版文档页的导航/浮层在捕获时隐藏，iframe 保留原始内容画布；
每一条交互还需要完整的前后截图，并比较原版与本地的变化像素比例（容差取 2 个百分点与原版
变化幅度的 35% 中较大者）。仅 DOM 不变的 `source-no-op` 不能豁免视觉反馈差异；局部视口/
主题的调试报告也不能标记为全矩阵 `passed`。Lumen token 的颜色、玻璃背景和阴影不作为通过
依据，也不能屏蔽几何差异。

## 类别修复边界

App Shell 7 的作用域工作台采用 8 组真实 iframe/本地静态对照与 16 个机制样本：组织菜单只变更组织；
项目菜单更换数据库名前缀而不改变指标；生产、预发、预览三个环境带来不同的记录、连接数和系统状态。
分别抽样状态详情、Data 折叠、提示卡关闭、账号菜单、搜索输入、创建演示无反馈，以及窄屏抽屉、合并作用域菜单与数据库卡片。
Data 收起后原版仍保留隐藏的子链接，Lumen 也保留节点；搜索框保留输入但不筛选演示记录。
相同选择器的重复点击、其余导航链接与账号选项、各视口/主题下相同业务转换均记为 `inferred-not-replayed`，
不宣称逐个按钮验收。记录由宿主类型化提供，当前预览页 14/13/13 行，100 行以内面板滚动，更多行交由宿主分页；
101 行压力 fixture 用于确认可达性。德语长文案、空/单行、重复 ID、失效选择均有本地测试。

原版在 286 宽度下的合并作用域菜单保留 240 宽，从 56 位置展开，右侧超出 iframe 10；
Lumen 将菜单宽度限制在可用区域内，仍保留相同条目、顺序与反馈。这是可见的非主题几何差异，
需在本地审计报告保留说明与人工复核状态，不得视作颜色/token 差异或声称已逐按钮通过。

App Shell 6 的文档工作台使用 16 个代表案例覆盖目录展开/收起、文件选择、标题三处同步、
文本与块格式开关、树焦点移动、菜单关闭和窄屏抽屉；不逐个点击 19 个文件或每个格式按钮。
正文、文件树、元数据、字数和文案由宿主提供，100 条以内由导航面板滚动，超过该量由宿主分组/分页；
101 条输入仍保留可达性。方向键仅移动树焦点，确认才选择；窄屏选择文件保持抽屉打开。
原版窄屏“更多格式”的菜单项只关闭菜单，并不复用桌面块格式的状态开关。
仅 `Webhook retry schedule` 与 `API versioning` 的元数据经过真实选择验证，其余记录的元数据是代表性宿主 fixture，
不能冒充逐条核验的原版内容。

该变体原版的窄屏“更多格式”菜单右对齐在第二个工具栏控件下，菜单左侧越出 iframe，导致文字被裁切。
Lumen 保持同一菜单内容、顺序和关闭反馈，但将覆盖层约束在所属工具栏内；这属于明确的非主题差异，
不是颜色/token 白名单。保留真实源/本地截图和 `needs-fix`/待复核状态，不放宽视觉门禁，也不把它登记为完整审计通过。
本地 `bun scripts/verify-hbar-app-ui-app-shell-documents.ts` 检查九个宽度、短宿主、德语长文案、空树、101 条文档、
树键盘操作、标题同步、菜单焦点返回及窄屏菜单边界。

AI Usage 8 以五例覆盖 Details/Upgrade 两个独立动作、两种按钮 hover 与窄屏原生 Space 激活。
原版两个动作都不改变业务状态，不虚构弹窗或升级成功；Enter 与其他视口的等价激活明确记录为推理覆盖。
趋势条与四项用量均是被动展示，不逐条点击。主值和限额必须保持同一段落的内联文字流，
尤其注意不同字号继承绝对行高会撑高行盒。`--compact-only` 验证精确卡片几何、六宽度、短宿主、
空态、德语长文案、禁用与容量边界；次级指标自然生长，趋势点缩小间距以容纳超过建议上限的输入。

AI Usage 7 以七例覆盖状态筛选、汇总、互斥展开、错误详情、返回全部、窄屏键盘收起和代表行 hover。
各行详情从真实渲染内容读取，但同类行不生成重复交互矩阵。筛选暂时隐藏的展开 ID 保留，返回全部后恢复；
删除的 ID 才清除。结果区原版保留 21.25rem 最小高度，行与详情仍由内容自然生长。
`--requests-only` 检查 640/639 断点、短宿主、长译文、空态和 50 条分页；200 条历史通过四页访问，
这是宿主容量扩展，不宣称原版提供了分页。原版窄屏居中裁切标题和筛选器，本地保证它们可滚动访问，
此差异单列待复核。请求行 hover 是轻微阅读高亮，深浅主题强度分别匹配，不能直接套用普通按钮的大面积填充。

AI Usage 6 按套餐单选、Enter/Space、两个独立底部动作和卡片 hover 选样，共六例。
原版卡片是 `button[role=radio]`，没有方向键游标切换；被动分段条与权益文本不点击。
`Upgrade`、`Stay on overage` 和卡片 hover 在公开预览中均没有业务/选中状态变化；
其中 hover 也不改变卡片填充，不套用普通按钮的整块 hover 填充反馈。
`--overage-only` 检查 640/639 断点、短宿主键盘可达性、德语长文案与七张套餐/七条权益。
桌面/平板四个控件的几何与源捕获逐项对齐；不等长卡片的内部内容按原生按钮行为垂直居中。
窄屏源顶部裁切、极窄源底部按钮越出内面板，
与本地安全滚动/按钮换行的差异单列待复核，不归为 Lumen 主题差异。

AI Usage 5 按两类预算预测结果、阈值添加/移除和两个独立开关选样，共六例。
原版没有保存按钮；不制造额外提交成功提示。键盘案例从焦点就绪态开始按键，获取焦点
可能引起的原生滚动另存 `focus-before/after.png`、对应 JSON 与 `focus-preparation.json`，
不删除、不位移这些证据。极窄原版顶部裁切和本地安全滚动仍须人工复核；不能以键盘准备
拆分替代对该几何差异的验收。`--budget-only` 检查预算联动、阈值独立性、窄屏及长文案。

AI Usage 4 的人员用量按六个机制选样：团队筛选、团队内姓名匹配、无结果、清空恢复、
极窄屏键盘返回全部团队，以及搜索焦点反馈。成员行是被动内容，不生成“逐人点击”；
其它团队值通过相同筛选投影的单元测试检查，等价手势与其它主题/宽度明确记为推断。
`bun scripts/verify-hbar-app-ui-usage.ts --members-only` 检查 640/639 断点、短宿主、
长文案及 50 人分页边界。原版结果区有 20rem 最小高度，过滤后保留该空间；普通成员行
始终自然生长。超过 50 人的分页是宿主容量扩展，不宣称来自原版。极窄原版标签越出卡片
与本地标签横向滚动的差异须单列人工复核，不能归为材质差异。

AI Usage 1 的选样示例已固化在 `scripts/reactbits-audit-sampling.ts`：30d／90d 两种数据投影、
代表日柱 hover、另一日柱 focus、失焦恢复提示、切换后的周柱明细，以及极窄屏键盘返回 7d。
共七个真实源／本地案例，不重复每根柱子的所有手势。其余同类点、主题与宽度标为
`inferred-not-replayed`；该选样计划不能代替其它七个 Usage 变体的独立结构分析。
本地 `bun scripts/verify-hbar-app-ui-usage.ts --overview-only` 额外检查断点、德语长文案、
空态、32 点溢出与短宿主可达性。原版短预览的顶部裁切须单列人工差异，不能伪装成主题差异。

Comments 类别在 2026-09-27 对实现提交 `f20ee42` 重新绑定证据，报告位于
`artifacts/reactbits-pro-visual-audit/comments-category-final-v1/`。六个变体共有 48 组静态截图对、
46 个源/本地交互样例（各变体依次 8、8、6、8、9、7）：27 个 `matched`、19 个 `source-no-op`，
缺失 0；语义、状态及浏览器错误机器门禁无失败。当前截图与状态机制复核后，Comments 1–5 为 `passed`，
Comments 6 仍为 `needs-review`；类别严格门禁只报告第 6 个的 `manual-review-required`，
因此不能将 Comments 整类登记为全部验收。其余重复手势、记录、主题和宽度保留 `inferred-not-replayed`，
不以机制选样代替其它变体的独立结构分析。此处是提交绑定的证据快照；修改共享实现后应重新绑定，
正式 Host/桌面业务与整个 300 变体目标仍须单独验收。

Comments 6 按选中标记、定位、解决、输入、Send 无业务反馈和两种窄屏原生 Space 操作选取七例，
不对每个标记重放所有主题/视口。三个标记是真实覆盖在画布上的对象，位置是宿主提供的画布百分比；
定位例外仅允许该 marker 容器，线框装饰与评论正文保持 flex 流。解决后保留评论和标记，
更新全局未解决数、划线及可恢复动作；选中/定位不清空草稿。Send 始终可用但公开源不提交、不清空，
不制造发送成功。正常三条评论在桌面自然生长，紧凑布局评论历史上限 13.75rem，
显式 pane-scroll 集合由评论栏滚动承载，头部和输入留在该滚动区之外。

2026-09-27 的 Comments 6 原版在 670px 的 Preview iframe 内将标题置于约 -21.5px，
356px/286px 内约 -43.5px；根容器居中超过其高度的内容，导致顶部文字裁切。
本地安全居中保证标题可从滚动起点访问，因此平板/窄屏默认几何存在差异。这不是 Lumen token 差异，
不能因为语义/状态机器门禁通过就签署完整视觉验收。该变体保留 `needs-review`，不写人工通过签名；
其它主题/宽度的同类操作标为 `inferred-not-replayed`，不拿推理覆盖消除这一待复核项。
`bun scripts/verify-hbar-app-ui-comments.ts` 覆盖六个变体的本地功能，并额外检查 Comments 6 的
全解决/恢复、草稿保留、长译文、超容量历史与原目标键盘动作。旧 `canvas` 契约仍可独立使用。

Scheduling 1 在 2026-09-27 的证据位于
`artifacts/reactbits-pro-visual-audit/scheduling-1-final-v2/`：8 组静态截图对、8 个代表性交互案例，
其中 5 个 `matched`、3 个 `source-no-op`，缺失 0；机器门禁、当前截图人工复核和严格比较均通过。
平均归一化像素 MAE 为 0.001982，仅作定位辅助，不替代语义、状态与人工验收。
七列日期与事件元数据使用 flex 正常流；1024px 以下堆叠，640px 以下隐藏原生筛选框。
选择日期只更新选中项与标题中的日期，保留原版固定 Wednesday/June 前缀与六条事件；
月份、年份及筛选选项仅更新各自原生值。前后月与 Add 在源预览没有业务结果，不制造计算、筛选或弹窗。
日期按钮、三个选择框、无操作按钮、hover 和窄屏 Space 分别选样，其余等价日期、值、手势和
主题/宽度登记为 `inferred-not-replayed`，不做逐日期乘视口的重复重放。
`bun scripts/verify-hbar-app-ui-scheduling.ts` 补充检查两侧断点、长中文、43 个日期与 7 条事件、
显式 pane-scroll、元数据换行及键盘可达性；空态、边界与重复/失效 ID 另有单元测试。
新 `referenceMonth` 由宿主提供受控数据与文案，旧 `month` 契约仍可独立使用。
Scheduling 2–7 在 Scheduling 1 完成时仅有源/旧本地基线；以下第 2 个独立验收记录更新此状态，
不把第 1 个的通过扩展到整类或正式宿主业务。

Scheduling 2 的 2026-09-27 证据位于
`artifacts/reactbits-pro-visual-audit/scheduling-2-final-v2/`：8 组静态截图对、8 个机制交互，
4 个 `matched`、4 个 `source-no-op`，缺失 0；结构和状态门禁、当前截图人工复核及严格比较通过。
平均归一化像素 MAE 0.00089 仅供定位，不代替语义与交互复核。
该变体是自然高度居中的人员时间卡：人物信息为被动段落，开始/结束是同排独立原生选择框，
10 个时长为同一 `radiogroup` 中的按钮，已选时长在底部说明句内联强调，Cancel/Apply 保持原顺序。
时长选中改变单选状态和说明；起止时间只改自己的值，即使结束早于开始也不制造验证。
Custom 不出现编辑器；More、Cancel、Apply 在公开源预览无业务状态结果，不制造菜单、重置或提交成功。
选样覆盖三种独立状态变化、三个无结果动作、hover 和极窄屏原生 Space；其他选项与手势标为
`inferred-not-replayed`。现有 `timeRange` 契约仍独立可用；新增 `referenceRange` 的文案、人物、
选项和受控 ID 由宿主提供。相关单元测试和 `bun scripts/verify-hbar-app-ui-scheduling.ts`
覆盖旧契约、空态、重复/失效 ID、10/11 项容量、长中文、超容量 pane-scroll 和短宿主键盘可达性。
Scheduling 3–7 仍未完成对齐，不因前两个通过而登记整类通过。

Scheduling 3 在 2026-09-27 的当前源／本地证据位于
`artifacts/reactbits-pro-visual-audit/scheduling-3-final-v4/`：8 组静态截图对、12 个机制交互，
9 个 `matched`、3 个 `source-no-op`，缺失 0；结构与状态硬门禁、当前截图人工复核及严格比较通过。
平均归一化像素 MAE 为 0.001483，仅供定位。表单卡的标题和页脚始终在独立滚动字段区之外；
人物标签自然换行，名称、添加人员、日期、链接和 Notes 是受控文本输入，起止时间为原生选择框。
添加人员按 Enter 不增加记录；移除按钮只作用原始人员 ID。日期不是原生日期选择器，Attach 没有文件选择结果；
空名称时 Create 仍可点击，空态及编辑后 Create、Cancel 均无业务反馈，不制造保存成功、重置或验证错误。
内容、可访问名称、人员记录及草稿值由宿主 `referenceForm` 契约提供；原 `form` 契约保留。
复核包括滚动上下边缘淡化、短宿主页脚、长中文、0/1/2/3 人和显式 7 人 pane-scroll、失效及重复 ID。
其余同类输入值、手势、人员和视口组合标为 `inferred-not-replayed`，不将这 12 例冒充整个 Scheduling 类别验收。
Notes 审计发现原始控件 `value` 与 React 受控 `textarea.textContent` 的表示差异；审计器提交 `568fdc0`
将值与静态文案分开归一化，保留原生值、AX、标签与可见正文比较，并升级源／交互协议。
Scheduling 4 在 2026-09-27 的当前证据位于
`artifacts/reactbits-pro-visual-audit/scheduling-4-final-v5/`：8 组静态截图对、10 个机制交互，
6 个 `matched`、4 个 `source-no-op`，缺失 0；结构与状态门禁通过，但仍为 `needs-review`，未签署视觉验收。
新增宿主 `referenceDeadline` 契约提供时区、五个独立预设、原生月份选择、七列日期与二十个滚动时段；
日期改变时间栏标题和摘要，时间仅改变单选与摘要。预设只改变高亮，No date 不清空日期；
月份仅改变选择值，前后月、Cancel、Apply 无业务状态结果，也不重置草稿。
保持原有 `deadline` API；空态、重复/失效 ID、边界与边界加一、长中文、超容量 pane-scroll 和短宿主键盘可达性有定向测试。
桌面/平板面板自然高度、日历和时段对齐；窄屏堆叠后源预览仍强制居中，顶部时区及首个预设被裁到 iframe 外，
本地保留安全滚动。该非主题几何冲突不能用颜色白名单或低像素误差掩盖，严格比较仍会因未人工签署而失败。
2026-09-27 再次从真实 iframe 捕获 `scheduling-4-revisit/`，极窄亮色复现相同裁切：源时区标题
`y=-100.25`、首个 Today 预设 `y=-55.25`，外层 flex 容器高 640、内容滚高 769、初始
`scrollTop=0`。将根、body、内部可滚动节点归零后仍保持负坐标；聚焦 Today 也不会滚回可见区域。
来源不是可通过普通滚动找回的另一个合法视口状态，不能要求本地照抄该不可达状态，同时宣称
“窄屏关键内容不遮挡”。保留当前 `needs-review`，本地顶部安全可达，不扩大颜色/像素例外，
该诊断不作为通过的静态或交互证据。
另存 `scheduling-4-final-v2/` 的极窄时段 Enter 诊断：DOM 状态一致，但裁切位置与另一预设 hover 带来的像素变化
不满足视觉反馈门禁；不计入匹配样本，不通过删除截图或放宽阈值将其当作通过。
保留这份诊断，最终选样采用桌面时段选择与极窄日期 Space；时段 Enter/Space 和全部时段滚动可达性在本地验证，
其余同类手势/布局标为 `inferred-not-replayed`。Scheduling 5–7 仍待对齐，整类未验收。

Scheduling 5 在 2026-09-27 的当前证据位于
`artifacts/reactbits-pro-visual-audit/scheduling-5-final/`：8 组静态截图对、10 个按状态机制选样的交互，
7 个 `matched`、3 个 `source-no-op`，缺失 0。结构与状态硬门禁、桌面及窄屏当前截图复核、严格比较均通过；
平均归一化像素 MAE 0.002713 仅作定位。宿主 `referenceAvailability` 契约提供时区、7 天、逐日开关、
稳定 ID 时段、8 项起止选择与全部可见文案；旧 `availability` API 独立保留。
开关即时改变标题中的可预约天数；关闭再开启会重置为 09:00–17:00 的一个时段，不保留原来的两个；
添加会追加 13:00–17:00，可重复；移除只作用指定时段，最后一项禁用。原生起止选项独立，结束早于开始不制造校验。
Copy 与 Save 在原版预览没有可见业务结果，本地也不制造复制提示或保存成功；这不代表正式产品保存链路已交付。
选样覆盖时区、两种起止选择、开关、添加、移除、Copy、Save、hover 与极窄键盘 Space。
其余日／时段、手势和视口主题组合明确标记 `inferred-not-replayed`；本地另外验证关闭恢复、连续增删、
原始 ID、长中文反序、空／单项／边界及超容量日列表与时段 pane-scroll、窄屏长文案和页脚可达性。
Scheduling 4 的窄屏几何仍待复核，Scheduling 6–7 仍待对齐，不登记整个 Scheduling 类别通过。

Scheduling 6 在 2026-09-27 的当前证据位于
`artifacts/reactbits-pro-visual-audit/scheduling-6-final-v6/`：8 组静态对、9 个机制样本，
7 个 `matched`、2 个 `source-no-op`，缺失 0；结构/状态/溢出硬门禁、人工签署和严格比较通过。
平均归一化像素 MAE 0.004966 仅辅助定位。`referenceTimeline` 的宿主契约提供标题、日期、
小时轴、时长选项、事件 ID/日期/起点分钟/时长及所有文案，旧 `timeline` API 保留。
时间跨度是数据驱动的时间轴刻度，不是截图坐标；间隔和事件在 flex 文档流中顺序排列，
重叠组按可复用泳道分配。时间轴承担垂直滚动，编辑底栏留在外部，不使用绝对定位或 CSS Grid。
前后周改变日期与事件投影；Day/Week 与日按钮改变范围；Today 在初始周无状态变化。
事件选择打开就近底栏，标题/时长直接修改，关闭保留，删除仅移除选中的原始 ID；New 默认在活动日创建事件。
来源实测确认跨日移动、底边调整时长与空白时间段创建；本地生产浏览器覆盖三种指针机制、
日/周导航、CRUD、Space、长中文反序、空/单项/边界/超界及短高度时间轴和页脚可达性。
极窄日期头采用紧凑字号和圆点，避免来源相邻标签挤压；键盘焦点仍可见。
该明确的小幅几何取舍以及刻度线和来源暂态 hover 拖动点差异已写入人工说明，未用主题白名单掩盖。
其余事件/日期、编辑与拖动组合及主题/视口排列标为 `inferred-not-replayed`。
这些是可注入宿主状态的来源预览闭环，不宣称正式日历持久化或远程创建/删除服务已交付。
Scheduling 4 的窄屏几何仍待复核，Scheduling 7 待对齐，整类尚未验收。

Scheduling 7 在 2026-09-27 的当前证据位于
`artifacts/reactbits-pro-visual-audit/scheduling-7-final-v2/`：8 组静态对、6 个机制样本，
4 个 `matched`、2 个 `source-no-op`，缺失 0；结构/状态/溢出门禁、当前人工签署和严格比较通过。
平均归一化像素 MAE 0.006581 仅用于诊断。`referenceBooking` 接收宿主人物摘要、3 项语义详情、
8 个日期及 9 个时段、原始 ID、受控选择、日期/时间格式化文案与明确容量策略，旧 `booking` 独立保留。
人物/选择区域以 flex 两列并在窄屏上下流；时间选择以 flex 自然换行为三/两列；日期带横向滚动，
边缘渐隐随真实滚动位置切换，末端选中日期不再被右侧渐隐遮住。短高度由组件拥有纵向滚动，页脚可达。
日期选择只更新 checked 状态、时段标题和摘要，来源不会按容量数字过滤九个时间；时间选择保持日期。
满额日为禁用 radio；Confirm 在原版无可见预约成功、导航或提示，本地不虚构服务结果。
本地生产浏览器覆盖独立选择、禁用日、原始 ID、键盘、末端日期横向滚动、窄屏页脚、短高度、中文反序与超界数据。
空/单项/默认上限/上限加一、重复和失效选择有单测；其余等价手势与视口主题组合标为 `inferred-not-replayed`。
这些是来源预览对齐和可注入宿主状态，不代表远程预约/日历持久化业务已交付。
Scheduling 1–3、5–7 的预览已逐变体签署；Scheduling 4 非主题窄屏几何仍未签署，整类不登记完成。

按 38 个类别逐类修复，每一类包含该类所有变体。先记录源 iframe 的语义父子关系、区域、
控件顺序、状态和响应式流，再用 flex/正常文档流实现；只有真实 dialog/menu/drawer/
popover overlay 才能使用定位。内容、文案、集合和容量继续由宿主 contract 提供，不能在可复用
组件中硬编码源文案或伪造记录。图标使用共享语义尺寸等级；每个类别通过后独立提交子模块、
wrapper、fixture、测试和审计证据。

变体清单中的“注册”与“完整视觉/交互审计通过”必须分开记录。只有 `review-ledger.json`
中静态矩阵、真实交互、page/console error、溢出、结构硬门禁全部通过，才允许标记为已验收。
