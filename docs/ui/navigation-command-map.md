# UI 入口、命令与渲染出口对照

上级：[UI 总计划](index.md)。实现状态见[任务清单](execution-plan.md)。本表是 R6.1 的生产入口清单，用于防止新增空按钮、第二套页面导航或无法渲染的 surface。

## 1. 唯一展示出口

Web 组合根通过 `apps/web/src/surface-manifest.ts` 声明可渲染 surface。每个 surface 只能属于一个 outlet：

| Outlet | Surface ID        | 生产 renderer                                              | 活动状态来源                                       |
| ------ | ----------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| page   | `settings`        | `HbarSettingsWorkspace`，分组内组合 Provider 与 Extensions | `presentation.page`                                |
| page   | `status`          | `HbarStatusWorkspace`                                      | `presentation.page`                                |
| tool   | `files`           | `HbarFileWorkspace`                                        | `presentation.toolInstanceId` + `surfaces.panels`  |
| tool   | `monitoring`      | `HbarSessionMonitoring`                                    | 同上                                               |
| tool   | `agents`          | `HbarAgentWorkspace`                                       | 同上                                               |
| tool   | `goals`           | `HbarGoalPlanWorkspace`                                    | 同上                                               |
| modal  | `commands`        | `HbarCommandPalette`                                       | `presentation.modalInstanceId` + `surfaces.panels` |
| modal  | `settings-editor` | `HbarProviderDialog`                                       | 同上 + provider editor 投影                        |

会话页不是 panel 实例；`presentation.page.kind === 'session'` 时由当前 `navigation.sessionId` 选择 `HbarSessionWorkspace`，没有选中会话时显示同一出口的空态。`focusedPanelId` 只保留给仍需按实例查找设置表单或编辑器的兼容投影，不决定页面、工具或模态的布局落点。

## 2. 用户入口与命令

| 用户入口或行为                       | 执行命令                                                                                           | 结果出口与目标                            | 返回/关闭                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| 侧栏会话行                           | `app.setSession <sessionId>`                                                                       | session page；成功后窄屏侧栏收起          | 选择失败保留原页面                            |
| 侧栏“新建会话”                       | `commandPalette.refresh` → `setQuery app.createSession` → `openCommand` → `app.openPanel commands` | commands modal 的新建参数页；默认当前工程 | Escape 返回目录；执行成功关闭弹窗并进入新会话 |
| 工程行“在此工程新建会话”             | 打开 `app.createSession` 参数页并写入原行 `workspaceId`                                            | commands modal；工程已选，标题可选        | 不折叠工程、不改变当前会话                    |
| 会话行“重命名”                       | 打开 `app.renameSession` 参数页并写入原行 `sessionId` 与标题                                       | commands modal；执行后合并返回的会话事实  | 不选择被操作行；失败保留输入和原标题          |
| 会话行“归档”                         | 打开 `app.archiveSession` 参数页并写入原行 `sessionId`                                             | commands modal；执行后合并归档事实        | 仅归档当前项时清除当前选择                    |
| 工程标题“打开工程”                   | `commandPalette.refresh` → `setQuery workspace.open` → `openCommand` → `app.openPanel commands`    | commands modal 的路径参数页               | Escape 返回目录；执行成功进入新工程           |
| 侧栏“命令”或 Ctrl/Cmd+K              | `app.openPanel commands`                                                                           | commands modal                            | 结果→参数→搜索→关闭                           |
| 侧栏“状态”                           | `app.openStatus dashboard`                                                                         | status page / Performance                 | `app.back` 或页头返回恢复 session/tool 上下文 |
| 状态页分区                           | `app.openStatus dashboard\|usage\|git`                                                             | 同一 status page 实例切换分区             | 不增加返回层级                                |
| 侧栏“设置”                           | `app.openSettings global`                                                                          | settings page                             | `app.back` 或页头返回                         |
| 会话设置                             | `app.openSettings session <sessionId>`                                                             | 同一 settings page，预选会话作用域        | 返回原会话和工具上下文                        |
| 设置作用域切换                       | `app.openSettings <scope> [targetId]`                                                              | 同一 settings page 与对应 form 投影       | 不创建第二套设置状态                          |
| Provider 新增/编辑                   | `app.openSettingsEditor providers <entryId?>`                                                      | settings-editor modal                     | `app.closePanel` 返回原设置分组和焦点         |
| 文件/监控/子 Agent/目标与计划        | `app.openPanel <surface> <sessionId> followActive`                                                 | 唯一 session tool outlet                  | 再次点击或 `app.closePanel` 只关闭工具        |
| 扩展与技能管理                       | `app.openSettings global --section extensions`                                                     | settings page 的 Extensions 分组          | 返回原会话上下文                              |
| 旧 `app.openPanel extensions`        | runtime 迁移为上一个命令                                                                           | 不注册、不渲染 `extensions` surface       | 仅兼容已有命令调用者                          |
| 展开工程、折叠详情、菜单和图表 hover | 组件局部状态                                                                                       | 所属组件内部                              | 不进入共享业务状态                            |
| 显示/隐藏应用侧栏                    | `app.setSidebarVisible <boolean>`                                                                  | AppShell sidebar/drawer                   | 不改变页面和会话                              |

所有业务表单继续执行各自的公开命令；UI 不直接写 Zustand。命令目录根据 catalog descriptor 生成参数表单，不能再维护一张 UI 专属命令清单。

`app.createSession` 是客户端组合命令：它先确认工程，再用运行时持有的幂等键调用 Host `session.create`，合并返回的目录事实并更新选择。`RESULT_UNKNOWN` 等不确定结果保留同一键供重试，普通失败清除待处理键。`app.renameSession` 与 `app.archiveSession` 同样只通过 Host 命令端口写入；返回会话先进入目录投影，归档仅在目标就是当前会话时清除选择。工作区/会话 ID 参数优先从目录只读投影生成“名称 · 路径/所属工程”选项；未加载或跨 Host 的稳定 ID 仍可通过“其他标识符”输入，因此 UI 不要求常规用户猜内部 ID，也不封死高级目标。

## 3. 迁移与拒绝规则

- `extensions` 是唯一保留的旧入口别名，转换发生在 app-runtime；它不出现在 Web surface manifest 中。
- 未在 manifest 中注册的 panel 会由 `surfaces.canRender` 返回 false，并以 `CAPABILITY_UNAVAILABLE` 结束，不创建不可见实例。
- 同时最多有一个 page、一个 tool 和一个 modal 活动；局部菜单与 disclosure 不占用应用 outlet。
- 页面选择只读 `presentation`、`navigation` 和对应模块投影。新增入口必须先补命令契约和 manifest，再补 renderer 与行为/视觉验证。
- CLI、TUI 或其他客户端可以拥有自己的 manifest；不得通过导入 Web React 组件取得渲染能力。

## 4. R6.1 验收证据

- `tests/web-shell-boundary.test.ts` 检查八个生产 surface 的唯一 outlet，并断言 `extensions` 与未知 ID 不可直接渲染。
- `tests/app-surfaces.test.ts` 检查 page/tool/modal/returnContext、旧 Extensions 迁移、失败导航保持原页面和 followActive/pinned 目标。
- Connected Web E2E 已从实际入口遍历会话、四类工具、设置、Provider modal、Extensions 分组、状态三分区和命令三步流；各页面截图索引见[视觉审计](visual-audit-2026-09-19.md)。
