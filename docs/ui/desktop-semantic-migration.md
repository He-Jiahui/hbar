# Desktop 元素与 Lumen 语义迁移

本记录对应全量 Desktop 元素分类与迁移。工作台、会话、设置、工具和全局页面直接使用 Lumen 的内容、控件与容器 API；平台标题、托盘和通知由宿主提供文案。完整验收还包括元素清单、Schema 展示适配、原生文案同步、浏览器矩阵与临时原生验收。

## 依赖基线

- hbar 起点：`40eddc9ed53259b640eb7dddf76213fe35160a36`，原 Lumen 指针为 `5d3616757cdf14b74f9005efbed48e02fc6bff39`。
- 最新上游 `master`：`92e6f6cf213bd701adea70c365983dfb7579b48b`，通过直接 Git 查询确认。
- 本轮固定的 Lumen：`a958a3ffaae79fbfeccb1181cdfd963ae224c6f8`。该合并同时包含最新上游与本地语义内容、受控 slots、主题及单行阅读能力；包版本仍为 `0.12.0`，接入仍为 `workspace:*`。
- 干净安装暴露 Web 未声明的 `@hbar/commands` 和根测试未声明的 workspace 消费者。补齐公开依赖以及 Lumen 构建所需的 Node 声明后更新 Bun 锁文件，冻结安装通过。
- 附件兼容检查改为验证唯一的可访问删除名称及重复项消除；质量入口检查保留按序执行的 lint、类型、主题和测试门禁。

## 已运行的升级验证

- 24 个公开入口、受控 slot、内容和表单绑定测试通过；相关文件严格 ESLint 通过。
- 隔离工作树 `bun run build` 通过，保留既有大 chunk 提示。
- 同一 `a958a3ff` 源码在已安装依赖的 Lumen checkout 上执行 pnpm 包构建，类型、Vite 库产物与声明生成均通过。pnpm 使用仓库指定的 `12.3.4`。
- 全库 `bun run typecheck` 实际失败，语义迁移前观察到 96 项诊断，涉及已退役 Web 入口、主题契约、CLI 插件信息和存储等路径。这些失败仍需处理，不能将范围检查写成全库通过。
- 隔离 Lumen 的完整 pnpm 安装使用临时 Node `22.23.2`。13 个旧镜像 tarball 曾遇到证书过期；通过 npm 官方源填充 pnpm 内容缓存后，原锁文件的冻结安装通过。
- Lumen 独立 pnpm 依赖中的 React `19.3.0` 与宿主 `19.2.8` 同时存在时，Bun SSR 会使用两份 Hooks dispatcher。正式测试使用继承根配置的 `tsconfig.test.json`，把 React、React DOM 与 JSX runtime 统一解析到宿主依赖，和 Vite 的 `resolve.dedupe` 保持一致。93 个工作台、导航、审计与公开入口用例通过；更新测试命令契约后，其 4 个用例再次通过。

## 共享语义能力

Lumen 已补齐章节、集合、消息作者、时间、指标、空态、路径、快捷键、定义项和行内强调角色。标题的 `level` 只调整文档层级，其他角色的类型不允许该属性；`metadata.time` 保留机器可读的 `dateTime`。UI 公开入口同时导出语义文字与 flow 容器。图标公开 API 对齐既有 `xs/sm/md/lg/xl` token，命中范围仍由控件负责。

方向敏感的用户内容使用 `inline.isolated`，由 Lumen 保留原生 `bdi` 隔离语义。12 个角色 SSR 用例和扩展后的 20 个实际 client 场景通过，包含中英文混合分支名称的原文与计算后的 `unicode-bidi: isolate`；库类型、构建、声明和严格范围 lint 通过。

- 17 个相关内容、公开角色、原文保留与表单绑定测试通过，严格范围 lint 通过。
- 独立 pnpm 库构建、TypeScript 和声明生成通过；按 Lumen 名称限定的 PropTypes / API 文档生成通过，该上游生成器只覆盖 MUI 项目，因此 Lumen 接口另记在包 README 与类型声明中。
- `bun scripts/verify-desktop-semantic-roles.ts` 使用 Vite 构建真实 client fixture，验证 20 个中英文／明暗／1440、1100、900、390、320 宽度场景，窄屏 125% 文字放大；包含完整标题、路径滚动、辅助说明换行、连续句、time、原始代码、键盘焦点、文本对比度和无页面横向溢出。截图与结果放在 `artifacts/desktop-elements/roles`。
- `bun scripts/verify-lumen-icon-scale.ts` 在独立库 CSS 下核对五档公开图标与兼容图标，明暗／16、20px 根字号的几何结果通过。以上属于共享原语验证，尚不代表业务界面已全部迁移。

## 后续验收

Lumen 合并基线将模态窗口改为注册的 portal surface；宿主原有 `dialog:modal` 和 `closest('dialog')` 判定会漏掉它。公开模态查询现同时支持原生 dialog 和已注册的 modal，并按 document 限定所属窗口。工作台、文件工具、计划、组织与项目编辑的焦点保护已接入，验证错误的焦点恢复继续保留原运行时、版本、草稿和用户后续交互边界。

- 49 个焦点目标、项目编辑及组织状态用例通过；9 个实际 Chrome 模态查询用例覆盖原生／portal、锚定子层排除、跨 document、隐藏、inert、分离、重新连接和注销。
- 项目编辑明／暗／强制颜色与中英文 1440／320px 的 6 个外观与焦点用例通过。表面背景检查读取新版 surface 的实际背景；危险色断言等待状态过渡完成，焦点归还仍核对原菜单触发按钮。
- 隔离 Lumen 类型、库构建、声明、范围 lint 与格式通过；范围 PropTypes / API 文档命令通过，Lumen README 记录实际公开函数。

[元素清单](desktop-elements.md)与[类型化记录](desktop-elements.json)已覆盖 144 个生产 TSX 模块、3656 个元素，包括延迟页面和原生平台记录；所有入口图 TSX 都出现于实际 Bun browser 构建输入。6 个审计测试覆盖文本用途、回调原目标、可访问名称、低层文字与原生元素检测、函数级 renderer 边界及入口完整性。所有 LumenFrame 都检查直接内容，类型化 React 内容槽位和 JSX 组合保留其组件所属关系；普通字符串不能通过改用容器绕过用途声明。`--check --build` 验证生成结果未过期；`--strict` 在缺口仍存在时失败。

工作台与导航的 112 处低层文字已按宿主槽位改为内容角色：页面标题、导航名称、时间和辅助元数据、排序选项、表单说明、空态、反馈、集合标题和快捷键。组合用的文字容器改为 LumenFrame，项目编辑标签仍关联原输入，目录清单使用 LumenCollection / LumenCollectionItem；目录名称的斜线由宿主 formatter 提供。

- 94 个工作台、导航、审计与公开入口用例完成验证；新增普通容器与类型化槽位检查、目录第 33 项输入后，相关 16 个审计／容量用例通过。目录覆盖中英文、0／1／32／33 项，保留传入原始行 ID 与内容。
- 19 个相关浏览器用例分别验证通过：侧栏树与页签 5 个，真实 Host 的目录多根操作及全局页面恢复 6 个，项目编辑外观／焦点 6 个，以及侧栏长名称对齐 2 个。窄屏测量等待宿主确认响应式收起后再打开，原有对齐与无溢出断言保留。
- Web 与本地查询模块构建通过；当前修改范围的严格 lint、内容和图标 guard、格式通过。全库 TypeScript 仍为已记录的 96 项历史诊断；审计闭包中新增的 2 项可空路径诊断已修复。

消息回归发现用户 Copy 入口被历史操作栏条件排除。`c49412bb` 引入仅显示最后一条完成助手消息的条件，`ecd493fc` 后续重组时保留该条件。现将用户消息作为明确的操作栏对象，仍从原消息内容复制。相关 6 个 Copy 用例通过；真实 Host 的原文 Copy／窄屏 Find／外链／草稿和消息外观两项浏览器用例通过，后者覆盖明暗及多个宽度。单次提交用例显式关闭测试 Host 的预算续跑配置，保留原有单次提交断言；其他 fixture 的默认策略保留。范围 lint、格式与 Web 构建通过，全库 TypeScript 仍有 96 项已记录诊断。

消息阅读组件的 30 处低层文字已迁移。消息原文、代码块、语言／行数、工具摘要、执行与复制反馈、图片名称各自使用内容角色；图标和组合部分使用 flow 容器，原文和图片链接使用 LumenLink。项目分支使用 `inline.isolated` 保留原生方向隔离。清单现在同时记录链接和媒体的原始 href／src 目标。

