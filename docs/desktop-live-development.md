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
| `apps/host/src`、已导入的 kernel、contracts、插件等 TS 依赖                                      | Bun `--watch` 重启源码 Host；固定本次运行的 Host 端口，前端连接恢复                   |
| `apps/desktop/src-tauri` 的 Rust 或 Tauri 配置                                                   | Tauri 开发监视器增量编译并重启桌面开发窗口                                            |
| 原生文件查询或沙盒 Rust 模块                                                                     | 重新运行对应原生模块构建命令，再重启开发实例                                          |

未被导入的文件不会主动改变正在运行的模块。后端重启会中断正在执行的任务，开发修改前应完成或取消当前任务。Storage Worker 在独立线程中运行；修改仅由 Worker 导入的文件时，应重启开发实例以加载新代码。

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

发布仍使用 `bun run desktop:build`，它会构建网页与 Host，再生成桌面安装包。官方工作流见 [Tauri 开发说明](https://v2.tauri.app/develop/)、[Tauri 与 Vite 配置](https://v2.tauri.app/start/frontend/vite/)和 [Bun watch 模式](https://bun.sh/docs/runtime/watch-mode)。
