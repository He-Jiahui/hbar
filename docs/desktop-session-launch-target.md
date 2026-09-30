# 会话启动位置：分支、隔离工作树与文件目标

本记录是 `codex/session-launch-target` 隔离分支上的交付及后续验收边界，**不是已迁移到主工作区、已安装或 UI 已完成的声明**。参考仓库保持只读；本次核对的 cc-haha revision 为 `e28d0a653481ef41b7a329411eeb2f0fd5656731`。

## 参考表达及 hbar 的差异

参考 `desktop/src/components/chat/RepositoryLaunchControls.tsx` 是输入区内的单一位置入口：根视图说明目录、分支和当前／隔离工作树，分支列表可搜索并进入创建分支子视图。取消创建回到列表，成功后关闭菜单并在触发器上显示选择。桌面为锚定菜单，移动浏览器使用 bottom sheet；同一组件区分 toolbar 和 outside 两种正常流位置，不需要重复业务事实。

`ChatInput.tsx` 在首次发送前使用可编辑的 launch controls，已有消息后使用只读 `ProjectContextChip`。实际首发提交把位置和 repository 选择绑定到原会话；项目归属不随临时工作树变成新项目。组件画面只支撑可见表达和被实际操作的状态，不代替真实首发与 Host 行为验收。

### 2026-09-29 参考取证的有效范围

只读审查确认 `EmptySession.tsx` 的桌面入口在 composer 工具行中，位于加号／权限模式之后、模型／Run 之前；H5 窄屏把同一入口放到 composer 面板之后。`RepositoryLaunchControls` 用 `useMobileViewport() && !isDesktopRuntime()` 决定是否使用 bottom sheet，不能仅根据窗口变窄就把 native 菜单改成 H5 sheet。

| 交互                        | 当前源码／已有测试所表达的语义                               | 本次证据界限                                                     |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Directory／Branch／worktree | 单一 Location pill 内分层进入，不在外部放三个重复入口        | 当前真实组件的桌面锚定菜单、H5 sheet、可见层级及 computed styles |
| Current／Isolated worktree  | 选择后更新 parent-owned launch choice 并关闭菜单，不立即运行 | 已捕获两张 radio card 和选中态；本次未操作切换或真实首发         |
| New branch → Cancel         | 返回分支列表，而不是退出全部选择流程                         | 两个视口实际点击并捕获 Cancel-return，未调用创建 API             |
| New branch 空名 → Create    | 按钮仍可点击，处理函数就近显示校验错误，API 请求前返回       | 两个视口实际点击并捕获局部错误；branch-create 请求计数为零       |
| Files／Changed／Editor      | 使用会话活动 workDir，项目身份仍保留原 repo                  | 源码数据链核对；不是本次 native smoke                            |

取证产物在主 checkout 的忽略目录 `artifacts/ui-reference/cc-haha-runtime/repository-launch-audit-20260929/`。有效组件 capture 为 `component-reference/captures-styled-flow-20260929/capture-metadata.json`，对应 1440×900 和 390×844，每个视口包含未选目录、根菜单、已选触发器、分支列表、新建表单、空名错误和 Cancel-return，共 14 张截图。使用当前 `RepositoryLaunchControls`／`DirectoryPicker`／`Button`／主题和 Tailwind 插件，隔离 route fixture 提供项目与分支；输入框、邻近权限和模型按钮是明确标注的合成 composer 外壳，**不是完整桌面应用或 native 截图**。

人工核对了两个视口的根菜单和新建表单，并读取 DOM／ARIA／computed styles：Location 内部为 flex row，根菜单为 flex column，目录／分支／radio card 为自然流行；桌面触发器为 36px 高，菜单外框约 400px 宽，H5 使用 390px 宽的内容生长 sheet。两个视口无 document 横向溢出；表单底部动作按 Cancel、Create 顺序排列。尺寸是参考观察值，不授权以截图坐标或固定内容高度实现 hbar，也不要求复制参考的每个非语义像素值。native 窄窗口行为仍只有源码依据，未在此 capture 中模拟。

