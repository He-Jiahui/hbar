# Desktop 会话归档、恢复与页签生命周期核对

本轮只迁移参照产品的“确认对象操作后收回对应会话页签”的交互闭环，不把 cc-haha 的永久 Delete 改名当作 hbar Archive。hbar 的归档保留历史，可以恢复；它与移除本地页签、隐藏项目、取消 Run 是四种不同操作。

## 证据等级与参考入口

实际查看了 cc-haha 仓库发布的桌面 `D:/Git/cc-haha/docs/images/app/en/session-new.webp`、窄屏抽屉 `D:/Git/cc-haha/docs/images/app/zh-CN/h5-sessions.webp`。二者直接证明 Search chats 邻近 Refresh/批量管理、项目层级、项目右侧菜单与新建会话、窄屏侧栏覆盖主区域。截图没有展开会话右键菜单、确认弹窗或项目菜单；下表这些展开行为是原源码证据，不冒充运行截图。

| 原入口                | 实际动作与归属                                                  | 确认、反馈与键盘                                                                                                   | 原源码                                                                                            |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 会话行                | 打开原 session tab，连接原 session；移动端收回 drawer           | 批量模式时改为选择，不跳会话；Shift 选范围                                                                         | `desktop/src/components/layout/Sidebar.tsx:776–806`                                               |
| 会话右键菜单 Rename   | 原会话就地编辑标题，不切换主视图                                | 保留编辑文本；Enter/取消分支由行组件处理                                                                           | 同文件 `887–905`、`1480–1500`                                                                     |
| 会话右键菜单 Delete   | 删除原会话文件，**不是归档**                                    | 确认后完成删除，再断开该 session 与关闭其 tab                                                                      | 同文件 `763–774`、`1627–1636`；`src/server/services/sessionService.ts:3916–3925` 使用 `fs.unlink` |
| Search 旁批量管理     | 切换选择模式；选择组、全选、取消全选、删除选中                  | Ctrl/Cmd+A 跳过可编辑目标；Esc 退出；确认展示最多五个目标及剩余数；只对服务器确认成功的 ID 断开/关闭，失败单独提示 | Sidebar `809–847`、`906–923`、`1096–1158`、`1638–1668`                                            |
| 项目右键/更多菜单     | 编辑显示名、Pin/Unpin、打开系统文件管理器、Hide/Restore project | 隐藏与恢复的是客户端项目名单偏好，不是被删除会话的恢复                                                             | Sidebar `1518–1543`，隐藏偏好处理 `685–729`                                                       |
| Projects 标题更多菜单 | 项目组织方式、创建/更新时间排序、恢复隐藏项目                   | 与单项目/单会话操作分层                                                                                            | Sidebar `1548` 起、`1919`                                                                         |

参考中的直接删除与批量删除不适合照搬：当前 hbar 公开 Host 只有单目标 `session.archive`，没有具有逐项持久回执的批量删除/归档契约。本轮不添加假 bulk、Delete 或“恢复已删除历史”。

## hbar 现有入口与本轮修复

| hbar 入口/状态                | 已有行为                                                                                       | 本轮页签闭环                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 会话行 More → Archive         | `session-navigation-row.tsx:264`；捕获原 workspace/session，原行确认；取消默认聚焦，Esc 可退出 | 意图和 loading 不退役；只接受已验证、单调的 Host archived 事实                                              |
| 原目标归档确认                | 解释从常驻名单隐藏、保留历史、可恢复；目标移出可见名单后反馈仍在原 project                     | 成功退役匹配 workspace/session **及捕获 instanceKey** 的 Session tab；不选择邻居，不取消 Run，不清 A/B 草稿 |
| unknown → Check result        | `session-archive.ts:224`；只读 `session.get` 原目标，不重新执行 archive                        | unknown 页签仍在；只有读到原目标 `archived === true` 才退役。原目标相反/缺失/失败仍 unknown                 |
| 项目 More → Archived sessions | `lumen-workspace-shell.tsx:737`；100 条 inclusive page，客户端显示 archived，First/Next 有界   | 恢复只回名单，不自动创建页签或导航；用户再打开时建立新 Session tab instance，内存草稿仍保留                 |
| Sidebar observational refresh | 已有 session roster 观察式更新，不清当前选择/草稿                                              | 已确认外部归档只退役对应 tab；观察者不取得导航写权限；刷新恢复原空工程，不暗选 B                            |
| 主区域 Files Workbench        | 稳定 pinned panel instance、原 workspace/path 文档缓存                                         | 即便来源 Session 被归档，工作台 tab、surface 与未保存编辑稿都保留；不替用户关闭 Files                       |
| 本地归档当前 A，B 仍打开      | 原目录 unavailable writer 清 A 的 navigation，不隐式选 B                                       | 保存原 `activeWorkspaceId` + `activeId:null`，刷新后仍是原工程空会话；B tab 保留但不被暗选                  |
| 已保存 32 个 Session tabs     | 并行四个 Host 验证，最多 32 refs                                                               | restore guards 在最终验证后、重新选 active 前释放，避免第 33 个 guard 导致 BUSY/停在 loading                |

