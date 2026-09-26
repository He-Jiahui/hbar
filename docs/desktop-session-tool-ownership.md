# 会话工具归属与返回路径（P2）

本单元迁移 cc-haha 的“工具属于当前会话、切回时恢复该会话视图”体验，不新增 Browser/PTY，也不把本单元验收当作整个桌面迁移完成。参考版本 `e28d0a65`，hbar 修复起点 `090fc0e`；原组件、真实入口、reload 和窄屏边界见[参考审计](desktop-session-tool-reference-audit.md)。

后续 P3 更正：本页的 “Workbench → Back / X 不重新展开” 只对应展开后没有再操作预览的已测分支。重新实测原组件确认：在 Workbench 内打开文件、切换标签或刷新预览后，Back 会恢复同一来源 dock。P3 按此条件补齐，见[原组件两分支证据](desktop-file-preview-reference-audit.md)与[P3 交付](desktop-file-preview-tabs.md)。本页旧资源与当时测试结果仍保留为历史，不回填成当时已覆盖两个分支。

## 症状与依据

真实 Host 基线在中英文均复现：A 打开 Files 并编辑，切到从未打开工具的 B，B 继承 A 的 Files；B 改开 Monitoring 后返回 A，A 又继承 Monitoring。原文件草稿、composer 和材料仍存在，问题是视图归属而非数据丢失。10 张基线图和两份 observations 在 `artifacts/session-tool-ownership/baseline/`，故意失败的两项测试保留在 `baseline-complete-red-results/`。

相关历史 `b196c16` 建立 page/tool/modal 分离，但导航成功时保留全局 `toolInstanceId`；工具栏使用 `app.openPanel` 的 `followActive`，所以同一面板随导航重绑定。`c38d213` 已明确修复显式 workspace 面板不借用当前 session。本轮不逆转这两个公开契约：新增窄范围的会话工具 action，通用 API 仍保留原语义。

## 用户可观察行为

| 动作                               | 当前行为                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A 开 Files，切 B 或另一项目 C      | B/C 初次默认关闭；不继承 A 的面板或目标                                                                |
| B 开 Monitoring，再回 A            | A 回原 Files、模式、路径和草稿；B 记住自己的 Monitoring                                                |
| 工具 X 或再点当前入口              | 只收起该会话的工具；不会保存、清除或取消执行                                                           |
| 关闭会话标签，再明确重开会话       | 默认不弹工具；再次点 Files 可恢复尚未淘汰的缓存和受保护草稿                                            |
| 已归档会话标签退役、随后恢复       | 清后续自动展开记忆；外部归档保留当前阅读工具和设置返回位置，恢复不导航、不复活标签、不删草稿或未知结果 |
| Settings/Status → Back             | 恢复当次会话的工具；从该页主动选 B 时改用 B 的记忆                                                     |
| 失败导航仍留在 A                   | A 的工具仍能重新打开；加载中的导航和过期标签 capture 被拒绝                                            |
| Files → Expand                     | 同一不可变目标进入 Workbench；来源侧栏记为关闭，不复制文档                                             |
| 在 B 开工具，再选 A 的 Workbench   | 暂收 B 的侧栏但记忆不变；工作台仍读 A 的原文档                                                         |
| A 的 Files 已展开，再从 A 点 Files | 定位现有 Workbench，不产生第二份面板                                                                   |
| Workbench → Back / X               | 不擅自重新展开来源工具；来源已关闭/归档时不复活来源                                                    |
| 项目级 pinned Files                | 保留明确 workspace/null-session，跨会话不重绑定，也不写入任一会话的工具记忆                            |
| renderer reload                    | 不持久化工具开关和缓存。会话标签继续走既有持久化契约                                                   |

参考真实 TabBar 关闭会话时会清理 preview。hbar 有可编辑文件、pending/unknown 写操作，故有意只清可见性，保护未保存数据；这一安全差异不能写成逐字段复制参考。hbar 的四种工具也不是参考 Files/Browser/Activity 的一对一能力声明。

