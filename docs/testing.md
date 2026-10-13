# 验证说明

## 远程节点验证

远程节点的 CLI、公开发现、设备配对、权限和恢复边界见[远程工作区节点](remote-nodes.md#当前-cli-工作流与交付状态)。从仓库根目录可运行以下聚焦验证：

```powershell
bun test --timeout 60000 tests/node-console-cli.test.ts tests/node-console-client.test.ts tests/node-console-host-observation.test.ts tests/cli-service-entry.test.ts
bunx eslint apps/cli/src/node-console-attach.ts apps/cli/src/application.ts apps/node/src/cli.ts apps/node/src/control-server.ts apps/node/src/main.ts packages/contracts/src/node-info.ts tests/node-console-cli.test.ts
```

`node-console-cli.test.ts` 启动真实临时 A Host 与 B 节点，确认 A 的 `GET /node-info` 是硬 404、B 返回严格公开描述；同文件另验证 B 本机配对命令产生八位、五分钟邀请。`node-console-client.test.ts` 使用真实 B HTTP 服务验证 observer 配对、根目录范围和只读拒绝。`node-console-host-observation.test.ts` 在真实 A-B 连接上验证受限会话观察、设备撤销及公共 HTTPS listener 的 Host/Origin 约束。上述测试使用临时数据根，不访问生产会话或商业模型。命令列表仅说明当前定向覆盖；提交前仍须按本仓库要求执行实际适用的 lint、typecheck、基础测试和构建门禁，并分别记录结果。

本轮 Linux WSL2 真实 managed A/B 验证另覆盖了 A 使用 `--no-local-exec`、远程 workspace create/read/write 和同 Session worktree reuse；`tests/runtime-execution-host-node.test.ts` 的远程 Git 查询在 B 创建隔离 worktree 后同时读取 `main` 与 `feature/remote-e2e`，1 项通过、19 个断言。`tests/node-worktree-production.test.ts` 的生产组合测试覆盖 B 侧 create/get/reuse/remove，并以本机确认与 launch-target provisioning identity 约束操作；专项结果为 25 个断言通过。`tests/node-workspace-mount-execution.test.ts` 验证 B 进程使用与挂载文件系统/查询一致的 root alias；mount 契约和 Storage 持久化共 32 项已验证。该 UI 提交的 `e2e/workspace-location-picker.spec.ts` 真实 A/B save/remove/reopen/reload 与 Host folder get 为 1/1（26.4 秒）；验证只读 root 创建、固定位置、同节点 folders、重叠禁用和独立 observer 只读控件。49 字符英文 root 名称在 390px 下换行且无溢出；人工检查覆盖 picker/folders/observer 的 390px 与 created 的 1440px。没有验证中文 workspace 浏览器流程或 Windows process 正向能力。remote `shared-branch` 在 Kernel 入队前由 `REMOTE_SHARED_BRANCH_UNSUPPORTED` 拒绝；`shared-current` 与 `isolated-worktree` 可用。B 本机受保护 allocator remove 已验证；A 自动释放 worktree reference 当前明确不支持，尚未接入 Storage 原子释放。Workspace UI commit `720b7b2c10ebd0f8a7b21731a0b0129d155e9aba` 的 strict TSC 3,658 文件、25 个 typed lint 文件 0 warnings、7 个 model/runtime/SSR suites 46 项/270 assertions、41 个临时 React links 恢复、内容/icon/flow guards 及 Web build 均通过。最终 Root `bun run check` 已通过，完整结果见下文。

平台能力按实测记录，不从测试桩推断系统保证：Linux WSL2 上的 bubblewrap managed backend 完成真实隔离 A/B 执行验证；Linux B 端布局、隔离契约和容器计划等四组测试共 22 项通过；容器部分仅验证计划与失败拒绝，本机没有 Docker/Podman 引擎，未执行 live 容器隔离验收。Windows 最新原生构建和探针使用默认配置、未设置 HBAR 覆盖，16 项测试共 52 个断言；filesystem 与 processTree 为 true，network=false、available=false，nonce handshake exit 45。因此需要网络隔离的执行仍失败关闭，没有 Windows 网络隔离正向证据。macOS/Seatbelt 未在 macOS 实机验证。跨端 bundle 使用 contracts portable SHA-256 实现，`tests/contracts-sha256.test.ts` 覆盖标准空串、ASCII、UTF-8 和多区块 known vectors；浏览器 build 不再 externalize `node:crypto`。这只证明哈希实现与打包兼容性，不构成一般安全性或平台隔离声明。不得把缺少某平台运行环境标成跳过后通过，也不得将结果外推到其他系统配置。

提交 `53f789cb` 的远程运行时 strict TypeScript index/TSC 覆盖 3,642 个文件；另有 73 个改动文件通过类型感知 lint，0 错误、0 警告。该提交当前记录的定向测试集为 93 pass、1 个 Linux-only skip、0 fail、601 assertions；Host/Kernel 六项修复测试通过，Provider diagnostics 46 项、671 assertions 通过。恢复夹具修复单独提交为 `924717e2`，夹具 SHA-256 为 `00719d9a62d2683e342b61f35a0ff1182d1fc2bf5630e4253f47d70ecb7013ad`；该历史运行时 revision 的真实 Linux A/B 验收通过实际 SIGKILL、B grace cleanup、A 重启后 `EFFECT_UNKNOWN` 结算及单次执行检查：1 项测试、6 assertions、66.37 秒通过。最初失败是夹具使用 B 私有 `/tmp` 看不见的绝对路径；改用 B workspace cwd 相对路径后通过，没有修改该 revision 的生产恢复代码。当前最终生产图上的恢复与其它 live proof 另有下文验收，不把历史结果跨 revision 外推。

输出 UI commit `65479dd3` 使用 strict index 3,643；13 个输出 UI 文件及 10 个 fixture 文件的 typed lint、36 项单元测试（405 assertions）、受影响 fixture 86 项（1,021 assertions）和 Web build 均通过。受控真实浏览器输出 fixture 在英文/中文及 1440/390 视口组合下 4/4 通过，并经人工检查。B Console UI commit `239b5160` 的生产构建、内容/边界 guards、7 个格式文件和 E2E 1/1 通过；准确的 typed lint 范围为 6 个 TS/TSX 文件。这些数据记录对应提交的定向验证；最终全量门禁结果见下文。

A Nodes Settings UI commit `633d20033623398515b57fba288e8f708c349440` 通过 strict TSC（3,575 文件）、定向类型感知 lint（0 warnings）、7 项测试/35 assertions、内容 guard、icon guards（3 个 icon 文件）、格式检查和生产构建。隔离端口 4330/4318 的 3 项真实 Nodes Settings E2E 覆盖分页、撤销、observer、剪贴板及 reload 后分组恢复；1440px 与 390px 视口经人工检查。

首次 Root `bun run check` 的 lint 在扫描 3,984 个文件、63 批后停止：仅 `tests/node-websocket.test.ts:165` 和 `tests/runtime-node-link-process.test.ts:173` 各报 1 个错误、0 警告，均为未等待 `protocol.dispose()`。历史变更 `1f30dc3d` 将 `WorkspaceNodeProtocol.dispose` 从同步 `void` 改为等待 `terminal.dispose()` 的 `Promise`，旧夹具提交 `583f14ea` / `e8a0c3b9` 未补 await。两处修复由独立 fixture-only commit `9018bdd3a7d03d0985c91e28ea66c052e5a912fe` 提交；两文件 typed lint 0 错误、Prettier 通过，8 项测试/29 assertions/0 fail（4.46 秒）通过。

之后 Root 全仓 lint 3,984 文件/63 批 exit 0，全仓 TSC `--noEmit`、sandbox evaluator、theme-token checks 均 exit 0。首轮完整 Bun 基础测试覆盖 1,037 个文件、6,644 项、68,739 assertions，耗时 2,202.19 秒：6,614 pass、11 skip、19 fail、1 error；这是历史失败结果，不是最终复验。Lumen 独立运行 5 个文件、84 项全部通过（13.16 秒）。针对 19 个首轮失败，已完成生产修复或获得隔离通过证据：runRow optional-field canonical JSON 修复为 worker commit `271b1f2d`；其他修复提交包括 `485a29ad`、`e4317f0e`、`65bcd8be`、`cc526da3`、`1f35042f`、`b1049128`、`d0bfcb6d`、`ae9688a8`、`70435b58`、desktop 端口冲突 preflight `b6071ab7`，以及 7 条 UI 路径的 public Lumen wrapper 修复 `2d065833`。CLI 每例 45 秒、Host A/B 每例 60 秒；专项测试为 remote guard 6/59、runtime-startup 1/35、router 1/33、runtime Host-node 2/12、CLI patch 1/21；隔离 geometry 6/36、Host restart 1/13 通过。

最终 UI 定向验证中，boundary/component 8 文件共 51 项/1,412 assertions，terminal model/client 7 项/23 assertions，flow 5 项样式检查和 Web build 均通过；生产 B console E2E 1/1（12.3 秒）。真实 UI E2E 共 7 项/57.5 秒（Nodes Settings 3、workspace 1、terminal 1、runfile 两种 locale），当前 390px 与 1440px 截图均经检查。最终 CLI standalone build/help 通过，SHA-256 为 `60E8EDF0548CAAFFA2B7E47029C8F0218A14669125E0DD1241FD954868B6A5A9`，对应 build metadata HEAD `70435b58`。最终 Root TSC 与剩余 17 个 TS/TSX 文件的 scoped typed lint 通过；worker 在提交前已通过 strict 与 typed lint。

当前最终生产图 Linux live proof 使用精确源码 commit `2d0658338e0ccf2bd2b0d980b3238aaae9ad149f` 的 git archive，archive 仅排除 3 个本地修改文档；B worker Git blob `051244bf9e2d78d169ecc6f830cf9b569a220f3a` 的 archive SHA-256 为 `d796e5b37e652dc0c3fc336e4496da6c2172bcc22d8a7007f81dc225841be2f9`。Ubuntu 24.04.3 WSL2、Bun 1.4、bubblewrap 0.9.0 上，B worktree 1 项/25 assertions，B layout 4 files/22 tests/81 assertions（容器部分仅验证 plan/fail-closed），Host/Kernel/B-worktree 2 项/26 assertions，真实 SIGKILL/grace/restart/`EFFECT_UNKNOWN`/no replay recovery 1 项/6 assertions；合计 26 项/138 assertions，命令均 exit 0。恢复夹具使用已提交的 `924717e2`，未打本机补丁。manifest SHA-256 为 `17ae4ed51aaab3a3077e7f4196b2f756c5a67fdabcf1a540b9f45ac1e1190506`；验收方核对了 manifest 与四份日志。

最终 Root `bun run check` 在实现 HEAD `2d0658338e0ccf2bd2b0d980b3238aaae9ad149f` exit 0，完成时间为 2026-10-13 09:21:18.3893120 UTC。全量 lint 覆盖 3,984 文件/63 批，strict TSC、sandbox evaluator 与 theme-token checks 均通过。基础测试覆盖 1,037 文件、6,643 项、68,841 assertions，耗时 1,845.84 秒：6,632 pass、11 skip、0 fail；Lumen 为 5 文件、84 pass（12.05 秒）。11 项均按当前 Windows 平台条件跳过，其中 3 项是 Linux 容器路径与计划测试，其余是受管执行及 worktree 测试；上面的 Linux 26/138 proof 不代表这些跳过项都已重跑。容器在 Linux 上只验证了 plan/fail-closed，本机没有 Docker/Podman 引擎，未执行 live 容器隔离验收。首轮 6,614 pass/11 skip/19 fail/1 error 是已修复后的历史结果；fresh rerun 已清零失败。41 个 peer React links 均按原样恢复。

Terminal UI commit `b502af7383905f5510aeb34b4b2419a0e6781d13` 通过 strict TSC（3,648 文件）、11 个文件类型感知 lint（0 warnings）、12 项模型/Client/HostRPC/shell boundary 测试（56 assertions）、content/icon/flow guards 及生产构建。operator local PTY E2E 1/1 通过、9.5 秒；结果行、焦点、关闭和无溢出通过，1440/390 视口由 parent 人工检查。该浏览器验收使用 Host local PTY；B remote auth/routing 由独立 HostRPC public test 覆盖，不代表 remote PTY browser 验证。

Workspace UI commit `720b7b2c10ebd0f8a7b21731a0b0129d155e9aba` 的真实 A/B Playwright E2E 1/1（总计 26.4 秒，测试本身 21.8 秒）通过。覆盖只读 root 创建、固定 workspace location、同节点 folders 保存/删除/reopen 并经 Host `folders.get` 回读、overlap disabled 和独立 observer readonly controls；49 字符英文 root 名称在 390px 下换行且无溢出。父代理人工检查 picker/folders/observer 的 390px 与 created 的 1440px。该提交还通过 strict TSC（3,658 文件）、25 TS/TSX typed lint 文件 0 warnings、7 个 model/runtime/SSR suites 46 项/270 assertions、41 个 temporary React links 全部恢复、content/icon/flow guards 和 Web build；没有新增 Prettier 失败，3 个既有基线失败仍在 App、web-session-host、app-runtime/index。没有中文 workspace browser 或 Windows process positive proof。

贡献者可先看 [Wiki 的测试与验收](wiki/Testing.md) 选择检查；本页记录完整的自动化覆盖和性能基线。

## 自动测试

`bun run check` 串行运行严格 lint、类型检查和 Bun 测试。覆盖组件库以及 Pi 流式循环、真实 pi-ai HTTP 协议适配、工具成功/失败、批准/拒绝、幂等队列、取消、插件依赖与作用域、卸载释放、压缩与分支、配对与 Origin、设备撤销以及崩溃后的未知副作用恢复。

`bun run lint` 固定使用根配置与 `tsconfig.eslint.json`，覆盖 hbar 源码、脚本、测试、配置和已声明 workspace `hbar-ui/packages/lumen-app-ui`。子模块内未接入 hbar workspace 的 MUI 上游包、文档和示例由其独立工程检查负责，不混入 hbar 的检查项目；生成产物仍排除。入口为类型感知 ESLint 显式分配最多 8 GiB Node 堆，避免默默依赖终端环境变量。`tests/lint-workspace-coverage.test.ts` 检查根 TypeScript 范围、Lumen 源码 / 构建配置均被覆盖，并保持同一套严格规则。

崩溃测试启动额外 Bun 进程，在已提交工具意图且实际写入完成、结果尚未提交时终止进程，重新打开同一数据目录，检查 WAL 历史和 unknown 结果，不重放调用。它不宣称覆盖所有磁盘故障或断电场景。

### Lumen 宿主组件测试

`bun run test:lumen` 使用根 `vitest.lumen.config.ts` 执行已声明 Lumen workspace 的组件测试；`bun run check` 在 Bun 基础测试后执行同一入口。Vitest、jsdom、Testing Library 和 Chai DOM 均为固定版本的测试依赖，正常生产构建不导入它们。

子模块没有保留 MUI monorepo 的私有 `@mui/internal-test-utils` 实现。根 TypeScript 路径与此 Vitest 配置将已有测试中的该名称映射到 `tests/lumen/renderer.tsx`：适配器使用公开 Testing Library API，提供渲染、受控 props 更新、用户事件与 fake-clock 的 React act 结算。它只用于测试；生产源码由严格 lint 禁止导入。每例结束释放 DOM、计时器、spy 和临时全局变量。

这些 jsdom 测试检查对话滚动、文件预览、图片导航、Composer 和侧栏分隔条的交互契约；几何、真实 Canvas、主题、溢出与原生窗口继续使用对应 Playwright/桌面验收。配置限制单个测试 Worker，以及每例和 hook 的等待预算。

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

子窗口的共享遮罩验收使用 `bun run test:e2e -- e2e/dialog-backdrop.spec.ts e2e/dialog-sizing.spec.ts`。遮罩测试在原生 top layer 与不可用时的回退路径中，直接比较浏览器截图像素：暗色遮罩压暗背景、亮色遮罩提亮背景，底层高对比条纹被模糊。它还检查窗口打开时切换主题不丢失草稿、焦点和尺寸，关闭后恢复背景，点击遮罩关闭，以及系统高对比度关闭背景模糊。尺寸测试继续覆盖大 / 中 / 小窗口的 80% / 60% / 40% 和小视口 100%，截图保存在 `artifacts/dialog-backdrop/` 与 `artifacts/dialog-sizing/`。这些受控组件测试不依赖真实供应商或创建模型 Run。

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

Storage Worker 的退出、错误、无回复与关闭握手故障由 `tests/storage-lifecycle.test.ts` 验证。普通 RPC 默认 30 秒回复期限，关闭握手默认 5 秒；超时使当前 Storage 终止其自有 Worker，不重放写操作，并明确报告结果可能未知。真实残留测试进程与文件锁的排查边界见 [Storage Worker 生命周期](storage-worker-lifecycle.md)。单个 Bun 测试的 `--timeout` 不应被当作整个外部启动器／进程树已回收的证明；验收后还需核对 owned 进程退出。

### 聊天数据库

聊天数据库的统计、规则、调度、资源保护及恢复边界见[聊天数据库设置](chat-database.md)。
`e2e/chat-database-settings.spec.ts` 在真实临时 Host 上验证英文桌面和中文窄屏的保存、继承、
分页、实际清理、VACUUM 及丢失受理响应核对；`chat-database-drafts.spec.ts` 验证两个窗口
的独立持久附件引用、关闭与重载；`chat-database-deletion.spec.ts` 验证在线与漏通知重连、
侧栏与搜索同步、草稿编辑及附件移除、焦点和 320px 溢出。

这些场景不使用商业模型或用户数据。维护后的搜索与新消息、删除阶段崩溃、SQLite 重建、
上传和引用竞争、缓存重定向等由独立 `chat-database-*.test.ts` 覆盖。定向验证通过不能替代
仓库级 lint、typecheck、基础测试及构建的实际结果。

## 运行单元恢复与热重载验收

2026-10-11，在 `codex/host-runtime-implementation` 隔离工作树、Windows 和 Bun 1.4.0 上完成本轮验收。行为、公开操作和首次安装要求见[运行单元恢复与热重载](runtime-recovery.md)。所有 Host、数据库、浏览器和终端 fixture 使用本轮创建的独立目录；没有重启正在使用的 Host，也没有使用用户 Session 或商业模型。

| 门禁                      | 实际结果与范围                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 严格 lint                 | 维护源文件全量清单分批检查，新增文件和最后增量另行检查；3,538 个文件，0 错误、0 警告，使用同一根 `eslint.config.js` 和 `--max-warnings 0`        |
| Typecheck                 | 全仓 TypeScript `--noEmit` 通过；使用项目声明的 TypeScript 6.0.2，未放宽类型约束                                                                 |
| 基础测试                  | 完整覆盖 897 个文件，共 5,907 项：5,895 通过、12 失败；失败项均在实施前基线中存在，不能宣称全仓测试通过                                          |
| Web E2E                   | `connection-recovery.spec.ts` 与 `runtime-status.spec.ts` 共 3 项通过；首次握手失败自动恢复，中英文状态、局部更新、进程故障和连接保留            |
| Web / Host / Desktop 构建 | Web、14 单元产物、Host 和 Tauri debug EXE 构建通过；使用 `--debug --no-bundle`，没有执行 NSIS 安装包验收                                         |
| 隔离 native smoke         | 真实 Tauri / WebView、14 业务单元和 16 个 Bun 进程；实际杀死 fixture Kernel 后恢复，身份、凭据、其他 13 单元 PID 与 WebSocket 保持，页面错误为空 |
| 原生资源保留              | 真实浏览器 DOM 状态跨 Browser 插件及 Kernel 替换保留；真实终端的 shell 变量和 terminal ID 跨 Kernel / Controller 替换保留，关闭后释放            |
| Standalone CLI            | 编译后二进制启动嵌入 Host、14 单元和原生查询引擎；1 项真实测试、26 个断言通过                                                                    |
| 并发测量                  | 8 Session、16 mock Run、8 个并行查询，旧/新 Run 绑定不同 Kernel 代，13 个无关 PID 和连接稳定；具体延迟、内存和队列采样见下述脚本及运行文档       |
| 文档链接                  | 全仓检查仍有 762 个历史截图或审计产物缺失；隔离工作树没有这些未跟踪产物，不伪造文件消除失败，本次新增/修改文档链接另行核对                       |

基础测试采用 64 文件分批、新建 Bun 进程执行；含较多构建和原生生命周期场景的一批进一步逐文件隔离。首次单进程全仓尝试出现 Windows 原生 I/O 异常退出（`GetQueuedCompletionStatusEx` / `PostQueuedCompletionStatus`），多文件复验也出现过连续 `Bundle failed`；相应文件在新进程逐一复验，保留原失败日志。这是本机观察到的测试运行限制，未将其归因于已证实的 Bun 缺陷。首次 lint 单实例尝试达到 Node 堆上限，随后按同一维护清单、同一规则以新进程完成剩余检查；没有通过排除源文件或关闭规则通过门禁。

原基线为 5,643 通过、13 失败。本轮剩余 12 项涉及 Lumen 边界 2 项、sandbox popup 1 项、归档 composer 中英文 2 项、模型与 Plan 的只读恢复 2 项、Workspace alias 展示 4 项及组织设置 unknown receipt 1 项；Web composition root 的旧失败已在当前接入中消除。修复 Goal 重启测试的 Windows 临时目录清理竞争后，其所在 64 文件整批 455 项通过；Controller 的旧 56 槽等待改为双向预算下的 24 个普通槽，4 项实际进程测试通过。

本轮本地日志保存在忽略的 `artifacts/` 中：`runtime-final-base-result.json` 汇总实际覆盖及与基线的失败比对；`runtime-base-batches/` 保存各批日志，`02-rechecked.log` 为 Goal 所在整批复验，`09-isolated/` 为逐文件日志。严格检查清单与结果、Web E2E、桌面构建和 CLI 分别保存在 `runtime-lint-files.json`、`runtime-lint-result.json`、`runtime-final-e2e-complete.log`、`runtime-final-desktop-delivery.log` 和 `runtime-final-cli-delivery.log`。这些生成产物没有作为源码提交，不把未来 checkout 中缺少日志视为测试已运行。

重点故障注入由 `runtime-process`、`runtime-native-tree`、`runtime-ipc`、`runtime-controller-process`、`runtime-driver-process`、`runtime-plugin-process`、`runtime-storage-fault-host`、`runtime-storage-process`、`runtime-maintenance-process`、`stable-storage-port` 和 `storage-worker-preflight` 测试覆盖。它们核对真正的物理退出、心跳与退避、主动停机、候选只读、异常回调、控制容量、唯一写入者和未知写入门禁。`kernel-runtime-recovery`、`goal-startup-host`、`recovery-lineage-host` 和 `process-host-runtime` 核对完成回执、工具意图、恢复去重、普通对话与 Goal、审批/取消/预算/用户队列和 CLI 恢复链。`runtime-artifacts`、`runtime-manager`、`runtime-source-integration`、`runtime-formal-reload` 与 `process-host-runtime` 覆盖实际归属、两代容量、连续保存合并、不自动回退、真实资源和显式应用；单测存在断言与实际通过必须区分。

可以从仓库根目录复跑以下代表性入口；桌面构建先进入 VS x64 工具环境，独立原生 smoke 使用本机 WebView2 和刚构建的 debug EXE。性能与终端脚本启动自己的源码 Host，不能将它们当作正式部署升级命令。

```powershell
bun test ./tests/runtime-process.test.ts ./tests/runtime-ipc.test.ts ./tests/runtime-manager.test.ts --tsconfig-override ./tsconfig.json
bun test ./tests/process-host-runtime.test.ts --tsconfig-override ./tsconfig.json --timeout 120000
bun test ./tests/kernel-runtime-recovery.test.ts --tsconfig-override ./tsconfig.json --timeout 120000
bun test ./tests/compiled-cli.test.ts --tsconfig-override ./tsconfig.json --timeout 120000
bun scripts/desktop.ts build --debug --no-bundle
bun scripts/verify-runtime-desktop.ts
bun scripts/verify-runtime-terminal.ts
bun scripts/measure-runtime.ts
```

源码只准备、后续显式应用单独由 `tests/runtime-formal-reload.test.ts` 验证。E2E 使用不冲突的隔离端口，并执行 `bun @playwright/test/cli.js test e2e/runtime-status.spec.ts e2e/connection-recovery.spec.ts`。原生与性能脚本保存结果/截图至 `artifacts/runtime-native-smoke/` 和 `artifacts/runtime-measurement/`，只回收通过目录和进程身份验证的自有 fixture。Windows 进程树和本机原生浏览器已实测；Linux/macOS 原生退出行为、安装包发布及商业供应商没有在本轮执行，不宣称通过。

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

### 与主干整合验证（2026-10-11）

合并 `master` 的诊断、MAX 模式、技能运行时与 Run 文件变更实现时，迁移 24 的两种历史布局通过幂等迁移 25 补齐。两种布局升级、保留 Session 数据、完整性检查及候选只读预检共 2 项通过。

整合过程使用同一严格 ESLint 配置检查冲突解决及新增接线文件，0 错误、0 警告；全仓 TypeScript `--noEmit` 通过。定向验证包括恢复/存储契约/Supervisor 15 项、MAX/技能/文件变更/迁移 26 项、Goal 恢复与原有暂停及预算控制 41 项、Worker/Storage 诊断与恢复 33 项。部分用例重叠，这些数字不作为不重复的总计。

实际受管进程场景分批验证 Controller、Kernel、插件替换、资源保留、旧代绑定、取消、单次恢复、订阅游标与失败候选；实际 `runHost` 验证 Host、Kernel、Storage Worker 的关联诊断及日志内容隔离。Bun 长串构建测试中出现过启动超时；终止本轮旧测试进程后，崩溃恢复及剩余场景在新进程复测通过。整合验证没有重新执行上一表中的完整基础测试、桌面构建、原生桌面 smoke 或性能测量，上表属于合并前交付记录。

最新主干的连接抽屉整合沿用宿主文案与 Lumen 主题，内容契约及图标等级 guard 均通过；相关存储/文件变更/性能模型 23 项、维护的 Lumen 组件 84 项、首次连接失败和中英文运行状态 Web E2E 3 项通过。实际 Host 诊断测试 32 个断言、Windows CLI/App 会话恢复同步及 fixture Supervisor 清理复测通过。

纳入 `aff2a23c` 的已完成轮次文件变更后，统一使用公开 Run schema 保留文件摘要与恢复关系；Timeline/文件审查/双语 UI 共 24 项通过，60 个整合源文件严格 lint 为 0 错误、0 警告，全仓类型检查通过。Playwright 使用预览服务器，首次测试误用了旧 Web 产物；重新 Web 构建后，文件变更 2 项、运行状态 2 项及首次握手恢复 1 项，共 5 项在最新产物上通过。
