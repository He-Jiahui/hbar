# 项目显示名称：参考语义与 Host 基础

## 范围与证据

基线：hbar `61d4869`，cc-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731`。本单元只交付公开的 Host/Storage/Client 别名合同；**尚未接入项目菜单、编辑对话框或名称消费者，不能称为桌面编辑项目功能已经完成**。

参考采用 cc-haha 的实际 `Sidebar`、`ProjectEditorModal`、store 和主题的受控渲染，不是手绘仿图，也不是原版完整 Host。主线重新查看的既有证据：

- `artifacts/project-organization-recheck/cc-edit-alias-en-US-1440.png`：项目菜单进入编辑；名称与只读真实路径分开，Save/Cancel 在底部。
- `artifacts/project-organization-recheck/cc-reset-alias-zh-CN-320.png`：已有别名时出现恢复文件夹名。该截图是恢复入口，不应冒称恢复后画面。
- `artifacts/project-organization-recheck/reference-extra.json`：四组 locale/width 的原组件实际触发 name → null 两次偏好请求，`aliasThenReset: true`。
- `artifacts/project-organization-contract/cc-alias-validation-en-US-320.png`：空名称就近校验。

源码：`desktop/src/components/layout/Sidebar.tsx`、`ProjectEditorModal.tsx`、`desktop/src/stores/projectDisplayNameStore.ts` 与 `src/server/services/desktopUiPreferencesService.ts`。原版按项目逻辑根记录 Host 偏好；规范化首尾和连续空白，最多 80 个 JavaScript UTF-16 单位；保存默认文件夹名相当于移除别名。独立 Restore 立即保存 null 并保留对话框，后续 Cancel 不撤销已经保存的恢复。

原版输入框 Enter 不提交。本轮没有实现键盘差异；后续若支持 form Enter/IME，需要如实记录为 hbar 改善，而非声称逐项相同。

## 为什么独立于隐藏状态

`8767e88` / `7dc0ab4` 已实现 `workspaceOrganization` v1 的隐藏、恢复及 exact receipts。它的严格快照只接受 `hiddenWorkspaceIds`，直接追加 aliases 会破坏旧客户端严格解析；改写旧请求也会破坏未知操作的回执核对。

本单元因此新增独立 `workspaceDisplayNames` v1，**不修改旧隐藏状态和旧 durable receipt 的 wire shape**。两者同为 Host/data-root presentation 状态，分别拥有 revision；并非另一份 Workspace。canonical `Workspace.id/name/path/createdAt` 不变，不改目录、不重命名会话、不切换会话、不提交 Run。

## 公开合同

| 命令                            | 输入／输出与含义                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceDisplayNames.get`     | `{}` → `{schemaVersion:1, revision, entries:[{workspaceId,displayName}]}`。首次为空只读，不创建状态行。                                                    |
| `workspaceDisplayNames.apply`   | `{expectedRevision, workspaceId, expectedDisplayName, displayName}`；原值和新值均为 string 或 null，null 表示没有别名。必须提供 actor 与 idempotency key。 |
| `workspaceDisplayNames.receipt` | `{idempotencyKey, request:原完整apply输入}`；仅查询当前认证 actor 的历史 ACK；null 不证明写入失败，不自动重放。                                            |

三个命令仅在 API/internal surface 注册，不在命令面板暴露未经 UI 捕获的任意 CAS 表单。公共入口是 `@hbar/contracts/commands/workspace-display-names`，Client 使用既有 `createWorkspaceSessionCommandClient`。

容量规则：

- 名称 1–80 UTF-16 单位，首尾无空白，单行；ASCII、中文、阿拉伯文、组合音标和 ZWJ emoji 可用。
- 拒绝控制字符、Unicode 行/段分隔符、孤立 surrogate、双向控制符和仅由不可见格式/组合符组成的名称。这里比原组件校验更严格；不笼统禁所有 Cf，以免破坏 ZWJ emoji。
- 合同不偷偷 trim 或折叠空白，确保提交与回执逐字段一致。UI 应在捕获请求前一次性规范化；内部连续空格仍是合法 API 输入。
- 最多 2000 个不同 workspace ID，快照独立限制 256 KiB UTF-8 JSON，包含 revision/envelope 字段。名称可以重复，不能作为 identity。
- 字节上限和条目上限同时生效，因此不是“2000 个最长 ID 加最长 Unicode 名称必定可存”。失败返回 `INPUT_TOO_LARGE`，不截断或清理其他别名。

