# 专注工作流

hbar 的专注工作流把长任务的目标、当前焦点、允许范围、验收条件和外部证据保存到 Host。模型每轮都能重新读取这组事实，因此不需要仅靠对话上下文记住“正在做什么、做到哪里、什么才算完成”。简单问答和一次读取不必启动工作流；涉及多步修改、验证或委派的任务才使用它。

Goal、Plan 和 Workflow 各自承担不同职责：

| 对象     | 负责的事实                                             | 不负责的事实                  |
| -------- | ------------------------------------------------------ | ----------------------------- |
| Goal     | 总体目标、状态、Token 预算、累计用量和耗时             | 文件范围、当前 TODO、验收证据 |
| Plan     | 带版本的目标说明和结构化 TODO 草案                     | 正在执行的焦点和运行状态      |
| Workflow | 当前 TODO、焦点、范围、探索计数、委派、补丁和 Evidence | 模型供应商配置、UI 临时状态   |

Workflow 是 Session 级 Host 真相源。Web、桌面端、CLI 和模型工具都通过同一组命令读取或修改它。前端 Zustand 只保存按 `sessionId + workflowId + revision` 投影的只读 ViewModel；较旧响应不能覆盖较新 Host 事实。

## 结构化计划

每个 TODO 必须包含稳定且唯一的 `id`、标题、范围和验收清单：

```json
{
  "id": "implement-search",
  "title": "Implement the bounded search path",
  "scope": {
    "readPaths": ["plugins/local-tools"],
    "writePaths": ["plugins/local-tools"],
    "tools": ["search_text", "read_file", "write_file"]
  },
  "acceptanceChecks": [
    {
      "id": "targeted-test",
      "description": "The targeted integration test passes",
      "verifier": {
        "kind": "tool",
        "toolName": "shell",
        "expectedArguments": { "command": "bun test tests/local-tools.test.ts" }
      }
    }
  ]
}
```

路径必须相对工作区，不能使用绝对路径或 `..`。Plan 最少 1 项、最多 100 项；单项最多 32 个验收项；读取路径、写入路径和工具列表各最多 128 项。TODO、验收项、委派和 Evidence 的标识符必须唯一。Host 在命令入口和恢复状态时都会校验这些约束。

Plan Mode 使用模型工具 `save_workflow_plan` 保存草案。草案不会在 Plan Mode 内执行；下一次普通用户 Run 自动激活同一 revision。自动化也可以用 `workflow.plan.save` 和 `workflow.activate` 显式完成这两步。新的写入必须带读取到的 `expectedRevision`，避免旧计划或旧界面覆盖新状态。

## 固定但可调整的循环

活动工作流向模型重复注入当前焦点、revision、允许路径、允许工具、待验收项、委派状态和最近失败。正常循环为：

1. 用 `get_workflow` 或 `workflow.get` 定位当前 TODO 和 revision。
2. 只在声明的读取路径与工具内做有界探索。默认连续 8 次读取后，Host 要求先记录检查点。
3. 直接执行当前项，或把互不重叠的可写项交给子 Agent。
4. 通过实际工具结果、工作区结果、浏览器断言或明确的用户接受生成 Evidence。
5. 用 `workflow_update` 或 `workflow.checkpoint` 记录 `progress`、`revise`、`complete` 或 `blocked`；检查点将探索计数归零并明确下一焦点。

需要扩大范围时必须先调用 `workflow.expandScope`，给出新增范围、理由和当前 revision。Host 拒绝未声明工具及结构化参数中的越界路径。`revise` 会取消该 TODO 尚未结算的委派并清理相应隔离 worktree，让计划在保留历史证据的同时可以调整。

这个循环是稳定的控制骨架，并不规定每项必须执行相同数量的读取、工具调用或 Agent。简单项可以直接执行和验证；遇到新证据时可以扩展范围、修订或阻塞，而不需要继续无效探索。

## 外部验收与完成门禁

模型的完成陈述不是验收证据。工具型验收只在工具结果已经结算后记录，并保存 Run、Call、工具名、参数哈希和结果哈希。用户型验收必须通过 `workflow.acceptCheck` 或 Goals and plans 面板的 Accept/Reject 操作写入。Agent Evidence 绑定 Agent 和结果哈希。

同一个工具验收连续三次得到相同失败结果时，Host 把当前 TODO 和 Workflow 标记为 `blocked`，阻止继续调用普通工具，直到记录 `revise` 检查点。Evidence 最多保留 1,000 条；UI 每次显示 20 条并显式加载下一页。

`workflow.complete` 只有在以下条件同时满足时才成功：

- 所有 TODO 都是 `completed`；
- 所有必需验收项都是 `passed` 或 `accepted`；
- 所有委派都已 `applied` 或 `cancelled`；
- 调用方提供当前 Workflow revision。