此前完整 Host／页面的有界尝试未得到可用画面；早期组件 capture 缺少 Tailwind utility，行内容连在一起、面板异常宽，**仍不可作为视觉依据**。`captures-final-01` 记录了 10s page navigation timeout。随后一轮样式检查把 flex parent 对 inline-flex 的正常 blockification 误判为无样式，未被接受；修正观察断言后记录上述有效证据，没有修改参考生产代码。旧 `current/session-empty-1440x900.png` 日期为 2026-09-20，且未展示此入口，也不能代替当前参考。

有效 lane 未启动参考 Host，未发送首条消息、创建分支、调用付费 provider 或读写真实用户配置；metadata 记录 API 请求与 fixture 边界。此前 lane 的 `user-state-guard.json` 记录 `realConfigMutations: []`，本次再次核对参考 tracked source 无改动。每次 capture 的自有 Vite／Browser 进程均在 finally 中停止。被 shell policy 拒绝清理的早期临时目录保留，没有换用其他删除方式。真实首发、重启、文件编辑与 native smoke 仍需独立验收。

hbar 既有 [项目上下文](desktop-session-project-context.md) 只读展示注册工作区与分支。通用 `git.branch`／`git.worktree` 虽能接受目录和文件系统路径，但不能直接接到 composer：切换共享 checkout 会影响其他会话，客户端自由决定工作树路径也无法提供可靠恢复。

本次采用 Host 自己生成和管理会话目标。第一条已受理 Run 冻结该目标，后续 Run、模型系统上下文及 local tools 使用同一 binding；关闭、归档、取消或错误均不自动删除目录。当前模式只包含共享当前 checkout 与独立工作树（既有分支／新分支），**不包含在共享 checkout 切换分支**。

### 追加核对：选择的分支不等于隔离工作树的执行分支

2026-09-29 再次核对上述 reference revision 的 `src/server/services/repositoryLaunchService.ts`、`sessionService.ts`、`conversationService.ts` 及 `desktop/src/components/chat/RepositoryLaunchControls.tsx`。这一步是源码／提交差异依据，不是新增真实首发或 native capture。`95b181de` 引入 CLI worktree 启动对齐，`dea5d9bc` 明确创建成功后的就近确认及关闭菜单，`38de7069` 修正 parent selection 先于刷新后的分支 context 发布时的新分支丢失；不能只看菜单初始画面而漏掉这些时序。

| 动作                   | cc-haha 当前真实语义                                                                                 | hbar 仍需补齐的差异                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 选择一个已有分支       | 仅更新 parent-owned branch choice，回到 Location 根菜单；不立即 switch                               | 目前分支选择只属于 isolated-worktree，shared-current 不能表达所选的非当前分支                                         |
| 选择 Current worktree  | 保留所选分支，关闭菜单；首次启动时才核对并 switch 共享 checkout                                      | 需要单独的共享分支选择／准备契约和对其他共享会话、dirty Files 的保护，不能把选项转换回当前 HEAD                       |
| 选择 Isolated worktree | 所选分支是 baseRef；实际创建会话专属的新分支及工作树，原分支／目录不变                               | 目前 isolated existing 直接检出所选分支，已占用的 main 无法隔离；必须新增派生语义，不能在列表里把 main 禁用后称为一致 |
| New branch → Create    | 立即创建本地 ref，但不移动 HEAD；用响应携带的新 context 同步选择并关闭菜单，切换／隔离发生在首次启动 | 目前 isolated new 在 prepare 时创建执行分支；它不是参考的立即创建 ref 动作，也不能伪装成创建成功                      |
| 创建期间更换目录       | 迟到响应不会把旧仓库的 branch/context 填进新目录；spinner 仍会释放                                   | 必须以原 workspace／revision 及 request generation 核对，保留正确归属                                                 |

`SessionService.createSession` 通过 `resolveSessionWorkspaceLaunch` 保存启动计划；`ConversationService.startSession` 对未物化的隔离启动传入 CLI `--worktree` 与 `--worktree-base-ref`，共享模式则在首次启动调用 `prepareSessionWorkspace`。参考 `planIsolatedWorktree`／`createDesktopWorktree` 使用派生的 `worktree-desktop-*` 分支名；因此另一个 worktree 已检出的分支仍可作为隔离起点。分支发现的 availability 需要区分“共享 checkout 能否切换”和“能否作为隔离 base”，不能只用一个 checked-out disabled 标志。

