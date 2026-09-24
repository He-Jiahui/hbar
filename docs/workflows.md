# Goal、Agent Plan 与专注工作流

hbar 的长任务状态与 Codex 语义保持一致，并且只存在一份执行计划。

| 概念       | Host 持久事实                                                       | 不负责                       |
| ---------- | ------------------------------------------------------------------- | ---------------------------- |
| Goal       | 会话级 objective、停止状态、Token 预算、累计用量和耗时              | 步骤、文件范围、验收按钮     |
| Agent Plan | 带单调 revision 的 `{ step, status }` 有序清单                      | 工具权限、路径范围、Evidence |
| Workflow   | 当前 Plan 步骤的执行焦点、能力范围、验证策略、委派、诊断与 Evidence | 第二份 TODO 或 Goal 完成判定 |

Plan Mode 只在对话中产出 proposed plan。回到 Default mode 后，Agent 使用 `update_plan` 发布或修订唯一的 Agent Plan。Goals and plans 面板只读显示这份 Plan；生产 UI 不再提供 Plan 保存、清除或排序入口。兼容 Host 命令仍保留一个版本，但不再暴露给新模型流程。

## Goal 生命周期

`goal.create` / `create_goal` 在任何未完成 Goal 存在时返回 `GOAL_EXISTS`。用户显式替换 objective 使用 `goal.set`，必须携带当前 `expectedGoalId`；替换生成新的 `goalId`，重置 Token/时间计量、自动续跑审计与关联 Workflow，并清除旧 Agent Plan。同一 objective 或省略 objective 时只更新状态或预算，保留累计用量。旧 Goal 已清除时，携带其身份的写入也会被拒绝，不能重新创建旧目标。

`goal.set complete` 与 `goal.update complete` 使用相同的完成检查。校验与持久化期间锁定观察到的 Plan 和 Workflow 版本；并发修订会被排序或返回版本冲突，不会写入未经当前工作流验收的完成状态。创建或替换 objective 时不能同时标记完成。

Workflow 完成最后一个 Plan 步骤后不会擅自完成 Goal。Agent 仍需根据 objective 的停止条件调用 `update_goal complete`。Goal 可以在没有 Workflow 时独立运行。

Goal 的 Host `maxTokenBudget` 是上限；兼容 `goal.set` 参数中的同名字段只能收紧它。新建、替换和普通预算更新共用这一上限，`tokenBudget: null` 也不能取消 Host 已配置的限制。

Goal 在每个模型步骤结束时结算，下一次模型请求前检查已耗尽的额度。每次 Run 的 Goal 身份、起算位置和结算游标持久化；账目与游标在同一事件中提交，重复回调或重启不会重复计费。未能证明归属的旧 Run 不会被猜测归入当前 Goal。已绑定 Run 在暂停或完成前后仍如实结算实际消耗，但不会用预算状态覆盖显式暂停。计量写入结果未知时停止后续模型请求，等待 Host 重放持久事实恢复。

独立 session budget 在每个模型步骤结束时结算，并使用持久事件游标避免重复计费；下一次模型请求前检查已结算额度。单次已发出的请求可能超额，但不会在长 Run 中继续发起新的模型请求。旧的整轮账本保持已结算金额，升级和重启不会重算既有消耗；账本写入结果未知时阻止新请求，Host 恢复后回读持久事实。

## 焦点与范围

`workflow.focus.set`（模型工具 `workflow_focus`）为某个 Agent Plan 步骤设置或完整替换焦点。焦点绑定：

- Agent Plan revision；
- 步骤索引；
- 步骤文本 SHA-256；
- 当前读/写目录前缀与工具集合；
- 验收检查与完成策略。

路径是工作区相对文件或目录前缀，统一使用 `/`。新输入拒绝绝对路径、`..`、`*` 和 `**`。`apps/web/**` 等 v1 数据只在迁移时规范化为 `apps/web`；`**/*`、`**` 和 `*` 迁移为 `.`。

工具名在持久化前与真实 ToolRegistry 核对。历史 `functions.read_file` 会在工具存在时规范化为 `read_file`；未知工具立即返回 `WORKFLOW_TOOL_UNKNOWN`。ToolDefinition 明确声明无工作区访问、结构化路径访问或 workspace-wide 访问，Workflow 不再猜测 `path`/`cwd` 字段。`shell` 与 Git 工具属于 workspace-wide；写入或进程工具必须显式拥有 `.` 写范围。

`workflow.expandScope` 只接受真实增量；重复扩展返回 `WORKFLOW_SCOPE_NOOP`，不消耗 revision。普通工具连续三次遇到相同工具、路径、Plan revision 和焦点拒绝时，Workflow 进入 `needs_revision` 并停止 Goal 自动续跑。`get_workflow`、`update_plan`、`workflow_focus`、`workflow_update` 与 Goal 控制工具始终可用，Agent 可以自行修订后继续，不需要用户选择。

## 检查点与恢复

