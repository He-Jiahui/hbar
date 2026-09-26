# 桌面交互入口继续审查

本页是 cc-haha 参考体验迁移的剩余工作记录，不是完成声明。审查由会话、导航和设置三个独立方向进行，主线核对代码、测试与截图。已有产物与本轮新验收分开，不以旧截图证明当前完整体验。

## 本轮已验证并提交

- `7d9f0f7`：原请求的 Plan 审批、同 Run 的模式切换、反馈和刷新回看。[边界与参考](desktop-plan-exit-reference.md)。没有把完成后的旧提案动作冒充同轮审批。
- `a336682`：从持久 Goal-source Run 生成续作分隔。[边界与参考](desktop-goal-continuation-reference.md)。不是完整 Goal 设置/状态/完成事件卡。
- 当前工作树全量 Bun 测试 1612/1612，严格 lint/typecheck、生产构建通过；Plan/Goal 定向真实 Host E2E 各 2/2。原生 Plan 定向验证通过；新原生 exe 构建被运行中的用户进程占用，通用 smoke 在导航标记检查处失败，这两项不能标绿。

## 仍需实施与复核

| 单元                                 | 参考视觉/源码                                                                            | 当前差距和验收                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 完整 Goal 时间线                     | cc `MessageList.tsx` 的 Goal 设置、状态、完成卡                                          | 只有续作分隔和当前 Goal 条。需要持久生命周期事实；不能用当前 `goal.get` 反推历史。清除/替换/重连后仍可回看原事件                                                                                        |
| Files 阅读导航器                     | cc `docs/images/app/en/workspace-diff.webp`；`WorkspacePanel.tsx` 的 Show/Hide Navigator | hbar document/diff/browser 互斥，读 A 后要返回列表找 B。复用公开 tree/changes/openEntry/openChange，在阅读时保留可折叠导航器；保留过滤、分页、dirty/unknown 文档及原实例身份，验证 1440/320 与真实 Host |
| 侧栏会话刷新                         | cc `session-main.webp` 的 Search 旁 Refresh；`Sidebar.tsx` 的 focus/visibility 刷新      | hbar 已展开项目会话主要首次加载，重连 workspace.list 不等于会话名单刷新。需双 Client 新建/重命名/归档复现、原项目就近刷新和有界旧 ID 核对；不能把未出现在第一页的 ID 当已删除                           |
| 设置原位用量                         | cc `settings-usage.webp` 的用量分类                                                      | hbar 全局用量在 Status，当前 Status reader/view 强绑定 status 面板；不能跳到 Status 后宣称设置原位。需 settings 专属只读 reader/view，复用有界 usage.query；不伪造连续天数、头像等未提供事实            |
| 模型、permission、Goal/Plan 入门路径 | cc `model-picker.webp`、`permission-modes.webp`，现有真实 Host 对比产物                  | 同位模型浮层、执行菜单和 Goal 编辑已存在；还需在本轮最终产物上重新核对完整矩阵，不能仅因入口存在或旧图相似就宣布达到用户预期                                                                            |
| 原生通用视觉门禁                     | 当前 desktop-smoke 的选中导航标记断言                                                    | 本轮看到 shadow=none、width=null。须查相关视觉改动历史与实际当前渲染，再定位产品或测试问题；不能删除断言假装通过                                                                                        |

设置/导航审查还发现语言选择、插件安装管理和批量归档等候选，但应按真实现有契约独立闭环，不扩大按钮名称。`session.list.title` 是精确标题筛选，不能当全局全文搜索。

Browser、真实终端、定时任务、市场/MCP/模板、图片材料预览及历史 rewind 不是换入口即可迁移的功能：需要相应产品/安全/持久化契约。当前 `browser.*` 是自动化，不是原生内嵌 Browser；内部 wakeup 不是 schedule CRUD；Fork 不是回滚磁盘。不得用占位 UI 声称等价。

下一步先围绕已有 hbar 能力补 Files 导航器与侧栏刷新，并继续完整 Goal 生命周期审查；每个单元按参考流式布局、宿主文案/数据、就近目标反馈和独立验证/提交交付。最终仍需按原目标逐入口完成审计，不能只验收本轮两项而把总 Goal 标 complete。
