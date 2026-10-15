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

设置使用现有工作台描述与受控 Schema 表单，不增加第二套表单、浮层或状态所有者。参考：[settings-form-1](https://pro.reactbits.dev/docs/app-ui/settings-form/settings-form-1) 的设置行与保存区结构；[settings-form-2](https://pro.reactbits.dev/docs/app-ui/settings-form/settings-form-2) 的设置分组和保存状态；实际选择与键盘交互沿用现有 Lumen PopupSelect。

当前托盘入口子功能已通过严格变更范围 lint、全仓类型检查、29 项相关 Bun 测试（356 个断言）、19 项原生单元测试、Web 与 Host 资源构建、2 项中英文浏览器测试和原生后台闭环。通用设置的混合作用域分支此前遗漏了自定义页面的保存区，现由回归测试与真实保存流程覆盖。

全仓基础测试仍有已确认的基线失败：在不含本功能的 `8e00fe91` 独立工作树运行 `context-compaction-overflow`、`chat-database-artifact-references` 和 `chat-database-artifact-upload`，结果为 43 通过、4 失败。三项涉及投影提交故障后已关闭的 Storage 调用，一项涉及 request hook 后的上下文容量；这些既有失败没有被视作本功能通过的检查，也没有在当前托盘子功能中扩大修复范围。

## 完整目标的后续交付

以下仍属本次后台模式目标，不能把原生托盘入口的交付当作它们已经完成：

- `hbar serve --unattended`、网页监听配置、托盘地址复制与配对入口。
- 所有 session 的 Command 目录、描述与执行工具，Host/client/platform 路由及相同权限准入。
- 无 UI 的有界自动调度、普通 Run 重试与修复、Goal 唯一接管、持久次数及未知副作用核对。
- 全局默认与 session 覆盖的三种决策模式，以及决策记录、人工接管和重启恢复。
- 推荐项与模型补全；跨 workspace 的结构化委派、运行中目标引导、循环检测、过期答复拒绝及五分钟默认等待。
- 决策和重试的会话内展示、全部工程门禁及完整端到端验收。