## 原子性与恢复

Storage Worker 的数据库版本从 7 升到 8，增加独立状态与 receipt 表。迁移在 IMMEDIATE transaction 内重新读取版本；v6→7 分支允许另一 Worker 已完成 v8，避免使用启动时旧版本判定导致竞争失败。旧隐藏表和回执保留；更高未知数据库版本拒绝启动。

写入按以下顺序在同一事务内执行：

1. 以 actor/key 查找原回执；同 key 不同输入明确冲突；完全相同的请求返回原回执，不回滚当前状态。
2. 检查当前 revision 和捕获的原 displayName。不同项目同 revision 竞争也只允许一个胜者，失败者需重新读取并让调用方确认，不自动覆盖。
3. 新增/替换非 null 别名要求 workspace 存在。清除允许陈旧 ID，且只删除目标条目。
4. 校验容量及安全整数 revision；有变化时更新状态，每个合法操作（包括 no-op）写 durable receipt。
5. journal 写失败会回滚状态；事务返回且 Host 验证 ACK 与原输入完全一致后，发布 `host.changed` / `workspace-display-names` 失效通知。

Client 和 Host 均再次校验 receipt 的原 workspace、revision、原值、新值、changed/revision 关系。写响应丢失或畸形按 `RESULT_UNKNOWN` 处理；读取失败不会触发重写。回执是历史事实，不是最新快照；通知也只要求相关 owner 读取有界最新投影，不广播整个目录/会话历史。

沿用既有 transport 的超时和队列限制。已取消的 signal 在派发前拒绝；派发后放弃等待不代表 Worker 事务已取消，不能据此新 key 重试。当前没有自动删除 durable receipts 的保留策略，不承诺无限写入下数据库大小固定。

## 下一 UI 单元的完成条件（尚未交付）

采用一个 Zustand 别名 owner 和公开纯 resolver；所有 UI captions 由 canonical Workspace + alias snapshot 派生，不修改 directory store 的 Workspace.name。

| 消费者                   | 接线范围                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Shell                    | 项目行、aria/action label、反馈、归档目标、显式项目选择器；picker 第二行保留真实路径。                |
| App/session              | 会话项目说明、composer project context、归档通知；别名出现后真实路径仍可核对。                        |
| Files/workbench/tabs     | 只改 targetLabel/workspace detail，不改 panel identity、文件 path/kind、dirty draft 或 unknown 写入。 |
| Commands/Settings/Status | workspace/session target说明、workspace scope、Git项目选择，选择结果仍是 workspace ID。               |
| 排序                     | 现有按名称排序可改为 displayName + stable ID tie-break，保留 pin 分区，不顺带新增手工排序。           |

编辑入口在项目行菜单；名称、真实路径、Restore、Cancel、Save 就近组织。捕获原 workspace ID/revision/alias；切换会话、排序移动、A→B→A 和旧 Host 回包均不能改错对象。恢复 null 成功后保留对话框并更新输入；关闭未知操作不能丢弃原 request/key/draft，应可从稳定项目入口重新核对。冲突不自动重写，null receipt 不解锁为“未保存”。

UI 验收必须覆盖中英 1440/900/390/320、长名/真实路径、Enter/IME/Escape、原行回焦与隐藏后 fallback、跨消费者一致、双 Client/重连、旧响应、隐藏/置顶/原稿/附件不受影响。需要真实临时 Host 浏览器和 Native WebView2 验证；本 Host 单元没有声称完成这些验收。

## 同轮其他分区复查（独立待办）

