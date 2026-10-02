# Desktop UI 成果同步

2026-10-02（Asia/Shanghai）。用户明确要求：先完整提交 hbar，保持工作区干净，再同步
隔离分支的 UI 成果。本次操作不包含远端 push、安装、重启现用桌面或商业 Provider 请求。

最新状态：保存与合并已经完成；用户随后明确允许临时原生验收。2026-10-02 的最终
原生核心流程已通过，详情见本页末尾“授权后的原生验收”。下文早期的“等待确认”和
lint 失败保留为历史记录，不代表当前仍缺授权或全仓 lint 仍失败。

## 保存原有工作

主分支 `codex/hbar-app-ui` 在最新 `25078df7` 上保存已有源码、测试、脚本、文档删除和
独立 HTML，形成 `3c67edb7`。这是用户要求的保存检查点，不冒充这些既有工作的全量
验收。保存后根工作区干净；共享 `hbar-ui` 保留 `f66cc62b`，未回退到 UI 分支的旧版本。

误生成的 `%SystemDrive%/ProgramData/Microsoft/Windows/Caches` 中五个缓存数据库
移动到已忽略的 `artifacts/ui-sync-preflight-20261002/systemdrive-cache`，未删除、未纳入
源码提交。提交前检查了明确暂存路径和 staged diff；Stop 模型基础 52 tests /
188 assertions 通过。Bun 有非致命的 directory-mismatch 诊断，未隐藏该输出。

## 合并方式与保留点

合并来源为 `codex/session-launch-target` 的 `48cc3c2e`，保留原有独立功能提交历史。
七个实际冲突逐项组合，而不是整文件选一边：

- App／Shell 同时保留宿主 `mobileNavigationLabel` 和 UI 分支 `locale`、侧栏组织／rail。
- Session 宽屏保留 Find、Activity、labelled More；窄屏保留统一菜单的完整工具注册。
  reading owner、background Agent Stop、Agent Tool 子会话入口均保留。
- Provider 同时保留主分支目录读取 generation／原位 Retry，以及 UI 分支的公开列表
  labels／全局默认选择。实际保存、默认与读取恢复仍使用原 Host 契约。
- 导航测试同时保留宽屏 More、窄屏菜单、原来源／dirty／焦点返回；不靠移除功能断言
  消除冲突。原隔离端口对齐维护的 Host／preview 端口。
- flow guard 合并精确 path／selector overlay 白名单和 self-test，没有通用放开定位。

测试适配使用新的 `workspace.sidebar.list`／`session.sidebar.list` 契约和真实 runtime
refresh，而非往 store 里伪造行。控制属性按当前 Lumen 公共转发结果断言；生产构建边界
区分真正的 catalog／preview／fixture 入口和生产模型目录模块。

## 验证范围

本次验证以核心流程和内容连续性为单位，不新增按钮乘视口矩阵。当前已实际执行的
验证和最终结果如下。生产 Web build 使用主目录当前共享 Lumen，3544
modules；产物为 `dist/web/assets/index-w2muuzEZ.js` 与 `index-B8ctyle9.css`。

- 默认 `bun run typecheck` 最终通过。合并过程中的冲突标记、夹具 readonly／optional
  类型问题已修复；没有降低 strict 或排除源码。
- 三组互不重叠的定向 Bun 验证：117 tests／737 assertions、114／431、40／492。
  覆盖模型／首发／Goal Plan、后台 Agent／子会话／文件引用／阅读与标签，以及 React
  导航、Provider、公开解析和新 Gallery 保留行为。总计 271 tests／1660 assertions；
  保存检查点和修复中间重跑不累加。
- 19 个核心 Host E2E 最终均通过：首发／Goal Plan／Files／Provider 七项；窄屏菜单／
  宽屏 More／dirty 返回六项；后台停止／阅读返回／rail／Agent 返回与恢复六项。
  它们分组定向执行，不是完整 `test:e2e`。失败的中间运行保留在 artifacts。
- 当前 owned integration paths 的类型感知 ESLint 零警告通过；content／icon guards、
  flow guard 两样式及其合并后的 self-test、格式和 staged diff 检查通过。
- 全仓 `bun run lint` 实际运行仍失败，记录为 3 errors／0 warnings：两处共享 Lumen
  `file-manager-reference.tsx:734` 和 `file-manager.tsx:946` 的 switch 缺少显式 queued
  分支，以及编辑中测试正则的无用转义。测试项已修复并 scoped lint 通过；共享两项
  未修改，也未排除／降低规则。未重跑全仓，不把 scoped 结果写成全仓通过。

中间 E2E 失败已按证据收敛：窄屏页签在统一菜单中，不要求隐藏 tab 可聚焦；后台
编辑器使用真实键盘输入后断言草稿；阅读比较等待虚拟测量稳定，未增加误差阈值；
首次项目自动展开不再与过时 Expand 名称竞争。正确的选中对象、未发送草稿、dirty
文件、原 Run／Agent 和焦点返回仍有可观察断言，不把测试改成只验证按钮存在。

