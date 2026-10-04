# 启动连接期间的设置连续性

本单元将 cc-haha 的“稳定设置入口、晚到恢复不抢当前导航”迁移到 hbar 的真实 Host 生命周期，
不复制参考程序的整个 tab store，也不将一个 Host 的实体、表单或未决操作迁给另一个 Host。

## 依据与已复现问题

[启动审计](desktop-startup-entry-audit.md) 保留了原 production App 的 16 场景红测、历史与图片出处。
参考是 cc-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731` 的中英文 `settings-general.webp`、
`Sidebar.tsx` 的稳定 Settings tab、`tabStore.ts` 的晚到恢复意图检查以及 `uiStore.ts` 的分类归属。
发布截图证明页面层级与入口位置，源码证明恢复意图设计；截图本身不证明参考程序的离线或握手时序。

hbar `3b5f35b` 引入的 pending → confirmed runtime 替换会丢设置页；Appearance 保存也会写到
临时 `pending:<origin>` namespace。`80861aa` 解决了语言切换重建，但没有移除真实 Host 的边界。
不能简单删掉 hostId 依赖：持久化与其他 Host-scoped 资源仍需要真实身份。

## 实现边界

- Web 的 `startup-runtime.ts` 用独立 Zustand owner 管理同一 endpoint 的运行时与 Appearance 绑定。
  首次 identity 确认只携带当前全局 Settings 页的原实例、已知分类与侧栏状态；初始化发生在新 runtime
  暴露给 React 之前。若用户已 Back，则不重开设置。未知分类不带入严格构造契约。
- pending runtime 不装配持久化端口，既不读也不写临时 Host namespace。外观初值来自设备 bootstrap，
  可以编辑但 Save、Reset、Check 不写临时端口，使用宿主中英文提示说明尚未确认。
- 首次同 endpoint 绑定保留 Appearance editor/store/草稿，换到真实 preference 端口并读取真实 revision。
  相同 baseline 可安全重定 revision；不同值保留草稿并要求只读核对及明确继续。
  读取失败不视为空默认值，不自动覆盖保存内容。
- 同 Host 重连不重建 owner 或解开 unknown 锁；不同 Host 或不同 endpoint 创建新的所有者，不迁移旧的
  草稿、保存动作、会话、工具、弹窗或返回上下文。异步订阅与旧读取有释放/身份边界。
- 设置分类在新 Host 描述加载期间使用 Web 传入的短小、类型化导航目录，保持同 key 按钮和焦点。
  它只提供标签与顺序，不提供表单字段或写入能力。真实描述到达后仍以它为准，未知和重复项有测试。
- 自动恢复旧页签不能覆盖早期 Settings 意图，包括打开后又关闭、读取中和最终 Session 选择已在等待的
  情况。仅后台选择使用可取消信号；显式选择页签仍可用。取消按现有 navigation error 语义结束，
  不挂在 loading，也不将这次取消显示成页签恢复失败。
- React effect 的 retain/release 采用微任务租约，StrictMode 的即时清理/重设不会处置仍在使用的 owner；
  最后释放会清理原 runtime、偏好订阅与连接资源。

没有新增业务 RPC。Providers 在连接确认前的新增按钮本来就禁用，本单元保持这一能力门控，
不声称迁移了一个原本无法创建的 Provider 草稿。自动连接确认后，可以在原分类再显式打开编辑器。
Appearance 的 conflict 会按既有语义锁定编辑并要求核对，不承诺被禁用的控件仍可接收输入。

## 验证与视觉检查

- 组合定向测试 50 pass / 456 assertions：启动 Settings 构造、设置分类、Appearance 绑定与原 CAS/unknown、
  设备语言、通用页和命令搜索回归。
- 实际 runtime startup owner 15 pass / 106 assertions：三分类原实例、bootstrap、不写临时端口、
  相同/不同 Host、迟到读写、unknown、订阅释放与 StrictMode 租约。
- 页签启动竞争与原归档/Workbench 回归 71 pass / 397 assertions，其中新增 11 项。
- 最后补验启动分类记忆与原 surface 生命周期 9 pass / 56 assertions：即使旧设备导航值尚未更新或读取失败，
  handoff 后 Back 再打开仍使用刚才的已知分类。该命令与前述组合有重叠，不叠加成独立用例总数。
- 真实临时 Host + production App 的 **27 个浏览器场景通过**：中英文、1440/320、General/Providers/Appearance，
  Back、切分类、原 DOM/焦点、真实 namespace 读取及保存/Reset/刷新、已保存值冲突与存储读取失败恢复。
  gate 只延迟真实 `system.hello` 响应并原样释放，不伪造其他业务响应。无 Run 和 Provider 写入。
  最终源重新构建并复跑 **27 passed / 1.5 分钟**，图片/JSON 在 `artifacts/startup-handoff/verified-final`，
  日志为 `e2e-final.log`。62 张截图包含 320 宽下 footer 的真实滚动可达、提示换行与 Save/Reset viewport 验收。
- 首轮 General 最后失败是测试把 `provider.describe` 只读查询错误计为写入，已纠正；Providers 的原焦点
  DOM 断开则是实际问题，由稳定 pending 分类目录修复并在完整矩阵重跑通过。二者没有混为一谈。
- 主线已人工复看参考中文原图、当前 General 与 Appearance 桌面图、320 宽完整内容及滚动到 footer 的图。
- 真实 WebView2 **4/4 启动场景通过**，900×600，中英文 General/Providers/Appearance；扣住真实 hello
  175–238ms 后原样释放，原 DOM/焦点保留，已保存的 active Session tab 没有抢走设置页，未写 pending
  偏好键且无 Provider/Run 写入。复用独立、归属已验证的原生 fixture，不附着用户窗口；新 fixture 已正常
  清理，9441 已释放。图与报告位于 `artifacts/startup-handoff/native`，总脚本日志为 `native-run.log`。
  同次原有 Goal 历史、语言与归档 smoke 也通过，exit0。使用现有 debug launcher 与本单元新构建资源。
- Web production 与 Host 资源构建通过，仍有既有大 bundle warning；没有声称重新编译桌面 exe。
  content/icon guards、定向严格 lint、格式与差异检查通过。首次整仓 check 在原生脚本编辑中间态的未使用
  导入处退出，未进入全量测试；脚本定稿后的最终 `bun run check` **exit0**：原生工具构建、根严格 lint、
  根 TypeScript 均通过，全量 **1854 pass / 0 fail / 13844 assertions，340 文件，230.63 秒**。
  日志 `artifacts/startup-handoff/final-check.log`。这是本轮当前工作树的完整结果，包括已有并行任务的测试，
  不将全部测试计为本次新增；前一归档单元记录的1789/1失败不是本次最新结果。

## 未包含的工作

这不是一般跨 Host 状态迁移，不保存全局 Settings 为永久特殊页签，不迁移打开的 Host 表单/弹窗或未知写。
没有迁移历史遗留 pending storage key，也没有读取或删除用户的旧临时键。
外部归档保留会话的新执行准备门禁是[下一独立单元](desktop-external-archive-readonly-audit.md)，
不能用本单元的启动连续性证明 Send/Goal/Plan/模型归档 guard 已完成。
