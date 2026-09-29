# 会话启动位置：分支、隔离工作树与文件目标

本记录是 `codex/session-launch-target` 隔离分支上的交付及后续验收边界，**不是已迁移到主工作区、已安装或 UI 已完成的声明**。参考仓库保持只读；本次核对的 cc-haha revision 为 `e28d0a653481ef41b7a329411eeb2f0fd5656731`。

## 参考表达及 hbar 的差异

参考 `desktop/src/components/chat/RepositoryLaunchControls.tsx` 是输入区内的单一位置入口：根视图说明目录、分支和当前／隔离工作树，分支列表可搜索并进入创建分支子视图。取消创建回到列表，成功后关闭菜单并在触发器上显示选择。桌面为锚定菜单，移动浏览器使用 bottom sheet；同一组件区分 toolbar 和 outside 两种正常流位置，不需要重复业务事实。

`ChatInput.tsx` 在首次发送前使用可编辑的 launch controls，已有消息后使用只读 `ProjectContextChip`。实际首发提交把位置和 repository 选择绑定到原会话；项目归属不随临时工作树变成新项目。这些是当前源码证据，不能代替专门的当前画面与行为截图。

hbar 既有 [项目上下文](desktop-session-project-context.md) 只读展示注册工作区与分支。通用 `git.branch`／`git.worktree` 虽能接受目录和文件系统路径，但不能直接接到 composer：切换共享 checkout 会影响其他会话，客户端自由决定工作树路径也无法提供可靠恢复。

本次采用 Host 自己生成和管理会话目标。第一条已受理 Run 冻结该目标，后续 Run、模型系统上下文及 local tools 使用同一 binding；关闭、归档、取消或错误均不自动删除目录。当前模式只包含共享当前 checkout 与独立工作树（既有分支／新分支），**不包含在共享 checkout 切换分支**。

当前隔离目标只支持登记到 Git repository root 的 workspace。登记的是仓库子目录时，shared-current 仍以该子目录为文件边界；isolated prepare／Run 明确返回 `SESSION_LAUNCH_TARGET_SUBDIRECTORY_UNSUPPORTED`，不创建分支／工作树／binding，也不偷偷把 cwd 扩大到整个 repo。完整子目录隔离支持仍需分离 worktree root 与 execution cwd 的持久契约，不能只改一个返回路径。

## 已提交的底层切片

- `68c3426`：版本化选择、actor／幂等键回执及 storage v10；同一请求恢复不会重新选择目标，首条 Run 后禁止修改。
- `a38e52f`：Host 管理准备意图与真实工作树、storage v11 的首条 Run 原子 binding、重启核对与模型／工具 cwd。旧会话迁移为原共享 checkout，不把此前的选择标签追溯成已经隔离执行。该提交的初始聚焦验证为 16 tests／132 assertions；随后独立扩展回归为 14 文件、77 tests／470 assertions，覆盖既有发送、取消、队列、Goal 续行、Plan 及恢复。

- `3fba187`：可选会话 Files 目标，paired Client／真实 Host 验证 9 tests／52 assertions。
- `73ef542`：与 Files 共用 context 的会话 Git 只读接口，扩展 Files／Git 回归 14 tests／90 assertions。
- `9c6bdad`：修正初始提交审查发现的取消、锁链、并发、路径解析、hooks 和关闭边界。加入等待者取消不取消 owner；取消最后一个等待者不会提前清除正在使用的锁；每个 service 最多四条 Git 命令、64 条排队命令，排队可取消；Unicode／空格路径用 NUL porcelain 核对；内部 worktree add 不执行 post-checkout hook；受管会话根的 junction／symlink 逃逸被拒绝；关闭也中止无外部 signal 的已绑定目标核对。确认未受理 Run 后，容量／超时保留 typed 失败，不变成持续的未知结果。

最后独立扩展验证为 **19 文件、106 tests／666 assertions、0 failures，74.72s**。它覆盖上述修正、真实 Files／Git API 和既有共享发送、队列、Goal、Plan、取消及恢复；不是全仓、native smoke 或 UI 上线验收。临时夹具中 get 在 preparing 时仍可读，协作取消／关闭测试使用小于三秒的预算；这不保证所有用户磁盘和 Git 环境均小于三秒。准备仍是同步 RPC，90s preparation 与 15s reconciliation 为配置预算，**尚未实现早受理的后台任务和增量进度通知**。

