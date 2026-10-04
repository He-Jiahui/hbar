# Goal / Plan 入口：原因说明与显式恢复

2026-09-26，参考 cc-haha `e28d0a65`，hbar 复查基线 `7191ade`。这是已存在的目标准备与持久 Plan 模式之间的交互补全，不增加 Host 能力、不改变工具审批权限，也不等同于同轮 `exit_plan_mode` 决策。

## 参考、症状与历史依据

重新渲染原版 `ChatInput`、`ModelSelector`、`ReasoningEffortPopover`、`PermissionModeSelector` 和 `ActiveSession`，用中英文、1440/320 视口观察入口层级、浮层、键盘与窄屏结构。原版把 Plan 放在输入框旁的执行模式菜单内，并在不可用时说明具体原因；Goal 使用 slash-command 路径，**没有 hbar 的 Goal chip**。因此本次迁移的是就近解释与明确下一步，不宣称逐个控件完全相同。

参考是原组件及合成 store 的隔离渲染，不是原 Host 或 Electron；hbar 基线是实际生产 App 加隔离真实 Host。54 张截图和观察数据位于 [复查报告](../artifacts/session-entry-recheck/review.md)。例如 [原版中文执行菜单](../artifacts/session-entry-recheck/reference-execution-zh-CN-320.png) 与 [hbar 旧目标准备状态](../artifacts/session-entry-recheck/hbar-goal-prepared-execution-zh-CN-320.png)。

历史核对：`a40a6ce` 将 Plan 从单次 chip 改为会话持久模式，并让 Goal 在 Plan 状态禁用；`c6c2e52` 保留归档会话但限制新的执行准备。`7191ade` 上复现两个入口缺口：目标准备后 Plan 灰显但不说明原因；Plan 已启用时 Goal 灰显且仍显示普通提示。Runtime 的互斥检查是正确的，缺少的是 UI 解释与恢复路径。

## 已实现行为与边界

- **目标准备 → Plan**：执行菜单在灰色 Plan 行外用正常对比度解释原因，并提供独立“取消目标准备”。只调用原 session/revision 的 `composerIntent.setIntent(default)`，保留文字、附件和持久 Goal；菜单保持打开并聚焦重新可用的 Plan。之后用户再次明确选择 Plan 才调用 `mode.set(plan)`。
- **Plan → 目标准备**：Goal 是可聚焦的说明入口，不再是不明原因的禁用项。说明内“退出计划模式”仅执行 `composerPlanMode.setMode(default)`；只有同会话的 canonical ready/default 才显示已退出。关闭说明后，再次明确点击 Goal 才准备输入。不会自动创建目标或发送。
- 当前目标未完成、事实加载/失败、离线、只读、处理中、结果未知分别对应类型化原因。未知结果仅提供原操作的只读核对，不能重复退出或重发。已存在目标不能通过此入口被清除、替换或恢复运行。
- 临时 UI 状态绑定 session 与交互 lifetime；A→B→A、卸载、旧回执不能改变新页面的提示、状态或焦点。关闭和 Esc 保持可用；恢复完成不抢走用户主动移到其他控件的焦点。
- 文案由 Web 宿主的中英文类型化 bundle 提供，组件不导入 Web locale。使用 Lumen 控件与 `sm`/`md` 图标层级。只有已证明为覆盖层的容器定位，内部是普通 flex 内容流；窄屏为底部说明层，标题/关闭与可滚动正文分离。执行选项仍为有界的四种审批选择和一个 Plan 项，没有新增无限列表或业务事实缓存。

## 验证入口

- `tests/composer-intent-availability.test.tsx`：状态优先级、真实 session 身份、未完成目标、只读/离线/unknown、双语与长文案、late lifetime 和安全错误文案。
- `tests/composer-permission-picker.test.tsx`：四种审批选择与独立 Plan、准备阻止原因和取消动作的语义关联。
- `scripts/verify-composer-permission-recovery.ts`：实际组件、Edge StrictMode、可控的本地取消 Promise，中英 1440/320 × pending Esc / 键盘移到关闭两条路径；不连接 Host，不冒充原生验收。窄屏滚动容器可参与 Tab 顺序，脚本使用最多六次真实 Shift+Tab 并记录每一步，不强制焦点。保留红测试与失败证据。
- `e2e/composer-intent-recovery.spec.ts`：实际生产 UI、隔离真实 Host、文字与真实附件、双向恢复、A/B 和延迟/丢失回执；持久化每例 Host 事实和命令计数。不使用付费供应商，不通过发送 Run 制造 unknown。
- 既有 Goal/Plan、Plan unknown、执行菜单与归档只读回归分别运行，不能以新用例替代原有边界。