## 所有权与容量

`sessionTools.open/toggle` 是内部有类型 client action，输入含 workspace、session 和来源标签 instanceKey。导航目标和标签必须仍匹配；标签已退休但仍选中的阅读视图（包括明确 Restore 后）允许 null 标签。UI 不保存另一份工具数据；Zustand 所有者只保存面板 ID 和被选中的工具。

每个拥有者最多四个槽，最多 32 个拥有者。面板使用 `sessionTool: true`、固定 pinned 目标和稳定 UUID；generic `app.openPanel` 不能重绑定这些 ID。会话工具 X 经原 `app.closePanel/back` 入口收起，但不删除受保护缓存；其它 generic close 行为不变。

容量满时只淘汰未打开会话/Workbench、非当前/返回目标、且没有 dirty/loading/submitting/unknown 的旧拥有者。Files、Agent、Goal、Workflow 的只读公开状态是保护依据，不能跨层查看私有写表。32 个拥有者都受保护时显式返回 BUSY，工具入口下就近给出中英文保存/丢弃/核对与关闭标签提示，不静默丢草稿。被安全淘汰的 Files/Agent 条目和临时版本表随之释放；文件文档继续受既有 32 文档/8 MiB 保护缓存约束。

这里的硬边界是新增会话拥有者 32×4，不把现有通用面板 `MAX_PANELS=8` 的软淘汰误写成全应用硬容量。

## 异步边界

隐藏的 marked Goal/Workflow 释放 watcher/feed，传递读取取消信号并以 generation 隔离旧响应；恢复只进行一次后台核对。dirty、unknown、submitting 和已发送写操作的目标保持不变。后台快照不是写回执，不能抹掉未知动作，也不能让读取开始后确认的新写结果倒退。

Workflow 代理读取仍分批最多 8 个；隐藏后不继续下一批。首次读取被隐藏时终止 loading 状态，避免无写操作也永久占用受保护容量。再次显示若读取失败，原数据保留并可明确刷新，不建立无界自动重试。

Files 的在途读取仍可落到其原固定面板，但不能导航或污染 B；文件写回执丢失后保持未知，只允许明确核对，不自动再写。现有 ClientTransport 没有 Host 远端取消协议，本单元仅保证客户端隔离、释放订阅和停止后续批次，不声称 Host 已物理取消已发送请求。

## 验证

维护入口为 `tests/session-tool-ownership.test.ts`（7 个场景，包含 32/33 容量与当前归档页面返回）、`tests/session-tool-visibility.test.ts`（16 个并发/生命周期场景）和 `e2e/session-tool-ownership.spec.ts`（7 条真实 Host 流程）。归档兼容修正后，两个新运行时文件与原 tab archive 回归合计 **53 pass / 0 fail / 382 assertions**。

最终 Web 生产构建 **3,062 modules / 834 ms**，资源为 `index-PHHwPRy5.js` / `index-BjMvxqM0.css`；Host standalone resources 构建成功。保留既有 bundle 大于 1,500 kB 提示、Cargo config 弃用提示，不将 warning 隐瞒或调高阈值掩盖。

原生使用现有 debug launcher 加上述新资源，**中英 × 900×600/1440×960 四条完整路径通过，32 PNG、passed:true、errors:[]**。验证 A Files/编辑稿/composer → B 不继承 → B Monitoring → A 恢复 → Expand 后切 B → Back 侧栏关闭 → 显式 Files 恢复；原文件未保存，Run 为 0。这里没有重编 exe，也没有把浏览器 320 截图当成 320 原生窗口。

