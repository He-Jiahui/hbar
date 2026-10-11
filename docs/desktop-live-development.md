# 桌面源码开发与实时更新

在仓库根目录、VS x64 开发环境中执行：

```powershell
bun run desktop:dev
```

`bun run desktop` 是同一个入口。脚本先启动 Bun 源码 Host 和 Vite，再通过 `tauri dev` 打开真实桌面窗口。它不执行 Web 生产构建、Host 打包或 NSIS 发布。首次启动仍需编译 Rust 开发程序；后续只修改前端 TypeScript、TSX 或 CSS，无须重新生成或安装 hbar EXE。

需要先安装 workspace 依赖（`bun install`）、Node.js 及 Rust/MSVC 工具链。启动脚本和 Host 由 Bun 运行，Vite 与 Tauri CLI 使用 Node.js。原生文件查询模块在首次开发前用 `bun run native:build` 生成；已有模块可直接复用。

## 修改后如何生效

| 修改位置                                                                                         | 更新方式                                                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `apps/web/src`、已导入的 `packages/app-react` 和 `hbar-ui/packages/lumen-app-ui` 的 TSX、TS、CSS | Vite HMR；符合 React Refresh 边界的组件保留局部状态，入口或非组件依赖变化可能刷新页面 |
| Controller、Kernel、内置插件、Storage 或 Maintenance 的兼容 TS 依赖 | 400 ms 防抖，按构建依赖归属替换受影响单元；旧任务固定原版本，稳定入口和连接保持 |
| Supervisor、稳定监听/协调底座、公开不兼容契约 | 诊断显示需要显式重启，不自动替换底座 |
| `apps/desktop/src-tauri` 的 Rust 或 Tauri 配置                                                   | Tauri 开发监视器增量编译并重启桌面开发窗口                                            |
| 原生文件查询或沙盒 Rust 模块                                                                     | 重新运行对应原生模块构建命令，再重启开发实例                                          |

新增、删除、重命名、存活 re-export 绑定和声明动态资源均参与归属判断。Storage 与 Maintenance 的 Worker 包含在各自的不可变进程版本中，兼容更新通过受控交接加载，Storage 先排空旧事务并确认 Worker 实际退出。无需为普通业务更新结束所有任务；底座、原生模块和不兼容迁移仍须显式重启。新旧并行、两代容量和恢复规则见[运行单元恢复与热重载](runtime-recovery.md)。

Vite 的监听排除 Rust 构建、`dist`、`artifacts` 和 `.dev`，避免生成日志或缓存引发重复刷新。桌面通过注入的 Tauri 桥读取本地 Host 凭据；开发页面的 Host 地址由启动脚本明确提供，凭据不放进页面 URL。

## 端口、数据与退出

终端会打印实际 Vite 和 Host 地址，默认由操作系统选择两个空闲 loopback 端口。同一次运行的后端重载保持 Host 端口不变。可以指定固定端口：

```powershell
$env:HBAR_WEB_PORT = '5196'
$env:HBAR_HOST_PORT = '4396'
bun run desktop:dev
```

两个端口必须不同且可用。`HBAR_WEB_DEV_URL` 可指定带端口的本地 HTTP 根地址，并须与 `HBAR_WEB_PORT` 一致；`localhost` 会统一为 `127.0.0.1`。

默认数据和 WebView2 profile 保存在 `.dev/desktop-live`，源码 Host 日志在 `diagnostics/host-dev.log`。它与已安装桌面的数据目录独立。需要其他开发实例时，用 `HBAR_HOME` 指定另一目录；已有 Host 正在占用该目录时，脚本会报错，不终止或替换该 Host。`HBAR_WORKSPACE` 可指定项目，`HBAR_DEMO=0` 可关闭 Local fixture。

保持启动终端运行。Ctrl+C 或 Tauri 开发进程结束时，脚本回收本次启动的 Host、Vite 和桌面进程树，保留开发数据。窗口关闭按钮沿用隐藏到托盘的行为；从托盘退出或在终端 Ctrl+C 才结束开发实例。

发布仍使用 `bun run desktop:build`，它会构建网页与受管 Host 产物，再生成桌面安装包。首次安装此架构需一次显式重启，后续兼容版本由运行时重载命令应用。源码正式部署可使用 `HBAR_RUNTIME_WATCH=prepare` 只构建登记候选，等操作方显式应用。官方工作流见 [Tauri 开发说明](https://v2.tauri.app/develop/)、[Tauri 与 Vite 配置](https://v2.tauri.app/start/frontend/vite/)和 [Bun 子进程与 IPC](https://bun.sh/docs/runtime/child-process)。

发布包将 `playwright` 和 `playwright-core` 连同包内资源放在 `runtime/node_modules`。这些依赖需要按自身目录读取 `browsers.json` 和驱动文件，保留完整包可以避免 Bun 将开发机的绝对目录写进运行时路径。`tests/build-host-bundle.test.ts` 在仓库目录不可读、自动安装被禁用且工作目录无关的进程中验证资源加载。Chromium 浏览器程序继续通过现有浏览器配置或本机 Playwright 缓存定位。
