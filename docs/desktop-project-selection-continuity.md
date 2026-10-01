# 项目切换与首发选择连续性验收

日期：2026-10-01；基线 `6777a7ab`，仅在隔离工作树追加核心流程验收，
没有新的生产 UI、Host、文案或样式变更。用户确认的策略是：空会话切项目时
保留输入区当前模型和思考等级，即使目标项目默认不同；新 Session 保存为显式选择，
不反向更改项目默认配置。

## 已有实现与此前证据范围

- no-tab 首发：`PreSessionLanding.chooseWorkspace` 调公开
  `preSessionDraft.setWorkspace`；后者只改变项目并重置 launch selection，
  保留 modelId、thinkingLevel 与草稿。已解析并显示的默认模型也成为 draft 选择，
  目标项目默认值不会覆写它；尚无任何模型选择时仍可读目标项目的默认配置。
  相关历史见 `f7065019`、[首发默认模型](desktop-first-send-default-model.md)。
- 已创建但尚未发送的空 Session：`session-workspace-move` 捕获当前显示的
  model/thinking，物化 replacement Session 并确认显式设置。
  `session-workspace-move.spec.ts` 的 inherited-model 流程已经证明不同项目默认值
  下选择保留，但该具体 case 没有在切换后发送；不将其当作首发完成证据。
- 默认 tabs 布局下 Files 属于 `WorkspaceTabsController` 的当前 Session toolbar，
  捕获 sessionId/workspaceId/sourceTabInstanceKey，通过 `sessionTools.toggle` 打开。
  header 的同名入口显式关闭，非缺失；Sidebar Project files 是另一种 workspace scope。

## 新增一条实际核心流程

`e2e/pre-session-project-continuity.spec.ts`：
`first-send project switch preserves current model and effort, then tab Files opens the actual target`。

测试使用独占临时 Host、生产 Web 和本地 fixture。源项目和全局默认为
local-fixture/low，目标项目默认为另一临时 mock model/low，先通过公开 settings
读回确认事实。目标模型只提供目录/默认配置，不用于运行或外部模型请求。

1. no-tab 输入区显示 local-fixture，选择源项目并以键盘确认 high，填入中文草稿。
2. 通过 Location 切到目标项目，原模型、high 与文本都保留；尚未创建任何新 Session。
   源项目保持 fixture 的一个初始 Session，目标项目为零；320 窄屏无横向溢出。
3. 实际点击 Send，目标项目只创建一个新 Session；唯一匹配文本及模型的主 Run
   实际 completed。公开 `session.getModel` 确认原模型/high，来源均为新 Session
   settings；目标项目 settings revision/resolution 未改变，源 Session 没有新 Run。
4. 首发后的 toolbar 仍显示同一模型/high。从顶部 tabs 的唯一 Files 按钮以 Enter
   打开，实际读取目标项目独有的 target-only.md，内容匹配；关闭后 pressed 复位，
   输入区的新草稿保留。没有借 Sidebar workspace 入口证明 Session toolbar。

主 agent 查看三张最终实渲截图：源选择1440、切换后首发前320、目标 tab Files1440。
图片位于
`artifacts/project-continuity-v41/final-results/pre-session-project-contin-279d0-les-opens-the-actual-target/`。
它们验证 hbar 当前页面，不冒充 CC 原图；CC 模型/effort 视觉依据见已有
[首发模型层级](desktop-model-first-send-continuity.md) 与默认模型参考记录。

## 实际检查

- 新核心 E2E **1/1，通过 6.2 秒（test 4.3 秒）**，没有增加按钮 × 视口矩阵。
- 既有首发 runtime 与 model-selection 回归 **66 passed / 426 assertions**。
- 最终 scoped strict TypeScript、类型感知 ESLint 零警告、Prettier 与 diff check 通过。
  本单元只新增测试，复用已构建的 `6777a7ab` Web 产物
  `artifacts/background-agents-v40/web/assets/index-mVuwe_WW.js`，没有重复无变更 build。
- 测试初版的 settings report 取键方式错误，以及将 slider End 误认为 high，均是
  测试缺陷：改用公开 encodePath，并按真实 thinkingLevels 以键盘选择 high，随后
  实际整条流程通过；没有为让测试通过而改产品模型政策或削弱 Run/作用域断言。

临时目录的绝对根与前缀在清理前验证，finally 分层关闭浏览器、Host 与 fixture。
最终 localhost 4317/4329 无监听。Bun 的既有 tsconfig override directory-mismatch
诊断仍出现但退出 0，Host 关闭的 Vite ECONNRESET 不记为失败。
未跑全仓/native desktop 门禁、安装依赖、修改真实配置、调用付费模型、merge、push 或部署。
本单元补齐用户确认策略的首发证据，不表示整体 UI 迁移已完成。