主 agent 查看了当前生产构建上的 Goal/Plan 1440 与 Vue dirty 编辑 390 截图，路径在
`artifacts/ui-sync-preflight-20261002/core-results`；与 CC 发布主画面及 workspace
参考区分，不冒充 CC 本轮原生截图。页面控制台无新增 pageerror；结束临时 Host 时的
Vite ECONNRESET 诊断仍保留。构建报告大 chunk 警告，不忽略该交付限制。

临时 Host 使用独立目录与 mock Provider；不是原生 Tauri 验收。原生启动／打包、完整
业务 test／check 未因代码同步自动宣称完成。当前交互能力与独立底层能力范围仍见
[当前交互地图](desktop-interaction-map-current.md)。

## 原生构建与验收准备（后续记录）

在同步后的 `ccbface7` 上，以现有 MSVC 环境执行离线构建：`bun scripts/build-host.ts`
和 `cargo build --locked --offline --manifest-path apps/desktop/src-tauri/Cargo.toml
--target-dir artifacts/desktop-native-acceptance/target --features custom-protocol` 均通过。
原生 debug 程序为 `artifacts/desktop-native-acceptance/target/debug/hbar-desktop.exe`；
Host／Bun 资源位于 `dist/desktop-resources`。未安装／下载依赖／生成 NSIS 安装包。
构建后主仓库和共享 `hbar-ui` 仍干净；离线编译成功不证明窗口交互成功。

原 `desktop-smoke.ts` 的即时创建会话和 `.hbar-composer-intents` 循环仍属于旧入口，
不能检验当前首发／Goal Plan。后续脚本改为当前入口和 Host 事实断言，并将项目和
profile 同时隔离到系统临时目录。保留外观、附件、文件、窗口和 Host 生命周期验收，
不删除它们来取得绿色结果。失败日志脱敏、连接文件校验、精确临时目录清理与 Host
命令行所有权另有 17 项纯单测覆盖。

本次只是更新验收入口并验证脚本的类型、lint 和边界单测；尚未启动原生窗口，也未
声称 native smoke 已通过。临时原生启动仍等待用户确认。两位 gpt-6-luna/max agent
只读复核入口契约与已保存视觉证据，没有对真实软件进行操作；未发现新的、证据充分
的五条核心路线缺陷，不作为整个迁移完成证明。

入口复核返回后，补充了原生脚本的三项明确断言：批准前 Host mode 确为 Plan；
批准后仍是原 Goal ID 且 active；JSON 计划正文没有被误识为文件引用。它们沿用已通过
的 `e2e/goal-plan-coexistence.spec.ts` 契约，没有扩展视口／按钮矩阵。原生附件步骤
仍只证明 chooser 与附件呈现，不能替代 `e2e/pre-session-attachments.spec.ts` 对
Run files／images 的 Host 事实验证；原生执行依然待确认。

## 授权后的原生验收

用户明确允许临时原生验收后，使用已离线构建的 debug Tauri 程序和当前生产 Web／Host
资源，启动独立 profile、独立临时项目和 local-fixture mock 模型。没有安装、重启
现用软件、修改真实项目数据或调用商业模型。

### 查实并修复的问题

- `45a3e76e` 修复验收进程退出核对：Bun 经 signal 结束时 `exitCode` 可保持 null，
  必须等待有界的 `.exited`，否则清理错误会掩盖原始失败并留下临时 Host。纯边界
  单测增至 19 pass／30 assertions。第一次遗留的 owned profile 已 recoverably
  移到 `run-20261002-01/failed-temporary-profile` 保存；后续运行自动释放临时数据。
- 真实原生首发暴露插件重载后的服务引用不一致：command `mode.set` 回答 Plan，
  legacy `mode.get` 却仍是 Default，UI 正确表达 unknown，没有伪造发送成功。
  Agent 用真实 Kernel + Host + SDK 的 `plugin.set` 重载回归先得到红测；
  `4a5e765b` 在 Host 组合根注入 typed Mode／Goal／Plan forwarding ports，每次
  解析当前插件服务，保持用例工厂契约不变。新旧 mode、Goal 与 Plan 双向读写
  1 test／13 assertions 通过；修复范围没有扩大到一般服务迁移。
- 脚本入口和几何按当前实现核对，不回退产品：初始 no-tab 首页首次发送创建；
  侧栏显式 New session 立即创建。重命名绑定原 Session ID，并读取自动标题更新后的
  名称；Lumen 行菜单的触发是带标签的 native summary。选中导航使用当前公共
  `aria-current`／selected paint，不再要求旧伪元素。历史滚动区按实际 client viewport
  居中，侧栏与主区之间明确测量实际 resize separator；没有加宽误差阈值。
- 主 agent 手看截图发现 Files `PATH_DENIED`，拒绝把仅面板出现算成功。原因是脚本把
  项目放在受保护的 Host 数据根里，不是产品权限错误。项目改用独立 owned temp
  sibling，保留保护规则；最终步骤实际列出文件并打开其正文，截图不再显示错误。

### 最终实际结果

最终原生运行在 `artifacts/desktop-native-acceptance/run-20261002-13`，终端 exit 0。
前面的诊断、失败与尚未包含文件正文断言的成功运行均保留，不累加为更多独立用例。
覆盖：