有效参考截图继续支撑 Location 内 Directory、Branch、两张 radio card、branch search／New branch／Cancel／Create 的自然流层级。上表的实际 Git 行为仅有源码及参考既有测试依据；本轮未调用参考创建 API、发送消息或写入参考仓库。底部工具行维持加号 → 权限 → Location → 模型／Send 的阅读顺序，不能为迁就慢准备 API 另加可见 Prepare 按钮。

当前隔离目标只支持登记到 Git repository root 的 workspace。登记的是仓库子目录时，shared-current 仍以该子目录为文件边界；isolated prepare／Run 明确返回 `SESSION_LAUNCH_TARGET_SUBDIRECTORY_UNSUPPORTED`，不创建分支／工作树／binding，也不偷偷把 cwd 扩大到整个 repo。完整子目录隔离支持仍需分离 worktree root 与 execution cwd 的持久契约，不能只改一个返回路径。

## 已提交的底层切片

- `68c3426`：版本化选择、actor／幂等键回执及 storage v10；同一请求恢复不会重新选择目标，首条 Run 后禁止修改。
- `a38e52f`：Host 管理准备意图与真实工作树、storage v11 的首条 Run 原子 binding、重启核对与模型／工具 cwd。旧会话迁移为原共享 checkout，不把此前的选择标签追溯成已经隔离执行。该提交的初始聚焦验证为 16 tests／132 assertions；随后独立扩展回归为 14 文件、77 tests／470 assertions，覆盖既有发送、取消、队列、Goal 续行、Plan 及恢复。

- `3fba187`：可选会话 Files 目标，paired Client／真实 Host 验证 9 tests／52 assertions。
- `73ef542`：与 Files 共用 context 的会话 Git 只读接口，扩展 Files／Git 回归 14 tests／90 assertions。
- `9c6bdad`：修正初始提交审查发现的取消、锁链、并发、路径解析、hooks 和关闭边界。加入等待者取消不取消 owner；取消最后一个等待者不会提前清除正在使用的锁；每个 service 最多四条 Git 命令、64 条排队命令，排队可取消；Unicode／空格路径用 NUL porcelain 核对；内部 worktree add 不执行 post-checkout hook；受管会话根的 junction／symlink 逃逸被拒绝；关闭也中止无外部 signal 的已绑定目标核对。确认未受理 Run 后，容量／超时保留 typed 失败，不变成持续的未知结果。
- `a7221b9`：明确拒绝会扩大操作范围的子目录隔离准备，shared 子目录维持原边界；通过 paired API 保留 typed 拒绝，未创建分支／工作树或受理 Run。

最后独立扩展验证为 **19 文件、106 tests／666 assertions、0 failures，74.72s**。它覆盖上述修正、真实 Files／Git API 和既有共享发送、队列、Goal、Plan、取消及恢复；不是全仓、native smoke 或 UI 上线验收。临时夹具中 get 在 preparing 时仍可读，协作取消／关闭测试使用小于三秒的预算；这不保证所有用户磁盘和 Git 环境均小于三秒。准备仍是同步 RPC，90s preparation 与 15s reconciliation 为配置预算，**尚未实现早受理的后台任务和增量进度通知**。

随后新增的子目录 scope fence 单独通过真实 Git／paired Host 测试，并再次独立重跑通过（每次 1 test／12 assertions），核对 shared 子目录边界、prepare／direct submit／API submit 的 typed 拒绝，以及无分支、工作树、binding、resolution、Run 和文件副作用。阶段记录为 fixture 11.73s、paired 拒绝 16.75s、完整测试及清理 21.09s；重跑测试自身为 27.97s，因此仅该测试使用 60s 的有界夹具预算，产品 API／Git deadlines 未变。原 20s 预算两次耗尽；随后扩大四文件回归时，未改动的 compaction、retry、cancel、watch 与 Git fixture 也触及 20s 上限，该轮已停止，**不是通过结果**。当前证据不足以把所有超时都归因于系统负载；上述 106 tests 的绿色记录属于之前的 hardening revision，不能冒充 scope fence 后的完整回归。

