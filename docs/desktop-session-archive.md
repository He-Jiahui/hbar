# Desktop 会话归档与恢复

本功能迁移 reference 的对象就近操作方式，不复制其 Delete 语义。cc-haha 当前会话菜单为 Rename/Delete，Restore hidden 是隐藏项目恢复；hbar 复用已有可逆 `session.archive`，不新增删除入口。

## 用户路径

1. 会话行菜单 → 归档 → 原行小确认。确认明确显示目标标题，并说明归档不删除历史、可以从原项目恢复。Escape 或取消不写入。
2. 原项目菜单 → 已归档会话。列表在项目标题下就近展开，不切换主会话；关闭列表返回项目菜单焦点。
3. 已归档会话行 → 恢复。只恢复记录，不隐式打开；用户随后可从常驻列表自行选择。

确认后的归档只清除仍与目标相同的当前 sessionId，并保留 workspace。归档别的会话、等待期间切换会话、恢复会话，均不改变无关选择。常驻列表继续隐藏 archived，归档历史完整保留。

## 状态与边界

`packages/app-runtime/src/session-archive.ts` 通过公开 `session.get`、`session.list` 和 `app.archiveSession` 协调一个操作意图及一个分页视图。目录投影仍是唯一已确认会话事实源；意图只保留原目标、标题摘要、期望 archived 值、revision 和 requestId。

| 操作状态            | 可执行行为                                    | 不允许的行为                           |
| ------------------- | --------------------------------------------- | -------------------------------------- |
| confirming / failed | 明确确认或取消；失败留原位置                  | 静默换目标                             |
| submitting          | 等待确认，仍可导航其他会话                    | 重复提交或取消未知外部副作用           |
| unknown             | 查询原 session/workspace 的真实 archived 状态 | 用新请求重放、清除原意图或改绑其他会话 |
| reconciling         | 等待原目标读取结果                            | 并行重复对账                           |
| succeeded           | 关闭结果提示；开始下一个操作                  | 隐式打开恢复后的会话                   |

提交前读到已经达到目标状态时只确认事实，不再写入。明确业务拒绝可取消或重试；已经开始写入后的断线、无 code 异常等保守保留 unknown。关闭归档列表、折叠或切换项目、原行被过滤或移除，不会隐藏最终恢复入口或清掉在途意图。

这不是新增持久 receipt：若未知操作后另一客户端再次改变 archived 状态，读取不相等不能证明原操作没有执行，必须保持 unknown。意图属于当前 runtime，不承诺浏览器或进程重启后恢复。Host 活动运行时的 BUSY 规则保持不变；UI 提示先停止运行，不自动取消运行。

## 有界分页

- `session.list(includeArchived:true)` 返回混合项目会话，而不是仅归档项。每次最多读取 100 条，UI 从目录事实中筛出 archived；只保留一页 ID 和当前/下一游标。
- 用户明确选择下一页或刷新第一页，不自动无限扫描。首混合页没有归档但仍有游标时，显示“本页没有归档会话”，而不是项目级空态。
- 关闭或更换项目取消旧读取；晚到响应不能重新打开列表。读取失败保留上一页与游标，重试由用户明确发起。
- 超过 100 条、重复 ID、重复游标响应拒绝。目录有界缓存淘汰了当前页引用时显示刷新提示，不把缺失事实误当空列表。
- 菜单、确认、列表与结果使用宿主提供的中英文类型化文案、Lumen 控件和 flex 流布局；不添加截图坐标或固定内容高度。

## 实际验证

- `bun test tests/session-archive-runtime.test.ts tests/session-rename-runtime.test.ts tests/app-react.test.tsx tests/workspace-open-runtime.test.ts tests/workspace-session-commands.test.ts`：48 passed，323 assertions。包括 0/1/100/101/250 条容量、失败游标、取消读取/晚到结果、重复 ID、工作区不匹配、已达目标无重复写、unknown 原目标保留。
- `bunx playwright test --config artifacts/session-archive/playwright.config.ts`：最终 3 passed，12.6s。真实临时 Host + 生产 App，英文/中文、长标题、1440/390/320、Enter/Escape/焦点、折叠项目后的原目标恢复区、关闭分页后的项目菜单焦点、历史保留、跨会话晚到响应、接受恢复后未知结果、当前归档、恢复不导航，以及真实 101 条混合分页。
- 同一归档构建回归 `session-rename.spec.ts`：2 passed，10.6s。最终简化本页空态文案后，重新构建并重跑分页 E2E：1 passed，6.4s。
- 独立 Vite production build、root typecheck、9 文件 focused ESLint、content/icon/flow/production boundary guards、格式及 scoped diff check 通过。
- 人工查看 `artifacts/session-archive/confirm-en-US-320.png`、`restored-zh-CN-1440.png`、`pagination-second-page.png`。测试产物只在忽略的 artifacts 目录，Host/preview 使用 44717/44729；测试完成后无监听，不影响用户实例。

归档状态机与分页不依赖付费模型，测试只使用临时会话和历史。未声称完整共享 Web E2E 或本轮原生构建已运行；这些由主线集成验收。