实现分工是 Directory 传递**经过 schema 与已有 seq/updatedAt 单调筛选的确认事实**，Tabs owner 执行 `retireConfirmedArchivedSessions`。展示层仍显示真实 tab 状态，没有偷偷过滤 archived tabs 制造第二份名单。没有新增公有命令、Host 改写、receipt、Run 调度或 Files 文档代码。

## 首轮发现与原因

审计不是只比较 DOM 坐标。用隔离的真实编译 Host/Web 点击 A 归档，并在 B 保持活动/输入时记录了 `hbar-observations.json`：Host `archived:true`、sidebar A 消失，但 A Session tab 仍为 1；点击该 tab 报 `SESSION_ARCHIVED`，B 仍在。图 `hbar-confirmed-archive-tabs-1440.png` 同时显示 sidebar 已归档与 header 残留 A tab。

历史核对了 `e855123`（归档/恢复闭环）、`8cbb181`（Session tabs 基础）、`3080c71`（observational roster）；前两功能独立落地后缺少确认事实的组合接线，不认定为某一提交破坏旧功能。Directory 原 callback 只处理 selected navigation，Tabs 原本只禁止新开 archived，而没有接受已打开对象被归档的事件。

首轮新的 Bun 测试先以确认归档/unknown 核对两用例复现：2 fail，tab A 留在名单。后续修复发现并封住：

1. close 的邻居验证本身收到归档事实，会改变 tabs revision；允许只由本 owner 确认退役造成的 revision 重基，其他导航、move、打开竞争仍 BUSY。若 checked neighbour 已退役，不激活/重新插入它。
2. 旧 selection/restore 已拿到未归档 DTO、还在 workspace 验证时，被新归档事实失效。Directory 1000-cache 驱逐不能把旧回执当新；不依赖 cache 缺席，也不建立长期 Session 镜像。
3. 旧 archive/get 响应低于已确认的 restore seq 不关闭已恢复的新 tab、不清导航。schema/target 失败与 loading/缺席也不算 confirmed archive。
4. 32 个 restore guards 持有到发布检查后释放，新的 active selection 使用自己的 guard。
5. 本地当前 A 归档后的空工程要显式持久化，不能让 saved active fallback 在刷新时暗选 B。外部当前 A 的已载入视图依然原样保留，但保存引用同样是原空工程；用户明确选 B 后清除 marker 并保存 B。有效来源 B 的 Files Workbench 不被 A 的 marker 覆盖。

短期 guard 最多 32 个，已知 session ID 只接收相同 ID 的 archive identity；未知 ID 的名称解析 guard 至多记录 32 个 identity，达到上限则 `NAVIGATION_SUPERSEDED` fail closed，要求新操作，而不是谎报该任意目标已归档。每次选择/恢复 `finally` 与 runtime dispose 释放。Session read 的更高 seq/time floor 也只在 read 在途时存在，remote registry 总并发上限 32，完成/失败/dispose 即释放。