## Files 公共契约

运行时的读取接缝采用 `SessionLaunchTargetReader.read(sessionId, { signal?, requestId? })`：Client 只调用 `sessionLaunchTarget.get`，校验严格响应及原请求的 session identity，每次从当前认证 Host 获取 revision，不缓存或猜测零版本。Web 组合根已注入此只读能力；它不提供 set／prepare，也不授权客户端选择文件系统路径。取消只停止观察并消费迟到的传输终态，现有 authenticated transport 仍负责请求 deadline；没有远程 query-cancel RPC，不能宣称它停止了 Host 工作。Reader 的 standalone／paired Host 验证为 8 tests／38 assertions，覆盖非法和错会话响应、预取消、dispatch 期间取消、迟到失败、并发乱序及 typed query 错误。注入 reader 本身不等于 Files cache／draft 已迁移。

文件命令保留普通项目操作，并提供可选的 `sessionTarget: { sessionId, expectedRevision }`：

| 调用目标                                | Host 行为                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| 仅 `workspaceId`                        | 与已有项目文件命令兼容，使用注册 checkout                                     |
| 当前共享会话及正确 revision             | 核对 session 的项目归属，解析同一个共享 checkout                              |
| 已绑定的隔离会话及正确 revision         | Host 核对绑定，使用精确隔离工作树；不回落到共享 checkout                      |
| 错误项目或旧 revision                   | 返回 `STALE_TARGET` 或 `COMMAND_CONFLICT`，不读写另一上下文                   |
| 已准备、但尚未被首条 Run 绑定的隔离目标 | 返回 `SESSION_LAUNCH_TARGET_UNRESOLVED`；文件命令不会代为创建、绑定或切换目标 |

该对象是严格 schema，不接受客户端提供的 root／targetPath。`file.list/find/read/write` 均使用该解析路径；read/write 返回请求对应的 typed session target。写入仍保留 SHA-256 baseline 比较，等待同一物理文件的其他写入后再次核对会话版本。多个共享会话写同一 checkout 时仍使用同一物理目标的写锁，不因 session ID 不同而丢失冲突检测。

对应 paired Client＋真实 Host 回归使用临时 Git 仓库、隔离 Host 数据目录及 mock 模型，不调用付费模型、不操作用户项目。覆盖隔离目录的列表、路径搜索、读写、共享目录保持不变、路径逃逸、原文件冲突、错误项目、旧版本、未绑定目标与共享并发写。测试目录在 cleanup 前验证归属及绝对边界。

## 会话 Git 只读契约

`sessionGit.info/status/diff` 使用严格的 `{ workspaceId, sessionId, expectedRevision }`，diff 另接受 bounded、slash-relative 的 paths 与 cached 选项；不接受客户端 cwd。它们与 Files 复用同一 Host context 校验和解析端口，未绑定隔离目标不会回落到项目 checkout。三个读取在查询后再次核对目标 revision，status／diff 还核对 Git service 返回的 cwd 与 Host 解析目标一致。现有 `git.*` 继续表示调用者明确指定的项目／目录，不被悄悄改成当前会话。

会话 status／diff 使用独立 DTO：严格回显请求的工作区、会话和目标版本，不返回执行 cwd、repository root 或 origin URL 元数据。status 的路径相对于 execution root，并按路径段判断范围，避免 `pkg` 匹配 `pkg2`；Windows drive／UNC 比较忽略大小写，POSIX 保留大小写。当前会话 DTO 不支持原始 backslash 路径字符，明确拒绝，不把合法 POSIX 文件名偷偷改成另一条 slash 路径。

| 状态条目               | execution root 内的投影                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| 普通文件／未跟踪文件夹 | 相对 `path`；选中根自身的未跟踪文件夹为 `path: '.', directory: true`             |
| Rename                 | 保留范围内 `from`／`to`；范围外一端为 null，两端均在外则排除                     |
| Copy                   | 仅 destination 在范围内时包含；范围外 source 为 null；复制到范围外不算本目录更改 |