- 71 个消息、代码、图片、Copy 与资源归属用例通过；项目上下文的 4 个 SSR 用例保留完整分支和原目标，6 个审计用例通过。
- 29 个消息阅读相关浏览器用例验证通过，包括代码原文 Copy、折叠／Find、有界图片加载／重试、工具执行时间／进度、原文换行、操作栏、焦点、外链与草稿。范围 lint、内容／图标 guard、格式、Web build 和清单输入核对通过；全库 TypeScript 仍有 96 项诊断。
- 既有 `session-project-context.spec.ts` 两项浏览器用例实际失败：它们在首次提交前期待只读分支，而当前界面在这个阶段提供启动位置选择器。该流程将随启动／输入区迁移核对，不能将它记为已通过。

审批、问卷、运行历史及选中文本反馈的 35 处低层文字已按用途迁移。工具与片段标签、代码原文、问题／回答、选项主副文本、运行元数据、计划步骤和操作反馈使用独立角色。路径标签与资源路径分开声明，由审批预览的外层阅读区承担横向滚动。运行历史及计划步骤使用 LumenCollection / LumenCollectionItem 的原生列表语义，保留原运行 ID 和既有 20 项分页、80 项窗口。

- 25 个相关测试通过，覆盖审批原始输入与未知结果、问卷保密与恢复、历史 0／1／20／21／22／80／81 项、重复 ID、取消锁、失败重试归属及选中文本草稿规则。
- 中英文审批及运行历史 4 个真实 Host 浏览器用例通过。审批覆盖原目标、键盘确认、问卷切换／恢复、后续草稿焦点和 320px 长路径完整原文／键盘滚动；运行历史验证显式分页、原运行重试和执行中 Stop 目标。
- 中英文选中文本的 2 个真实 Host 浏览器用例复验通过，覆盖原文引用、重复添加、移除、会话草稿隔离及最终被接收的运行输入。
- 这些确定数量的 fixture 显式关闭预算自动续跑，保留单次提交与分页的数量断言。旧窄屏导航测试使用已收起抽屉的 DOM 可见性判断及宽屏页签；现依据抽屉状态展开再操作，在 320px 核对实际选中会话表面，宽屏继续核对页签。
- 严格范围 lint、内容／图标和 flow layout guard、格式、Web build、清单生成及实际构建输入检查通过。全库 TypeScript 仍为 96 项已记录诊断，本批修改范围无新增诊断。

计划审批、计划建议与排队输入的 26 处低层文字已迁移为文档／工具标签、表单标签、阅读段落、反馈、集合主文本、元数据和紧凑状态。排队列表由 Lumen 集合承担语义，原操作 ID 显式保留在行上，全文继续通过原请求的编辑入口读取；预览容量、10 项分页、未知写入与引导恢复仍由原 ViewModel 管理。

- 80 个相关测试通过，覆盖计划原文、失效目标、未知写入和只读回执恢复、队列游标／分页边界、编辑／移除及引导并发归属。
- 13 个真实 Host 浏览器用例分别通过，包括中英文计划审批、计划建议、模式退出恢复、原回执丢失／读取失败／离线恢复、排队全文编辑和移除，以及单项引导、保留剩余队列与草稿。恢复用例在宽屏核对页签，320px 核对原会话表面与抽屉收起；回执次数和禁止重复写入断言保留。
- 引导 fixture 原默认 `artifacts/queue-guidance-v19/web` 在隔离 checkout 不存在，浏览器只收到“Build the web application”提示。默认入口已对齐本次实际构建的 `dist/web`，显式预览目录仍可覆盖。
- 严格范围 lint、内容／图标和 flow layout guard、格式、Web build 及清单输入核对通过；全库 TypeScript 保留 96 项已记录诊断，修改范围无新增诊断。

文件候选菜单实际点击被对话阅读区拦截。浏览器 trace 显示 `lumen-conversation-content` 位于候选按钮上方，局部绝对定位无法越过工作台 stacking context。候选菜单现使用共享 FloatingSurface 的 portal、最高层级、材质、定位与关闭；兼容接口公开 `focusBehavior` 和 `placement`，保留输入焦点的候选使用 anchored 模式，不声明移动端 modal。旧菜单关闭由共享协调器承担，编辑器的 IME 事件仍由专用 renderer 管理。

- 11 处文件候选标题、路径辅助说明、空态、容量与读取反馈声明 Lumen 内容角色。15 个 mention 映射、目标解析和 slash 用例通过。
- 中英文 mention 和加号菜单 4 个真实 Host 浏览器用例分别通过。新检查验证 portal、实际点击命中、背景模糊、左对齐、输入焦点、anchor 外部关闭、其他菜单打开时关闭；原用例继续验证撤销／重做、普通文本不获得路径权限、跨会话目标、原路径提交、IME、目录分页，以及 1440／900／390／320px 四边界与截图。
- 范围 lint、内容／图标和 flow layout guard、格式与独立预览构建通过；全库 TypeScript 保留 96 项已记录诊断，候选与共享接口无新增诊断。构建与实际浏览器证据位于 `artifacts/desktop-elements/mention-*` 和 `artifacts/reference-mentions`。

Slash 候选与首次发送前的命令选择同样迁入共享 FloatingSurface，删除局部定位与关闭路径。命令名称、说明、键盘提示和 Goal 确认说明共 4 个槽位声明 Lumen 角色；名称与说明从同一内容起点排列，滚动列表跟随键盘选中项。

- 22 个候选、mention 映射、命令解析及首次发送单测通过。8 个真实 Host 浏览器用例通过，覆盖中英文命令补全、IME、附件与原草稿、首次发送动作、Goal 确认取消／清除，以及活动和空闲 Goal 替换只执行一次。另重跑 2 个命令用例，确认 1440／320px 键盘移到末项和首项都进入视口。
- Escape 的共享关闭在 CodeMirror 原生处理之后发生；原生处理会临时让 Tab 走浏览器焦点导航。关闭回调使用编辑器公开 `setTabFocusMode(0)` 结束该临时窗口，保留显式开启的 Tab 焦点模式。实际 Escape 后重新输入、Tab 补全已通过，未加入本地 Escape 关闭监听。
- Goal 替换用例依据 `96445c54` 的明确执行所有权契约核对初始用户 Run ID 不变，并继续检查新 Goal ID、原草稿与 3 条生命周期事件。确认说明的滚动样式由旧 `span` 选择器改为内容角色，长目标 320px 验证继续通过。
- 范围严格 lint、内容／图标和 flow layout guard、格式与 Web build 通过。全库 TypeScript 仍有 96 项既有诊断，相关修改范围无诊断。浏览器证据位于 `artifacts/desktop-elements/slash-*`，中英文截图已检查。

后台 Agent 停止入口在 320px 被工具栏阅读轨道裁切。`2e65b042ec` 将后台动作留在轨道内，与 `backgroundAction` 的主动作契约不符；Lumen 提交 `3058f98b39` 将其放入发送按钮旁的受保护动作区，并将可聚焦的轨道声明为具名 toolbar。后台取消反馈声明为可换行反馈正文。

- Lumen 15 项组件测试与包构建／类型检查、严格范围 lint 通过；hbar 13 项后台任务、取消归属、未知结果核对和释放测试通过。
- 真实临时 Host 用例分别在最终构建通过，1440／320px 检查两个动作可见、实际指针命中、键盘停止、待回执仍可发送、原草稿、失去回执后的只读核对、原 Agent ID 和其他会话不受影响。窄屏截图已检查。
- 内容／图标与 flow layout guard、格式、Web build 通过。全库 TypeScript 仍有 96 项既有诊断，该范围无诊断。证据位于 `artifacts/desktop-elements/background-*`。

消息查找的计数和边界／失败说明分别声明 `control.status`、`feedback.paragraph`，保留原查询、原文映射、可访问名称和三个独立动作。

- 83 项查找、键盘、原文／Markdown 区间与容量测试通过。中英文宽屏已加载历史和流式／工具／模态快捷键的 4 个真实 Host 用例通过；中英文 320px 历史用例在导航等待修正后各运行两次，4 次均通过。
- fixture 对单次流式写入显式关闭预算自动续跑，保留原 Host Run ID 和精确数量；默认自动续跑曾在两次手动写入之间耗尽测试预算。侧栏辅助依据展开状态操作，窄屏等待实际选中表面及抽屉自行关闭，避免在异步选中之前再次关闭。首次英文窄屏回切曾出现匹配区间未完全进入视口，导航等待修正后仍保留完整范围与实际命中断言。
- 原搜索无隐式获取历史／写入、草稿与附件、会话切换、IME、长查询、Markdown 表格／代码水平定位、滚动锚点、焦点恢复与清理检查保留。严格范围 lint、内容／图标 guard、格式及 Web build 通过；全库类型诊断仍另行记录。证据位于 `artifacts/desktop-elements/find-*`、`background-find-*` 与 `artifacts/session-find/browser`。