最终审查还精确复现了“请求开始前已经知道版本，但等待期间缓存被驱逐”的同族边界。原 `session.get` floor 只观察开始后的事实，导致开始前已知 restored seq3、随后驱逐 A、旧 archived seq2 回来时误关新 instance；`seed-get-red.log` 保留红测。普通选择与 saved restore 若开始时已知 archived seq2，缓存驱逐后的旧 unarchived seq1 也会先发布/激活 A；`initial-selection-red.log` 两项失败，fresh restored seq3 用例通过。修复为 get floor seed 原目标 canonical 版本，selection 捕获只读 canonical snapshot，restore 最终保留 `(id,workspaceId,seq,updatedAt)` 四字段 stamp。初始 archive 只阻止不高于该版本的旧回执，真实较新的 restoration 仍允许打开，不永久封禁原 ID。

seed 不能把真实的缺失读取当过时：第一次加 seed 时，既有 vanished selection 测试与释放容量槽的 late-roster 测试真实失败（`focused-seeded-get.log`）。修复明确区分初始 seed 与读取期间的更高确认版本；仅初始版本不阻止新的 null，期间较新 fact 则使 null non-authoritative。既有独立查询契约、真实删除投影、late roster 与上述新选择/restore 一起回归，没有改旧断言迁就实现。

旧 `session.archive` ACK 原本直接走 workspace write port，绕过 get 的短期 floor。`late-archive-ack-red.log` 证明 ACK seq2 等待期间原目标恢复为 seq3、重新打开、切 B、跨项目驱逐 A 后，旧 ACK 会退役新 instance。get 与 archive 现共用最多 32 个在途版本 floor，原 archive consumer 仍收到自己的 ACK DTO，但旧 ACK 不 merge、不退役、不调用 unavailable。取消只释放投影保护且禁止该请求晚回写，不谎称服务端写入撤销；finally/dispose 释放。新增测试实际占满 16 get +16 archive，第 33 个 `CAPACITY_EXCEEDED` 拒绝且不调用 Host，取消一个后可新请求，旧取消 ACK seq99 不污染当前 seq1，再完成后容量恢复。容量不是 Host 活动 Run 的 `BUSY`，避免错误提示用户停止无关运行；主代理负责对应宿主双语提示和单测。named retirement action 只留 Tabs owner 内部订阅，不从 publicAppRuntime 暴露任意调用，防止 caller 伪造 confirmed facts。并未把这套保护扩展到 rename/create 的其他潜在迟到写回边界，后者需独立审计。

主代理进一步用真实 runtime → `SessionArchiveFeedback` 的双语 SSR 测到容量码被旧 owner 分到 unknown，导致新局部说明与手动重试看不到：初轮 2 BUSY 绿 / 2 CAPACITY 红。`session-archive.ts` 只在明确拒绝白名单新增 `CAPACITY_EXCEEDED`，不改变通用 transport/未知错误分类。新增 actual-floor 测试在原 A preflight 成功后占满真实 32 个局部 projection，归档入口返回明确 failed、原目标与容量码，A 的 Host write 次数为 0，cancel 可用，未凭假错误注入宣称写入未发生。主代理新增反馈 4 测试 / 40 assertions，连原 archive 套件为 21 pass / 139 assertions；中英局部 alert 不假冒 Run 忙、不冒 unknown，真实 Host BUSY 解释仍保留。

主代理完整回归还发现了本单元真实兼容性问题：最初 floor 对旧独立 `session.get` consumer 抛 `QUERY_SUPERSEDED`，破坏了既有“自己的查询可以完成、但不回写新投影”合同；`tests/app-runtime.test.ts:221` 失败。修复为较旧 response **non-authoritative**：仍返回该 consumer 原 DTO，只禁止 merge 和 unavailable 副作用。selection 的原目标 guard 在 get 之前已存在，独立地阻止旧归档 selection 重开；rename/unarchived 旧查询不被错误拒绝。没有调整既有测试或弱化 guard。完整 `app-runtime.test.ts` 随本单元测试一起重跑通过。

继续审查又实证了缓存驱逐后的迟到页：A 已恢复为 seq3 并重新打开，原 `session.list` 页的 archived seq2 回来时缓存没有 A，旧实现把它当新事实，误关恢复后的新 instance。`late-page-probe.ts` 首次 JSON 显示 Host `archived:false/seq3`、projection `archived:true/seq2`、`reopenedRemains:false`。Roster 绕过 Directory queries，直接 `options.directory` 读取并在完整扫描/四并发 get 结束后合并，因此另加“已收集 A 的旧 get，等待 C，期间恢复 A、跨项目页驱逐 A，再确认 null 释放槽”的红测。单纯恰好 1000-cache 全满会 skip 旧 A，不能误以为版本保护已成立；释放槽后两个入口均失败。红测保留 `late-projection-red-cross-workspace.log`。

