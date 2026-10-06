# Windows 桌面安装包：2026-10-05

## 产物

安装器为 `apps/desktop/src-tauri/target/release/bundle/nsis/hbar_0.1.0_x64-setup.exe`，Windows x64、当前用户 NSIS 安装模式，版本 0.1.0，46,457,484 字节。

SHA-256：`FDAF4EAEFFB7C614C6001D0A63943ECE8F0BC21C9E63A635FFAD65F929FEBE7A`。

这是桌面安装包，包含 Bun Host、Storage Worker、Web 资源与原生查询模块。不要把单独的 `hbar-desktop.exe` 当作可独立分发的便携程序，它需要同目录的 runtime/native 资源。安装器没有代码签名；本轮没有安装、覆盖或升级现用桌面。

## 源码与构建

应用源码包含 `04beca5d` 的项目／父 session／subagent 三层侧栏、`d04b8227` 的 Host 文案测试契约修正，以及 `df58e379` 的 Storage Worker 生命周期修复。用户原有 `ChatSessionChrome.tsx` 四行标题删除参与本次构建，但没有夹带提交。

开始构建时，旧 sandbox 测试 PID 22768 加载着原生查询模块，造成 `EBUSY`。用户要求修复后按完整进程身份清理了该测试与启动 shell，文件锁释放；详见 [残留进程与 Worker 生命周期](storage-worker-lifecycle.md)。

Web、Host 和 native query 构建通过。首次 Rust 构建因全局 Cargo 镜像所使用的本地代理不可达而失败，失败日志保留。没有修改全局网络配置；之后使用调用进程内的 `CARGO_NET_OFFLINE=true`、VS x64 环境及 `bunx --no-install tauri build --ci` 完成 Release 与 NSIS 构建。

合并后的 Cargo.lock 缺少 Cargo.toml 已声明的通知插件。离线解析补齐通知插件与传递依赖，并选择本机缓存中的兼容版本；这个生成锁文件在本次交付中独立提交，不修改依赖的 manifest 版本要求。`cargo metadata --locked --offline --no-deps` 与 `cargo test --release --locked --offline` 通过。不声明本轮验证了干净机器的依赖安装或其它平台的构建。

## 实际验证

- Storage 生命周期、真实 Storage、sandbox 与 reasoning effort：30 pass / 0 fail。
- Goal/Budget 合并、双预算、恢复记账与 Host bundle：22 pass / 0 fail。
- Rust 原生单测：11 pass / 0 fail。
- 生命周期修改文件：类型感知 ESLint、Prettier、Git diff 检查通过。
- 原生 Release 使用独立临时 profile／项目启动，UI 与随包 Host 连接，真实文件读回通过。
- UI 选择 max 后，自动压缩与推理均发送 max/max；使用本地 Responses 夹具，没有商业模型调用。
- Goal 与 Budget 账本同为 60 tokens，Budget 耗尽后拒绝新的 Run，不发生重复续作。
- 实际原生侧栏中，项目一级、父 session 二级、subagent 三级，子项展开／折叠及最新回复排序通过；时间模式保留同样的项目层级。
- 原生验收的 Desktop、Host 与 supervisor 已退出，独有临时 profile／项目已清理；后续进程扫描没有 hbar 或 Bun 残留。

全仓 typecheck 仍有既有旧 UI/CLI 引用、Storage worker overload 和无关测试契约诊断，本次生命周期文件没有诊断；不声明全仓 check 或全部 E2E 通过。原生启动和上述定向功能已验收，安装／升级流程未执行。

## 证据

日志和截图在 `artifacts/desktop-release-20261005-04beca5d/`。其中早期 `source.zip`／`source/` 是解除占用前准备的 04beca5d 快照，没有用于最终构建；最终构建使用主工作区的最新源码及本次生成的 Cargo.lock。

- `desktop-build.log`：Web/Host/native 构建成功、联网 Cargo 失败。
- `tauri-offline-build.log`：最终 Release/NSIS 成功。
- `native-rust-tests.log`：11 个 Rust 单测通过。
- `native-startup.log`、`native-final/native-startup.json`：实际 Release 原生验收与结果。
- `native-final/native-max-effort.png`：最大思考等级实际选择。
- `native-final/native-project-session-agent-tree.png`、`native-final/native-time-project-session-agent-tree.png`：项目和时间模式的三级导航。