输入流程验收发现运行时组合根仍把已准备 Goal 当成 Plan 写入锁：该条件来自 `a40a6ce6a`，`7ecf17c0` 已移除界面和用例的互斥规则，却遗漏组合根。界面允许选择 Plan，但组合根在写入前返回 BUSY，且当时未改变模式投影。现移除这个旧条件，提交中、结果未知、正在执行与执行目标检查继续由原状态机处理。

- 新组合根回归在保留旧条件时明确失败为 BUSY；移除后验证 Plan／默认／Plan 三次确认写入、原 Goal 准备 revision 和全文草稿不变，取消 Goal 准备仍保留 Plan，未创建 Goal 或 Run。
- 163 个运行时、模式、权限选择、回执恢复、执行准备与首次发送测试通过。中英文宽屏并存／晚回执／未知结果 4 个真实 Host 用例和中英文 320px 并存 2 个用例分别通过；未知结果核对只读取 mode.get，原 A 草稿与附件保留，B 不受晚回执影响。
- 旧浏览器用例依据 `7ecf17c0` 更新为并存契约，保留操作归属、可访问命中、草稿、附件和禁止额外写入断言。窄屏先确认数据入口已加载，再明确打开抽屉并检查真实视口，避免初次加载时读到旧展开状态而操作屏外 DOM。
- 严格范围 lint、Web build、格式和差异检查通过；全库 TypeScript 仍有 96 项既有诊断，该范围无诊断。诊断期间添加的临时日志已移除；证据位于 `artifacts/desktop-elements/intent-*`。

输入辅助、Goal 摘要／恢复、附件传输与上下文引用的 40 处低层文字已逐槽位分类，直接引用的原文正文也声明 `reading.paragraph`。附件和上下文由 Lumen 集合承接，原实体 ID、全文和动作目标保留；长文件名由外层轨道承担滚动。长 Goal 清除确认保留完整宿主文案，阅读区独立滚动，取消和确认动作保持可达。

- 70 个输入、附件、上下文、Goal 恢复／焦点和对话阅读测试通过，包含 0／1／3／12／13 项附件、原始 kind:id、重复引用与无额外授权。
- 34 个真实 Host 浏览器用例分批通过：最初批次中的 8 个加号、附件、选文及首次发送用例通过；更新移动端入口后的 2 个 Agent 父子运行用例通过；最终 24 个长目标容量、清除焦点与 Goal／Plan 恢复用例全部通过。覆盖中英文和 1440／900／390／320px，保留原草稿、附件、A／B 会话、未知回执只读核对、禁止重复写入和清理断言。
- 最初完整批次有 10 个失败，已分别定位和重跑：Agent 在 390px 调用了隐藏的桌面 Activity 按钮；恢复辅助在关闭侧栏时查找未挂载节点，并把实际使用抽屉的 900px 当作桌面。现使用真实移动端工具菜单，并按工作台 63.9375rem 断点先展开、再定位、等待选中表面及自动收起；没有删除原交互断言。相关历史为 `b414d9fa` 的树导航迁移。
- 严格范围 lint、内容／图标和 flow guard、格式、Web build 与实际构建输入清单核对通过。全库 TypeScript 仍有 96 项既有诊断，修改范围无诊断。长目标宽／窄截图与 Agent 窄屏截图已检查；证据位于 `artifacts/desktop-elements/composer-content-*`、`agent-parent-final-*` 和 `goal-content-final2-*`。

项目位置与首次运行准备的 34 处低层文字已逐项分类，分支名称字段及其基准帮助由公开 `LumenFormField` 提供。入口标签、方向隔离的分支名称、项目／分支选项、执行方式说明、空态和恢复反馈分别声明内容用途。位置选择器使用共享 FloatingSurface，移除局部 Popover 生命周期、定位／材质与 Escape 关闭；内容内部保持原项目、分支、revision 与创建／核对／采用动作。

- 41 项选择窗口、去重／失效 ID、分支模型／查询／创建、共享分支和项目上下文测试通过。选择窗口覆盖 0／1／60／61／100／101，创建验证捕获的基准、未知回执只读核对与禁止重复写入。
- 最终 6 个真实 Host 浏览器用例全部通过，包含中英文分支创建、首次发送的隔离分支，以及现有空会话的共享／Goal 隔离分支准备。焦点修复后的中英文位置用例各重复 3 次，6 次全部通过。5 个宽度 1440／1100／900／390／320 检查 body portal、最高层级、背景模糊、统一文本起点、视口边界、Escape／键盘打开、外部及触发器关闭。混合语言长分支的全文、阅读区键盘滚动、模式实际命中及首次运行目标保留。
- 初次验收复现选择后 Branch 焦点落到 body。诊断确认焦点曾成功进入 Branch；随后延迟过滤查询将候选 page 清空，原条件卸载了这个按钮。相关历史为 `41486a63` 的查询投影与 `40805e67` 的分支返回焦点修复。入口现由已确认的草稿选择维持，查询未就绪时使用 aria-disabled 与动作门禁，候选事实继续由原查询投影负责。新浏览器观察器有界记录真实过滤查询回执，等待查询完成后再次核对焦点；没有添加延时重试或界面中的候选数据副本。临时诊断和尝试过的延迟焦点方案已删除。
- 现有空会话 fixture 使用真实抽屉展开状态及视口检查，初次窄屏启动等待自动收起完成；确定数量的运行显式关闭预算自动续跑。原 Session 数量、初始 Git HEAD／分支、选择的 ref／OID、运行输入、原草稿和资源清理检查保留。
- 严格范围 lint、内容／图标与 flow guard、格式、Web build 与实际构建输入清单核对通过。全库 TypeScript 保留 96 项既有诊断，修改范围无诊断。宽屏、窄屏、长分支与新分支表单截图已检查；证据位于 `artifacts/desktop-elements/location-*`、`artifacts/pre-session-location` 和 `artifacts/pre-session-branch-creation-ui`。

模型入口迁入共享浮层前，Lumen 提交 `d638a7b3d3` 补齐公开 `responsivePresentation`：默认 `auto` 保留窄触摸面板，`anchored` 保留 Desktop 窄窗口的锚定搜索，`narrow-sheet` 为两种指针统一使用窄底部面板。布局、软键盘避免和焦点捕获由同一个共享决策驱动；删除原先可能覆盖运行时选择的重复 CSS media rule。

- 独立实际 client fixture 的 120 个 Chrome 场景通过：中英文、明暗、两种指针、三种展示策略与 1440／1100／900／390／320，窄屏根字号 20px。检查实际锚定／底部几何、搜索或表面焦点、完整说明与键盘滚动、portal／层级／模糊、Escape／入口／外部关闭、打开另一个表面、单一活动层及卸载释放。代表截图已检查；证据位于 `artifacts/desktop-elements/floating-presentations`。
- Lumen pnpm 构建／类型／声明、51 项组件测试与严格范围 lint 通过。触及的浮层文件修正 namespace import、optional undefined、花括号与嵌套条件的既有 lint 问题，没有添加规则例外。公开 PropTypes 与 API 命令按 Lumen 名称限定通过，但生成器实际只覆盖 MUI，Lumen 接口记录在 README 和声明；Vale 命令已尝试，当前没有其可执行程序。
- hbar 独立 Web 构建、范围 lint 与格式通过。全库类型仍保留 96 项既有诊断，浮层与 client fixture 范围无诊断。模型／推理与权限调用方的具体迁移及运行回归仍在后续子功能中验收，以上共享原语结果不等同于全部业务菜单已经接入。

Lumen 提交 `abad9de5ee` 保留可关闭入口的宿主 `aria-busy`。浏览器验收复现 Button 覆盖这个原生属性；原实现的回归测试有 2 项失败。公共 Button／IconButton 现保留宿主忙碌与清除值，实际 loading 仍优先并阻止重复提交。9 项 node 范围测试、严格范围 lint／格式和 Lumen 构建／类型／声明通过，包含实际表单的默认、提交与重置行为；没有新增公开 props 或 lint 例外。首次未限定范围的测试还选择了浏览器项目，因缺少其捆绑 Chromium 失败；明确 node 范围后全部通过。调用方菜单及其异步关闭、失败反馈仍在下一项独立验收中。

