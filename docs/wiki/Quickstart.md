# 快速开始

下面的步骤用 `--demo` 启动本地 fixture，不会调用真实模型服务或消耗 API 额度。先跑通它，再在设置页配置自己的模型。

## 1. 准备环境

hbar 当前需要 Bun `1.4.0`。浏览器和独立 Host 开发不依赖 Rust；Windows 桌面构建另外需要 Visual Studio C++ 工具链、Windows SDK、WebView2，以及仓库 `rust-toolchain.toml` 指定的 Rust 工具链。

```powershell
git clone https://github.com/He-Jiahui/hbar.git
Set-Location hbar
bun install --frozen-lockfile
bun run build
```

## 2. 启动一个隔离的 Demo Host

把 `<你的项目目录>` 换成希望 Agent 读取和操作的工作区。`--home` 是 hbar 的数据目录；为不同试验使用不同目录，可以避免 Session、设备配对和数据库互相影响。

```powershell
bun run host --home .dev/my-host --workspace <你的项目目录> --demo
```

终端会显示监听地址和一次性配对码。默认地址是 `http://127.0.0.1:4317`；在浏览器中打开它并输入配对码，即可进入工作台。配对码有效期为 5 分钟，配对完成后可在“设置 → 设备”中生成新码或撤销设备。

## 3. 验证会话、审批和取消

Demo 模式支持普通文本，以及 `/demo`、`/slow` 和 `/fail`。还可以在输入框中发送下列工具请求，观察审批卡片和执行记录：

```text
/tool read_file {"path":"README.md"}
/tool write_file {"path":"scratch.txt","text":"hello"}
/tool shell {"command":"Get-Location"}
```

读取工作区内文件默认允许；写入与 Shell 会请求批准。不要把真实密钥放进测试项目或消息中。

## 4. 接入真实模型或桌面应用

移除 `--demo` 后，在“设置 → 模型”中配置协议、地址、模型 ID、能力、价格与 API Key。密钥由 Host 使用 Bun Secrets 保存；Windows 上会落入系统凭据管理器，不会发送给客户端或写入事件日志。

开发浏览器工作台可运行：

```powershell
bun run dev --demo
```

开发桌面应用则运行 `bun run desktop`；它需要在 VS x64 开发环境中执行。完整启动参数、局域网访问和桌面 Host 复用方式见主仓库的 [README](https://github.com/He-Jiahui/hbar/blob/master/README.md)。

接下来请阅读 [工作区与会话](Workspaces-and-sessions.md)，了解数据在哪里以及会话如何恢复。
