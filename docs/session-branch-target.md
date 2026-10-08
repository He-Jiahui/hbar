# 会话分支与执行目录

已有会话的 Composer 分支入口通过 `sessionBranchTarget.*` 命令选择执行目标。新会话首次运行的 Location 契约仍由 `sessionLaunchTarget.*` 管理。

- 选择本地分支时，Host 校验所捕获的 `refs/heads/*` 与提交 OID。分支已经在本地 Git worktree 检出时，使用 Git 注册的目录；客户端不能提交任意执行路径。
- 未在其他 worktree 检出的分支使用当前会话的执行目录，执行普通 `git switch --no-guess`。切换冲突保留未提交内容，不强制覆盖或清理文件。
- 新建分支从捕获的本地分支 OID 创建，新建 worktree 使用 Host 数据目录的受管 worktree 根。新建目录必须在源仓库之外，不能通过符号链接转移到其他位置。
- 已接受过任务的会话可以在没有活动或排队任务时重新选择目标。Host 将目标版本、目录、Git 解析结果及执行绑定一起提交。
- 任务开始时，在会话和 checkout 锁内核对选定分支。其他会话改变过共享 checkout 时恢复所选分支；存在其他任务或本地修改冲突时报告错误，避免在错误分支执行。
- AI 可以通过当前会话的 `git_branch`、`git_worktree` 或进程工具创建 Git 分支。任务结束后，Host 从该任务捕获的执行目录识别当前本地分支，并更新后续任务的目标；新建 worktree 可以从分支列表直接选择。

`sessionBranchTarget.select` 使用必需的幂等键，在 Git 副作用之前持久记录具体意图。完成后返回 `ready` 或已确定的 `failed`；进程、连接或结果确认中断时返回 `unknown`。`sessionBranchTarget.operation` 读取原操作，`sessionBranchTarget.reconcile` 只核对原目录、分支和提交，不重新创建分支或删除 worktree。未确认的操作阻止新的任务受理和再次切换。

本地分支列表按名称分页，每页最多 50 项，总扫描最多 4096 个本地引用。游标绑定会话、目标版本、查询和 Git 快照，AI 或外部命令改变引用时需要重新读取。当前分支作为新建操作的基础单独提供，不依赖它是否出现在当前列表页。

验证覆盖在 `tests/session-branch-target.test.ts` 与 `tests/session-branch-target-kernel.test.ts`，包括已有会话、worktree 目录、AI 工具执行目录、分支恢复、未提交内容、版本冲突、幂等结果及未知副作用核对。