Lumen 提交 `b8c6a007c2` 修复真实目录刷新移除获得焦点的 Retry 后的归属，共享浮层现按已有初始焦点策略恢复。生命周期只观察自身内容，后续外部焦点清除跟踪，`preserve` 表面保持编辑器归属；关闭和卸载释放 observer 与监听。19 项 node 浮层焦点／composer 测试、严格范围 lint／格式和 Lumen 构建／类型／声明通过，120 个真实 Chrome 展示场景复验通过。真实 Host 的 320px 触摸 Retry 用例通过，较广的调用方批次为 6／7；剩余一项仍在校正旧窄屏页签断言。公共行为独立提交，调用方菜单仍在后续验收。

首次发送的通用选择器保留领域组合与宿主模型、分组、原始 ID、辅助说明、远端分页和确认动作，composer 展示接入共享 FloatingSurface。标题、控件、选项主／副文本及反馈继续直接使用 Lumen 内容角色，模型列表增加具名的键盘阅读区。删除本地 Popover、定位／材质、Escape、手动焦点生命周期及已过时的 Dialog 样式；Desktop 窄窗口保持锚定搜索，Web 使用公开窄面板策略。请求处理中可关闭浮层，重复选择受门禁约束，失败在原入口附近保留，迟到回执保持原 ID 并不抢占后续焦点。

- 21 个容量、原始 ID、重复／失效 ID、模型目录和首次发送测试通过。关闭状态的 SSR 验证入口，打开状态的分组、说明、选中标记和分页迁入实际浏览器检查，保留原数据／数量要求。
- 91 个实际 Chrome client 场景通过，包含中英文、明暗、两种指针、Desktop／Web 与 5 个宽度及窄屏 20px 根字号；检查正文与选项全文、统一左起文本、列表的实际 End 滚动与末项可达、搜索／方向键／Enter／Escape、portal／材质／边界、另一入口及外部关闭。容量覆盖 0／1／60／61／100／101、重复与失效选中 ID、远端分页；异步场景覆盖刷新中的原动作 ID、关闭后的成功／失败、后续焦点与重试，以及同步抛错恢复。
- 最终独立预览上的 7 个真实 Host 用例全部通过：模型搜索／选择、实时目录、无供应商设置往返并保留 Goal、读取失败重试，以及目录变化后的 Plan 恢复。初次批次中的旧测试依赖 landing 内的加号浮层、目录为空提示和窄屏页签；现使用 body portal、真实失效选择提示和原目标会话表面。保留 Session／Run 数量、原文、权限、位置、Goal／Plan 与清理断言，确定数量的 fixture 显式关闭预算自动续跑。
- 严格范围 lint、内容／图标与 flow guard、格式、Web build、清单生成及实际构建输入核对通过，全库类型仍为 96 项既有诊断，修改范围无诊断。长内容与真实 Host 的宽／窄截图已检查，证据位于 `artifacts/desktop-elements/pre-session-choices`、`choice-final-*` 及 `artifacts/first-send-model-reference/hbar-e2e`。另一个选择有效性用例在尚未迁移的推理浮层复现输入被遮挡，留给该表面的独立迁移处理；没有把此项失败计入本项通过结果。

首发推理选择器的 3 处低层文字声明 `choice.title`、`popover.title` 与 `feedback.paragraph`。入口和原生范围控件复用 Lumen，浮层使用共享 anchored 模式，删除本地 Popover、定位、Escape、焦点微任务与计时器。原模型 ID、支持级别和本地预览形成明确操作身份；模型／能力／确认值变化时关闭旧预览，提交与异步回执保持原模型目标，失败仅在原身份处呈现。关闭取消未确认预览；指针释放、Enter 及仍打开时的 blur 保留确认路径，失效级别和仅剩一个级别继续要求明确确认。

- 36 项首次发送、模型有效性、范围映射及提供商推理测试通过；Host 能力覆盖 1／7 上限和 0／8 拒绝，View 对空能力不发明范围，对单级失效选择保留恢复入口。打开状态的实际范围与刻度交由浏览器验证，SSR 继续核对原名称、未确认值和关闭入口。
- 47 个 Chrome client 场景通过：中英文、明暗、两种指针、五个宽度及窄屏 20px 根字号，验证原文、实际范围命中、具名标题的键盘 End 阅读与末字可见、焦点和菜单协调、0／1／3／7 能力，以及刷新／迟到成功或失败的原目标、后续焦点、重试和同步抛错后的长反馈阅读。人工截图发现初版长译名把滑杆挤出视口，现由标题阅读区承担滚动，滑杆保留操作空间；新验收检查实际命中与末字位置，等待浏览器完成键盘滚动后再核对。修正后的宽／窄截图已检查。
- 最终独立预览上的 3 个真实 Host 用例通过：中英文首次 Run 保持确认级别、原推理级别失效后重新确认、仅剩一级时显式恢复、删除模型后的切换，以及首发后输入和模型入口连续性。初次失败的中心点击实际落在窄屏浮层内，现点击真实露出的输入区并核对关闭与输入焦点；发送按钮检查对齐 `13f5d78d` 引入的现有 canonical Lumen 控件，保留原颜色、图形、输入、级别及 Session／Run 数量检查。fixture 显式关闭预算自动续跑。
- 严格范围 lint、内容与 flow guard、格式、Web build、清单与实际构建输入核对通过；全库类型仍为 96 项既有诊断，修改范围无诊断。证据位于 `artifacts/desktop-elements/pre-session-thinking`、`thinking-reading-*` 及 `artifacts/desktop-experience/pre-session-thinking-*`。会话内的模型／推理菜单与权限菜单仍须分别迁移和验收。

真实 Host 首发验收复现 `503c569a` 后模型菜单失去原有右边缘对齐，旧实现明确采用 `rect.right - width`。Lumen 提交 `10ab5c5a80` 增加公开 `FloatingAnchorAlignment` 与 anchored above／below 的 `anchorAlignment: start | end`；共享组件继续承担视口收敛，side placement 保持原居中，sheet 保持原布局，point／modal 类型不接收此参数。

- 26 项 node 对齐、原焦点恢复与 composer 测试通过，公开入口的严格 lint、格式、Lumen 类型／构建／声明及限定 proptypes／API 生成通过。原 wildcard 控件导出与明确 Divider 导出冲突，现明确列出控件导出，保留原 root Divider 实现；公开入口身份回归通过。API 文档工具仍属于 MUI 生成流程，实际 Lumen 契约记入 README 与声明；既有 Vale 不可用限制未冒充通过。
- 132 个 Chrome 公共能力场景通过：原 120 个语言／主题／指针／展示策略／五宽度用例，加上 12 个 start／end、左／中／右锚点、1440／320px 的边缘收敛与 below 向上翻转用例。初始 node 翻转 fixture 有足够下方空间，已改为实际视口底部锚点来验证真正的翻转；未放宽断言。证据位于 `artifacts/desktop-elements/floating-alignment-*`。
- 公共能力先独立提交；模型调用方的恢复及首发权限菜单仍在后续独立验收中。

首发模型调用方现通过 hbar 主题适配器传递公开 `anchorAlignment="end"`，恢复 composer 触发器原有的右边缘对齐；没有添加局部坐标或定位样式。91 个 Chrome 选择器场景复验通过，并增加 Desktop／Web 非 sheet 表面的真实边缘与视口收敛检查。中英文真实 Host 模型选择及实时目录共 3 个用例通过（同一 14 项批次全部通过），宽屏 E2E 明确核对触发器与菜单右边缘；原搜索、分组、失效／重复 ID、分页、异步目标与草稿断言保留。8 项选择器单测包含在通过的 128 项批次中；严格范围 lint、内容／图标与 flow guard、构建和格式通过，全库类型仍为 96 项既有诊断。宽／窄真实 Host 截图已检查，证据为 `choice-alignment-browser.log` 与 `approval-alignment-*`。权限菜单的变更未夹带在此调用方提交中。

首发权限菜单的 11 处低层文字已声明入口、浮层标题／正文、选项主／副文本与反馈的用途，直接采用 Lumen 内容角色。菜单接入共享 narrow-sheet／anchored 浮层；移除原生 Popover、本地定位、Escape 和手动关闭焦点。有限集合固定为 5 个权限，Host 支持 Plan 时增加 1 项，当前 Plan 时再增加退出动作；没有假造空集合、分页或虚拟化。确认正文和长错误由具名阅读区滚动，取消／确认动作留在外部，长单行按钮由动作轨道承担横向阅读。

