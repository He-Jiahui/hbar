# Desktop UI 成果同步

2026-10-02（Asia/Shanghai）。用户明确要求：先完整提交 hbar，保持工作区干净，再同步
隔离分支的 UI 成果。本次操作不包含远端 push、安装、重启现用桌面或商业 Provider 请求。

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