- [最终原生 verification](../artifacts/session-tool-ownership/native/hbar-native-session-tool-ownership-PRI0Nq/verification.json)
- [英文 1440 回 A](../artifacts/session-tool-ownership/native/hbar-native-session-tool-ownership-PRI0Nq/a-files-restored-en-US-1440.png)、[中文 900 的 B 不继承工具](../artifacts/session-tool-ownership/native/hbar-native-session-tool-ownership-PRI0Nq/b-no-inherited-files-zh-CN-900.png)
- [中文 900 Back](../artifacts/session-tool-ownership/native/hbar-native-session-tool-ownership-PRI0Nq/a-back-dock-closed-zh-CN-900.png)、[cleanup](../artifacts/session-tool-ownership/native/hbar-native-session-tool-ownership-PRI0Nq/cleanup.json)

原生 owned PID 37544/11356/24284 已退出，9443/51833 已释放；两个所属临时目录已移除，证据目录保留，旧受保护 PID 9572/48668 未触碰。上一批 KOwg 资源的四条原生验证单独保留，不替代本次新资源结果。

### 发现并修正的回归

首批 KOwg 资源新 7 条真实 Host 已通过，但旧 28 条只通过 25 条：两个用例揭示外部归档把当前 Files 一并收起，违反 `c6c2e52` 的保留阅读合同；另一个 `35a2852` 时代旧测试仍期待 Send enabled，与后续已交付的归档执行准备门禁冲突。产品现以明确 archived Directory 事实区分“当前阅读保留”和“下次自动展开记忆”，并为 Session/Settings/Status 三种返回路径加入运行时回归。旧测试仅将 Send 改为 disabled 并加 archived notice，原 Host ARCHIVED 拒绝断言完整保留。

首批完整 `bun run check` 为 **2000 pass / 0 fail / 14783 assertions**，记录在 `pre-archive-compat-check.log`，它仅代表兼容修正前版本，不作为最终结果。失败、harness 误判和重跑证据均保留，不能拼接部分通过冒充一次全绿。

### 最终冻结结果

- 根 `bun run check` **exit 0**：原生工具构建、严格 lint、TypeScript noEmit 全部通过；Bun **2001 pass / 0 fail / 14813 assertions / 350 files / 267.57 s**。日志为 [final-check.log](../artifacts/session-tool-ownership/final-check.log)。
- 最终新 E2E **7/7，一次通过 51.1 s**，`compat-final-results/`：中英 1440/900/390/320、同/跨工作区、Settings/Status、项目 pinned Files、Expand/Back、source close/archive/restore、原稿/材料保留，以及一次真实临时文件写入回执丢失后的 unknown 和只读核对。观察到该文件只写一次，不自动 replay，未提交 Run。
- 同一 PHHw 资源上的五套既有 E2E **28/28，一次通过 2.4 min**，`compat-regression-results/`：工具容器 6、Files Workbench 4、archive tabs 6、execution access 10、composer Goal/Plan 2。不修改产品去放宽归档执行权限；实际 [外部归档保留 Files](../artifacts/session-tool-ownership/final/compat-external-archive-en-US-1440.png) 已人工复核。
- 最终原生四条验证见上节；根及独立浏览器构建的资源标记相同。所有测试使用临时数据和 local fixture，无商业 provider。浏览器 owned 45083/45085 已释放，相关临时 Host 和 `hbar-session-tool-owner-*` 测试目录已清理。
- 修改文件格式、content/icon guards、`git diff --check` 和两个新文档相对链接检查通过；未改参考布局 CSS，继续使用 P1 的 normal-flow adaptive split/page。

迟到 Files 回复的最终 E2E 因果证据是：释放真实原回复 → B 保持 Monitoring → A 显示真实 lateText → 再选 B 仍为 Monitoring。曾尝试的 Playwright `framereceived`/DOM bridge 无法观察 routed reply，作为失败 harness 证据保留，最终测试已删除这些观察器；不声称第一次 B 断言时 React 一定已消费该回复。详细原始结果与边界见 [verification-report](../artifacts/session-tool-ownership/verification-report.md)。

## 后续范围

真正多文件预览标签（P3）、Browser/PTY 的完整公共能力、全桌面逐入口矩阵及通用原生视觉门禁仍是后续单元。所有提交只包含本功能明确路径，保留工作树内其它任务的修改；不推送、发布或改写历史。