- 使用 `77c2f258` 已提交源码在隔离 fixture 中重现：Allow 保存抛错后确认分支没有 alert，只有取消回选项后才出现；请求处理中 Close 拒绝关闭。相关路径可追溯到 `bc143daf` 的关闭 busy 条件与错误仅放在普通选项分支。现确认操作附近和关闭后的原入口均保留反馈，in-flight 门禁阻止重复提交，保留 `confirmAllow: true` 的显式确认；忙碌时仍可关闭，晚回执不抢占另一浮层的焦点。
- 52 个真实 Chrome client 场景通过：中英文、明暗、两种指针和五宽度，窄屏 20px 根字号；验证选项全文与角色、统一左起、portal／材质／边界、具名阅读区的实际 End 滚动、确认按钮命中、取消后 Allow 焦点、IME／修饰键、Escape／外部／另一入口关闭。有限容量包含无 Plan、支持 Plan、选中 Plan、能力失效时的退出与禁用原因。异步覆盖原草稿目标、能力／选择刷新、显式 Allow 与 Plan、迟到成功／失败及后续焦点，另有同步抛错、确认内错误全文阅读与重试、中英文长动作标签的键盘横向阅读。
- 128 个单测通过（其中本项相关 7 文件 120 项，选择器 2 文件 8 项）；首发审批、草稿 revision、显式 Allow、Host 确认、未知回执、目标切换和 Goal／Plan 独立性保持原要求。关闭 SSR 只核对入口；原打开描述与选项断言迁入两语言真实 client／Host 检查。最终独立预览的 14 个真实 Host 用例全部通过，其中首发 landing／权限／Goal／Plan／容量与提供商恢复 11 项，模型／目录 3 项。原有 Portal 祖先、model 初始焦点与未含 sandbox 的旧数量断言按实际契约校正，保留原 Session／Run、权限、Host 默认、草稿、目标和清理断言；fixture 显式关闭预算自动续跑并核验临时目录归属后删除。
- 严格范围 lint、内容／图标和 flow guard、格式、构建、清单生成／核对及实际生产构建输入验证通过；全库 TypeScript 仍有 96 项既有诊断，该范围无诊断。初次新脚本的 3 项字面量类型扩宽已通过明确 fixture 类型修正，未使用断言或忽略。普通菜单、长确认的宽／窄截图已检查；证据为 `pre-session-approval`、`approval-baseline*` 与 `approval-alignment-*`。会话内权限／模型菜单仍待分别迁移。

首发页面组合根剩余的 5 处低层文字已分别声明：目录操作错误、模型读取与恢复提示、Slash 限制说明采用可换行反馈正文，Goal 操作标签采用单行控件标签。保留宿主文案、alert／status、原草稿与命令归属，CSS 通过具名内容角色选择目标；该生产模块已无低层 LumenText。

- 88 项 landing、Goal、模型目录／有效性、Slash 与首发草稿测试通过。14 个真实 Host 用例分批通过：初批 13 项通过，触摸 Slash 用例的旧 Close 焦点断言失败；按 `503c569a` 接入的共享 touch sheet 面板焦点契约校正后，该用例独立重跑通过。原关闭、软键盘策略、全文草稿、Session／Run 数量、Goal／Plan、权限、模型能力失效与提供商恢复断言保留，确定数量的 Slash fixture 关闭预算自动续跑。普通首发检查 1440／900／390／320px，其他用例涵盖宽屏及触摸窄屏。
- 严格范围 lint、内容／图标与 flow guard、格式、独立 Web build、清单生成／核对和实际构建输入通过；全库类型仍是 96 项既有诊断，修改范围无诊断。使用本轮真实 Host 截图复核普通菜单、Goal 标签和恢复布局；证据为 `landing-content-*`，没有将初批失败报告为单批全部通过。

闭合输入工具栏的截图检查复现窄屏文字裁切：`2e65b042ec` 引入的 rail 使用 `flex: 1 1 0`，Host 将 toolbar 改为列方向时，零 basis 转为高度；实际测得阅读区只有 4px，文字越过上下边界。Lumen 提交 `ccc6228f1e` 使用 `min-block-size: max-content` 保留内容固有高度，继续由原横向轨道阅读完整单行标签，发送／停止动作保持独立；没有为普通内容设置固定高度。

- 96 个公开 `LumenPromptComposer` Chrome 场景通过：行／列、两语言／主题、五宽度、默认／200% 字号，以及 0／1／3／12 个宿主控件。用原生文字 Range 实测 client 阅读区上下边界，核对 ArrowRight 的实际横向滚动、原控件动作与编辑后全文发送。初始 fixture 的非序列化 formatter、列布局宽度和单行标题的阅读归属均已按实际 Host 合同修正；Chromium 的 End 不执行横向滚动，最终使用其真实 ArrowRight 行为，未添加产品键盘处理或强制滚动。
- 9 个真实 Host density／首发／Goal／Plan／容量用例全部通过；首发页面现直接验证 1440／1100／900／390／320px 下文字和 SVG 的垂直边界，原数量、目标、草稿和权限断言保留。修复后的 320px Goal 工具栏完整可读，32px 深色公开 fixture 的文字和发送动作可达，截图已检查。15 项 Lumen composer node 测试、包类型／构建／声明、格式和 flow guard 通过；父仓库 fixture／脚本／E2E 严格 lint 与内容 guard 通过，完整 typecheck 仍为 96 项既有诊断，修改范围无诊断。清单及实际生产输入核对通过；证据为 `composer-control-flow-*` 与 `composer-rail-*`。

会话模型与推理菜单原来按整个控件组定位，但它们是独立触发入口。把整个组直接当作共享 surface 的 anchor 会让协调器将相邻按钮的点击判定为原入口点击，导致旧菜单关闭后新菜单无法打开。旧分组 anchor 的实际 node 回归已复现该失败；Lumen 现公开 anchored 模式专用的 `positionReferenceRef`，仅负责几何和宽度匹配，实际 `anchorRef` 继续负责外部关闭与焦点归还。缺失定位参考回退到实际触发元素，两个元素的 ResizeObserver 均随关闭释放。

- 15 项定位／边缘对齐／焦点 node 测试通过。公共 client 验证扩展至 148 项，新增的 16 项覆盖中英文、明暗、细／粗指针、1440／320px：保留分组右边缘和上方间距、分组标签变化后重新定位、相邻入口切换、一次仅一个 surface、Escape 归还原触发按钮和无页面横向溢出。证据为 `floating-position-reference-*`。

会话模型菜单使用共享 FloatingSurface；原模型按钮负责打开、关闭与焦点，完整模型／推理控件组只负责定位。Web 保留窄屏 sheet，原生 Desktop 使用显式 anchored 策略。删除模型路径的原生 Popover、局部 resize／scroll 定位与 Retry 焦点 rAF；剩余原生推理菜单保留独立边界，随后单独迁移。模型目录继续限制为 4096 项、每批 60 行，保留原 ID、搜索、失效模型、分页和隐藏但已配置的有效模型。供应商组名声明章节标题，表面标题与长恢复正文有具名阅读区，Close 保持在外。

- 48 项模型目录、配置／写入、无效化和关闭状态 SSR 用例通过。原生 Popover SSR 中的展开内容断言移入实际 client：原生／Web 策略、缺失 ID 原文、Providers／Retry、归档 unknown 的核对按钮和禁写选项均在可见 body portal 上核对。首轮额外运行的 Agent SSR 仍有一项闭合菜单内容断言失败，它属于此前共享首发菜单后的测试差距，将随 Agent 表面迁移处理，未算入本批通过。
- 106 个实际 Chrome client 场景通过：两语言／主题／指针、五宽度、两种展示策略，以及 0／1／12／60／61／4096 项。验证全目录检索、分批加载、关闭／原按钮焦点、可见的相邻菜单切换、原草稿和原写入目标；窄屏 sheet 按 Close 后切换。长标题和恢复正文分别以真实 ArrowRight／End 阅读，原完整文案保留。Retry 用 `aria-busy`／`aria-disabled` 保持焦点，重复 Enter 不启动第二次读取；刷新移除 Retry 后由共享能力恢复搜索焦点。列表变更、关闭后晚成功、失败后的附近反馈及切到 B 后 A 的迟到失败均验证原 Session／Model ID、后续草稿与焦点。
- 13 项真实 Host 用例分别通过：模型／推理编辑 2 项、运行中禁用 2 项、触摸搜索 1 项、供应商删除／隐藏替代／读取失败重连／空目录恢复 8 项。首轮供应商 fixture 实际读取旧 `dist/web`，结果不计本次验收；随后 10 项模型／恢复用例绑定本轮冻结构建并检查入口资源名，全部通过。恢复 Host 的默认资源路径同时遵循 `HBAR_E2E_PREVIEW_DIST`，不再隐式选旧资源。当前 320px 菜单与长恢复正文截图已检查，证据为 `session-model-*`。
- 最终资源再构建后，两语言读取失败／重连用例在修正后的默认资源路径各复验一次，2 项通过。范围严格 lint、内容／图标／flow guard、格式、Web build、清单生成与实际构建输入核对通过。新增 browser 脚本的两处字面量类型扩大已用明确 fixture 输入契约修复，完整 typecheck 回到 96 项既有诊断，修改范围无诊断。原生菜单资源脚本已使用可访问 dialog 名称定位；本批尚未运行原生 Desktop 构建／验收，它仍属于最终平台交付范围。

