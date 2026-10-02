# Desktop 当前交互地图与整合边界

2026-10-01，当前产品实现基线 `db80aebd`，隔离分支 `codex/session-launch-target`。
参考为只读 `D:/Git/cc-haha`，版本 `e28d0a653481ef41b7a329411eeb2f0fd5656731`。
这是用户要求的核心流程收束地图，不是逐按钮／尺寸矩阵，也不是完整 CC 功能或原生
桌面验收完成声明。早期审计的缺失项必须按本地图和实际源码核对，不能直接照搬。

2026-10-02 用户已授权先保存主工作区，再同步 UI。后续状态以
[UI 同步记录](desktop-ui-synchronization.md)为准；下文的等待确认和只读预检保留为
当时记录，不再作为新的授权阻碍。

## CC 的表达方式与迁移准则

参考主画面 `docs/images/app/zh-CN/session-main.webp` 与
`docs/images/app/en/workspace-preview.webp` 本轮由主 agent 再次查看：左侧是稳定的
项目／会话导航，顶部标签保存工作上下文，正文是主阅读区，工具是右侧辅助区域，
输入区保留在底部。详情不与正文争夺同等视觉重量；状态可见但不会充满工具栏。
这两张是发布截图，不是本轮真实 CC Host，不能证明审批／迟到结果行为。

入口与行为还需由实际 CC `ChatInput`、`Sidebar`、`TabBar`、`WorkspacePanel`、
`PlanModePermissionDialog`、`Settings` 与 `ProviderSettings` 源码及原组件实渲
证明，具体证据在下表的独立交付记录中：

1. 功能放在它所属的上下文。材料和执行意图在输入区左侧，模型、思考与 Send/Stop
   在右侧；项目／会话行操作各自绑定原行，不在等待后重新猜全局 active ID。
2. 高频动作直接可见，少用的设置和工具进入 More；同一动作不在一排堆重复入口。
   全局设置与会话工具是不同作用域，不能仅靠相同图标混同。
3. 选择、详情与工具往返保留用户工作状态：草稿、未保存文件、阅读位置和原来源。
   打开工具不是发起 Run，也不是默默保存配置。
4. 处理中、审批、结果未知和失败在发起位置表达，恢复也在原处；不能用远处 toast
   或静态成功样式冒充 Host 确认。用户后来的焦点与操作优先。
5. 内容按 normal flex flow 增长、换行或在所属 pane 内滚动。只给真实 overlay 入口
   容器定位，图标使用语义尺寸、文案由宿主的类型化中英 bundle 提供。

## 当前可用核心路线

本轮三位既有 gpt-6-luna/max agent 只读核对当前源码、测试断言与保留实渲；
主 agent 运行新组合并查看最终画面。表中的既有证明不算作本轮重跑数量。

