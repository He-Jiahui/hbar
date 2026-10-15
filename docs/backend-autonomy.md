# 后台托盘与会话自动化

## 原生后台入口

桌面支持 `--background`：启动 Host 与托盘，不创建工作台 WebView。托盘的“打开客户端”按需创建工作台；后台模式下关闭工作台会销毁窗口和 WebView，托盘与 Host 继续运行。“打开网页”使用系统浏览器打开 Host 地址，不在 URL 中传递凭据。

“设置 → 通用 → 桌面启动方式”保存到全局分层字段 `desktop.startupMode`，取值为 `client` 或 `background`，默认 `client`，在下次桌面启动生效。显式 `--background` 或 `--client` 覆盖本次启动，不改写已保存值；两个冲突参数被拒绝。工作区和会话不能覆盖该全局设置。

已保存后台偏好时，`--client` 可以临时打开窗口；关闭窗口仍会释放 WebView 并回到后台。

原生壳通过受鉴权的只读 `/api/desktop/startup` 取得当前 Settings 投影与类型化托盘文案，没有独立的本地启动偏好存储。Controller 尚在恢复时只对这项读取进行有界重试；无法认证或配置损坏不会被当作默认配置。旧 Host 返回 404 时保留客户端启动兼容行为。

同一数据根已有健康 Host 时复用实例。普通“退出客户端”保留 Host；“停止后台并退出”重新读取连接并核对健康实例，再终止其 Supervisor 进程树，不能把陈旧 Host PID 当作当前所有者。停止失败时保留托盘。后台窗口关闭不会弹出原有的退出服务确认框。

## 验证入口

- `bun test tests/desktop-startup.test.ts` 验证真实 Host 下的默认值、保存、重启恢复、非法值、全局作用域、设备鉴权、Origin 拒绝及中英文托盘文案。
- `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --target-dir target/desktop --bin hbar-desktop` 覆盖原生参数、关闭策略、文案容量及既有原生能力。
- 构建 Web、Host 资源与原生程序后运行 `bun scripts/verify-background-tray.ts`。它使用独立临时 profile 和项目，等待当前 PID 的真实 `tray_ready` 事件，再检查没有 WebView 子进程；验证启动偏好、复用 Host、测试客户端进程结束后 Host 存活、实际文件读取 Run 和网页设备配对。最后通过真实原生窗口的关闭按钮，验证窗口销毁、WebView 释放及关闭前正在执行的 Run 继续完成。进程清理不等于验证托盘菜单点击；普通退出和停止归属另有原生单元覆盖。`HBAR_DESKTOP_EXE` 可指定待测程序。
- `e2e/desktop-background-startup.spec.ts` 验证通过真实设置控件保存，在中英文、桌面与窄屏下检查可达性、溢出及刷新后的已保存值。截图和原生结果保存在忽略目录 `artifacts/backend-autonomy/`。

## 网页监听设置

“设置 → 通用”提供全局字段 `backend.webAccess`（`local`／`lan`，默认 `local`）与 `backend.webPort`（1–65535，默认 4317），均在重启后台后生效。局域网模式绑定 `0.0.0.0`，继续使用现有设备配对、角色与工作区权限。保存草稿不会改变当前连接；页面分别显示当前 Host 实际提供的地址和待重启应用的设置。

Host 在绑定端口前，通过存储包的有界只读 Worker 读取已提交的全局设置，再通过 kernel 的公开设置投影解析监听策略。读取不打开写者、不迁移 schema、不执行 checkpoint，也不依赖执行模块就绪。空数据根和旧 schema 沿用默认值；损坏、过大或不兼容的设置明确失败，避免静默使用另一组监听参数。读取支持取消、超时并等待 Worker 退出。

显式 Host `--host`／`--port` 覆盖本次启动。原生桌面采用已保存的监听设置；测试或显式环境配置可以使用 `HBAR_PORT` 覆盖，`0` 表示操作系统分配临时端口。冲突记录 `EADDRINUSE`，不会悄悄改用随机端口。原生启动超时只释放本次启动且尚未就绪的 Supervisor，保留已复用的 Host 和占用端口的其他服务。

- `tests/startup-settings.test.ts` 验证首次读取、WAL 中的提交、数据库与 WAL 字节不变、旧版本无迁移、损坏与过大配置、取消及超时。
- `tests/backend-web-listener.test.ts` 验证持久端口、范围校验、真实局域网鉴权与配对、端口冲突和原服务存活。设置 `HBAR_TEST_HOST_EXECUTABLE` 可针对已编译的独立 CLI 重跑同一流程。
- `bun scripts/verify-background-port-conflict.ts` 使用原生桌面、隔离数据根和受控占用端口，验证启动诊断、未就绪 Supervisor 释放和原监听服务保留。
- 扩展的中英文设置 E2E 同时保存后台启动方式、网页访问范围和端口，验证刷新恢复以及实际地址不会被待重启的设置替换。