会话推理菜单也使用共享 FloatingSurface，整组模型控件的原定位关系保留在 `positionReferenceRef`，推理按钮独立承担入口与焦点归还。删除最后的组合控件原生 Popover、局部几何／resize／scroll 与范围输入的 Escape 关闭分支。关闭先取消预览，键盘和指针确认仍绑定原会话、真实档位和配置版本；保留 `8fef11f7` 的指针取消后新键盘手势恢复契约。忙碌／未知状态由 aria 标记与原写入 guard 禁止重复动作，已打开的范围控件保持可读焦点。当前档位、表面标题与反馈正文分别声明内容角色，长标题换行进入具名阅读区，滑块留在外。

- 48 项模型／推理单测通过。56 个实际 Chrome 场景通过，覆盖中英文／明暗／细粗指针／五宽度、0／1／2／7 档、完整长标题、七档真实值、Escape／pointercancel、IME／229、配置版本变化、待回执关闭与后续草稿。长内容截图复核发现标题会把档位文字挤成单字窄列，现允许 header 内容换行，并增加档位文字至少获得阅读区一半宽度的几何断言；修正后截图已复核，滑块仍可见。完整模型 client 的 106 项再验通过。
- 初次迁移把清理旧会话表面的 effect 移到新显式模型请求之后，会在 A→B 与请求同时更新时先打开又关闭 B 菜单。新增真实 client 回归实际失败，日志为 `session-thinking-request-baseline.log`；将清理放在请求之前后，两语言验证 B 模型菜单打开、A 推理菜单关闭及旧预览零写入。这是本次迁移中定位并修正的问题，不能归因于已提交基线。
- 9 项不同的真实 Host 用例分别通过：第一批模型／推理 2、运行中 2、触摸 1，共 5 项；第二批模型／推理 2、空会话欢迎 2、既有空 Session 的共享／隔离分支启动 2，共 6 项。三处依赖旧模型原生 class 的浏览器／原生验收选择器改用可访问 dialog 名称，原模型、草稿、Session／Run 数量、分支、权限与 Goal 目标断言保留。欢迎 fixture 的确定数量关闭预算续跑并使用经过真实路径校验的临时目录清理。
- 范围严格 lint、内容／图标／flow guard、格式、Web build、清单生成／核对和实际生产输入通过。新增脚本中长标题的可选类型已显式检查，完整 typecheck 回到 96 项既有诊断，修改范围无诊断。证据为 `session-thinking-*`；原生 smoke 的选择器已适配，本项没有运行原生 smoke，最终平台验收仍待完成。

权限菜单的 Goal 准备取消需要区分初次焦点与内容恢复：初次打开应进入当前选项，取消成功移除原按钮后应能进入 Plan。Lumen 的 `focusRecoveryRef` 现仅用于已聚焦内容被移除，保留原初次焦点策略；目标必须位于同一 surface、连接、可见、非 hidden／inert／disabled，否则回退原焦点策略。`preserve` 模式和用户后续外部焦点优先，目标引用不会泄漏到 DOM。

- 25 项 Lumen 焦点／composer node 用例通过，120 个真实 Chrome 场景覆盖两语言／主题／指针／五宽度及恢复、后续外部焦点、preserve 三条路径。公共 fixture 首次遗漏显式 dialog 角色，已按公开语义契约补齐；测试用条件 ref 的嵌套表达式也已按严格 lint 修正。包类型／构建／声明、范围严格 lint／格式和限定 API 命令通过；父仓库 fixture／脚本严格 lint、内容 guard、清单及真实构建输入核对通过，完整 typecheck 仍为 96 项既有诊断，修改范围无诊断。证据为 `floating-content-recovery-*`。权限菜单调用方尚待接入，不把公共能力验收记成该菜单已完成。

