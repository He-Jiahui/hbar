# hbar

独立 Bun Host、Pi 最小运行循环、Cordis 插件宿主，以及可在 Tauri、桌面浏览器和手机浏览器访问的 React 工作台。

首版是可以运行的会话闭环：模型流式响应、工作区文件工具、Shell 审批、持久队列、取消、历史、分支、归档、图片与混合文件附件、摘要压缩、模型配置和本地插件管理。Goal、Plan、Budget 模式已作为内置插件接入；调度、后台任务和团队等后续边界见 [架构说明](docs/architecture.md)。

## 运行

需要 Bun 1.4.0。Windows 桌面构建还需要 Visual Studio C++ 工具链、Windows SDK、WebView2，以及 `rust-toolchain.toml` 固定的 Rust 工具链。浏览器和独立 Host 不依赖 Rust。

```powershell
bun install --frozen-lockfile
bun run build
bun run host --home .dev/my-host --workspace D:\Git\hbar --demo
```

访问终端显示的地址，默认是 `http://127.0.0.1:4317`，输入终端显示的一次性配对码。配对码有效期 5 分钟；连接后可以在“设置 → 设备”生成新码或撤销设备。

带 `--desktop` 启动的本地 Host 也可通过 `bun run pair --home <数据目录>` 刷新配对码。当前预览实例的命令是 `bun run pair --home .dev/preview`。

`--demo` 显式启用不访问模型网络的 Local fixture。可发送普通中文消息、`/demo`、`/slow`、`/fail`，或以下工具请求来验证流程：

```text
/tool read_file {"path":"README.md"}
/tool write_file {"path":"scratch.txt","text":"hello"}
/tool shell {"command":"Get-Location"}
```

写入和 Shell 需要批准。使用真实模型时不带 `--demo`，在“设置 → 模型”配置协议、地址、模型 ID、能力、价格与 API Key。密钥由 Host 通过 Bun Secrets 存储，Windows 使用系统凭据管理器；不会发送给客户端或写入事件日志。

## 局域网访问

```powershell
bun run host --home .dev/lan-host --workspace D:\Git\hbar --host 0.0.0.0 --port 4317 --demo
```

Host 显示可用的局域网/VPN IPv4 地址。手机访问对应地址并配对后，可以操作同一工作区和 Session。执行发生在 Host 所在机器。HTTP/WS 不加密传输，设备配对不会替代 TLS；需要加密时提供 `--cert path/to/cert.pem --key path/to/key.pem`，或者使用 VPN。

默认只允许同源页面。反向代理或其他前端域名需要通过可重复的 `--origin https://example.com` 显式放行。令牌使用 HttpOnly Cookie 或 Authorization Header，WebSocket 握手也支持消息体中的令牌；不使用 URL 查询参数。

## 开发与桌面

```powershell
bun run dev --demo
# Vite http://127.0.0.1:5173，Host http://127.0.0.1:4317

bun run desktop
bun run desktop:build
```

桌面命令需要在 VS x64 开发环境中执行。开发桌面使用 `.dev/desktop` 和 Local fixture；安装版默认使用用户目录下的 `.hbar`，不自动启用假模型。

Tauri 启动独立 Bun 进程，关闭窗口隐藏到托盘；退出桌面也不会终止 Host。安装包将 Bun、Host、Storage Worker 和网页资源一起打包。使用独立 Host 与桌面连接同一个数据目录时，先运行 `bun run host --desktop --home <目录> ...`，再通过 `HBAR_HOME` 指向该目录启动桌面；桌面通过本地 `connection.json` 与实例 ID 校验复用 Host。

每个数据目录只允许一个 Host。可通过不同 `--home` 和 `--port` 运行多个互相独立的实例。停止前台 Host 使用 Ctrl+C；后台 Host 的 PID 记录在其数据目录的 `host.lock`。

## 扩展

“设置 → 插件”可以加载一个本地插件目录、启停插件并编辑配置。可直接加载本仓库的 `examples/observer`：它提供工具、配置、只读面板、交互式 React 面板及一个内容渲染器，停用后会释放注册和订阅。

```powershell
# 启动时替换必需能力的示例：所有写入和进程操作都被策略拒绝
bun run host --home .dev/readonly --workspace D:\Git\hbar --demo --profile examples/read-only.profile.ts
```

插件目前是可信的进程内代码，拥有 Host 或浏览器页面权限。Cordis scope 负责生命周期和服务可见性，不是 OS 沙箱。插件能力与开发方式参考 DeepSeek Harness；现有 DSH 插件需要适配 hbar SDK，不承诺原样加载。

详细接口、依赖规则和示例见 [插件开发](docs/plugins.md)。

## 验证

```powershell
bun run check
bun run build
bun run test:e2e
bun run bench
bun scripts/build-host.ts
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
bun scripts/desktop-smoke.ts
```

浏览器测试默认使用本机 Edge，无需另外下载浏览器；可通过 `HBAR_BROWSER_CHANNEL` 更换。测试创建独立临时数据目录，真实协议测试使用本地 HTTP 供应商，不消耗商业模型额度。

截图和性能数据保存在忽略跟踪的 `artifacts/`。完整验收方法及测试边界见 [验证说明](docs/testing.md)。

## 目录

| 目录                                       | 职责                                            |
| ------------------------------------------ | ----------------------------------------------- |
| `apps/host`                                | CLI、HTTP/WS、配对与访问控制                    |
| `apps/web`                                 | React/Zustand 工作台、内容渲染和平台适配        |
| `apps/desktop/src-tauri`                   | 窗口、托盘、启动或连接本地 Host                 |
| `packages/contracts`                       | DTO、Zod schema、协议版本与事件类型             |
| `packages/kernel`                          | Session、队列、运行、强制执行入口与 Cordis 宿主 |
| `packages/storage`                         | 独立 SQLite Worker、事务、日志和投影            |
| `packages/plugin-sdk`                      | Host 插件接口与服务/钩子契约                    |
| `packages/client`、`packages/ui-sdk`       | 跨端网络 SDK、Client 插件接口                   |
| `plugins/pi-driver`、`plugins/local-tools` | 默认循环驱动与执行实现                          |
| `examples`                                 | 额外本地插件与启动组合示例                      |

## 许可证与贡献

本项目以 [MIT License](LICENSE) 发布。提交代码前请阅读 [贡献指南](CONTRIBUTING.md)；其中包含开发环境、验证命令和提交要求。