`dirty` 表示投影条目是否非空，`repositoryDirty` 单独表示完整 Git repository 是否有更改。diff 明确使用 execution-root scope、literal pathspec 和禁用 rename／textconv 的策略，外部路径与 `..` 不被接受；`[ab].txt`、`*.txt` 和 `:(top)…` 作为字面路径处理，不获得 Git wildcard／magic 的扩大范围语义。Git status 返回截断输出时明确报 `GIT_OUTPUT_LIMIT`，不把不完整 porcelain 当作 clean 或完整列表。diff 则继续携带 `truncated`，UI 必须展示其边界。这是展示／执行目标范围契约，**不是新增权限隔离或对文件正文任意绝对路径字符串的清洗保证**；范围内被删除或移入文件的真实内容仍可在 diff 中出现。

三个新命令只读、session scope、内部 API surface，不添加 palette 操作或 Git mutation；不以会话 ID 冒充提交的 provenance。每个 Host 命令有 30s deadline 及 8 个同时调用上限，解析和 Git service 之间传递同一 Host `AbortSignal`。现有 WebSocket Client Git adapter 不提供远程 query-cancel RPC，因此不能把客户端停止观察表述成 Host Git 进程已停止；关闭／timeout 的 Host 中止和前端旧结果丢弃仍要分别验证。

真实 Host 回归核对隔离分支、working changes、staged index／diff 与 Files 的同一目录；共享 checkout 的文件、分支和两个 diff 均保持不变。另外核对 cwd 注入、错误项目、旧版本和未绑定目标明确失败，以及 query/internal metadata。新的 DTO／scope 切片聚焦验证为 **30 tests／174 assertions，全部通过**，包含 projector、真实 paired Host 的子目录 rename／copy 边界、outside sentinel、literal paths、暂存／未暂存、未跟踪根、非 Git 目录、查询中目标变更、Git plugin 的 scope 参数和 status 截断失败，以及既有 paired Files／Git 回归。9 个变更路径的 scoped ESLint 零警告、explicit strict TypeScript 和 staged diff 检查通过；contracts／kernel／session tests 格式通过，plugin／SDK 保留无关历史格式，不夹带全文件改写。该阶段全仓 typecheck 退出 1，包含 preview fixture／契约、`@lumen/app-ui` 解析和当时并行 Files 测试的诊断，未冒充通过。随后 Files runtime／Changed／diff 的独立验收如下。

## Files runtime 与浏览器闭环

Files dock、固定面板和展开的工作台从所属 surface／workbench 获取原来源会话，不在异步返回后借用当前导航的 session。显式项目 Files 继续没有 session target；会话 Files 必须经 Host reader 解析正确 workspace／session 的 revision。未提供 reader、未绑定隔离选择、错会话或畸形响应都明确失败，后续树、搜索、打开和 Changed 操作也不回落到项目文件或通用 `git.*`。

文档缓存按工作区、会话、目标 revision 与规范相对路径隔离；read／write／reconcile 校验回执中的目标。每个本地 action 捕获 source session 与目标版本，旧版本动作被拒绝；旧列表、搜索、文档及 diff 返回不能重新填入新目标。未确认写入仍在原缓存中保留 pending 内容，通过原目标核对，不能重放。目标真的改变时旧 preview 被移除，受保护草稿不会迁移到新 checkout；这不等于已经有旧版本草稿的跨目标恢复 UI。未来 Location action 必须阻止带有 dirty／pending／unknown Files 的选择变更，先在原目标保存、放弃或核对。

Changed 使用 `sessionGit.status/diff` 的 execution-root 相对路径与严格目标回显，UI 不拼 Host 的内部 cwd。`isRepository` 是独立状态，不能因 DTO 不携带 root 就误显示非 Git 目录；根本身的未跟踪文件夹 `'.'` 打开目录而不是读取文档或 diff。working／staged diff 保持独立 preview UUID，并保留原会话归属。中英文 Host copy 为未绑定、目标变化、无效响应和能力缺失说明恢复动作；`INVALID_OUTPUT` 不再被错误翻译成“文件过大”，能力缺失也不承诺可回落浏览全部项目文件。