1. 原生自动认证、临时 Host 数据根，外观保存、刷新恢复和恢复默认。
2. 首页选项目、mock 模型、high 思考等级，Goal 准备与 Plan 同时存在；首次 Send
   只产生一个 Session／Run，model 与 thinking 由 Host 回读确认。
3. 原请求上的真实计划审批；批准后同一个 Run 完成，Goal ID 不变、仍 active，
   Host mode 回到 Default，未发送草稿完整保留，JSON 计划没有错误文件链接。
4. 行内重命名、模型浮层 Escape 返回焦点、原生 file chooser 附件呈现。
5. 侧栏 New session 在当前项目创建，返回原会话仍保留草稿；真实临时文件列出并
   读取正文，Files 往返保留工作内容。
6. 默认窗口及原生 900×600 内窗无水平溢出；侧栏展开按 normal flow 缩小主区，
   输入区与工具内容自然换行，没有覆盖主内容。
7. Close 隐藏窗口；桌面退出后 Host 继续存活；独立 SDK 取消 mock Run 并实际结算。

主 agent 查看最终模型／thinking／Goal Plan／会话和 Files 画面，并与 CC 发布主图、
原 ModelSelector 和原 Plan 决策组件的保留实渲对比。实际原生图位于该运行的
`artifacts/ui-redesign/tauri` 子目录；CC 原组件隔离渲染仍不是 CC 原生 Host 证明。
计划批准后即时截图可处于短暂投影更新阶段；后续会话图和 Host 回读确认最终状态。

更新后的脚本通过根 `bun run typecheck`、scoped 类型感知 ESLint、Prettier 与 diff
检查；全仓 `bun run lint` 已在同步后 `07d7bd4d` 基线及本轮 Host 修复上通过。
共享 Lumen 两项 queued 缺失由其所有者修复并 pin 到 `e63a81f3`，不是本任务排除
文件或降低 lint。最终新增变化没有修改生产 UI 样式；Web build 3544 modules 和
离线 Host 资源构建通过，原生程序未重新安装，已有大 chunk 警告仍在。

结束后按精确 data-root／程序路径确认 owned 临时 Host／桌面进程均已退出；最终
profile 与项目目录已由有界 cleanup 删除，只有 ignored 截图、日志和第一轮恢复证据
保留。没有触碰用户的其他 Host、桌面或真实项目。

这是“UI 成果同步 + 当前核心流程的临时原生验收”完成记录，不是完整 CC 功能同等
实现或全套 `bun run check` 通过声明。PTY、内嵌 Browser、Team 等需要新公开后端
契约，仍按[当前交互地图](desktop-interaction-map-current.md)单独列范围；本轮
未新增静态按钮冒充这些能力。

## 文件搜索连续性补充（2026-10-02）

核心入口复核没有把旧审计里的已交付项目重复列为缺口，但新增的真实搜索链发现了
上一轮“文件列表／正文读取”不能覆盖的情况。CC 的 `WorkspacePanel` 把 All 路径
搜索、实际结果焦点、打开与返回保留查询放在同一 Files 流程；视觉／键盘来源与
原组件隔离边界见[路径搜索交付](desktop-files-path-search.md)。

`run-20261002-14` 的真实原生红证据：在 `plugin.set` 更新设置后，文件列表与正文
读取仍可用，搜索未展开目录里的文件却在原面板显示 `QUERY_UNAVAILABLE`。
Host 的文件用例持有启动时的 ExecutionProvider；插件重载释放了它的 workspaceQuery，
因此原搜索入口存在却无法完成。`7b36faf1` 将文件命令的装配改为有类型的当前服务
转发，并在缺少真实搜索能力时仍返回原 capability 错误；没有降低保护、回落到假
本地过滤或顺带重构一般插件服务。

维护的 native smoke 追加一条连续路径：fixture 在未展开的 nested 目录写入文件，
插件重载后搜索 → ArrowDown 聚焦真正结果 → Enter 读取正文 → Back 保留查询。
这不是新的按钮 × 尺寸矩阵，也没有商业模型或真实项目操作。更新 Host 资源后的
最终 `run-20261002-15` 全流程 exit 0，原模型/high、Goal Plan、草稿、文件正文和
窗口／Host 生命周期断言仍通过。主 agent 亲看搜索焦点图及 900×600 的结果／预览
标签／草稿并存图；没有横向文档溢出，预览标签的 pane-owned 滚动不是整页溢出。
红／绿截图与日志分别保留在两次运行的 `artifacts/ui-redesign/tauri` 子目录。

本次原生进程与 owned Host 已确认退出，临时 profile／项目由原脚本有界清理。
独立 Host 回归、严格类型与 lint 结果由修复提交保留；最终脚本 scoped 类型感知
ESLint、Prettier、边界 19 tests／30 assertions 和 staged diff 检查通过。
MSVC 环境下离线 Host 资源构建通过，Cargo 配置弃用／linker 诊断仍保留。
没有新增 UI 样式，没有安装、重启用户桌面、调用付费 Provider 或声明完整 CC 能力
已迁移。