`workflow.checkpoint complete` 先写入带 operation ID 的 transition intent，再以 Plan CAS 完成当前步骤并把下一 pending 步骤设为 in_progress，最后结算 Workflow。Host 如果在任一步崩溃，恢复时会幂等补齐；若 Plan 已被其他写入改变，则进入 `needs_revision`，不会把旧结果写入新 Plan。

Plan revision 或步骤文本发生变化时，旧焦点、委派与 reviewer 结果都会失效。Agent 使用 `workflow_focus` 为新 revision 建立焦点即可恢复。Workflow 最后一步完成只结算 Plan/Workflow，不修改 Goal。

清除 Agent Plan 会记录 revision 墓碑；重新发布的 Plan 继续递增版本，Host 重启也不会把版本重置为 1。没有当前 Plan 时，兼容命令的 `expectedRevision: 0` 仍表示创建，但旧 Plan 的版本不能匹配新 Plan。

## 验收策略

`completionPolicy` 有三种：

- `agent`（默认）：执行 Agent 提交结论、摘要和 Evidence 引用。Host 记录 Plan revision、Run/Call、参数/结果哈希；全过程不要求用户决断。
- `review_agent`：Host 创建 `approval: deny` 的只读 reviewer。Reviewer 只能使用焦点允许的读工具和 `workflow_review_submit`。verdict 绑定 Plan revision、步骤哈希和 Git 工作区指纹；工作区变化后结果标记为 stale。批准推进 Plan；拒绝携带反馈自动恢复主 Agent；取消或失败也恢复主 Agent。
- `user`：仅在用户或任务明确要求人工验收时使用。Accept/Reject 只对当前焦点且 `waiting_user` 状态有效，不能提前接受未来步骤。

工具检查支持规范工具名、参数子集以及类型化结果谓词：成功、文本包含、JSON 路径等于、布尔为真。浏览器自然语言字符串包含断言只保留为 v1 历史，不再产生有效自动证明。纯视觉质量应由 Agent、review agent 或显式人工策略判断。

## Evidence 与委派

工具 Evidence 在工具结果结算后写入，包含 Run、Call、工具、参数哈希和结果哈希。Agent 结论、reviewer verdict 和显式用户决断使用不同 source。Evidence 最多保留 1,000 条；UI 以每页 20 条增量显示。

委派补丁继续在隔离 worktree 中运行，并绑定权威 Plan revision 与焦点。写范围不得重叠；预算不得超过 Goal 余量。补丁应用后由父 Workflow 执行集成验证。Goal 替换或清除会取消未结算委派和 reviewer，并把旧 Workflow 标记为 cancelled。

## 命令与模型工具

| Host 命令              | 作用                                     |
| ---------------------- | ---------------------------------------- |
| `workflow.get`         | 读取权威 Agent Plan 与当前 Workflow 焦点 |
| `workflow.focus.set`   | 设置或替换某个 Plan 步骤的焦点           |
| `workflow.expandScope` | 记录真实增量范围                         |
| `workflow.checkpoint`  | 记录进度、修订、阻塞或完成步骤           |
| `workflow.delegate`    | 创建有界隔离委派                         |
| `workflow.acceptCheck` | 仅写入显式 user 策略的当前人工决断       |
| `workflow.complete`    | 兼容 Workflow 结算命令；不完成 Goal      |

`workflow.plan.save`、`workflow.start` 和 `workflow.activate` 仅作为 v1 兼容入口保留；新模型提示不再暴露它们。模型侧使用 `get_workflow`、`workflow_focus`、`workflow_update`、`delegate_work`、`get_agent_result`、`apply_agent_patch` 和 reviewer 专用 `workflow_review_submit`。

CLI 示例：

```powershell
hbar exec plan.update --session <Session ID> --input-json '<Agent Plan JSON>'
hbar exec workflow.get --session <Session ID>
hbar exec workflow.focus.set --session <Session ID> --input-json '<focus JSON>'
hbar exec workflow.expandScope --session <Session ID> --input-json '<scope JSON>'
hbar exec workflow.checkpoint --session <Session ID> --input-json '<checkpoint JSON>'
```

## 迁移与验证

Host 不改写旧 SessionEvent，而是追加幂等 `workflow.migrated.v2`。有 Agent Plan 时以它为权威；没有时从 v1 workItems 派生一次 Plan。无法安全匹配的旧工具、范围、TODO 或提前验收会进入 `needs_revision`，不会静默扩大权限。

核心回归包含目标替换、Plan CAS、工具别名、Windows 路径、glob 迁移、workspace-wide Shell、三次拒绝自愈、提前人工验收、类型化谓词、review approve/reject/stale/cancel、重启恢复、预算边界和 transition intent：

```powershell
bun test tests/goal.test.ts tests/plan.test.ts tests/workflow-v2.test.ts tests/workflow.test.ts tests/workflow-delegation.test.ts
bunx playwright test e2e/workflow-focus.spec.ts
```
