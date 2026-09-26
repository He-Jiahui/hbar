# Desktop / Web 设备语言入口

本单元迁移 cc-haha 的 **Settings → General → Display language**：选项直接可见、点击原位生效、选择状态明确，不刷新工作台。完整参考入口及修改前真实丢失复现见 [只读审计](desktop-language-entry-audit.md)。这是桌面逐入口迁移的一个独立闭环，不是全桌面完成声明。

## 入口和有意适配

- 冷启动全局 Settings 仍落 Providers；导航顺序为 Providers → General/通用 → Appearance，原位返回、上次分组和 pinned 项目/会话设置目标不变。
- General 是 client/device 分组，不提供 Host／项目／会话 scope 切换。已有 Appearance 保持原独立分组与显式 Save/CAS，不移动或消费其草稿。
- 原参考有五套翻译，hbar 实际只有中英。只提供 English、简体中文和“跟随环境”，不伪造繁体、日文、韩文或模型回复语言。
- 自动策略沿用 `resolveShellLocale`：环境列表中首个中英文，无匹配则简体中文。界面说明这项 hbar 策略，不将其描述为参考原策略。
- 所有标签由 Web/Desktop 宿主提供 typed copy；选择列表固定三项，非用户输入/远程无限列表。布局使用正常 flex-wrap，窄屏保留已有分组 select；不照搬参考固定设置轨道。

## 所有权与可靠反馈

`language.ts` 是独立 Zustand owner，存储键 `hbar:web:language`，不使用 Host settings 或 Appearance preferences revision。选择即时应用本窗口，随后同步写本地存储；损坏/不可读值明确回退跟随环境。写失败保持已应用语言，明确“不保证重载保持”，只提供本地显式重试。重试成功按钮卸载后焦点回当前选中 radio，继续失败保留原按钮焦点。

`LanguageApp` 注册并清理相关 storage / languagechange 监听。`App` 的 runtime、Client、附件/资源控制器、Appearance editor 身份不再依赖 locale。稳定 `runtime-copy.ts` callbacks 在新动作发生时读取当前语言，Command 文案与 Plan 请求 formatter 更新；不把已有正文翻译、重发在途动作或更改原操作目标。document `lang` 同步更新。

本地存储实际范围是当前 Web origin / 原生 WebView profile，**没有新增原生全局偏好 IPC**。真实同 origin 浏览器两窗口传播已验证；不同 Host origin、原生多窗口广播、操作系统语言变更事件是否由 WebView 发出、退出并重新启动桌面后的 origin 保持，均未在本单元验证，不能据 listener 推断。

Settings 的 client custom group 不被无关 Host form 读取失败挡住。Host/usage/diagnostics 等 custom group 仍需真实 Host form；不存在把所有 additionalGroups 当离线可用的假状态。

Settings 有意暂时隐藏会话工具并保存在原 `returnContext`，Back 恢复原 Files。语言切换保持这一行为，不要求工具在设置正文同时可见。

## 验证和视觉证据

- 定向 Bun：`web-language`、`web-general-settings`、`settings-workspace`、`appearance-editor`，**30 pass / 0 fail / 325 assertions**。
- workspace public-entry guard **2/2**；design-system、Lumen canonical/production、Web shell guards **13/13**；General stylesheet flow guard通过。严格根 lint、最终根 typecheck 通过。
- `e2e/web-language.spec.ts` 独立生产目录与真实临时 Host，**3/3**：中英 1440/900/390/320、冷落 Providers、焦点和原位分组、同会话草稿、Back 原 Files、未保存 Dark、无 Client 重连、保存后重载、损坏值、离线保存失败/重试、键盘 Home/End/arrow。
- 第三项使用真实同 origin 第二窗口的通用语言按钮切换，第一窗口继续显示原会话及 `browser-e2e.md` 编辑器。原精确未发送文本与未保存文件内容均保持；磁盘仍是原内容，Host Runs 为零。不是合成一次 DOM lang 赋值。
- 独立原生复用 `verify-desktop-goal-lifecycle.ts` 的已校验临时 profile、workspace、进程父子/创建时间/精确 argv 及独占 9441。使用现有 debug launcher + 新建 Host/Web resources；**没有重新编译 desktop exe**。Goal 1440/900×600 回归和 General 中英900原位选择、Appearance dirty、会话草稿、重载中文均通过，无 provider Run。新 fixture 正常清理。
- 独立原 General 组件 Browser 验证中英四宽度、长宿主标签、读写失败、radio 键盘、重试成功和失败焦点；不是复制参考组件。选中状态截图等待真实 CSS transition 结束，避免旧背景被当作新选中项。

截图：

- [中文320生产页](../artifacts/desktop-entry-matrix/language/production-zh-CN-320.png)
- [英文1440生产页](../artifacts/desktop-entry-matrix/language/production-en-US-1440.png)
- [离线保存失败320](../artifacts/desktop-entry-matrix/language/production-offline-save-error-320.png)
- [真实两窗口文件草稿](../artifacts/desktop-entry-matrix/language/production-cross-window-file-draft-1440.png)
- [原生英文900](../artifacts/desktop-entry-matrix/language/native/general-en-US-900.png)、[原生中文900](../artifacts/desktop-entry-matrix/language/native/general-zh-CN-900.png)、[原生验证 JSON](../artifacts/desktop-entry-matrix/language/native/verification.json)

## 首轮问题与验收边界

修改前 locale 依赖重建 runtime，真实复现丢会话草稿、Files 和 Appearance dirty，document `lang` 未更新。问题不是缺一个语言按钮。

生产测试首轮错误地要求 Settings 内仍显示 Files；查 `surfaces.ts` 后改为精确验证原有隐藏/returnContext/Back 语义，并新增真实两窗口保持可见 Files 草稿。原生首轮在900隐藏 Sidebar 时未展开就点击 Settings，修正测试进入路径后重跑通过。独立 UI 审查发现重试成功焦点落 BODY，修正产品局部焦点恢复并重验。首次 build 被外部通知任务尚未落盘 CSS 阻断，完整落盘后重建成功，未修改其代码。

生产 build 保留既有大 bundle warning；Host resource build 保留已有 cargo config/linker warnings。根全量测试仍需最终工作树统一重跑；本单元的30项及浏览器/原生通过不替代全量，也不替代仍未收口的通用 desktop-smoke 导航材质门禁。Goal、模型、插件、归档与其它入口继续分别审查，不把本页算成全部 UI 操作逻辑一致。
