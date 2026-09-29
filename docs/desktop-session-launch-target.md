# 会话启动位置：分支、隔离工作树与文件目标

本记录是 `codex/session-launch-target` 隔离分支上的交付及后续验收边界，**不是已迁移到主工作区、已安装或 UI 已完成的声明**。参考仓库保持只读；本次核对的 cc-haha revision 为 `e28d0a653481ef41b7a329411eeb2f0fd5656731`。

## 参考表达及 hbar 的差异

参考 `desktop/src/components/chat/RepositoryLaunchControls.tsx` 是输入区内的单一位置入口：根视图说明目录、分支和当前／隔离工作树，分支列表可搜索并进入创建分支子视图。取消创建回到列表，成功后关闭菜单并在触发器上显示选择。桌面为锚定菜单，移动浏览器使用 bottom sheet；同一组件区分 toolbar 和 outside 两种正常流位置，不需要重复业务事实。

`ChatInput.tsx` 在首次发送前使用可编辑的 launch controls，已有消息后使用只读 `ProjectContextChip`。实际首发提交把位置和 repository 选择绑定到原会话；项目归属不随临时工作树变成新项目。这些是当前源码证据，不能代替专门的当前画面与行为截图。

hbar 既有 [项目上下文](desktop-session-project-context.md) 只读展示注册工作区与分支。通用 `git.branch`／`git.worktree` 虽能接受目录和文件系统路径，但不能直接接到 composer：切换共享 checkout 会影响其他会话，客户端自由决定工作树路径也无法提供可靠恢复。

本次采用 Host 自己生成和管理会话目标。第一条已受理 Run 冻结该目标，后续 Run、模型系统上下文及 local tools 使用同一 binding；关闭、归档、取消或错误均不自动删除目录。当前模式只包含共享当前 checkout 与独立工作树（既有分支／新分支），**不包含在共享 checkout 切换分支**。

## 已提交的底层切片

- `68c3426`：版本化选择、actor／幂等键回执及 storage v10；同一请求恢复不会重新选择目标，首条 Run 后禁止修改。
- `a38e52f`：Host 管理准备意图与真实工作树、storage v11 的首条 Run 原子 binding、重启核对与模型／工具 cwd。旧会话迁移为原共享 checkout，不把此前的选择标签追溯成已经隔离执行。该提交的初始聚焦验证为 16 tests／132 assertions；随后独立扩展回归为 14 文件、77 tests／470 assertions，覆盖既有发送、取消、队列、Goal 续行、Plan 及恢复。

初始提交后的审查另发现 joining caller 的取消、跨会话 Git 并发、Unicode worktree 路径、内部 Git hooks 和关闭总时限边界，需要独立修正与验证；不能以初始测试覆盖范围代替这些保证。

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

隔离分支的全仓 TypeScript 检查尚受根测试 fixture 的 `@lumen/app-ui` 解析基线影响；变更文件的 explicit strict TypeScript 与 targeted lint 另行运行并记录，不能把 scoped gate 表述成全仓通过。主工作区同时存在其他任务的 Kernel、manifest 和 UI 改动，未清除、自动暂存或夹带它们；集成必须单独核对。
