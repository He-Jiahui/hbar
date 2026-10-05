# 思考等级修复与 Windows 修复包

2026-10-05（Asia/Shanghai）。生产修复提交：`22d8e3be`。

## 已确认的原因与行为

现用桌面的失败 Run 已持久化 `input.thinking = max`，对应的自动
`compaction.request` 随后失败为上游不支持 `reasoning.effort = none`。
因此不是 UI 选择没有保存：PiDriver 的摘要路径使用了写死的 `off`，
SDK 将其编码为 `none`。此外，适配器没有转交 Host 声明的 thinking levels，
Pi 对自定义模型将 `xhigh`／`max` 静默降为 `high`。
摘要的关闭思考行为在初始驱动 `fb649893` 已存在，`94e5cad1`
将该默认值改为显式参数；不能仅因 blame 指向后者就认定它首次引入问题。

- [ModelRequest](../packages/plugin-sdk/src/index.ts) 增加可选、类型化的
  `context.thinking`。普通请求与自动压缩携带已确认的 Run 等级；压缩不改写模型元数据。
- [Kernel](../packages/kernel/src/index.ts) 把 Run 的选择传入压缩请求。
  [PiDriver](../plugins/pi-driver/src/index.ts) 使用该选择，缺省时使用模型声明的有效默认值。
- OpenAI Responses／Chat Completions 适配器提供明确的 `thinkingLevelMap`，
  保留声明支持的 `xhigh`／`max`，不再使用 SDK 的通用能力猜测。
  只有模型声明支持 `off` 时才允许发送 OpenAI 的 `none`。
- 不修改用户 Provider 配置、模型名称或模型默认值，不通过降低所选等级重试请求。

[GPT-6.1 Sol 官方模型说明](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
列出的支持等级为 `low`、`medium`、`high`、`xhigh`、`max`；不支持 `none`。

## 安装包与原生验收

- 安装包：`dist/release-20261005-effort/hbar_0.1.0_x64-setup.exe`。
- Windows x64、NSIS current-user、版本 0.1.0，未签名。
- 大小：46,412,126 bytes，约 44.3 MiB。
- SHA-256：`f19acc3625243f3746b57e7c6361ec7365d70d2c735e379c0d1e8946aa6425ef`。
- 交付文件与 Tauri 最终 NSIS 输出的哈希相同。旧交付文件保留。

最终脚本实际启动 optimized Release 原生桌面及其打包 Host，使用独立临时
profile、项目、WebView2 CDP 端口和本地 HTTP 模型夹具。
先用 mock Run 建立足够历史，再从真实输入区打开 effort 浮层，选择并确认“最大”，
通过真实 Send 按钮提交。已实际验证：

1. 选择持久化为 `max`，正式 Run 完成后输入区仍显示“最大”。
2. 默认插件配置下自然触发自动压缩；HTTP 夹具捕获压缩和正式回答各一次，
   原始 `reasoning.effort` 均为 `max`，没有降为 `high` 或 `none`。
3. 原生 bootstrap、已连接 UI 和打包 Host 的 owned 文件读取正确，页面错误为 0。
4. 原有 Goal／Budget 组合断言保留并通过：两份账本均为 60 tokens，预算耗尽，
   Goal 为 `budget_limited`，再次提交明确拒绝为 `BUDGET_EXHAUSTED`，未增加 Run。

临时原生／Host 进程和数据已按精确所有权清理。没有调用商业模型，
没有安装安装器、重启现用桌面或修改现用用户数据。现用桌面仍是旧二进制，
用户需退出旧版后安装该修复包；安装／升级流程本身未验收。

## 验证与边界

- [HTTP 回归](../tests/provider-thinking.test.ts) 修复前复现：普通 `xhigh` 变成
  `high`，自动压缩 Run 失败，默认摘要发出不支持的 `none`。
  修复后 7 个用例通过，覆盖五档普通请求、`max/max` 自动压缩／推理、
  有效默认值、支持 `off` 的模型及 Chat Completions 的显式 `max`。
- 十个定向文件：49 pass、290 assertions；包括模型配置、上下文、压缩／分支、
  usage、driver steering 和 composer 保存／恢复。使用 `./tests/...` 精确路径。
- 隔离源码快照的三份 effort／model 测试：10 pass、93 assertions，
  与上一组重叠，不相加成独立总数。
- 四个修改文件的严格类型感知 ESLint 与 Git diff 检查通过。
  Driver／SDK／新测试的 Prettier 检查通过；Kernel 文件仍有既有格式问题，
  本轮未夹带全文件格式化。
- 全仓 typecheck 未通过，仍有 CLI、旧 UI 缺失导入、Storage overload、
  无关 fixture 等诊断，本轮修改文件无诊断。未声称全仓 `check` 通过。
- 广泛诊断中的旧 `provider.test.ts` 仍因 Budget-only 自动续作收到 120 而预期 40
  失败；未带此 effort 修复的上一次发布快照也复现同一失败。未修改该断言。
- Web、Host、native query、Rust Release 和最终 NSIS 构建成功。
  隔离快照使用已有 vendor dependencies；首次缺少 workspace 局部依赖链接的
  Web／Host 构建失败日志保留，补齐隔离链接后通过，未更改生产依赖声明。
  Cargo 使用离线缓存，并在构建快照中重新解析锁文件；未宣称干净机器安装可复现。
- 首次原生组合夹具在 `plugin.set` 热重载后 Goal／Budget 验收失败。
  最终使用默认插件参数和更多历史自然触发压缩，完整 effort 与原有预算断言通过，
  未删除或放宽预算断言。首次失败保留；本轮不宣称 Goal／Budget 热重载场景已修复。
- 首次 NSIS 与提前启动的 owned 原生测试发生文件占用冲突；关闭 owned 测试后
  顺序执行完整打包和原生验收通过。未关闭现用 hbar 来解除占用。

## 证据与源码范围

证据位于 `artifacts/reasoning-effort-20261005/`：
`web-build-fixed.log`、`host-build-fixed.log`、`tauri-release-final.log`、
`isolated-effort-tests.log`、`native-startup-final.log`、
`native-final/native-startup.json` 与 `native-final/native-max-effort.png`。
初次失败日志和 `native-verified/` 保留，没有覆盖为成功。

构建应用源码为提交 `22d8e3be`，Lumen 子模块为
`d82843776dc247405cf46c46631bc21d69ed4cd7`。
包含用户既有 ChatSessionChrome 四行标题删除，仅复制到构建快照，未夹带提交。
用户暂存的 App 格式化及其他任务未提交的 UI 改动保留，不纳入该提交／源码快照。
未 push、发布或改写历史。
