# 验证说明

## 自动测试

`bun run check` 串行运行严格 lint、类型检查和 Bun 测试。覆盖组件库以及 Pi 流式循环、真实 pi-ai HTTP 协议适配、工具成功/失败、批准/拒绝、幂等队列、取消、插件依赖与作用域、卸载释放、压缩与分支、配对与 Origin、设备撤销以及崩溃后的未知副作用恢复。

崩溃测试启动额外 Bun 进程，在已提交工具意图且实际写入完成、结果尚未提交时终止进程，重新打开同一数据目录，检查 WAL 历史和 unknown 结果，不重放调用。它不宣称覆盖所有磁盘故障或断电场景。

`bun run build && bun run test:e2e` 使用 Vite preview 和 Edge/Playwright，覆盖无 Host 时的中英文桌面/窄屏外壳、Ctrl+K 本地命令目录、命令关闭后的导航、刷新、旧 localStorage 隔离和明确失败状态。真实临时 Host 场景覆盖选择会话、文件 compare-and-write、通用 descriptor 预算表单、发送/审批/取消、可靠 Usage、真实工具结算/并发/耗时统计、三层设置动态内容、ProviderDialog 凭据保存、Session Monitoring、子 Agent、目标/计划、扩展/技能以及 Performance/Usage/Git 状态中心。连接 Host 后还会切换到 390×844，逐项重开上述工具，检查水平溢出和 AppSidebar/Main 几何重叠。组件库的受控交互测试和独立预览验证脚本继续保留。

专注工作流的验证矩阵和定向命令见[专注工作流](workflows.md#迁移与验证)。`tests/compiled-cli.test.ts` 真实编译 standalone CLI，检查内嵌 Host、原生查询、Workflow、隔离补丁以及 Windows 进程拓扑；`e2e/workflow-focus.spec.ts` 用真实 Host 检查桌面和窄屏的单一 Agent Plan、当前焦点、显式人工模式与 Evidence 回读。

`bun scripts/desktop-smoke.ts` 需要先构建 Host 资源和 debug Tauri 程序。它通过 WebView2 调试端口驱动真实 Tauri 窗口，验证受限 `connection_info` 自动认证、唯一工作区默认、新建并打开会话、WebView file chooser 附件上传、文件工具、默认窗口与原生 900×600 内窗、横向溢出、关闭窗口隐藏、退出桌面后 Host 存活和通过独立 SDK 取消运行。调试端口只由该测试进程的环境变量启用，常规桌面启动不启用。

测试使用临时目录，测试用假凭据独立于真实模型配置。pi-ai 的网络集成测试对接本地 SSE 服务器，不对商业供应商发请求。真实供应商认证、供应商限流、商业计费、多型号手机硬件和复杂 VPN 拓扑仍需要部署环境验收。

## 性能基准

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