完成后的串行聚焦回归为 **9 文件、62 tests／522 assertions、0 failures，6.62s**，覆盖 runtime、tree、search、Changed、unknown save、preview tabs、session-tool ownership、session target 与 copy。变更 source／tests 的 scoped ESLint 零警告及 full-flag explicit strict TypeScript 通过，包含 `exactOptionalPropertyTypes`；content contract 与 icon scale guard 各检查两个 TSX 并通过。生产 Web build 通过，仍有既有大 chunk 警告，未表述成零警告构建。

最终审查又把两个既有 fixture 的 target 注入收敛为 test-only generic typed adapter，保留实际 command input／output 类型而不双重断言成宽泛 executor；受影响的两文件重跑为 25 tests／247 assertions、0 failures，strict typecheck 和 lint 通过。其余源码与浏览器行为没有因此改变。

`e2e/session-target-files.spec.ts` 通过 production Web 与临时真实 Host／Git 仓库验证 **3 cases，19.6s**：英文／中文未绑定错误、无共享回落请求；实际 local-fixture Run 绑定隔离目标；UI 编辑保存后通过公开 `file.read` 独立核对内容；共享目录同名文件未变；切换到共享会话并重访保留的工作台仍读原内容；共享 Files 读取自己的版本；返回原会话 Files 激活原工作台；Changed、working diff、空 staged diff 与再次 working diff 均使用原 session／revision。测试等待最终非 loading／非 error 的 diff 再取证，而不是把 refresh 期间保留的旧文本当作完成。

截图位于隔离 checkout 的 `artifacts/session-target-files/final/`，包含 saved workbench 和 working diff 的 1440px／320px 四张 PNG，均人工核对；document 没有横向溢出，narrow 的标签栏和代码阅读区仍各自拥有滚动边界，不承诺所有非活动标签标题同时完整可见。此轮没有改 CSS 布局或图标尺寸，也没有解决现有控件下划线／阴影的视觉差异；这些需要独立样式审查。它是 Web 用户流程证据，**不是 native build／smoke、安装或全仓上线验收**。

候选测试与取证存在以下未接受结果：首轮 broad status locator 命中两处合法状态，另存其 trace／PNG／context 至 `artifacts/session-target-files/initial-save-locator-failure/`；后续搜索行的复合可访问名称、错误的相对 `has` locator、非活动工作台卸载及瞬时 loading capture 均由实际画面／源码定位并修正测试，不把它们称为 Files 后端故障。另有一轮 Vite preview 30s 启动超时，以及 Host 20s readiness timeout／目录 EBUSY；不能把所有时长都断言为系统负载。Host helper 原始 `488d1dc0` 没有失败启动子进程的释放路径，已独立以 `10d439d3` 修正：仅终止自有 child，在拒绝前等待终态、释放 timer／readline／listeners；5 lifecycle tests／30 assertions、strict typecheck 与零警告 lint 通过，原启动及产品 deadlines 未扩大。

两个 rendered React suites 仍在执行测试前被 pinned `hbar-ui` 的 `prop-types` 缺失阻断，未安装依赖或将其算作通过。完成迁移后再次运行全仓 typecheck 仍退出 1，包含 preview fixtures／contracts 与根 fixtures 的 `@lumen/app-ui` 解析错误；scoped green 不能替代全仓门禁。参考源码保持只读，夹具使用独立临时数据与 local-fixture 模型，没有操作用户工程或付费 provider；cleanup 前验证自有绝对目录边界，未清理此前被策略拒绝的目录。

## UI 上线前仍需闭环

会话分支上下文已通过 Host target reader 和 `sessionGit.info` 读取真实目标，同时保持原工程名；对应交付与验证见 [会话工程与分支上下文](desktop-session-project-context.md)。Files 的缓存／草稿／固定面板和 Changed Files／diff 已完成上面的独立 runtime 与 Web 浏览器验收，但首发准备及可编辑 Location 尚未闭环。因此**不能现在就加入启动目标按钮并宣称参考体验已经实现**。

