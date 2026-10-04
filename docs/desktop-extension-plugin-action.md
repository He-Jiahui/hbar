# 插件详情就近启停：有界 P1 交付记录

2026-09-25。此单元只接通当前 Host 的插件启用／禁用，复用已有 `extensionWorkspace.setEnabled`，不新增第二套插件事实或 Host 写命令。安装、卸载、更新、市场、MCP 管理和技能正文不在本单元范围内。

## 参考与原问题

原 cc-haha `desktop/src/components/plugins/PluginDetail.tsx:198,271,279` 在详情中提供返回与启停入口；状态／来源／作用域摘要后是操作区，再向下是能力详情。`desktop/src/stores/pluginStore.ts:125,138` 承接原作用域的操作与重新读取。原组件隔离渲染证据见 [zh 1440](../artifacts/desktop-entry-matrix/extensions/reference-plugin-detail-zh-CN-1440.png)、[zh 320](../artifacts/desktop-entry-matrix/extensions/reference-plugin-detail-zh-CN-320.png) 和 [逐入口审计](desktop-extensions-entry-audit.md)。这些截图挂载参考原组件、stores 与主题，但 GET 数据是类型化 fixture、所有写操作被阻断，不能当成真实业务写入成功证据。

hbar `73295a9` 已有详情读取与返回原筛选行，但启停只有列表入口。`12e2758` 建立的 runtime 每次 `plugin.list` 成功会把 `actions` 清空；回执丢失后读取到当前值不能证明原请求不会迟到，这会把未知操作错误地解锁。修复前的聚焦测试已复现：刷新后原 `unknown` 状态变成 `undefined`。

## 完成路径与状态权威

| 入口／状态         | 当前交付行为                                                                   | 事实源与限制                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 插件详情           | 返回 → 状态与安装／运行作用域摘要 → 就近启停、重新读取 → 声明的贡献            | DTO 的 `installScope/runtimeScope/projectId` 是事实；不推断 plugin→skill/MCP/agent 所有权。                                        |
| 启用／禁用         | 捕获 `instanceId + pluginId + enabled`，走已有 typed command；按钮旁显示处理中 | required 插件不提供禁用；离线或读取中禁用写入；不是“当前会话应用”。                                                                |
| 直接确认           | 校验返回目标 ID、目标状态、原版本／来源／项目／安装范围后显示 Host 已确认      | 只同步本次改变的 plugin 到所有打开列表及同 ID 详情；不以整份无版本回执覆盖并发 B 的事实，不抢详情／筛选／焦点。                    |
| 明确 Host 拒绝     | 就近本地化错误，允许用户手动重试                                               | 如真实 `BUSY`：Host 仍有活动／排队 Run；非 Host 运行忙碌不能使用此解释。                                                           |
| 不确定结果         | 隐藏新写入口，保留返回与“读取当前状态”                                         | 运输错误、普通异常、畸形／错目标回执均不冒充失败可重试。读取值只更新当前观察，不确认原写，也不解锁。                               |
| 读取失败           | 保留原 plugin/action 身份与未知解释，提供同目标重读                            | 不重发 enable/disable；无数据时不造成功或空详情。                                                                                  |
| 第 65 个未决新目标 | 同目标操作区显示容量拒绝，发送 0 个新 Host 写                                  | owner 最多 64 项；终态历史可逐项驱逐，submitting/unknown 不驱逐。拒绝不添加第 65 项，不显示“Host 有 Run”。切换详情不会继承旧拒绝。 |
| 关闭／重开面板     | action owner 仍按 Host-plugin 保存，重新读取后继续显示未知锁                   | 面板 cache 保持既有 4 项策略；关闭面板不撤销 Host 副作用或释放未知写锁。                                                           |
| runtime dispose    | 释放读取／订阅，迟到写回执不再污染投影                                         | 重建 runtime／整页刷新没有持久操作 receipt，不能宣称旧操作已恢复确认或 exactly-once。                                              |

`plugin.enable/disable` 公开合同未提供 request receipt 或持久幂等键查询。本单元因此采用保守的 runtime 生存期锁；无法把“读当前值”和“原请求已最终完成”混为一谈。新 runtime 的事实读取不证明旧 runtime 的未知操作终态。若要跨刷新可靠核对，需要后续独立 Host receipt 合同，不在此 P1 中偷偷扩大范围。

并发回复没有版本号，因此直接 ACK 只使用 captured plugin 事实。ACK 到达时失效更早启动的列表读取与该目标详情读取，防止旧读覆盖已确认值；不把其他 plugin 的无序快照当作附带更新。A/B 两个独立动作可以并行，A 的旧全表回执不能把已确认禁用的 B 改回启用。

## 模块归属