会话权限／Plan 菜单现由共享 FloatingSurface 承担 body portal、上方左边缘定位、窄屏 sheet、外部关闭、Escape、初次焦点与内容恢复。删除原生 Popover、局部几何／resize、延迟焦点和第二条关闭路径。五个审批值加可选 Plan 是固定的五／六项内容集合；正文承担视口滚动，具名标题阅读区和确认动作横向阅读区留在正文外。延续 [AI 工作台外壳](https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-9) 与 [确认／sheet 表面](https://pro.reactbits.dev/docs/app-ui/app-dialog) 的既有层级，颜色、背景与定位继续由 Lumen 提供。

- 保留原 Session、审批 revision、模式 revision 与 `confirmAllow: true`；选择当前审批只关闭菜单，迟到回执仅关闭原打开意图。取消 Goal 的原按钮在处理中保持焦点和 aria 忙碌状态；成功移除后，公共 `focusRecoveryRef` 恢复 Plan，用户后续外部焦点和已关闭状态优先。确认 Cancel 到 Allow 的导航由本组件内容状态负责，不再注册延迟关闭恢复。关闭后的写入／取消失败反馈可见，原草稿和附件身份保留。
- 95 项审批／Plan 单元和实际 Host 契约用例通过。原生 Popover 在 SSR 中的展开内容断言移入实际 client；关闭 SSR 保留触发器、原归属、加载／未知／失败和恢复入口断言。126 个实际 Chrome client 场景覆盖两语言／主题／指针／五宽度、五／六项及全部不可写状态、失效 Session、长翻译／确认正文／完整标题、键盘／IME、原确认与模式 revision、同选项零写入、关闭／重新打开后的迟到回执、取消 Goal 的成功／失败／已关闭失败／后续焦点和只读核对。另有 12 个 development StrictMode 场景覆盖 Escape、真实 Tab 到 Close 和移除原控制后的 Plan 恢复，均零额外业务写入。
- 初次接入在宽屏沿用公共短菜单默认高度，导致六项菜单中 Plan 行不可见；真实 Host 回归失败。以 `a946cd80` 原组件和 CSS 构建对照后，恢复这组有界内容按视口增长的公开高度 token，并加入已选 Plan 的初始可见断言。只读恢复按钮曾在 Host 数据先返回、本地读取尚未结束时被移除，公共恢复因当时状态落到 Close；实际 client 复现后保留原读操作按钮直至操作完成，再在同一状态更新移除，原选项焦点验收通过。这两项是本次迁移修正的问题。
- 对照还确认三处旧测试差距：`d5da6ed9` 已增加 Sandbox，但 Host 测试仍按五项计数；窄屏 Goal 控件在 `a946cd80` 也受外层工具栏横向阅读区约束，真实焦点可揭示它；`888c0757` 的持久审批写入会推进模型配置报告的同一会话 settings revision，语言夹具却在自己的审批写入前冻结旧 revision。计数与顺序现在明确包含 Sandbox；Goal 用实际焦点验证可见；语言夹具先完整断言只有这次预期 revision 推进，再冻结完整模型配置用于后续只读语言交互，不放宽原身份与状态检查。对照证据为 `session-permission/baseline`。
- 13 项不同的真实 Host 用例分别通过：修正后的权限／Plan 直接选择／Goal 8 项、模式丢失回执 1 项、提议 Plan 的未知退出 2 项、语言控制／命令上下文 2 项；最后语言两项在修正夹具后通过，未把中间失败记为通过。另有四个两语言／主题的阅读弹层用例通过，确认长会话名／不间断路径正文换行、单行动作与原工具栏高度。范围严格 lint、内容／图标／flow guard、格式、Web build 和清单／实际生产输入通过；完整类型检查为 96 项既有诊断，修改范围无诊断。新增恢复条件中的三处可选 Plan entry 已按真实读取边界修正；长确认与实际 Host 菜单截图已复核。证据为 `session-permission/*`，本项未运行原生 smoke。

Schema 展示适配所需的 Lumen 字段基础能力已提交。`LumenFormField` 公开 `layout="rows" | "stacked"` 与宿主 `context` 槽位：字段标签、说明、校验／帮助分别声明内容用途；具名标签阅读区可读取完整单行文本，说明与反馈自然换行，copy／controls 通过 flex 随内容增长并窄屏堆叠。未启用结构槽位的默认纵排仍保留直接 label 结构与原控件 ID／说明关联。

- 10 项 Lumen node 用例通过，其中 6 项验证两语言的横／纵排关联、原无效草稿、宿主上下文、标签点击焦点与默认说明顺序；4 项覆盖组合框的移除／禁用高亮、恢复列表、关闭／重新打开、原查询和零隐式选择。此次维护的 forms 模块原有严格 lint 差距已收敛：补齐可选 undefined、显式控制流；组合框在 render 中条件清除失效的临时高亮，保留原查询与选择契约，不再由 effect 追加一次状态渲染。node 最初错误假定 option DOM ID 使用实体 ID，现核对实际可访问 option 的关联 ID与原回调目标。
- 40 个公开入口 Chrome 场景通过，覆盖两语言／主题／五宽度／两布局、125% 根字体、长标签真实 ArrowRight 阅读、说明／错误不截断、透明字段和嵌套注册控件原关联、编辑／恢复原草稿及实际横排／堆叠几何。320px 长内容截图已复核。证据为 `form-field-*`，本项不代表 Desktop Schema 调用方已完成。
- 包严格 lint、类型／构建／声明、格式、父仓库 fixture 严格 lint／内容 guard／flow guard、Web build、清单与真实生产输入核对通过。完整增量 typecheck 仍为 96 项既有诊断，修改范围无诊断。限定 proptypes／API build 命令通过；现有 API 工具只覆盖 MUI 项目，没有生成 Lumen API 页，公开 props 与 README 已更新。Vale 因可执行文件缺失未能运行，未将其记为通过。

Desktop Schema 展示适配已接入设置工作台和 Storage 两处生产入口。通用 Schema 通过 `SchemaFormPresentation` 的 Form／Field／Feedback／Reset 插槽提供具名标签、帮助、上下文、错误和原字段动作；Desktop 直接使用 `LumenFormField`、`LumenContentText`、`LumenFrame`、`LumenButton`。Schema 包保持独立，不引入 Lumen 依赖。注入展示的各个表单生成独立 ID，注册控件转发 ID 与可访问关联，错误、内容错误和帮助同时指向实际控件。原注册能力、数值 raw、Secret revision、草稿和 intent 仍由 Schema／ViewModel 管理。

- 布局沿用 [ReactBits settings-form](https://pro.reactbits.dev/docs/app-ui/settings-form) 的字段 copy／controls 层级和 [forms](https://pro.reactbits.dev/docs/app-ui/forms) 的标签、校验与恢复动作关系，使用已验证的 Lumen rows／stacked flex 流。表单遵守既有 64 字段容量，内容自然增长，由设置外层面板负责滚动；不增加固定内容高度。
- 32 项相关单测通过，包含两语言的 1／3／64 字段、65 字段拒绝、空投影、重复／失效筛选、原无效数值与局部错误、通用默认展示和原控件 ID，以及设置／Storage 原保存、未知结果和恢复机制。46 个实际 Chrome 场景通过，覆盖两语言／主题／五宽度／两布局、125% 根字体、长标签真实键盘阅读、标签点击、原草稿编辑和重置、列表变更后的原动作目标、同名字段的两个表单独立关联、容量边界最后一项可编辑及无横向页面溢出。320px 长翻译截图已复核。
- 首轮真实 Host 的设置恢复暴露本次迁移的 ID 查找差距：恢复组件仍重算旧全局字段 ID。现通过所属字段上的 `data-control-id` 查找原控件，保留原恢复焦点、完整选项可见性和局部滚动断言；修正后的恢复两项和 Agent 配置两项通过。另有 Storage 两项与全部设置分组的统一内容列两项通过，合计 8 项不同真实 Host 用例。
- 两项 contextual Providers 用例在最后返回会话时未恢复 composer 草稿，未计为本批通过。`b414d9fa` 已记录同一 reading-return 基线差距；本次以 `a1e9eda9` 原 Schema 源码构建真实 Web／Host 对照，仅增加供测试定位的表单标记，保留原字段、ID、回调和生命周期，两项仍在同一步失败。证据为 `schema-presentation/provider-baseline/*`；这不是 Schema 注入造成的回归，后续定位与修正见下方。
- 修改范围严格 lint、内容／图标／flow guard、格式、Web 构建和清单／实际生产输入核对通过。完整增量类型检查仍为 96 项既有诊断，修改范围无诊断。首轮单测的 6 个容量断言错误使用不存在的 Lumen data 属性，改为公开的 `data-text-context` 后全部通过；未把中间失败算作验收通过。证据为 `schema-presentation/*`；本项未运行原生 smoke。

contextual Providers 的已有 reading-return 测试差距已定位并收敛。原定位器把首发 textarea 与会话 CodeMirror 编辑器当作同一输入；隔离更新轨迹显示失败分支没有文档变化／草稿写入。新增输入后的全文断言后，三次重复中的三个失败已提前发生在打开设置之前，而不是返回路径。现在限定真实会话编辑器，使用浏览器逐键输入，并验证原全文和可发送状态，再进入设置。原模型／推理配置、未保存设置、零 run、仅一次供应商默认值写入与最终完整草稿断言均保留。

- 修正后的两条流程各连续三次通过，共 6 次实际 Host 验证；在 `a1e9eda9` 原 Schema 渲染构建上两条也通过。证据为 `composer-draft-return/host-keyboard*`。没有修改生产编辑器、draft 命令或状态投影；先前候选的失焦更新顺序改动未获得完整因果证据，已撤回，不作为生产修复交付。
- 单文件严格 lint、格式和既有 Web 构建通过；完整增量 typecheck 仍为 96 项基线诊断，本测试无诊断。新增断言定位了无效测试前提，没有取消、降低或延后原返回与写入身份断言。Schema 展示的不同真实 Host 验证现合计 10 项（原 8 项加 contextual Providers 两项），重复次数不重复算作不同用例。

Storage 设置的 11 处低层文本已按用途迁移：section 标题／说明、只读引导文件的字段标签与完整 resource 路径、当前使用目录的字段帮助、读取／保存／重启状态与局部失败正文。标题与路径由具名阅读区承接，保存、放弃、核对和重启入口共用具名工具栏横向阅读；正文与字段来源自然换行。五个字段沿用原 Schema／Controller 和 Lumen 字段适配，按实际字段名读取当前目录，不再依赖非空与索引断言。结构继续采用 [settings-form](https://pro.reactbits.dev/docs/app-ui/settings-form) 的分节字段与保存反馈、[forms](https://pro.reactbits.dev/docs/app-ui/forms) 的校验／恢复动作关系，保持现有 Lumen 主题与 flex 内容流。

- 10 项现有控制器、恢复和真实 Host 契约单测通过。28 个实际 Chrome client 场景通过，覆盖两语言／主题／五宽度、125% 根字体、长标题与长路径真实键盘横向阅读、单行动作与无页面横向溢出、原字段编辑／保存、读取中无伪字段、读取失败恢复、保存冲突后的原草稿、未知保存后较新编辑和原 operation ID／输入重试。另验证既有 4000 字符目录边界与 4001 字符无效 raw：全文保留、错误就近显示、禁写且零请求，恢复有效输入后原保存仍可完成。字段为固定的五项元数据，滚动由设置窗格承担；未添加动态列表或固定内容高度。
- Storage 保存／刷新恢复与全部设置分组内容列共 4 项真实 Host 回归通过；320px 长翻译和未知结果后的较新草稿截图已复核。最初浏览器夹具在 about:blank 运行，未满足 Controller operation ID 所需的安全上下文；改为隔离 localhost origin，并在入口检查 `crypto.randomUUID` 能力。夹具使用真实 Controller 与受控纯内存端口，模拟的读取／保存失败不冒充真实 Host 验证；结束时取消读取、卸载与释放 Controller，等待临时服务器关闭。证据为 `storage-settings/*`。
- 修改范围严格 lint、内容／图标／flow guard、格式、Web 构建与清单／实际生产输入核对通过。两次完整增量 typecheck 进程异常退出 253 且未产生诊断，未记作通过；随后使用相同完整项目的冷启动类型检查（禁用增量并显式设置 Node heap）得到既有 96 项诊断，修改范围无诊断。没有据此推断增量异常的具体原因。本项未运行原生 smoke。

设置工作台与字段内容恢复的 17 处低层调用已分类。字段来源／覆盖／继承／生效方式／只读提示使用 form.help，字段上下文和继承动作由 LumenFrame 组合；导航使用 navigation.caption，分组标题与说明使用 section 槽位，固定范围使用 metadata，加载与保存状态／错误使用所属反馈槽位。完整单行标题与固定范围在具名阅读区展示，保存／核对／刷新动作在页脚具名工具栏横向阅读，状态正文保持自然换行。删除外层为文本角色重复设置的字号与行高，消费 Lumen 排版。保留 [settings-form](https://pro.reactbits.dev/docs/app-ui/settings-form) 的导航／范围／字段／保存层级与 [forms](https://pro.reactbits.dev/docs/app-ui/forms) 的校验／恢复关系。

- 49 项设置内容、恢复、ViewModel、公共表单兼容和 Providers runtime 测试通过。旧 view 测试来自 `ff44d6d5`，仍假定 thinking 是 input 与旧全局 ID；`e16aa54a` 已迁移为受控 ToggleGroup，本次 Schema 又提供实例 ID。现在按实际 radiogroup 检查唯一原字段、禁写状态和原内容说明关联，不取消可访问状态断言；实际 Host 恢复仍保留完整焦点与可见性检查。
- 40 个真实 Chrome 场景通过，覆盖两语言／主题／五宽度／125% 根字体、长翻译、layered／fixed scope、标题与范围完整键盘阅读、长来源自然换行、页脚单行动作实际横向滚动、失败读取后的原字段恢复和零保存请求。fixture 通过公开 settings DTO schema 解析由宿主注入的报告，不把内部 readonly resolution 直接作为传输对象；清理卸载与 runtime 均有等待路径。截图已复核。相关模型选项仍由原动态内容查询决定。
- 6 项真实 Host 回归通过：两语言的局部内容失败恢复、全部分组统一内容列和 contextual Providers 的原草稿／配置返回。严格范围 lint、内容／图标／flow guard、格式、Web 构建和清单／真实生产输入核对通过。初次类型检查新增一项测试 DTO readonly 不匹配，公开 schema 解析修正后冷启动完整检查恢复至 96 项既有诊断，修改范围无诊断。证据为 `settings-workspace/*`；本项未运行原生 smoke。

Lumen outlined 动作的持久选中边框已补齐。`LumenButton`／`LumenIconButton` 从 `aria-pressed=true` 使用原动作前景的实线边框，未选中仍使用半透明边界，不增加 props、选择状态副本或宿主配色。实际 General 选项原有 CSS 规则被公开主题 outlined 规则覆盖；以 `d44eacc2` 原 General 两个源文件构建真实 Web／Host 对照后，等色边框失败仍存在。页面提高优先级与修改 primary 含义均非必要，使用公共 pressed 状态即可。

- Lumen 包类型、构建／声明、格式与 flow guard 通过。General 进行中的实际 Chrome 验证增加指针离开后的选中／未选中边框断言，26 个两语言／主题／五宽度场景全部通过；General 完整调用方迁移和真实 Host send／zoom 尚待下一提交验收，此处只记录公共样式基础能力。原语言键盘对照也在 End 导航处失败，后续恢复与控件迁移保留全部原断言。证据为 `general-settings/*`。

General 的 33 处低层文字已按用途分类：章节标题／说明、设备与字段帮助、表单 legend、选项标签／说明、缩放指标和读取／保存／恢复反馈。语言的固定三项使用受控 LumenToggleGroup，公开键盘导航与焦点由 Lumen 管理；发送的固定两项沿用原受控 LumenButton 与 Host 设置契约。单行标题、legend、选项由所属具名阅读区承接横向阅读，说明正文自然换行；legend 自己约束 intrinsic 宽度，避免原生 fieldset 的 legend 脱离父级 overflow 约束。语言保存重试移除原按钮后，只在原 controller／preference 仍匹配、焦点回到 body 且实际选中控件可见时恢复焦点。删除页面的选中配色与焦点覆盖，消费 Lumen 公共状态。结构沿用 [settings-form](https://pro.reactbits.dev/docs/app-ui/settings-form) 的分节字段与就近保存反馈，以及 [forms](https://pro.reactbits.dev/docs/app-ui/forms) 的标签、帮助和恢复关系。

- 27 项既有语言、General、缩放与发送控制器测试通过。26 个实际 Chrome 场景通过，覆盖两语言／主题／五宽度、125% 根字体、长标题与 legend 真实键盘阅读、语言 roving focus、保存恢复、原 storage key／偏好、发送未知结果的相同 operation ID／revision／输入重试、缩放边界 0.5／2 与重置，以及指针离开后的公共持久选中边框。字段与选项数量固定，外层设置面板负责纵向滚动，未引入伪列表或固定内容高度。320px 明暗长翻译、错误与选中状态截图已复核。
- 5 项真实语言流程通过，包含原会话、文件与未保存外观在两窗口间的身份保留，以及离线、损坏本地值、诚实写入失败、重试和键盘导航。原 `d44eacc2` General 对照在 End 键盘导航处失败；本次使用公共 ToggleGroup 并恢复原重试移除后的所属焦点，保留原断言。夹具关闭独立 Host 后校验真实临时根与前缀，再释放数据，并禁用无关 budget 自动继续。
- 10 项真实 Host send／zoom 流程通过：两语言的 1440／320px 下，保留 IME、单次提交、原 session／Host／附件／草稿、原 revision、发送方式切换与回读、保存失败／未知／重试、缩放键盘／滑块边界与同 origin 刷新持久化。冻结生产资产通过原文件名和 SHA256 校验。中间窄窗超时源于测试在设置布局加载前错误选择隐藏桌面导航，现等待实际设置表面与可见入口；原 Sidebar 激活关闭后等待真实会话输入，避免操作 inert 区域。截图断言先移开指针再等待动画结束，测持久选中状态，保留选中／未选中边框和背景差异断言。证据为 `general-settings/host-send-verified.log` 与 `send-verified/*`。
- 修改范围严格 lint、内容／图标／flow guard、格式、Web 构建与清单／实际生产输入核对通过。冷启动完整 typecheck 仍为 96 项既有诊断，修改范围无诊断。公共 pressed outlined 基础能力在 Lumen `3740b3d67d`／父仓库 `fb275641` 独立提交；本项验证其实际调用方。原生 zoom／平台 smoke 仍属于后续平台验收，浏览器 CSS fallback 不作为原生验证。其余证据为 `general-settings/*`。

LumenToggleGroup 的可选 `selectionVariant="contained"` 公共呈现已补齐，默认 subtle 保持原半透明选中效果。contained 从原主题前景／反差色得到实心选中背景与文字，选项详情继承反差文字；强制颜色使用 Highlight／HighlightText。单选、复选、原 ID、受控值、键盘与原生 validation 路径继续复用，未添加第二份选择状态。外观设置移除本地 selected 配色后，原 opacity=255 验收得到 36；通过公共呈现选项保留原实心状态要求，无需降低原对比度或透明度断言。

- 包严格 lint、typecheck、构建／声明、格式和 flow guard 通过。修改组件的既有 26 项 lint 差距按原规则收敛：补齐条件块、按公共包约定显式声明 optional undefined，并拆解两处嵌套条件，保留原判断结果。父仓库 29 项原选择组／外观状态测试、30 个实际 Chrome 场景、6 项真实 Host 外观流程通过；两项主题流程加入强制颜色下实心背景与 4.5:1 对比度断言后再次通过。外观调用方的完整内容分类在下一提交记录。限定 proptypes／API build 命令通过，现有工具只生成 MUI 文档，Lumen 契约写入 README 与公开声明；既有 Vale 不可用限制未记为通过。证据为 `appearance-settings/*`。

当前已提交清单覆盖 146 个生产 TSX 模块、3680 个元素，其中记录了 625 处低层文字未分类，合计 643 项静态缺口。其余生产表面迁移、原生文案同步和最终浏览器／原生回归尚未完成。后续按独立子功能验证并立即提交，在此记录当前证据与剩余要求。清单的 composed / semantic 状态只证明静态边界，不代表内容、容量和交互验收已通过。
