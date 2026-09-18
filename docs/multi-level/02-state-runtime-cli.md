# P2：只读状态、独立应用运行时与 CLI

状态：实施中，A2 只读运行时、目录查询与会话选择已交付；草稿、CLI、surfaces 与完整增量同步仍在后续里程碑。上级：[总计划](command-first-architecture-plan.md)。依赖 P0 与 P1 最小命令契约。交付 `packages/app-runtime` 及 CLI/Client adapters；React 只读 hooks 随 P5 进入 `packages/app-react`。

## 1. 状态所有权和写入边界

| 状态                                                                | 唯一所有者                      | UI 读取                | 用户修改                                        |
| ------------------------------------------------------------------- | ------------------------------- | ---------------------- | ----------------------------------------------- |
| Workspace、Session、Run、消息、审批、预算、用量、目标计划、有效设置 | Host 领域服务/存储              | 分页快照与只读投影     | Host command                                    |
| 当前 workspace/session、逻辑 page/panel/dialog、调用反馈            | 每个 app-runtime 实例           | app StateReader        | `app.*` command                                 |
| 提示词、附件草稿、表单、dirty、验证、baseline                       | runtime 的 Draft/Form 模块      | draft/form StateReader | `draft.*` / `form.*` command                    |
| 连接、请求、已连续应用游标                                          | Client SDK + 同步 adapter       | 只读连接/同步状态      | 内部生命周期；用户重连为 `connection.*` command |
| 布局描述、设备偏好                                                  | runtime + ClientPersistencePort | 只读布局/偏好          | `layout.*` / `preferences.*` command            |
| hover、光标、IME、拖拽坐标、普通树折叠、普通选项列表弹出            | renderer                        | renderer 内部          | 局部更新，不进入公共命令目录                    |

打开/关闭窗口、页面、工具面板和 ProviderDialog 属于逻辑 surface，即使表现成 UI 动作也执行 `app.*`。普通 ComboBox 的选项弹出是控件内部状态；进入有独立编辑会话的供应商子页面则是命令。拖拽实时状态由布局 renderer 所有，落定后通过 `layout.commit` 保存描述，不直接修改共享 store。

Zustand 使用 vanilla 且按领域分模块。只持久化允许恢复的草稿、上下文、偏好和布局，具有版本迁移；连接、函数、凭据及未核实的 operation 状态不按普通 JSON 恢复。

## 2. 公开接口形态

```ts
// 概念接口，具体 State/Command 泛型在实现时由公开契约推导。
interface StateReader<T> {
  getSnapshot(): DeepReadonly<T>
  subscribe(listener: () => void): () => void
}

const runtime = createAppRuntime({
  instanceId,
  hostCommandPort,
  stateFeedPort,
  platformPort,
  persistencePort,
})

const session = runtime.state.sessions.getSnapshot()
await runtime.commands.execute('app.setSession', { sessionId: 'session_123' })
```

UI 获得的 handle 仅有 state、query/commands；dispose 和注册能力属于组合根。不得导出 StoreApi、setState、可变实体/Map、私有 reducer 或 ClientTransport。只读类型配合不可变数据/开发期冻结、依赖门禁和嵌套引用测试；不是将可写 store 强制断言为 Readonly。

ViewModel 将 selector、回执与文案组合为受控 props，action 只绑定目标和命令。命令 handler 与网络投影同步器各持有私有 writer。服务端事实到达时由内部 reducer 更新投影，不“再发一条命令”形成循环。

生命周期由 runtime 管理，挂载/卸载 View 只增减消费引用。无 React 的 Bun 进程可以创建两个 runtime；退出 CLI 或关闭 UI 不取消 Host Run。

## 3. 选择上下文与原目标保护

`app.setSession <id|name>` 的解析顺序：明确 ID → 当前/显式 workspace 内精确名称匹配 → 重名返回候选。不存在、已归档和无权访问返回明确错误，名称匹配不静默跨工作区。成功后写当前 runtime 的稳定 workspaceId/sessionId。

选择改变可以触发该 runtime 需要的读取订阅，但不修改 Host Session 事实，也不把别的客户端切换过去。当前项删除/失效时进入无选择状态并提供显式选择入口；尚未提交的操作不自动改绑另一个 Session。

每项异步工作捕获 hostId/connection generation、runtimeId、workspaceId、sessionId、实体 ID、form/panel instanceId 和 request generation。回调只写对应实例/原目标；显示目标变化不改变请求目标。

面板描述用稳定 instanceId、kind、target 和 `binding: followActive | pinned`。默认工具面板跟随当前会话；切换时更换绑定、取消过期读取，但原在途写操作仍归原会话。固定面板始终绑定原目标。两种策略均保留分目标草稿与反馈。

## 4. 草稿与表单的轻量命令

- 草稿 key 包含 Host、workspace、session、draft/form instance；字段修改走本地内存命令，不逐字往返 Host。
- IME 组合片段可留在输入控件；组合完成提交 `draft.setText`。光标、选择范围、测量高度为控件内部状态。
- `run.submit` 捕获正文、附件、设置版本和 draftRevision。成功后仅确认已提交版本；发送期间的新输入不被旧回执清空。
- SettingsForm 使用 schema-core 的状态转换，由 `form.setField/addItem/removeItem/validate/reset` 驱动；表单级结构改动也不能由 React 自行写共享对象。
- 保存失败、断线 unknown、切换作用域和关闭面板不丢草稿。草稿恢复与撤销覆盖是不同操作。
- 大文件用 artifact 引用；持久草稿不保存 File/Blob、原生句柄、完整敏感输入或无限附件队列。