成功后 Host 同步把关联 Goal 标记为完成。Goal 自身的完成入口也经过同一门禁，所以无法绕过 Workflow Evidence。

## 子 Agent 与补丁

`delegate_work` 或 `workflow.delegate` 只接受当前可执行的 TODO。Host 拒绝重复 item ID、互相重叠的写入范围、与未结算委派重叠的写入范围，以及超过 Goal 剩余 Token 的预算。默认最多同时运行 3 个隔离 Agent，其余保持 `queued`，有槽位后按队列启动；一条命令最多派发 8 项，持久状态最多保留 128 条委派记录。

每个委派在独立 Git worktree 和独立子 Session 中运行。Host 把 Goal、TODO、plan revision、范围、工具和验收项组成焦点包。隔离 Agent 只能调用显式列出的工具；文件工具还必须命中声明的读取或写入路径。通用 `process` 工具无法获得可靠的文件级 OS 沙箱，因此隔离补丁 Agent 会拒绝这类工具；构建和测试由父 Workflow 在补丁应用后运行并形成外部 Evidence。

Agent 完成后只生成持久补丁元数据，父工作区仍不变化。补丁记录每个文件的操作和前后 SHA-256，并绑定 Agent、TODO 与 plan revision。`apply_agent_patch` 或 `agent.patch.apply` 在一次应用前检查：

- Agent 必须是目标 Session 的直接子 Agent；
- plan revision 必须一致；
- 文件仍位于委派写入范围；
- 隔离内容仍匹配捕获的 artifact 哈希；
- 父工作区的每个文件仍匹配派发时 baseline。

任一父文件有并发变化时，整组补丁进入 `conflict`，不会部分写入。完整性失败进入 `rejected` 并清理 worktree。成功应用后才把委派标记为 `applied`。CLI 对冲突和完整性失败返回非零退出码，同时在 stdout 保留可解析的补丁 JSON。

## 命令和模型工具

Host 命令包括：

| 命令                                   | 用途                              |
| -------------------------------------- | --------------------------------- |
| `workflow.get`                         | 读取 Plan 和 Workflow 快照        |
| `workflow.plan.save`                   | 保存结构化草案                    |
| `workflow.start` / `workflow.activate` | 直接启动或激活草案                |
| `workflow.expandScope`                 | 记录有理由的范围扩展              |
| `workflow.checkpoint`                  | 记录进度、修订、完成或阻塞        |
| `workflow.delegate`                    | 创建有界委派队列                  |
| `workflow.acceptCheck`                 | 写入用户接受或拒绝证据            |
| `workflow.complete`                    | 在门禁通过后完成 Workflow 和 Goal |
| `agent.result.get`                     | 读取子 Agent 结果与补丁状态       |
| `agent.patch.apply`                    | 显式应用指定 revision 的补丁      |

模型侧提供 `get_workflow`、`save_workflow_plan`、`workflow_start`、`workflow_update`、`delegate_work`、`get_agent_result` 和 `apply_agent_patch`。这些工具只是同一 Host 服务的模型入口，不维护第二份状态。

CLI 示例：

```text
hbar exec workflow.get --session <Session ID>
hbar exec workflow.start --session <Session ID> --input-json '<workflow JSON>' --idempotency-key workflow-1
hbar exec workflow.acceptCheck --session <Session ID> --input-json <JSON>
hbar exec workflow.checkpoint --session <Session ID> --input-json <JSON>
hbar exec agent.result.get <Agent ID> --session <Session ID>
hbar exec agent.patch.apply <Agent ID> --session <Session ID> --plan-revision <revision> --idempotency-key apply-1
hbar exec workflow.complete --session <Session ID> --input-json '{"expectedRevision":4}'
```

所有持久命令都在 Host 串行检查 revision。`workflow.start` 与补丁应用使用幂等键；网络结果未知时先用同一键重试或查询当前快照，不要换键重复写入。

## 验证

核心验证覆盖状态恢复、范围门禁、探索上限、三次失败阻塞、并发 revision、委派队列、预算、隔离补丁、冲突、完整性、列表容量和旧响应抑制。发布版 CLI 测试会真实编译并运行 `hbar.exe`，验证其内嵌 Host、原生查询、Workflow、Agent Patch，并确认只存在一个该路径的 `hbar.exe` Host 且没有递归子进程。浏览器 E2E 从真实 Host 启动 Workflow，在桌面和 390×844 窄屏中执行接受操作，再从 Host 查询 Evidence。

常用命令：

```text
bun test tests/workflow-contracts.test.ts tests/workflow.test.ts tests/workflow-delegation.test.ts
bun test tests/agent-patch.test.ts tests/compiled-cli.test.ts --timeout 90000
bun run build
bunx playwright test e2e/workflow-focus.spec.ts
```