- `artifacts/settings-extension-recheck/report.md`：仅 `skill.list` 失败却把已成功读取的 15 个插件显示为空；应拆集合状态与局部恢复。另有 Skills 路径过深、系统命令关闭后焦点落 BODY。
- `artifacts/goal-plan-entry-recheck/report.md`：Goal unknown 核对缺 busy、读失败出现两套恢复；Plan unknown 时普通审批显示可选与单勾，引发状态误读。Send 仍禁用，未发现绕过执行门禁。

上述是冻结生产资源 `61d4869` + 独立真实 Host 的分区实测，不是本别名单元已修复项目。既有正确行为（插件详情 Back、Settings Back 原稿、Goal摘要可达及 Plan 阻止续作）保留，不重复改写。

## 验证记录

- 存储与旧隐藏回归：`bun test tests/workspace-display-names-storage.test.ts tests/workspace-organization-storage.test.ts --timeout 20000`，29 pass / 0 fail / 354 assertions，23.62s。包含真实双 Worker v6/v7→v8、20 轮 v6 竞争启动、2000 项/UTF-8 容量、journal 原子回滚、未知旧 receipt、重启与原身份不变。见 `artifacts/project-display-names/storage-tests.log`。
- 新 Host/Client 边界与真实端到端最终重跑：49 pass / 0 fail / 281 assertions，25.55s；43 个边界故障用例，commands 6 用例中 5 个使用真实 port0 Host。两 Client 通知、认证/撤销、同 key 跨 actor 隔离、同 dataRoot 换 Kernel/Host、原隐藏 receipt 共存、派发后丢 ACK 再只读核对均覆盖。无 Run 或商业供应商请求。
- 最终一次本机 40 组 get/apply 测量：get p95 0.3990ms / max 0.7332ms，apply p95 0.9376ms / max 1.8403ms；不作为其他环境的时延承诺。
- 原生依赖构建通过；使用 `using-vsdevcmd` 的 x64 环境（VS 18.4.2），仅构建仓库查询依赖，不重建或停止用户桌面启动器。
- Vite 构建通过，3120 modules；单独输出到 `artifacts/project-display-names/web`，JS `index-DspL3nH9.js` / CSS `index-BoYVj6Fm.css`。已有大 chunk warning 保留。
- 全仓 lint 实际失败：未改动的 `hbar-ui/packages/lumen-app-ui/src/authentication/primitives.tsx:44` 引用未注册规则 `react/no-unused-prop-types`。本单元不夹带修订该组件或降低 lint。
- 根 `bun run typecheck` 最终通过；首轮新测试在预期 snapshot 中混用了 nullable alias，已通过真实 non-null guard 缩窄修正，没有放宽产品类型或删除断言。所有本单元 TypeScript 的严格 scoped ESLint 通过，Prettier 与差异空白检查通过。
- 全仓基础测试：`bun test tests --timeout 20000`，2522 pass / 1 fail / 26566 assertions，380 files，277.38s。唯一失败仍为既有 `tests/lumen-canonical-boundary.test.ts`，报告未改动的 Invitation/PasswordReset/Quote/WorkspacePicker authentication 原生可见控件；新别名、旧隐藏状态与编译 CLI 回归均通过。完整日志 `artifacts/project-display-names/full-tests.log`。因此不宣称全仓 check 全绿。

测试诊断必须与产品问题区分：新 storage case 最初在 Bun 的 `await expect(workerPromise).rejects.toMatchObject` 首次失败断言处挂住；独立相同输入探针证明重启/ready/receipt/replay 正常，改为先 await/catch 再同步 expect 后 358ms 完成，原 matcher 8 秒仍未返回。主线仅改测试辅助函数，未增 Storage 重试或生命周期绕行；`artifacts/project-display-names/matcher-diagnostic.json` 保留对比。超时探针的专属临时根保留，正常测试临时目录按精确父目录/前缀核对后删除。

未接 UI，本单元不执行或声称完成 alias 浏览器/native 交互验收，也不以原版截图替代 hbar 验收截图。