- [runtime owner](../packages/app-runtime/src/extension-workspace.ts)：同 plugin 跨面板共享单飞／未知锁、64 项容量、明确拒绝分类、目标 ACK 校验、有限面板投影、读取 generation 与 dispose。
- [详情 View](../packages/app-react/src/extension-plugin-detail.tsx) 与 [样式](../packages/app-react/src/extension-plugin-detail.css)：仅接 typed 状态和 callback，所有可见节点为 Lumen，图标 `sm/md` 语义 tier，普通 flex 流／换行。
- [工作区接线](../packages/app-react/src/extension-workspace.tsx)：列表与详情调用同命令／读取同 owner；保持既有 Back 筛选和焦点恢复。
- [宿主文案](../apps/web/src/extension-detail-copy.ts)：中英 action labels、Host 作用域说明、真实拒绝与本地容量文案；不把 raw exception message 当用户文案。

没有修改参考产品、共享 hbar-ui、`shell-copy.ts`、kernel/plugin-sdk、公共命令 schema 或其他代理的归档／语言功能。

## 实际视觉与交互证据

隔离生产构建：`artifacts/desktop-entry-matrix/extensions-action/web`；Vite Web 44957／临时真实 Host 44955。截图由真实 Host DTO、临时本地插件和 actual runtime 驱动，不是静态预览数据。商业 provider 不参与，所有测试数据在独立临时目录清理。

稳定截图目录独立于 Playwright `results`，重跑不会清空这些证据：

- [en 1440](../artifacts/desktop-entry-matrix/extensions-action/screenshots/en-US/detail-action-en-US-1440.png)、[en 390](../artifacts/desktop-entry-matrix/extensions-action/screenshots/en-US/detail-action-en-US-390.png)、[en 320](../artifacts/desktop-entry-matrix/extensions-action/screenshots/en-US/detail-action-en-US-320.png)。
- [zh 1440](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-action-zh-CN-1440.png)、[zh 390](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-action-zh-CN-390.png)、[zh 320](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-action-zh-CN-320.png)。
- [zh 真实 Host BUSY](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-host-busy-zh-CN-1440.png)：Host 有真实等待审批的 Run，禁用被拒绝，未修改插件。
- [zh pending](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-pending-zh-CN-1440.png)：真实写回执被延迟，按钮忙碌；换详情后释放回执，不抢另一插件目标。
- [zh unknown 1440](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-unknown-zh-CN-1440.png)、[zh unknown 320](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-unknown-zh-CN-320.png)：原请求先未到达 Host，当前值可读但不能解锁；之后原请求真正迟到生效、回执丢弃，仍只读、不显示已确认、不发第二笔写。
- [zh unknown 读失败](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-unknown-read-failure-zh-CN-1440.png)、[zh required 320](../artifacts/desktop-entry-matrix/extensions-action/screenshots/zh-CN/detail-required-zh-CN-320.png)。同目录有相应英文状态截图。

人工已查看桌面／窄屏普通、unknown、真实 BUSY 及 required；操作顺序和作用域说明维持正常流，320px 无页面横向溢出，Back 与读取当前状态可达。共享 Lumen 按钮指示装饰保持现有样式，此单元不是参考像素级复刻。

## 定向验证与未验证边界

实际通过：

- `bun test tests/extension-plugin-action-runtime.test.ts tests/extension-plugin-action-view.test.tsx tests/extension-plugin-detail.test.tsx tests/extension-workspace-runtime.test.ts tests/extension-workspace-react.test.tsx tests/design-system-boundaries.test.ts`：**59 pass / 0 fail / 470 assertions**。包含跨面板未知锁、A/B 乱序 ACK、旧读与新读单飞清理、dispose、64/65 容量、终态驱逐，以及真实 owner → 两语言 View 的容量告警和切目标不串反馈。View 单测使用 SSR DOM 标记与 runtime 投影，不冒充浏览器点击测试。
- 本单元源码／测试／E2E 的 type-aware ESLint `--max-warnings=0`；隔离 `tsconfig` 严格类型检查；content、icon、flow guard；design-system boundary test。
- 隔离 Vite 生产 build；新 [activation E2E](../e2e/extension-plugin-action.spec.ts) 与既有 [detail E2E](../e2e/extension-plugin-detail.spec.ts)：最终 14:32 重跑中英 **4/4（27.9s）**，含 1440/390/320、native Enter、Back 原筛选／焦点、真实写后 Host 查询、真实 Run BUSY、迟到 ACK／迟到写、读取错误和 required。

本单元没有独立跑整仓 `bun run check` 或 Tauri 原生 smoke；主线负责集成门禁。此前根 TypeScript 检查被外部 `scripts/reactbits-pro-audit.ts` 三处 TS 错误阻断；这些外部问题由原任务解决后，14:26 本轮根 `tsc --noEmit` 已通过。本单元 scoped TypeScript 也通过；不把两项类型结果称作全仓 check 通过。

测试启动前先等真实会话目录导航完成，再开 Host Settings。曾有一次仅新 spec 重跑在初始化 Settings 点击移交阶段超时，截图显示尚在空会话页，未进入启停组件；后续真实会话就绪前置的 4/4 已通过。此单元**未修改或验证 pending Host identity → 真实 runtime 的冷启动点击移交**，不把启动等待视作该通用入口缺陷已修复。

Vite 当前大 chunk 提醒仍存在（构建退出 0）；临时 Host teardown 有预期代理 `ECONNRESET` 日志，浏览器 pageerror 为 0。未新增商店、安装、更新、卸载等无公开闭环的装饰入口。
