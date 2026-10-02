# Agent 结果旁的直接子任务入口

本切片接续 `c64749f6` 的父会话 Agent tool 路径，把查看子任务的入口放回
产生它的工具结果旁。不改变 Agent 执行策略、不创建新的 Run，也不替代
Activity 中的父会话任务列表。整体桌面体验迁移仍未宣告完成。

## 参考与布局

只读 CC-haha：`D:/Git/cc-haha`，commit
`e28d0a653481ef41b7a329411eeb2f0fd5656731`。
`desktop/src/components/chat/ToolCallGroup.tsx` 的原始 Agent 卡片在任务摘要旁
提供结果与 Open run 两个不同动作。主 agent 实际渲染原组件并查看
`artifacts/agent-tool-open-v32/cc-agent-tool-open-1100.png`，也验证原回调接收
该卡片的 toolUseId。该预览注入合成任务与结果，不是完整 CC Host 或真实模型运行。

hbar 将“打开子任务”放在已成功的 `agent` 工具 disclosure 旁，保持工具身份、
折叠详情与直接导航的语义分离。带导航的 Agent 不再被埋进完成态的总 Activity
折叠组；普通工具和 thinking 沿用原来的 DOM 与折叠行为。入口是一项内容增长
的行内操作，不是列表或新的滚动区。父级 flex 换行，长文案与错误在正常流中
增长，没有按截图坐标摆放或设固定内容高度。图标复用 `sm` 语义等级，文案
通过宿主的中英文类型化 bundle 提供。

## 目标归属与行为

- UI 只接受成功工具结果的公开 `AgentToolResult` details，不从 JSON 正文、
  标题或猜测的 ID 推断子任务。缺失、错误、错父会话、自指与非法 details 没有入口。
- 点击捕获父会话、消息、call 和 tab incarnation。Runtime 从当前可见 timeline
  核对同父会话、同 Run 的唯一工具结果，再从 Host 核对 Agent 以及父/子 Session、
  子 Workspace；最终导航前再检查来源。迟到读取不能覆盖已切换的会话。
- 工具结果的 status 是创建时快照，不能与随后完成的实时 status 相等比较。
  Runtime 比对不可变身份、request、profile、objective 和 model；子任务终态可打开。
- 复用已存在的子 Session，并附加原 tab 返回来源；不复制 transcript、不触发
  agent.create、不重新发送任务。返回父会话保留原草稿。
- 忙碌时禁用重复点击，离开其他目标时取消等待；自身已经选中子任务的卸载
  不取消导航收尾，确保 Runtime 能附加返回来源。错误在按钮旁用安全码映射为
  本地化提示；重试只是再次核对事实与导航，不写入新的 Run。

## 验证记录

最终 Web 构建为 3,388 modules，产物
`artifacts/agent-tool-open-v32/web/assets/index-BYGVgmhI.js` /
`index-CmZEEU-r.css`；已有大 chunk 警告保留。作用域 strict TypeScript、ESLint
零警告、格式、diff 与文案/图标/flow guards 均通过，不代表全仓门禁通过。

- Agent 身份模型、真实 Kernel tool 与 Runtime 导航：26 tests / 114 assertions。
  其中导航 16 tests，包含 queued → completed、直开/返回保留草稿、缺失/错误结果、
  切会话迟到读取以及既有 Activity 回归。
- 消息 SSR：14 tests / 138 assertions，包括宿主注入的中文长 action、折叠详情
  和无嵌套按钮。命令使用 ignored scoped tsconfig 的 workspace alias；Bun 仍输出
  directory mismatch 内部警告，但实际 test runner 的退出码为 0。
- 最终 production Web + 临时真实 Host：中英 2/2，9.9 秒。完成原父 Run 审批，
  唯一 child，1440/390 截图，行内直开/返回保留新草稿，以及原 Activity 320px
  入口再次直开/返回；无 pageerror 或 document 横向溢出。
- 普通真实工具失败结果的中文 320px 回归：1/1，5.3 秒。原结果默认折叠、
  键盘展开/关闭、完整复制、刷新后保真和未增加 Run 均通过。
- 用户已选的跨工程模型语义另重跑 1 test / 9 assertions：目标项目默认值不同
  时保留 Workspace 继承的当前有效模型和 thinking。本切片未再次修改此功能。

主 agent 查看最终中文 1440/390 截图：工具与直接入口同一行，审批内容在下方，
窄屏 composer 草稿正常换行。截图存于 `artifacts/agent-tool-open-v32/screenshots/`。
测试使用确定性 test-only driver 与真实 Agent gateway，不依赖付费模型。
参考预览与 hbar 测试内容均为测试所有，不是产品内置示例。

初轮真实浏览器发现 inline action 自身卸载时无条件 abort，child 已选中却中断
了返回来源的附加。单元导航测试不能覆盖 React 卸载；主 agent 据失败截图、
registry 的取消行为和 reviewer 查证修正 cleanup，再用最终生产构建中英验证。
普通工具的 controlled preview 初轮因根 fixture 无法解析 `@lumen/app-ui` 而未
进入浏览器；未安装依赖修复，改用现有真实 Host 回归。后者前两次缺少环境值/
资产名含多余前缀，在前置断言失败；明确提供最终资产名后通过，不算产品缺陷。
临时 Host 关闭时 proxy 的 ECONNRESET 属于清理日志。

本轮一次 Bun 命令把全局参数放在 `test` 前，意外解析为 package test script，
触发 native build 和全仓测试。主 agent 已停止该进程；该中断运行不计为通过。
之后使用明确的 `bun test <path>` 定向命令。没有安装依赖、修改用户设置、
启动或重启 native 应用、push 或 merge；不认证全仓门禁或 native smoke。