修复复用 `session-projection-fence.ts`，只记录正在读取/扫描期间该 workspace 的 `(id,seq,updatedAt)`。seed canonical ≤1000 版本，订阅 accepted facts 更新；Directory 普通页在单请求期间持有，Roster 在**整次扫描到最终 reconcile**期间持有。旧 item 与旧 absent basis 按版本过滤，原消费者仍收到自己的 DTO/完成刷新；不向 `skipped` 填旧版本数，因为它现有文案专指容量导致未显示的新会话。1001 个 identity 时整批 non-authoritative，Roster 明确 `QUERY_SUPERSEDED`/Retry，不谎报刷新完成；Directory 独立页仍返回原 DTO但不合并。每页请求上限 32（registry 也有总 32/单 Session list 16 上限），Roster 8 个独立扫描；取消、finally、dispose 退订并清空短期版本。纯 fence 验证 foreign workspace、旧时间、1000/1001 和幂等 dispose，整合测试验证原稿/页签保留与有界重试。

底层 SDK 不能端到端 abort，因此取消后的原 transport handler 仍占 registry 并发槽直到响应。补测保留 16 Cancelled handler 后第 17 次 BUSY 的背压，不把取消冒充网络已停止；晚 archived 响应在 runtime 存活或 dispose 后都不回写/退役。最初压力测试误期望可以再开 40 个未完成请求的红结果保留 `focused-projection-final.log`，修正验收以实际有界合同为准，没有改 registry 放宽并发。

## 真实 Host 验收与视觉产物

专用 `e2e/session-archive-tabs.spec.ts` 使用真实 typed Client + 临时 Host/workspace/profile，测试 Host `44923`、Vite production preview `44925`；生产资源只写 `artifacts/desktop-entry-matrix/archive/web`。没有覆盖共享 dist，也没有连接或终止用户桌面进程。

中英各运行归档/恢复/unknown 与 Files 工作台流程。1440、900、390、320 四宽检查根页面不横向溢出，并保存以下真实产品截图（gitignored 产物）：

- `artifacts/desktop-entry-matrix/archive/confirm-{en-US,zh-CN}-{1440,900,390,320}.png`：原目标明确、取消/确认可达，窄屏自然换行。
- `.../confirmed-{en-US,zh-CN}-1440.png`：只有存活 B tab，B composer 保留原草稿。
- `.../workbench-{en-US,zh-CN}-{1440,900,390,320}.png`：来源 A tab 退役后工作台仍选中，未保存编辑稿与磁盘原文件不混淆。
- `.../external-active-boundary-1440.png`：外部归档后的已载入原 A 视图保留，tab 已退役；见下节真实 UI 边界。
- `.../external-empty-reload-1440.png`：外部当前 A 归档且 B 仍打开时，刷新恢复原空工程；此后明确选择 B 再刷新，才重新激活 B。
- `.../local-current-empty-reload-1440.png`：本地归档当前 A 后刷新，B 没被隐式激活。

审计前编译 Host/Web 的首发现图、脚本与 JSON 保留同目录：`hbar-row-menu-1440.png`、`hbar-original-target-confirm-1440.png`、`hbar-confirmed-archive-tabs-1440.png`、`hbar-archived-tab-rejected-1440.png`、`hbar-archived-list-{1440,320}.png`、`hbar-observations.json`、`verify-hbar-archive.ts`。这是实际 hbar，不是复制 reference 的演示图。

红测产物也保留：首次 E2E `results/` 两项在 B 导航未完成时向旧 A composer 填稿；修为先等待真实 heading B、再断言 B 稿件，`results-r2/` 主五项通过。新 reload 测试的 `results-final/` 首次误把 fixture 最后创建的 ready Session 当首项；后一个 `results-final2/` 又记录了测试 patch 放错作用域导致的错误。均为测试目标选择错误，未靠修改产品或降低断言掩盖。`results-verified/`、`results-authoritative/` 六项通过后，含最终普通页/Roster 共享版本 fence 的生产构建在 `results-projection-final/` 再次 **6 passed，25.9 秒**。