## 本次实际结果

- 严格 scoped ESLint、根 TypeScript、本功能 TS/TSX/CSS/HTML/文档 Prettier、content/icon/flow guards 及 flow guard self-test 通过。flow guard 脚本整文件的 Prettier 检查失败，已确认 HEAD 原文件也失败；仅格式化新增段，未夹带全文件重排。定向单元共 53 tests / 290 assertions 通过（最终 Goal 可用性与焦点判定 18/115、permission/Plan 18/98、intent runtime 与设计边界 17/77）。
- 最终生产构建为 `index-BpeGXZy5.js` / `index-CYCEtNCX.css`，3,095 modules，保留既有 chunk-size 提醒，不将提醒写成构建失败。
- 最终增强版真实 Host E2E **6/6**，21.5s；[报告](../artifacts/composer-intent-recovery/report.md) 和 `final-focus-results/` 中保留 14 张截图、每例事实 JSON。12 个会话观察均为 0 Run / 0 Goal；有 6 次明确的 fixture 附件上传、16 次明确的模式切换，不能表述为“0 写入”。丢回执后只读核对不重复写模式。
- 既有三套 composer 回归 **5/5**；归档/执行访问回归 **10/10**。这 15 例使用此前 B6 构建（与最终版只差 Goal pending 原生关闭焦点修复），旧例自身含 Demo/mock Run，不计入新 6 例的 0 Run 声明。
- 受控 permission focus **8/8**。最初两个产品焦点红测试保留在 `artifacts/composer-permission-recovery/red/`；提示流调整后一次 320 英文单次 Tab 假设错误另行封存。最终脚本记录滚动容器和 Close 的实际焦点路径，断言未放宽。
- Goal pending Esc 在 B6 真实 Host 上另有明确红测试：浮层关闭但 Goal 未聚焦。相同增强断言在 Bpe 全 6 例转绿；不是只靠 SSR 或最小探针声称修复。
- 原生 WebView2 **4/4**：中英文 × 900×600 / 1440×960，同一最终资源、现有 debug exe。20 张截图、[原生事实](../artifacts/composer-intent-recovery/native/hbar-native-session-intent-SB8vTf/verification.json) 与 [精确清理记录](../artifacts/composer-intent-recovery/native/hbar-native-session-intent-SB8vTf/cleanup.json) 保留。4 次 fixture 上传，0 Run / 0 Goal，0 pageerror/console warning。亲看中文 900 两个方向和 Web 中文 320，原因正常可读，操作可达，无水平溢出。
- 原生 runner 首次用了错误的 command client 读取 `mode.get`，在本地契约校验失败，未形成产品故障；改为公开 `HbarClient.call` 后重跑上述 4 例通过。两次都只停止已核对创建时间、父子关系和完整 argv 的自有进程、清理各自 profile/workspace；调试与 fixture 端口均释放，既有受保护进程没有查询或操作。

仓库 `bun run check` 的 native build、全仓严格 lint 和 TypeScript 已通过；Bun 为 **2221 pass / 1 fail / 24392 assertions / 367 files**，257.13s，整体 exit 1。唯一失败是 `tests/lumen-canonical-boundary.test.ts:97` 检出的 `hbar-ui/packages/lumen-app-ui/src/authentication/QuoteAuthentication.tsx:native-visible-control`，与前一轮相同的非本功能边界问题；没有修改该认证组件或放宽守卫。[完整日志](../artifacts/composer-intent-recovery/root-check.log) 保留，不能称全仓检查通过。

本次没有重建 launcher，也没有以定向原生验证冒充完整 desktop smoke、商业模型或跨设备验收。会话内查找仍只有 [只读模型](desktop-session-find.md)，没有因本次入口修正而变成可用 UI；项目隐藏、别名和跨窗口偏好一致性仍是单独的后续闭环。