该网页监听子功能通过 52 项相关 Bun 测试、源码与编译版独立 Host 的局域网流程、20 项原生单元测试、中英文与窄屏 E2E、原生后台闭环和原生端口冲突验证。验证还包括变更范围严格 lint、全仓类型检查及 Web、Host 和独立 CLI 构建。

设置使用现有工作台描述与受控 Schema 表单，不增加第二套表单、浮层或状态所有者。参考：[settings-form-1](https://pro.reactbits.dev/docs/app-ui/settings-form/settings-form-1) 的设置行与保存区结构；[settings-form-2](https://pro.reactbits.dev/docs/app-ui/settings-form/settings-form-2) 的设置分组和保存状态；实际选择与键盘交互沿用现有 Lumen PopupSelect。

当前托盘入口子功能已通过严格变更范围 lint、全仓类型检查、29 项相关 Bun 测试（356 个断言）、19 项原生单元测试、Web 与 Host 资源构建、2 项中英文浏览器测试和原生后台闭环。通用设置的混合作用域分支此前遗漏了自定义页面的保存区，现由回归测试与真实保存流程覆盖。

全仓基础测试仍有已确认的基线失败：在不含本功能的 `8e00fe91` 独立工作树运行 `context-compaction-overflow`、`chat-database-artifact-references` 和 `chat-database-artifact-upload`，结果为 43 通过、4 失败。三项涉及投影提交故障后已关闭的 Storage 调用，一项涉及 request hook 后的上下文容量；这些既有失败没有被视作本功能通过的检查，也没有在当前托盘子功能中扩大修复范围。

全仓 lint 已完成并通过，后续新增文件另行执行严格 lint。基础测试的大范围运行还报告了 Goal／Plan 目录期望缺少三个 `workflow.targets.*` 指令，以及受管运行时构建超时；重复超时后终止了该轮测试，不能视为全仓通过。其中受管 Controller 鉴权用例单独重跑通过，目录与大范围运行问题仍待最终集成时复核。

## 独立服务入口

`hbar serve` 在同一数据根没有可连接 Host 时启动受管 Supervisor，终端保持运行并显示实际地址与有效五分钟的配对码。它沿用网页监听设置，支持显式 `--home`、数据／缓存路径、绑定地址、端口、TLS、profile 和本地执行限制。服务入口保存供原生客户端和 CLI 复用的本地连接记录，但不增加桌面开发服务器的 Origin 例外。

已有 Host 时，入口通过健康检查及 WebSocket 握手核对实例身份和认证，再显示该实例的实际地址并生成一次配对码；不会创建 workspace 或 session，也不停止原服务。传入的启动覆盖项只在下次真正启动服务时生效。身份不匹配、鉴权失败及畸形响应明确失败，不据此启动第二个 Host。Supervisor 或直接 Host 仍持有存活租约时，有界等待其恢复；真正的进程租约继续处理并发启动竞争。

新建服务由当前终端持有；终端的退出信号只停止本次创建的 Supervisor，Windows 使用整棵受管进程树停止。连接已有服务的入口展示信息后正常退出，原有所有者继续运行。配对生成是一次明确操作，未知写入结果不会自动重试。

`tests/cli-backend-service.test.ts` 通过真实 CLI 服务验证新建、复用、地址与身份不变、设备配对、session 不变、非法启动参数和错误实例拒绝。设置 `HBAR_TEST_CLI_EXECUTABLE` 可对编译后的独立程序运行同一用例。`--unattended` 将在自动推进服务接入时提供，目前不接受该参数。

## 完整目标的后续交付

以下仍属本次后台模式目标，不能把原生托盘入口的交付当作它们已经完成：

- `hbar serve --unattended`、托盘地址复制与配对入口。
- 所有 session 的 Command 目录、描述与执行工具，Host/client/platform 路由及相同权限准入。
- 无 UI 的有界自动调度、普通 Run 重试与修复、Goal 唯一接管、持久次数及未知副作用核对。
- 全局默认与 session 覆盖的三种决策模式，以及决策记录、人工接管和重启恢复。
- 推荐项与模型补全；跨 workspace 的结构化委派、运行中目标引导、循环检测、过期答复拒绝及五分钟默认等待。
- 决策和重试的会话内展示、全部工程门禁及完整端到端验收。