## 5. CLI/TUI 的正式入口

```text
hbar commands list --category model.budget
hbar commands describe session.setBudget --json
hbar exec app.setSession "审查会话" --workspace workspace_1 --context dev
hbar exec session.setBudget 120000 --session session_123
hbar exec session.getBudget --session session_123 --json
hbar exec run.submit --session session_123 --input-file prompt.md --jsonl
hbar exec settings.get --scope session --session session_123 --path provider.model
hbar exec settings.set --scope session --session session_123 --path provider.model --value-json-file model.json
hbar repl
```

以上为目标语法。一次性 `app.setSession` 默认只影响该进程；需跨调用保存选择时显式使用 `--context`。命名 context 由本机持久化 adapter 管理，带 Host/身份、revision 与文件原子写入；并发更新冲突不能静默覆盖。自动化推荐每次显式传目标。

argv、REPL、OpenTUI 共用 commands parser/目录/执行入口。TUI 的行编辑、终端渲染、键位与 ANSI 留在 terminal/UI adapter。旧 CLI/终端实现迁移后只保留语法兼容和输出，删除另一套业务分派。

无 TTY 缺参数返回校验错误，不等待交互表单；提供结构化 JSON/JSONL 与既有退出码分类。stdout 不混日志或 ANSI，诊断写 stderr；审批 `ask` 仍只在明确的交互环境工作。CLI 中断取消其等待读取或订阅；取消已受理的 Run 需发送明确 `run.cancel`，不能把断连接解释为取消。

## 6. 窗口、子页面与跨客户端命令

| 命令                                             | 应用语义                                           | 平台边界                                           |
| ------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------- |
| `app.openPanel` / `app.closePanel`               | 创建/移除逻辑 panel instance，重复 open 聚焦同实例 | React 展示；无 renderer 返回不可用                 |
| `app.openSettings` / `app.openStatus`            | 定位到有 scope/section 的逻辑 surface              | 是 openPanel 的具名参数绑定，不能有第二份开关状态  |
| `app.openCommandForm` / `app.openSettingsEditor` | 打开参数表单/定制设置子页面，绑定原目标            | 关闭图标和 Escape 经 close 命令                    |
| `app.openWindow` / `app.closeWindow`             | 操作稳定 windowId 和明确页面描述                   | Tauri/Web PlatformPort；能力不足或弹窗阻止返回失败 |

无 GUI 的 CLI 可执行所有业务命令；窗口操作需明确 `--client <id>`，由已鉴权的定向控制能力找到该客户端已公布的 surface capability。Host 只中继与关联回执，不拥有 GUI 布局。

```text
hbar exec app.openPanel --panel files --session session_123 --client client_1
```

跨客户端打开不广播，也不默认选择任意窗口。目标断线、过期 generation、超时、拒绝能力分别返回明确状态；重试用原 invocation 核对。没有 GUI 返回 `CAPABILITY_UNAVAILABLE` 和可用的读取命令提示。浏览器受用户激活限制的原生弹窗不能承诺与 Tauri 等价。

GUI 内默认作用于自己。UI 快捷动作可以是 toggle，但脚本使用 open/close；关闭多个实例要求显式集合，不能用“当前窗口”模糊波及其他 runtime。

## 7. 投影和可靠增量同步

复用现有 Client SDK 的连接/恢复，由 StateFeed adapter 传递版本化 DTO。首次分页快照和订阅使用一致游标衔接，避免读取快照与开始订阅间丢失事件。

持久事件包含协议版本、eventId、实体 ID、实体范围单调 seq、revision 与操作关联；去重、乱序有界缓冲、缺口补取，游标只推进到连续应用位置。游标失效重新快照；连接换代拒绝旧响应。回执与事件先后到达也不重复应用或回退。

正文/thinking 分别使用 streamId、基准 offset、明确偏移单位及 delta/replace/reset。终态与持久消息按 ID 交接；固定增量长度时网络帧不能随历史增长。高频遥测可标记 gap，持久事实不能静默丢弃。

订阅引用计数、有界队列和生产端载荷限制；隐藏页面释放高成本订阅，侧栏只需轻量摘要。慢客户端仅影响自身。内部错误/断线形成可见 stale/recovering 状态，不继续显示假成功。

## 8. 独立交付与验收

| 切片 | 完整行为                                  | 主要验证                                           |
| ---- | ----------------------------------------- | -------------------------------------------------- |
| P2.1 | 无 React runtime、只读 facade、setSession | 两实例隔离、重名/失效 ID、嵌套只读、dispose        |
| P2.2 | 草稿/表单及预算最小切片                   | 切换期间提交、失败保留、旧回执不清新输入           |
| P2.3 | CLI/TUI、命名 context、兼容入口           | 非 TTY、输出/退出码、路径/Unicode、无 GUI 业务闭环 |
| P2.4 | surfaces、平台和定向 GUI 控制             | 多窗口、无 GUI、断线超时、幂等 open/close          |
| P2.5 | 全领域投影与可靠同步                      | 重复/乱序/缺口/慢消费恢复后等于 Host 快照          |

切片可与 P1/P4 同一业务闭环共同提交，不能以单纯搬文件或仅存在接口宣告状态分离完成。