随后新增的子目录 scope fence 单独通过真实 Git／paired Host 测试，并再次独立重跑通过（每次 1 test／12 assertions），核对 shared 子目录边界、prepare／direct submit／API submit 的 typed 拒绝，以及无分支、工作树、binding、resolution、Run 和文件副作用。阶段记录为 fixture 11.73s、paired 拒绝 16.75s、完整测试及清理 21.09s；重跑测试自身为 27.97s，因此仅该测试使用 60s 的有界夹具预算，产品 API／Git deadlines 未变。原 20s 预算两次耗尽；随后扩大四文件回归时，未改动的 compaction、retry、cancel、watch 与 Git fixture 也触及 20s 上限，该轮已停止，**不是通过结果**。当前证据不足以把所有超时都归因于系统负载；上述 106 tests 的绿色记录属于之前的 hardening revision，不能冒充 scope fence 后的完整回归。

## Files 公共契约

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

`sessionGit.info/status/diff` 使用严格的 `{ workspaceId, sessionId, expectedRevision }`，diff 另接受原有 bounded paths 与 cached 选项；不接受客户端 cwd。它们与 Files 复用同一 Host context 校验和解析端口，未绑定隔离目标不会回落到项目 checkout。现有 `git.*` 继续表示调用者明确指定的项目／目录，不被悄悄改成当前会话。

三个新命令只读、session scope、内部 API surface，不添加 palette 操作或 Git mutation；不以会话 ID 冒充提交的 provenance。每个 Host 命令有 30s deadline 及 8 个同时调用上限，解析和 Git service 之间传递同一 Host `AbortSignal`。现有 WebSocket Client Git adapter 不提供远程 query-cancel RPC，因此不能把客户端停止观察表述成 Host Git 进程已停止；关闭／timeout 的 Host 中止和前端旧结果丢弃仍要分别验证。

真实 Host 回归核对隔离分支、working changes、staged index／diff 与 Files 的同一目录；共享 checkout 的文件、分支和两个 diff 均保持不变。另外核对 cwd 注入、错误项目、旧版本和未绑定目标明确失败，以及 query/internal metadata。上述接口已具备，并不表示 runtime 的 Git 展示已经切换到它们。

## UI 上线前仍需闭环

当前 runtime 仍按原 `workspaceId`／`path` 缓存文件草稿，Changed Files 和 session Git context 仍读取注册工作区。因此**不能现在就加入启动目标按钮并宣称参考体验已经实现**。

后续独立验收项：

1. 为分支发现、准备受理／进行中／终态、取消与未知结果核对定义明确的公开状态，不让短读取或取消被慢 Git 阻塞。
2. Files 的树、搜索、preview、文档草稿和写入回执按工作区＋会话目标版本隔离；切换目标时旧响应不能覆盖新视图，旧草稿不能保存到另一 checkout。固定面板和 Files 工作台页签保留原来源会话。
3. 将 Session Git info、Changed Files 和 diff 接到上述会话只读接口，不让 UI 自行拼内部路径。项目级 Status 仍明确表示注册项目，而不是冒充某会话的隔离状态。
4. 接入 host-owned 中英文 copy 的单一位置入口，首发后变成可解释的只读 context。准备／失败／重试／取消在原入口附近反馈，保留草稿和阅读位置。
5. 使用当前参考组件的可见画面确定层级与响应式流；验证桌面、390px、320px、短窗口、键盘与焦点。再以真实 Host E2E 和 native smoke 验证选择、首发、Files 编辑、切换会话和重启，不以隔离组件画面冒充后端验收。
6. 子 Agent／Fork 的执行位置需要单独闭环。当前普通 Agent child 按 parent 的注册 workspace 创建，patchTask 也从 `sessions.workspace(parent.workspaceId)` 同步源文件，不能据此宣称已经继承隔离父会话的实际目录。另需核对正常 Git branch mutation 与首次 launch selection 的关系；当前绑定核对要求原分支名，不应在 UI 上无说明地承诺任意 branch switch 后可以继续。
7. 如需支持 monorepo 子目录的隔离会话，应持久保存仓库 root 和受限 execution cwd，并让模型、工具、Files、Git 与子 Agent 使用后者；先验证 scope 不扩大，再解除目前的明确拒绝。

隔离分支的全仓 TypeScript 检查尚受根测试 fixture 的 `@lumen/app-ui` 解析基线影响；变更文件的 explicit strict TypeScript 与 targeted lint 另行运行并记录，不能把 scoped gate 表述成全仓通过。主工作区同时存在其他任务的 Kernel、manifest 和 UI 改动，未清除、自动暂存或夹带它们；集成必须单独核对。