| 用户路线                                            | 当前入口与状态连续性                                                                                              | 权威交付／验证索引                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 选项目 → 模型／思考 → 首次发送                      | 输入区就地选择；空会话换项目保留当前选择和稿件；新会话保存显式选择，项目默认值不改                                | [项目连续性](desktop-project-selection-continuity.md)、`e2e/pre-session-project-continuity.spec.ts` 验证真实 Send 的目标 Session／Run／Files                                     |
| Goal + Plan → 审批 → 继续执行                       | Add 准备 Goal，执行菜单选 Plan，二者共存；原工具旁看计划、决定；批准后仍是原 Run，未发送稿保留                    | [输入入口](desktop-composer-entry-parity.md)、[原 Plan 依据](desktop-plan-exit-reference.md)、`e2e/goal-plan-coexistence.spec.ts`                                                |
| 输入 → 运行／排队 → 编辑／引导／停止                | 原输入区 Queue／Stop，卡片就近；后台 Agent Stop 与 idle Send 并列；操作绑定原 Run／Session                        | [主动作](desktop-composer-primary-actions.md)、[后台 Agent](desktop-composer-background-agents.md)、`e2e/composer-background-agents.spec.ts` 与 queue/Guide 专项                 |
| `/agent` → 原父 Run → 子会话 → 返回                 | slash 是父 Run 提示；真实 Agent Tool 创建 child；工具和 Activity 可以进入 child，再返回存活原父标签               | [父路径](desktop-agent-parent-route.md)、[工具入口](desktop-agent-tool-open.md)、`tests/agent-parent-tool.test.ts`、`e2e/agent-child-return.spec.ts`                             |
| 项目／会话发现 → 搜索／组织 → 标签                  | 侧栏 Search chats 与 Commands 分开；组织／排序仍绑定 Host 事实；折叠后 rail 保留直接入口；标签菜单动态贴合入口    | [组织](desktop-sidebar-organization.md)、[折叠 rail](desktop-sidebar-collapsed-rail.md)、[菜单](desktop-workspace-tab-menu-layout.md)、sort/search/tabs Host E2E                 |
| 旧消息／Find → Settings／Files → 返回               | 分页旧消息有界；回来恢复原消息及行内阅读偏移，不自动追到最新；Find 只索引原正文                                   | [阅读返回](desktop-session-reading-return.md)、[Find](desktop-session-find.md)、`e2e/session-reading-return.spec.ts`、`e2e/session-find.spec.ts`                                 |
| 消息路径 → Files → 行列／dirty 编辑                 | 相对源码引用就地打开原会话文件；复用原 preview、Workbench、编辑稿；迟到定位不抢焦点；错误在原引用旁               | [文件引用](desktop-message-file-reference.md)、[误识别与格式范围](desktop-message-file-reference-boundaries.md)、`e2e/message-file-reference.spec.ts`                            |
| Files → Changed/diff → Add／编辑 → 返回             | 文件导航、Working/Staged diff、所选代码／评论／整文件加入原稿；比较写入与未知结果恢复沿用真实 Host                | [预览 tabs](desktop-file-preview-tabs.md)、[评论连续性](desktop-file-review-continuity.md)、file-draft／selection／workbench E2E                                                 |
| Settings → Provider／Extensions → 编辑／详情 → 返回 | Provider 为全局首落点，default 动作不改显式会话选择；保存与核对独立；分类／插件详情往返保留草稿、筛选与焦点       | [Provider](desktop-provider-progressive-edit.md)、[选项恢复](desktop-settings-content-recovery.md)、[插件详情](desktop-extension-plugin-detail.md)、provider／extension Host E2E |
| Activity／Status → 当前事实 → 返回                  | Activity 展示真实 task/workflow/Agent；Status 为 hbar 自有性能／Usage／Git 工作台，不冒充 CC Team 或全局 Activity | [Activity](desktop-activity-workflow.md)、`lumen-status-workspace.tsx` 与 `e2e/web-shell.spec.ts` connected-flow；本轮无新 Status 原生图                                         |

## 用户已确认的语义，不能重报为缺口

- 空会话换项目保留当前模型／thinking；首次发送将其作为会话显式选择。
- Goal + Plan 共存；`/agent` 经父 Run 的真正 Agent Tool 路径。
- waiting-approval Guide 保持 restricted。hbar 的明确权限与 receipt 规则不为视觉
  一致被绕开；支持的参数在原入口表达，不新增假权限项。

## 本轮新发现和实际执行

完整 Goal/Plan 画面暴露了 `79ef6652` 的自动路径误识别：JSON 字面 `\\n` 被当作
路径分隔符。`f7966f25` 已以红测修复；`db80aebd` 随后补齐 CC 的可读源码／配置
扩展，不以缩减 `.vue`／`.xml`／`.ps1` 等真实入口换取测试通过。

- 最终文本系列基础检查：30 tests / 518 assertions，类型感知 lint 和作用域严格
  TypeScript 通过；生产 Web build 3411 modules。
- 在 `f7966f25` 对应生产资产上重跑 Goal/Plan、跨项目首次 Send、消息 Files 三链，
  3/3 通过，18.8 秒。扩展格式后的最终资产重跑 Goal/Plan + Vue Files 两链，
  2/2 通过，12.8 秒；两次不是更多独立用例，不混算。
- 最终 JS `index-D2kO73SQ.js`／CSS `index-DqultGzR.css`，在
  `artifacts/core-delivery-review-v46/web`。最终截图位于同目录的 `host-results`；
  主 agent 查看原文无错误链接、390 首发与目标选择、Vue line 80 可见定位。
- 根 `bun run typecheck` 因 root tests/preview 无法解析未链接的 Lumen 公开包失败。
  仅映射三个公开入口并继承根全部 include／严格选项的诊断检查通过；不安装依赖、
  不排除源码，也不把这个结果写成根门禁已通过。
  后续[公开解析修复](desktop-verification-resolution.md)已将同样的三个精确入口落实
  到根配置，默认类型检查通过；前面的失败仍是本轮实渲基线的历史记录。
- 拥有的 Host／preview 已停止，4317／4329 无监听。没有真实付费 Provider，
  没有本轮原生启动、打包、安装或全套门禁。

## 完整 Goal 仍未关闭的范围与下一步选择