最终 get/selection/restore seed 与 archive ACK floor 的当前源生产 build 通过（1.16 秒；既有大 chunk warning），再次执行六项真实 Host 流程：`results-safe-final/` **6 passed，22.3 秒**，日志 `e2e-safe-final.log`。构建前确认外部共享 UI 的 `notifications-system-reference.css` 已存在，没有使用旧 bundle 代替当前源。中英文四宽图重新写出并实际复核了 en-US1440 confirmed 与 zh-CN320 dirty Workbench。上一轮 `results-delivery/` 中文 B 已有 heading 但 CM 还未 editable 的同步失败，改为明确等待该输入可编辑，不 force fill、不更改产品；该红 trace 同样保留。

内部 retirement 不再公开、容量码与明确 failed owner 分类及宿主双语文案都稳定后，最后一次当前源独立 production build **2.11 秒通过**（`build-owner-capacity-frozen.log`），六项真实 Host **6 passed，22.6 秒**（`results-owner-capacity-frozen/`、`e2e-owner-capacity-frozen.log`）。上述截图再次写出；端口与该次临时 Host/browser fixture 已释放，仅保留 ignored 日志/图片。结束 Host 时 Vite WS proxy 记录 ECONNRESET，浏览器测试的 pageerror/目标/草稿/溢出断言均通过，不把正常连接终止日志冒充失败或隐藏。

## 仍存边界，不属于已完成能力

- **外部归档当前 A 的前端只读呈现仍未完成。** 为保留已经验证的 observational 导航策略，刷新后原 A 的已载入页面/内存草稿不抢走，tab activeId 为 null。真实 Host 拒绝新的 `run.submit`，错误码 `ARCHIVED`；当前 Send 仍 enabled。建议下个独立单元在 session-bound archived fact 下显示只读提示/禁用新提交，同时保留原稿、历史、Files。不能描述为本轮已实现。
- unknown 的 `session.get` 只确认该时刻原目标状态；它不证明旧写入不会迟到，不是持久命令 receipt。未读到期望态时保持原 intent unknown、不得盲重放；本轮没有改这个合同，也不宣称断开/重启后 archive intent 持久化。
- 会话行目前使用有可访问名称的 More 菜单，非 reference 的右键位置。页签已有 right-click/Shift+F10、方向键/Home/End 与 Delete 关闭视图；这些不是删除/归档快捷键，不新增未经证实的 shortcut。
- Archived session.list 是 inclusive 页。某页没有 archived 但存在 next cursor 时已有“本页无归档项”与 Next，不把它叫项目无归档。本轮不优化 Host 专用 archived filter 或最新更新时间增量合同。
- 删除不存在的 Session tab 保留原现状；本单元只有 Host `archived:true` 确认事实才执行归档退役，不扩大为缺席/缓存驱逐/错误都关闭。
- 上述截图上的共享 Lumen boundary 指示线属于既有视觉表达，本轮不改共享 UI、图标尺寸或 CSS。宿主仅补充本地容量拒绝文案，和 Host 活动运行 BUSY 明确分开。Workbench 不跨浏览器重启恢复未保存稿，本轮只验证运行中的原 instance/cache 保留。
- 旧原生首失败 fixture 的两个 Host/临时目录此前 cleanup 被策略拒绝，按主代理要求保留。本轮不处理旧 PIDs/目录，也不修改外部 dirty desktop-smoke。

## 验证记录

主代理补充独立原生900×600验证：`verify-desktop-goal-lifecycle.ts` 在既有经过精确argv/父子进程/创建时间/独占9441与Host origin校验的临时fixture内调用 `verify-native-session-archive.ts`。实际点击原行确认，A页签与常驻行退役，B仍选中且原输入保留；恢复A不抢B，用户重新打开A后原内存草稿保留；再归档当前A并等空workspace偏好保存，reload不暗选B。原生图片/JSON为 `artifacts/desktop-entry-matrix/archive/native/`，source/A均无Run。使用现有debug launcher加本轮Host/Web resources，未重新编译exe，新fixture正常清理。首轮脚本未在900选择会话收回Sidebar后重新展开，读到summary但不可见；修正正常入口后完整重跑通过，不使用force click或修改产品来绕过。