后续独立验收项：

1. 为分支发现、准备受理／进行中／终态、取消与未知结果核对定义明确的公开状态，不让短读取或取消被慢 Git 阻塞。当前 prepare 等待 Git，Run 的隐式 prepare 仍可能超过默认 command deadline；准备受理不能冒充 Run 已受理，必须保留现有原子 binding＋Run transaction。
2. Files 的树、搜索、preview、草稿、写入和工作台归属已完成版本隔离；继续为可编辑 Location 增加 dirty／pending／unknown 选择变更 guard 和可解释的恢复路径，并验证 native、重启与重连。
3. Session Git info、Changed 与 diff 已接会话只读接口并通过上述验收；项目级 Status 仍明确表示注册项目，而不是冒充某会话的隔离状态。
4. 接入 host-owned 中英文 copy 的单一位置入口，首发后变成可解释的只读 context。准备／失败／重试／取消在原入口附近反馈，保留草稿和阅读位置。
5. 使用当前参考组件的可见画面确定层级与响应式流；验证桌面、390px、320px、短窗口、键盘与焦点。再以真实 Host E2E 和 native smoke 验证选择、首发、Files 编辑、切换会话和重启，不以隔离组件画面冒充后端验收。
6. 子 Agent／Fork 的执行位置需要单独闭环。当前普通 Agent child 按 parent 的注册 workspace 创建，patchTask 也从 `sessions.workspace(parent.workspaceId)` 同步源文件，不能据此宣称已经继承隔离父会话的实际目录。另需核对正常 Git branch mutation 与首次 launch selection 的关系；当前绑定核对要求原分支名，不应在 UI 上无说明地承诺任意 branch switch 后可以继续。
7. 如需支持 monorepo 子目录的隔离会话，应持久保存仓库 root 和受限 execution cwd，并让模型、工具、Files、Git 与子 Agent 使用后者；先验证 scope 不扩大，再解除目前的明确拒绝。

参考的 Location 选择更新 parent-owned choice 后关闭，工作树准备发生在 first Send；不要为适配当前 API 凭空增加一个可见 Prepare 按钮。hbar 的空 composer 是尚无 sessionId 的 pre-session draft；版本化本地 choice 已完成下面的独立切片，仍需在首次发送时幂等移交给物化会话，再启动可查询、可取消的准备任务。prepare operation、launch revision、request／idempotency key 与 Run receipt 是不同事实；遗失受理回执应核对原键，取消需等 Git 已结算才可标记终态，重启 reconcile 不得重做未知副作用。完整 handoff 仍未实现。

### 空会话的阅读顺序与关闭后焦点

`13c4f9f0` 已将 launch selection 纳入版本化本地 draft 和不可变首次发送 capture：同一选择不额外增版本，更换工作区重置位置但保留文本、模型／thinking、权限和 Plan／Goal。缺少准备 handoff 时，isolated Send 在创建 Session 前明确失败，不忽略用户选择而发送到 shared checkout。该本地切片的 pre-session、Goal、Plan mode／choice 回归为 83 tests／466 assertions；strict 和 scoped lint 通过。它还不是完整 Location 或隔离首发闭环。

随后按有效参考的工具行层级，将可见控件顺序校正为加号 → 权限／Plan → 项目选择 → 模型。DOM／Tab 顺序随正常 flex 流变化，不用 CSS `order` 掩盖可访问阅读顺序；这一步仍使用原有项目对话框，尚未添加 Branch／worktree 根菜单，也没有复制参考的主题色或去掉现有 Lumen lamp 样式。

新的 production Web＋临时真实 Host 验证最初发现一个实际焦点故障：项目对话框关闭时，`pre-session-choice-picker` 在 `setOpen(false)` 提交之前调用 trigger.focus，外部按钮仍被 native modal 标为 inert。该同步恢复代码可追溯到 `7312b8c1`，当前 `LumenDialog.showModal` 实现与两种语言的浏览器复现证明了这次故障；未对历史 revision 做浏览器对比，不能称该提交是已证实的故障引入点。修复将 dialog 的显式关闭／成功选择恢复延后到关闭状态的 React effect，初始 closed render 不抢焦点；composer Popover 的现有同步关闭保持不变。

