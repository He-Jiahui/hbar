# 验证说明

## 自动测试

`bun run check` 串行运行严格 lint、类型检查和 Bun 测试。覆盖组件库以及 Pi 流式循环、真实 pi-ai HTTP 协议适配、工具成功/失败、批准/拒绝、幂等队列、取消、插件依赖与作用域、卸载释放、压缩与分支、配对与 Origin、设备撤销以及崩溃后的未知副作用恢复。

`bun run lint` 固定使用根配置与 `tsconfig.eslint.json`，覆盖 hbar 源码、脚本、测试、配置和已声明 workspace `hbar-ui/packages/lumen-app-ui`。子模块内未接入 hbar workspace 的 MUI 上游包、文档和示例由其独立工程检查负责，不混入 hbar 的检查项目；生成产物仍排除。入口为类型感知 ESLint 显式分配最多 8 GiB Node 堆，避免默默依赖终端环境变量。`tests/lint-workspace-coverage.test.ts` 检查根 TypeScript 范围、Lumen 源码 / 构建配置均被覆盖，并保持同一套严格规则。

崩溃测试启动额外 Bun 进程，在已提交工具意图且实际写入完成、结果尚未提交时终止进程，重新打开同一数据目录，检查 WAL 历史和 unknown 结果，不重放调用。它不宣称覆盖所有磁盘故障或断电场景。

### 定向测试路径与审计浏览器探针