定向命令：`bun test tests/app-runtime.test.ts tests/workspace-tabs-archive.test.ts tests/session-projection-fence.test.ts tests/workspace-tabs-runtime.test.ts tests/workspace-tabs-workbench-runtime.test.ts tests/session-archive-runtime.test.ts tests/session-roster-refresh.test.ts tests/session-roster-runtime.test.ts --timeout 30000`，稳定产品版本 **106 pass / 0 fail / 542 assertions**，其中新增 archive-tabs 30 项与纯 projection-fence 3 项。覆盖确认/unknown、A/B 原稿、当前/非当前、Files、外部观察、迟到选择/restore、旧响应、新 restore、缓存驱逐、迟到页/扫描与空槽、1000/1001、cancel/backpressure/dispose、32 tabs 恢复、本地/外部空工程重新恢复与明确选择 B 后刷新，以及初始 canonical seed、get/归档 ACK 共用容量与释放、实际 floor → failed archive intent。最后稳定日志：`artifacts/desktop-entry-matrix/archive/focused-owner-capacity-final.log`（28.74 秒）。主代理新增 4 SSR / 40 assertions 单独记录，不混入这 106 项的统计。

主代理随后把上述八套与 `session-archive-copy.test.tsx` 合并实跑：**110 pass / 0 fail / 582 assertions，9 文件，23.36 秒**，日志 `artifacts/desktop-entry-matrix/archive/final-main-acceptance.log`。容量反馈的初次 SSR 红测为2 pass/2 fail：owner 尚未将 pre-dispatch CAPACITY_EXCEEDED 识别为明确拒绝，展示 unknown 核对入口而非容量原因。新增明确拒绝白名单后，原目标局部 alert、failed、Cancel 和双语容量解释均验证；generic/transport unknown 不被放宽，真实 Host BUSY 的停止运行说明保持原语义。当前根 `bun run typecheck` 和新增三路径 strict lint 均 exit0；不将其冒充整个串行 check。

最后封口源已重新构建 Web 与 Host resources，并完整执行隔离原生脚本 exit0，日志 `artifacts/desktop-entry-matrix/archive/native-frozen-final.log`。原生覆盖 Goal、语言和上述900归档基础流程；32槽容量压力由实际 owner 的 Bun 测试和四条SSR反馈验证，不宣称原生压测通过。仍使用现有debug launcher，未重编桌面exe。

13 代码/测试路径严格 ESLint 通过；owner-scoped strict typecheck 通过；生产 build 通过（现有大 chunk warning 保留）；自有 `git diff --check` 通过。早一轮 root typecheck 通过，后续 root typecheck 新报外部 `scripts/reactbits-pro-audit.ts:3116/3396/3932` 诊断，不修改外部文件。主代理首轮全仓测试为 1727 pass / 2 fail（本单元独立查询兼容性与外部 notification registry）；本单元问题已由以上完整 app-runtime 定向回归证实修复。完整仓库最终重跑与原生门禁由主代理统一执行，未运行/外部失败不作为已经通过。

主代理本轮集成 Bun 测试日志 `artifacts/desktop-entry-matrix/final-integrated-unit-suite.log` 为 **1783 pass / 1 fail / 13447 assertions，334 文件，249.17 秒**；剩余失败为外部 `hbar-app-ui registry` notification semantic variants，不属于本单元，未修改或弱化其断言。该日志早于最后容量反馈/owner 补测，不把它冒充最后完整树的 full check。本单元迟到响应和独立 consumer 的真实兼容性回归均通过。串行 `bun run check` 曾在外部 notifications Header/fixture lint 问题处停止，不能声称整仓 check 绿色。最后 own 13 路径 lint 与 strict typecheck 的 exit0 日志分别为 `lint-owner-capacity-frozen.log`、`typecheck-owner-capacity-frozen.log`；原生产品/资源统一验收结论由主代理记录，不通过只读源码冒充原生能力。