已优化的 UI 代码尚未整合到用户正在使用的主工作区，原生桌面当前版本也未验收。
只读检查主 checkout `D:/Git/hbar` 位于 `codex/hbar-app-ui` 的 `89408ba5`；相对当前
实现有 142 个本分支提交、106 个主分支提交，并非简单 fast-forward。
13 个已提交路径双向变更；主工作区未提交的 `session-stop-model.ts`、kernel 和
plugin-sdk `index.ts` 也与本功能路径重叠。不能夹带、清除或自动 stash 这些工作。
已向用户请求选择先整合现有 UI 并原生验收，还是继续隔离开发底层能力；尚未收到
该选择时，不执行 merge／覆盖／安装／重启。

### 只读合并预检，尚未整合

后续 continuation 在双方 HEAD 未变化时执行
`git merge-tree --write-tree --messages 89408ba5 3880c93f`。它仅在 Git 对象库生成
不挂任何 ref 的预览树，不改变分支、index 或工作区；exit 1 表示发现内容冲突，
不是一次已经开始但失败的工作区 merge。预览树 `d255ed65` 仍含冲突标记，
不可用作可构建产品。双方 `git ls-files -u` 为空，主目录原修改未被清除。

13 个双向改动路径中，7 个实际冲突，6 个由 Git 文本自动合并；后者不代表行为验证：

| 实际冲突                                                                               | 双方变更与整合时必须保留的行为                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/App.tsx`、`lumen-workspace-shell.tsx`                                    | 主分支的宿主 `mobileNavigationLabel` 与本分支 `locale`／侧栏组织并存，不能丢掉新窄屏导航契约或本地化入口                                                                          |
| `lumen-session-workspace.tsx`                                                          | 主分支注册窄屏 header menu 的 find/工具/设置动作；本分支加入 background Agent、reading owner、工具内 child 入口及 labelled More。需按宽窄上下文组合，避免重复入口与失去来源       |
| `provider-settings.tsx`                                                                | 主分支 `isCatalogReadIntent`、load-presets/models generation 与原位 retry；本分支 `ProviderListViewLabels`、全局 default 动作。不能拿列表 refactor 覆盖编辑器读取恢复             |
| `e2e/session-tool-navigation.spec.ts`、`e2e/workbench-navigation-presentation.spec.ts` | 主分支窄屏统一菜单与本分支 More／来源返回／真实临时目录保护各有断言；需保留正常宽屏和窄屏入口语义，而非删一套测试换取通过                                                         |
| `validate-flow-layout.mjs`                                                             | 主分支的真实 mobile／consent／sticky-table 例外及 self-test；本分支的会话工具／项目排序／消息选区 overlay 精确例外及 self-test。每个许可仍需 path/selector 限定，不能通用放开定位 |

`session-stop-model.ts` 的用户未提交变更新增 `guided` 终态支持，不能简单丢弃；
实际 diff 中 kernel 主要是格式调整及 `events` 注册位置移动，plugin-sdk 是签名格式
调整；不能仅凭所属模块把它们说成新增执行语义。这里只检查归属，不代替用户决定
是否保存／纳入其工作。合并确认后应先在隔离整合环境保留双方已提交功能并验证，
再处理这些用户工作；不会自动 stash、提交或 reset 主目录。

本预检仅更新交付信息，没有跑新的业务测试或原生验收，也没有解决上述冲突。
它将“路径重叠”缩小为明确的 7 个整合点；继续执行仍等待已发出的用户选择。

另外，CC 的 interactive PTY、内嵌 Browser、Team replay/inbox、Scheduled、市场
安装／MCP 等并非 hbar 已有 UI 的漏按钮。本轮当前源码确认：

- runtime 对 terminal UI 明确返回 `CAPABILITY_UNAVAILABLE`；Host 进程工具不是 PTY。
- Tauri 仅有同 Host origin 的 `main` WebView，没有产品 child preview；`browser.*`
  是自动化，不是用户看到的内嵌页。此前网络红测暴露的 WebSocket 出口风险不能跳过。
- contracts 没有 Team timeline／member inbox／Scheduled 公共事实源。不能以
  Individual Agents／Workflow／静态 graph 代替这些能力。
- Provider 连接探测、远程模型拉取、可调用技能 metadata 和二进制 system-open
  也需真实能力与产品契约；当前不放装饰性入口。

这些需要独立明确范围和实际 Host／原生验收，详见[工作台能力边界](desktop-workbench-remaining-audit.md)
及[Browser 安全边界](desktop-browser-preview-boundary.md)。当前核心地图证明的是已交付
主链及适配，不以“未再发现按钮问题”宣告全部体验完成。总体 Goal 保持 active。