定向运行具体测试文件时使用 `./tests/...`，不要省略 `./`。Bun 将未带路径前缀的参数视作名称过滤器，会递归发现工作区测试；审计产物较多时，这会把发现时间误认为测试或编译卡住。具体文件路径可以避免这次全树发现，测试断言不变。参见 [Bun 测试运行器说明](https://bun.com/docs/test)。

```text
bun test ./tests/reactbits-pro-audit.test.ts ./tests/reactbits-pro-audit-browser-state.test.ts --timeout 20000
```

审计浏览器状态探针独立在 `reactbits-pro-audit-browser-state.test.ts`。两个用例共享一次 Chrome 启动/关闭，各自使用独立 BrowserContext/Page，并在 `finally` 中释放 context；复用进程不复用 DOM 或状态。行为测试仍各有 20 秒预算，进程生命周期 hook 单独有界于 30 秒，不删除原有的 checkbox/switch/select/progress/meter 断言。此调整修复了相关提交 `20aeb93` 的 fixture 在完成功能断言后因 Chrome 退出仍占用单测预算而超时的问题，不改变生产捕获协议或来源验收标准。

协议 17 的静态视口／内容范围回归另见下面两个定向文件：真实 DOM 区分 hidden 裁切、最近 pane 滚动、更高层不能解除近层裁切、viewport 隐藏和非渲染内容；本地 PNG fixture 确认等尺寸视口直接比较，不把 692px intrinsic root 缩放成 640px 视口。来源或本地不可达区域是独立硬门禁，即使图片相同或存在签核也不能覆盖。Chrome 和临时目录都在有界生命周期中释放；这些测试不代替现场来源证据，也不增加按钮×布局回放。

```text
bun test ./tests/reactbits-pro-content-geometry.test.ts ./tests/reactbits-pro-static-canvas.test.ts --timeout 20000
```

`bun run build && bun run test:e2e` 使用 Vite preview 和 Edge/Playwright，覆盖无 Host 时的中英文桌面/窄屏外壳、Ctrl+K 本地命令目录、命令关闭后的导航、刷新、旧 localStorage 隔离和明确失败状态。真实临时 Host 场景覆盖选择会话、文件 compare-and-write、通用 descriptor 预算表单、发送/审批/取消、可靠 Usage、真实工具结算/并发/耗时统计、三层设置动态内容、ProviderDialog 凭据保存、Session Monitoring、子 Agent、目标/计划、扩展/技能以及 Performance/Usage/Git 状态中心。连接 Host 后还会切换到 390×844，逐项重开上述工具，检查水平溢出和 AppSidebar/Main 几何重叠。组件库的受控交互测试和独立预览验证脚本继续保留。

专注工作流的验证矩阵和定向命令见[专注工作流](workflows.md#迁移与验证)。`tests/compiled-cli.test.ts` 真实编译 standalone CLI，检查内嵌 Host、原生查询、Workflow、隔离补丁以及 Windows 进程拓扑；`e2e/workflow-focus.spec.ts` 用真实 Host 检查桌面和窄屏的单一 Agent Plan、当前焦点、显式人工模式与 Evidence 回读。

`bun scripts/desktop-smoke.ts` 需要先构建 Host 资源和 debug Tauri 程序；自定义输出目录可用 `HBAR_DESKTOP_EXE` 指向实际程序。它会启动真实原生窗口，不是无窗口检查。使用前确认允许本轮临时原生验收，不安装或重启现用桌面。

工作台分隔条的定向原生回归使用 `bun scripts/desktop-layout-resize-smoke.ts`，也可通过 `HBAR_DESKTOP_EXE` 指向构建程序。
它使用独立临时 profile 和真实 WebView，比较拖动预览、松手、保存和刷新后的 CSS 像素宽度，覆盖两侧边界、原生缩放、根字号、
键盘调整、Esc 取消、窗口变窄后恢复和未发送草稿；不创建模型 Run。最新结果及现用 Host 的前端资源核对见
[工作台尺寸验收](workbench-resize-verification.md)。

命令阅读核心回归使用 `e2e/session-command-reading.spec.ts`：真实临时 Host 的本地
只读 stdout 命令，经原工具审批后核对同一 Run、首 12 行与完整展开、OS clipboard
原文回读、原始参数和未发送草稿。`session-tool-presentation-browser.spec.ts` 的
单条 command reading 用例用真实 React／presenter 验证 pending → success → error
内容变化与键盘焦点，不启动 Host 或执行工具。原生 smoke 另以 SDK 启动 owned
fixture Run、不消费原 composer 草稿，再从真实 UI 批准并检查阅读／Copy 反馈；
不把原生反馈等同于 payload 回读，不扩展成逐按钮／尺寸矩阵。实际结果见
[命令阅读交付](desktop-command-reading.md)。

脚本通过临时 loopback WebView2 调试端口、独立 profile 和独立项目驱动真实 Tauri 窗口，检查原生自动认证及 Host 数据根确为临时目录。核心路径从没有活动标签的首页开始：选择项目、mock 模型和 high 思考等级，准备 Goal 并选择 Plan；首次 Send 只创建一个 Session / Run，真实计划审批恢复原 Run 且保留未发送草稿。侧栏显式 New session 是另一条入口：在当前项目立即创建会话，再返回原会话核对草稿；不能将两者混为首次发送才创建。入口依据见 [入口审计](desktop-entry-audit-2026-09-26.md)。

脚本还检查行内重命名、模型浮层、Add 菜单的原生 file chooser、文件工具、外观保存／刷新／恢复默认，以及默认窗口和原生 900×600 内窗的内容对齐与 sidebar flow。外观导航核对当前 Lumen 的选中语义和可见背景，不要求已被共享组件替换的旧伪元素。关闭隐藏、退出桌面后 Host 存活和独立 SDK 取消继续保留。不存在的旧意图按钮不再通过空循环冒充已验证；失败时保留脱敏截图、页面文本和临时 Session 的 Host 事实，不能把脚本通过单测等同于原生流程通过。

profile 和项目分别使用系统 temp 下本脚本创建的直接子目录，项目不放在受保护的 Host 数据目录中；文件步骤必须列出并读取真实临时文件正文，不能只检查面板出现。插件设置重载后，还要在原 Files 搜索未展开目录中的文件，核对实际键盘焦点、打开正文与返回保留查询，防止仅列表可用掩盖搜索服务失效。连接文件先校验 URL／PID／实例字段，终止 Host 前核对其命令行的精确 data-root 所有权。失败日志隐藏临时 token 和配对码。调试端口只由该测试进程的环境变量启用，常规桌面启动不启用。纯边界检查可运行 `bun test ./tests/desktop-smoke-fixture.test.ts --tsconfig-override ./tsconfig.json`，不会启动原生窗口。此单测通过不代表 native smoke 通过；最新实际执行状态见 [UI 同步记录](desktop-ui-synchronization.md)。

Skills 的核心回归使用 `e2e/extension-skill-detail.spec.ts`：真实隔离 Host 发现 21 个技能，列表第二页进入详情，读取入口正文及分页后的参考文件，切换 Plugins 后回到同一技能详情，再返回原筛选／页码／键盘行焦点和未发送草稿。只跑英文桌面与中文窄屏两条代表性完整路径，不增加按钮乘视口矩阵。原生 smoke 另在 owned profile 放置一份只读技能，核对 900×600 内窗的概览／文件／返回；本轮实际通过与否以执行记录为准，不把脚本中存在断言算作已验收。

Provider 上下文默认回归使用 `e2e/provider-context-default.spec.ts`：真实 Session／Workspace
设置的 dirty thinking → Host-owned Providers → 单字段 global default → 返回原 layered
scope／draft → 返回聊天草稿。中文 Workspace 另保留真实显式 model／thinking 覆盖及本层
revision；WebSocket 只观察并转发 Host 写入，不伪造响应。原有 global 入口仍由
`e2e/provider-global-default.spec.ts` 独立验证。原生 smoke 另走 Session 设置路径，核对
Host 全局事实、原显式选择与 dirty draft；不知道结果时的精确 receipt 和离开入口前禁止
派发由运行时回归覆盖，不冒充 native 故障注入。实际结果见[上下文默认交付](desktop-provider-context-default.md)。

Markdown 文件阅读回归使用 `e2e/file-markdown-reading.spec.ts`，只保留英文桌面与中文
窄屏两条完整路径：真实 Host 的阅读／源码／编辑／显式保存、本地链接与原稿返回。
`tests/file-markdown-preview.test.tsx` 覆盖空、单项、长内容与 UTF-8 容量边界，以及不
加载图片、不执行 HTML 和相对路径策略；runtime 回归保护 UUID／draft／unknown。
旧 `file-preview-tabs.spec.ts` 显式进入 Source，只比较真实代码行，不把行号控件当正文。
原生 smoke 另读取 owned Markdown、切源码、打开链接并返回；实际执行结果见
[Markdown 阅读交付](desktop-file-markdown-reading.md)，不是脚本存在断言就算通过。
这不新增 Browser 或 Markdown 图片资源服务。

Mermaid 阅读回归见[图示交付](desktop-mermaid-reading.md)：`e2e/markdown-diagram.spec.ts`
用实际组件与本地合成内容走图示／源码／Copy／大图／缩放／平移／Find；无 Host 或
Provider，不能冒充真实文件读取。`e2e/file-markdown-reading.spec.ts` 与原生 smoke
另从实际 owned Markdown 读取图示，保留原编辑保存和草稿往返；执行结果单独记录。

该阅读路径还真实回读代码块剪贴板，确认折叠 Copy 包含完整代码、展开／收起保焦点，
真实滚动后第 25 行 Range 位于代码自身 pane 内。`code-block-copy-lifecycle.spec.ts`
使用同一受控夹具的 Files 模式复核迟到结果、双块身份、失败重试和 owner 变化；
它是注入剪贴板的组件验证，不冒充 OS clipboard 或真实 Host。原生 smoke 另在实际
文档代码块点击 Copy 并确认反馈，payload 的逐字回读与故障注入范围由独立测试负责。

代码语法阅读见[交付说明](desktop-code-syntax-reading.md)。定向 grammar／容量／Abort
回归在 `tests/markdown-code-highlight.test.ts`；既有 Copy fixture 另用实际 renderer
验证流式原文、跨折叠注释、token 插入后的 active Find 自动重映射和完整 Copy。
真实 Host 与原生 smoke 保留原文件往返，仅补语法角色断言，不增加按钮×尺寸矩阵。

测试使用临时目录，测试用假凭据独立于真实模型配置。pi-ai 的网络集成测试对接本地 SSE 服务器，不对商业供应商发请求。真实供应商认证、供应商限流、商业计费、多型号手机硬件和复杂 VPN 拓扑仍需要部署环境验收。

## 性能基准

Goal、Agent Plan、双预算、自主续跑和异常恢复的语义与当前验收边界见 [Session 自主执行](session-autonomy.md)。其中严格区分确定性测试、真实模型实验、预算停止和未通过的仓库级门禁。

`bun run bench` 在当前机器生成 10,000 条持久消息，通过真实 HTTP/WS Client SDK 获取 60 条分页快照，再启动 8 个并发 Session、完成 5 轮取消，每次确认运行结算。

输出 `artifacts/benchmark.json`，包含机器配置、时间、运行时、样本量、p50/p95/max、快照载荷和 Host RSS。取消指标从 Client 发出取消命令计时，到 Host 的 JSON-RPC 响应到达为止，不是所有外部副作用已经停止的延迟。目标为 p95 < 100ms。

首次记录，2026-09-08 UTC，本机 Bun 1.4.0、Windows、Ryzen 7 7700X、16 逻辑处理器、31 GiB 内存：

| 指标              | 结果         |
| ----------------- | ------------ |
| 并发会话          | 8            |
| 取消样本          | 40           |
| 取消受理 p95      | 1.37ms       |
| 60 条历史分页 p95 | 7.65ms       |
| 快照 JSON         | 25,799 bytes |
| Host RSS          | 184 MiB      |

这些数据使用 Local fixture，排除模型网络时间，只是当前实现与机器上的基线。旧浏览器套件曾检查历史虚拟化与后台运行隔离；当前外壳没有会话页面，将在新页面接入后恢复相应验证。

## 手动检查

以下业务 UI 检查适用于已接入页面的人工补充验收和后续面板：

- 两个已配对客户端查看同一个 Session，在一端提交、另一端审批；退出其中一个界面不应中止 Host。
- 开启真实模型后验证该供应商的推理、图像输入和工具协议能力；能力声明不支持图片时应明确失败。
- 中文输入法组合期间 Enter 不提交，组合完成后才按常规键盘行为发送。
- 拖动停靠布局、调整分栏、切换标签后刷新；手机应保持单面板、附件与长代码不撑开页面。
- 在普通 LAN 上，确认 Windows 防火墙允许所选端口；在其他网络通过 VPN 或 TLS 配置访问。
