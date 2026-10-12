# 项目显示名称：参考语义、Host 合同与桌面交互

## 范围与证据

参考基线：hbar `61d4869`，cc-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731`。Host/Storage/Client 基础已由 `eabb48a` 交付。本轮在其上接入项目菜单、受控编辑器和所有现有项目名称消费者，不改 canonical Workspace，也不将这一子功能的完成等同于整个桌面体验迁移完成。

参考采用 cc-haha 的实际 `Sidebar`、`ProjectEditorModal`、store 和主题的受控渲染，不是手绘仿图，也不是原版完整 Host。主线重新查看的既有证据：

- `artifacts/project-organization-recheck/cc-edit-alias-en-US-1440.png`：项目菜单进入编辑；名称与只读真实路径分开，Save/Cancel 在底部。
- `artifacts/project-organization-recheck/cc-reset-alias-zh-CN-320.png`：已有别名时出现恢复文件夹名。该截图是恢复入口，不应冒称恢复后画面。
- `artifacts/project-organization-recheck/reference-extra.json`：四组 locale/width 的原组件实际触发 name → null 两次偏好请求，`aliasThenReset: true`。
- `artifacts/project-organization-contract/cc-alias-validation-en-US-320.png`：空名称就近校验。

源码：`desktop/src/components/layout/Sidebar.tsx`、`ProjectEditorModal.tsx`、`desktop/src/stores/projectDisplayNameStore.ts` 与 `src/server/services/desktopUiPreferencesService.ts`。原版按项目逻辑根记录 Host 偏好；规范化首尾和连续空白，最多 80 个 JavaScript UTF-16 单位；保存默认文件夹名相当于移除别名。独立 Restore 立即保存 null 并保留对话框，后续 Cancel 不撤销已经保存的恢复。

原版输入框 Enter 不提交。hbar 支持普通 Enter 保存，IME composition / keyCode 229 不提交；这是明确的键盘改善，不声称逐项相同。原版编辑器内还重复提供移出侧栏入口；hbar 保留项目菜单的单一隐藏入口，不在名称编辑器中再添加第二个。视觉保持 Lumen 字体、按钮和主题体系，不追求原版圆角或字体的逐像素复制。

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

## 已实现的 UI 交互

采用一个 Zustand 别名 owner 和公开纯 resolver；所有 UI captions 由 canonical Workspace + alias snapshot 派生，不修改 directory store 的 Workspace.name。编辑器订阅完整状态，其他消费者只订阅同一 owner 的稳定 snapshot reader；输入变化不产生另一份别名事实或刷新整个目录。

| 消费者                   | 接线范围                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Shell                    | 项目行、aria/action label、反馈、归档目标、显式项目选择器；picker 第二行保留真实路径。                |
| App/session              | 会话项目说明、composer project context、归档通知；别名出现后真实路径仍可核对。                        |
| Files/workbench/tabs     | 只改 targetLabel/workspace detail，不改 panel identity、文件 path/kind、dirty draft 或 unknown 写入。 |
| Commands/Settings/Status | workspace/session target说明、workspace scope、Git项目选择，选择结果仍是 workspace ID。               |
| 排序                     | 现有按名称排序可改为 displayName + stable ID tie-break，保留 pin 分区，不顺带新增手工排序。           |

编辑入口在项目行菜单首项；名称、只读真实路径、Restore、Cancel、Save 用普通 flex 内容流就近组织。名称按原版语义一次性 trim/折叠空白，再捕获完整请求。未改变的名称保存只关闭编辑器，不重复写入或伪造回执。普通取消丢弃草稿；恢复 null 立即保存，成功后保留对话框并更新输入，之后取消不会撤销恢复。

运行时捕获原 workspace ID/revision/alias；本地草稿 revision 隔离 A→B→A、同 ID 关闭再打开和旧渲染回调。未知操作关闭后保留 request/key/draft，在稳定侧栏反馈区重新打开；空或错误 receipt 不解锁为“未保存”，不自动再写。冲突保留原输入，通过显式“读取最新值并保留输入”更新 CAS 基线。确认保存与读取最新快照是两个状态，后续 GET 失败不会把已确认保存改写为失败。

焦点回到原项目 ID 的菜单，不依赖改名后的排序；若源行不在页面，尝试项目组织入口、侧栏开关和主区域。用户已切换会话或在其他输入框继续操作时，旧完成结果不夺回焦点。物理请求槽与逻辑取消分离，重连仅重新读，不用新 key 重放旧写。

第一版真实截图显示 glass 面板和 plain 输入框使字段不易辨认，因此新增显式 opt-in 的 `LumenDialog appearance="panel"` / `LumenSurface material="solid"` / `LumenInput variant="boxed"`。共享默认 glass/boundary 以及 outlined 兼容语义均不改变。新面板无折射与装饰分隔灯条，但按钮原有 Lumen 小灯条保留。共享提交 `6f489d23c87df3dee22d7088fe5315797bd1f3fa`。

### UI 验收范围与边界

最终浏览器产物冻结在 `artifacts/project-display-names-ui/web-v5`：JS `index-B9pZe89e.js`，CSS `index-ZTPIC9-c.css`。每个 E2E fixture 校验实际加载的 JS，不以旧构建绿色结果代替本轮资源。V1–V4 旧构建和失败证据保留。

- 基础交互：中英各 1440/900/390/320，共 8 例。就近校验、空/超长名称鼠标 Save 回焦、长名、真实路径、普通 Enter、IME、取消、原 ID 回焦、未变化 Save 零写入、立即 Restore 和原会话草稿均通过。
- 恢复交互：中英 1440/320 的冷读取失败、丢失 ACK、空/错误/延迟 receipt、关闭重开和 A→B 后旧结果不抢焦点，共 4 例；另有中英 900 的确认保存后 GET 失败、冲突保留输入与显式 rebase，共 2 例。基础与恢复合计 **14/14，约 1 分钟**。
- 消费者：中英 1440/320 共 **4/4，21.6 秒**。Files/页签/Commands/固定 B 的 Settings/Git 对第二 Client 的名称变化即时响应；同别名的项目用真实路径与 ID 区分，选择、原 DOM、焦点、原会话草稿、附件和未保存文件内容不变。每例 1 次 UI + 7 次外部 alias apply、1 次临时附件上传，0 Run/settings.apply/file.write。完整报告 `artifacts/project-display-names-ui/consumer-verification.md`。
- 外观：英文 1440、中文 320，各 light/dark/forced-colors，共 **6/6，19.7 秒**。实测面板 alpha=1、无 filter、字段 1px 边界、2px focus-visible、正文对比度至少 4.5、Tab 约束与 Escape 回源；空/超长名称回焦后，用户点击路径与 Tab 到取消仍保留新焦点；没有横向溢出。`appearance-v5` 内有 12 图和 6 份 computed-style/几何 JSON。
- 旧项目组织回归：**8/8，25.4 秒**。隐藏/恢复、置顶、原草稿/附件/dirty Files、unknown 核对、菜单 End/Escape 和异步 toggle 焦点均保持。证据 `artifacts/workspace-project-organization/browser/alias-v5`。
- 定向基础测试：运行时/编辑器/校验焦点身份/消费者/共享外观/置顶/React Shell/项目说明合计 **77 pass，576 assertions，18.93 秒**；覆盖断线、dispose、物理并发槽、旧 revision 与 ABA，但这些不是浏览器真实断网验收。独立共享 DOM 既有回归另有 33 pass。

截图亲审包括 V4/V5 英文宽屏、中文窄屏和错误态，以及消费者宽窄屏图。窄屏 Git/Commands 原生闭合 select 仍会截断长标签；验证的是完整 option label/path 和 ID，不宣称 320px 展示整条长路径。项目路径输入框可选取、聚焦、横向查看，不在普通内容区制造横向滚动。

已实现但未单独用浏览器证明的边界包括：隐藏源行后的焦点 fallback、真实 WebSocket 断线重连、30 秒 wall-clock 超时；这些只具有相应实现或基础测试证据，不扩大为全路径端到端覆盖。

V3 外观新增 hover-invalid 断言首次失败：更高 specificity 的 hover 灰边覆盖了错误红边。V4 仅让 hover 排除 invalid 后复验通过，旧失败 trace 保留。其他早期红例属于 fixture 的空 HTML id 假设、窄屏自动隐藏的点击竞争，以及重复 Settings header 的响应式隐藏，报告已区分，没有放宽真实交互断言或删除失败证据。

## 同轮其他分区复查（独立待办）

- `artifacts/settings-extension-recheck/report.md`：仅 `skill.list` 失败却把已成功读取的 15 个插件显示为空；应拆集合状态与局部恢复。另有 Skills 路径过深、系统命令关闭后焦点落 BODY。
- `artifacts/goal-plan-entry-recheck/report.md`：Goal unknown 核对缺 busy、读失败出现两套恢复；Plan unknown 时普通审批显示可选与单勾，引发状态误读。Send 仍禁用，未发现绕过执行门禁。

上述是冻结生产资源 `61d4869` + 独立真实 Host 的分区实测，不是本别名单元已修复项目。既有正确行为（插件详情 Back、Settings Back 原稿、Goal摘要可达及 Plan 阻止续作）保留，不重复改写。

## Host 基础单元的既有验证记录（`eabb48a`）

- 存储与旧隐藏回归：`bun test tests/workspace-display-names-storage.test.ts tests/workspace-organization-storage.test.ts --timeout 20000`，29 pass / 0 fail / 354 assertions，23.62s。包含真实双 Worker v6/v7→v8、20 轮 v6 竞争启动、2000 项/UTF-8 容量、journal 原子回滚、未知旧 receipt、重启与原身份不变。见 `artifacts/project-display-names/storage-tests.log`。
- 新 Host/Client 边界与真实端到端最终重跑：49 pass / 0 fail / 281 assertions，25.55s；43 个边界故障用例，commands 6 用例中 5 个使用真实 port0 Host。两 Client 通知、认证/撤销、同 key 跨 actor 隔离、同 dataRoot 换 Kernel/Host、原隐藏 receipt 共存、派发后丢 ACK 再只读核对均覆盖。无 Run 或商业供应商请求。
- 最终一次本机 40 组 get/apply 测量：get p95 0.3990ms / max 0.7332ms，apply p95 0.9376ms / max 1.8403ms；不作为其他环境的时延承诺。
- 原生依赖构建通过；使用 `using-vsdevcmd` 的 x64 环境（VS 18.4.2），仅构建仓库查询依赖，不重建或停止用户桌面启动器。
- Vite 构建通过，3120 modules；单独输出到 `artifacts/project-display-names/web`，JS `index-DspL3nH9.js` / CSS `index-BoYVj6Fm.css`。已有大 chunk warning 保留。
- 全仓 lint 实际失败：未改动的 `packages/lumen-app-ui/src/authentication/primitives.tsx:44` 引用未注册规则 `react/no-unused-prop-types`。本单元不夹带修订该组件或降低 lint。
- 根 `bun run typecheck` 最终通过；首轮新测试在预期 snapshot 中混用了 nullable alias，已通过真实 non-null guard 缩窄修正，没有放宽产品类型或删除断言。所有本单元 TypeScript 的严格 scoped ESLint 通过，Prettier 与差异空白检查通过。
- 全仓基础测试：`bun test tests --timeout 20000`，2522 pass / 1 fail / 26566 assertions，380 files，277.38s。唯一失败仍为既有 `tests/lumen-canonical-boundary.test.ts`，报告未改动的 Invitation/PasswordReset/Quote/WorkspacePicker authentication 原生可见控件；新别名、旧隐藏状态与编译 CLI 回归均通过。完整日志 `artifacts/project-display-names/full-tests.log`。因此不宣称全仓 check 全绿。

测试诊断必须与产品问题区分：新 storage case 最初在 Bun 的 `await expect(workerPromise).rejects.toMatchObject` 首次失败断言处挂住；独立相同输入探针证明重启/ready/receipt/replay 正常，改为先 await/catch 再同步 expect 后 358ms 完成，原 matcher 8 秒仍未返回。主线仅改测试辅助函数，未增 Storage 重试或生命周期绕行；`artifacts/project-display-names/matcher-diagnostic.json` 保留对比。超时探针的专属临时根保留，正常测试临时目录按精确父目录/前缀核对后删除。

以上全仓数字属于 Host 基础单元，不冒充本轮 UI 的最新全仓结果。本轮新增浏览器证据见前节；Native 与最终静态/全仓结果单独记录。

## 本轮 UI 的静态与全仓验证

- 根 `bun run typecheck` 通过；本轮所有新增/修改 TypeScript 的严格 scoped ESLint 通过，新增/修改文件的 Prettier 和 `git diff --check` 通过。相关 content、icon、flow guards 通过。
- V4 Web 构建通过，3127 modules；之后当前工作区的一次构建被其他正在开发的 Kanban 导入未落盘暂时阻断，没有修改这些文件。再检当前工作区构建通过，3129 modules，输出到 `current-tree-build`；其最终 JS/CSS 内容与冻结 V4 以及 Native 资源一致。既有大 chunk warning 保留。
- 最后的校验焦点修正之后 V5 Web 构建再次通过，3130 modules。Host/native-query 资源使用 `using-vsdevcmd` x64 / VS 18.4.2 构建通过，没有重建 Tauri 启动器。每轮 Native 验收使用明确的预期 JS/CSS；最终资源更新至 V5。
- 全仓 lint 仍在未修改的 `authentication/primitives.tsx:44` 因未知 `react/no-unused-prop-types` 规则失败，没有用关闭规则掩盖。
- V4 阶段的 `bun test tests --timeout 20000`：**2578 pass / 2 fail / 26982 assertions，384 files，282.52s**。两项失败分别为另一项正在开发的 Kanban 第三个视图新增 lucide 图标而旧测试仍禁止，以及既有 authentication 的 canonical control boundary 检查；新别名和旧隐藏相关用例通过。日志 `artifacts/project-display-names-ui/full-tests.log`。V5 局部焦点修正后重跑根 typecheck、定向 lint 和上述 77 例，不把 V4 全仓数字改称 V5 全仓结果，也不声明全仓绿色。
- 共享包标准 pnpm 命令受要求 12.3.4 / 当前 11.19.0 的 engine 限制，使用现有直接二进制完成 TS/声明/DOM 测试。现有 API/proptypes 生成器不包含 Lumen，未运行无关全仓生成。

提交前两次遇到空 `.git/index.lock`。分别确认没有 Git 进程或文件持有句柄、核对精确创建和修改时间后，只将孤立空锁移至本轮 `orphan-index-lock-20260927T001539.bak` / `orphan-index-lock-20260927T004106.bak` 留存；未重置索引、未回滚或清除其他任务的工作区修改。

### Native V4 与最后一次参考对照

V4 使用既有 Tauri 启动器和新建独立 Host/profile/workspace，在中英 900×600 / 1440×960 四例全部通过。真实键盘进入项目菜单、输入和 Enter 保存、原行回焦、项目上下文/选择器同步、立即 Restore、原稿与会话保留均通过；8 次 alias apply，4 个会话合计 0 Run，0 Goal/file/provider 写入。所有控件在视口内且中心命中，pageerror/console warning/error 均空。证据为 `native/hbar-native-session-project-alias-Qs92jn`，24 图、verification/cleanup/directory-cleanup JSON；自有进程链已精确退出，成功 fixture 两个临时根已删除。

此前两次 Native 红例保留：首轮最后的测试计数错误拒绝正常 `goal.snapshot/history` 只读查询；第二轮是自动关闭侧栏与脚本 Hide 点击的竞态。只修测试判断和有界同意图关闭检查，不放宽保存、焦点、身份和零 Run 断言；失败轮目录没有再清理。

最后重新对照原版 `ProjectEditorModal.handleSubmit → focusInvalidField`，V4 新探针发现：鼠标点击空名称 Save 后，必填提示出现但 Save 被禁用，焦点掉至 BODY，1.5 秒后仍不恢复。`validation-focus-v4/observation.json` 与截图保留此真实产品缺陷；原有绿色矩阵没有覆盖该焦点断言，不能用它否定新证据。

V5 用仅属于本次显式 Save 的焦点凭据修复：捕获 opaque owner、编辑器 generation、原 workspace ID/revision/draft，只在匹配本地 validation 时回到名称字段；任意之后的 pointer/key/focus/window blur、关闭/重开、换 owner/目标都会使其失效。不是通用 validation effect，也不对 Host failed/unknown 状态抢焦。V5 浏览器 14 例与外观 6 例均包含新增空/超长名称鼠标 Save 回焦断言并通过。

### Native V5 最终验收

新建独立 fixture 的中英 900×600 / 1440×960 **4/4 通过，exit 0**，明确加载 `index-B9pZe89e.js`。四例均新增空白名称与 41 个 emoji 的真实鼠标 Save：就近错误、输入回焦和零额外 apply 均通过；原保存/恢复/路径/身份/原会话草稿断言保持，总共 8 次 alias apply、4 会话合计 0 Run，0 Goal/file/provider 写入。pageerror 和 console warning/error 均空，全部可见对话框控件完整在视口内并中心命中。

最终证据 `artifacts/project-display-names-ui/native/hbar-native-session-project-alias-s181b5` 包含 32 图及 geometry、verification、cleanup、directory-cleanup JSON。主线亲看英文 900 必填错误回焦、中文 900 恢复结果，以及中文 320 浏览器错误态。仅本次创建并经 executable/argv/parent/creation 核对的 Desktop→supervisor→Host 链退出，清理错误为空，成功 fixture 两个临时根已删除；保护进程和旧失败目录未查询或触碰。完整说明在 `artifacts/project-display-names-ui/native-verification.md`。

本轮按子功能独立提交共享外观适配（父仓 `913f6da`，子仓 `6f489d2`）与运行时 owner（`4daf66a`），随后提交已完成浏览器/Native 复验的项目编辑 UI 和消费者。其他 Goal/Plan/Extensions 复查中列出的差距仍是独立后续工作，未把本单元称为全目标完成。