修复后 `e2e/composer-launch-order.spec.ts` **2 cases／9.8s** 通过：en-US／zh-CN 的 1440、900、390、320px，实际 Tab 顺序、各触发器可见、无 document 横向溢出；权限 Escape、项目 Close／Escape／成功选择均回原触发器；原草稿保留，零新增 Session／tab。八张截图位于隔离 checkout `artifacts/composer-launch-order/`，人工核对英文 1440 与中文 320；初始两种语言的失败 trace／PNG／context 保留在 `initial-dialog-focus-failure/`。该测试未调用付费模型、修改用户配置或进行 native 验收，自有 browser／preview／Host 已释放。

这三个 UI／E2E 文件的 full-flag explicit strict TypeScript、scoped ESLint 零警告及 staged diff 检查通过；choice-picker／新 E2E／文档的 Prettier 通过。`PreSessionLanding.tsx` 格式检查仍有告警，独立检查当前 HEAD 的原始文件也退出 1；该文件本次只调换两个 JSX children，没有夹带历史全文件格式化。两个 TSX 的 flow／content／icon guards 通过，生产 Web build 通过并保留既有 2.37MB chunk 警告。rendered choice-picker suite 仍在测试执行前因 pinned `hbar-ui` 缺少 `prop-types` 失败（0 pass／1 fail／1 error）；未安装依赖，也不把浏览器绿色结果表述成全仓检查通过。

隔离分支的全仓 TypeScript 检查尚受根测试 fixture 的 `@lumen/app-ui` 解析基线影响；变更文件的 explicit strict TypeScript 与 targeted lint 另行运行并记录，不能把 scoped gate 表述成全仓通过。主工作区同时存在其他任务的 Kernel、manifest 和 UI 改动，未清除、自动暂存或夹带它们；集成必须单独核对。

## 追加的异步准备 API 与接入边界

在保留旧 `prepare`／`reconcile`／`cancel` 签名的前提下，新增 `startPreparation`、`preparation`、`cancelPreparation`、`reconcilePreparation`。start 持久化原 actor／idempotency key 对应的 operation receipt 后返回，不等待 Git 或接受 Run；查询与取消绑定原 session、target revision 和 operation ID，不跟随当前导航。storage v12 保存操作状态和取消意图，公开 snapshot 只包含身份、版本、时间、状态与安全错误，不携带执行路径或私有 selection。

操作状态为 queued、preparing、cancel-requested、ready、cancelled、reconciling、failed。取消受理与取消终态不同：如果 Git 已创建 worktree，Host 核验后可以报告 ready，并保留该 worktree；客户端仍需遵守自己已捕获的取消意图，不能因为迟到 ready 自动发送。未知创建结果和取消意图可在重启后核对，取消恢复只检查已有目标，不重新创建，也不删除已有分支／工作树。数据库内持久 pending 容量为 68，同一 Host 执行最多四项；活动准备期间禁止更换 selection 和事务内首次 Run binding。

Client 的 `SessionLaunchTargetPreparationManager` 是独立的认证传输适配器，不选择 cwd、不调用旧慢准备、不提交 Run。写入派发后的本地 abort、丢失响应或无法校验的 ack 保持 RESULT_UNKNOWN；停止观察不等于远程取消。start 重试使用原键，查询核对原操作，状态版本用于后续投影抑制旧响应。

该 API 子功能的验证结果记录在对应提交正文中，使用临时 Host／Git／SQLite 和配对 Client，未操作用户项目或付费 provider。它尚未注入 pre-session ViewModel，完整首次发送 handoff、就近进度／取消恢复 UI、最终 expected-target Run 受理检查仍是后续接缝；没有为此新增可见 Prepare 按钮。前面的同步准备时长记录描述旧 API，不能当作新 start 的响应时长证明，也不能把这次契约接入称为 native 桌面体验已经交付。
