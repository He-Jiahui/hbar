# 首发默认模型与思考入口

本单元修复 no-tab 首发 composer 的真实默认配置不可见问题，不改变 Provider 默认模型政策，也不迁移 OAuth 或选择目录第一项。改动仅位于隔离 `codex/session-launch-target` 工作树；CC 和主工作区只读。

## 参考与复现

CC `e28d0a65` 的 `EmptySession.tsx:334-366,832` 在首发前使用 `DRAFT_RUNTIME_SELECTION_KEY` 解析默认运行时选择；`ModelSelector.tsx:437-489` 在空 runtime selection 下显示 active Provider 的 main 模型与独立 effort。`runtimeSelection.ts:21-63` 和 `EmptySession.test.tsx:650-765` 说明默认解析和首发物化的实际含义。

本轮直接挂载未修改的 CC ModelSelector/原主题，设置 synthetic active Provider/main 模型、全局 high effort，并保持 draft runtime selections 为空、**不传 controlled value**。320px 的闭合→思考面板连续流截图为 `artifacts/first-send-default-v22/cc-default-closed-320.png`、`cc-default-thinking-320.png`，报告 `cc-default-report.json` 的按钮为具体模型与“高”，无页面错误。fixture 不含完整 EmptySession、Host、真实 Provider/profile、OAuth、收费流量或原生窗口；Material Symbols 字体未激活，chevron 呈 fallback ligature。旧 `first-send-model-reference` controlled-value 截图不能证明默认解析；本轮使用独立 `?default` fixture 分支，不覆盖旧报告。

hbar `68b6225a` 将首发模型初始化为 null；`1b16ec3b` 新增思考入口但依赖明确 draft.modelId，所以 null 默认下隐藏思考控件。`5a80286f` 对缺模型目录的首发做前置校验，不等于显示默认配置。当前 Host 的 session.getModel 只解析 global→workspace→session settings，Provider profile 的 main/model 字段不是分层默认选择。这是历史独立入口的差距，不是最近菜单样式修改引起。

真实临时 Host 预先设置全局默认模型与非模型默认的思考等级，旧 Web `index-B1YPQdzx.js` 在首发页仍显示“使用默认模型”，没有思考入口；新可访问名称断言失败，红测记录在 `artifacts/first-send-default-v22/red/`。有真实分层默认时可继承发送，因此不把这个情况误报成 Host 总是无法发送。

## 已交付的行为

- 首发页通过有类型的 runtime action `preSessionDraft.resolveDefaultModel` 解析现有公开 `settings.get` 和 `model.list` 合同。不在 View 访问 Host 内部、不提前创建 Session/Run、不写全局或项目默认配置。
- 有项目时读该项目的有效分层配置；没有项目时读全局。只接受目录中实际可用的默认模型与支持的思考等级，未配置默认模型时保持 null，失效默认值显示已有局部错误/重试入口，绝不猜选第一项。
- 确认结果成为现有唯一首发 draft 的 modelId/thinkingLevel，直接复用模型与思考控件。发送沿原捕获配置、Host 确认和单 Run 提交流程，不增加新的发送路径。
- 读取期间输入内容可以继续变化；结果保留最新文本、材料、权限与 Plan/Goal 意图。用户显式选模型、切项目、关闭页面或 runtime dispose 会取消原读取；晚结果不覆写新目标。读取有 15s 上限，正常同 draft 单飞；不逐字符重读默认值。
- 已显示的模型/思考选择在切项目后保留，与用户选择和既有 `f7065019` 一致；初始 null 且尚无默认选择时，项目选择可触发该项目默认解析。无新 UI 文案、图标或 CSS，布局沿原正常流与已验证 overlay。

## 验证与限制

最终生产 Web 为 `artifacts/first-send-default-v22/web/assets/index-DY4RW4j3.js`，CSS 仍为 `index-D-gDr7-e.css`；3382 modules，保留已有大 chunk 警告。真实临时 Host 的中文320px 默认显示→打开思考→Escape返回→选项目且保留草稿→不再选模型直接发送→Host确认思考与唯一用户Run通过（4.2s），并与既有中英显式思考选择首发回归共同 **3/3，通过15.3s**。实际可用画面在 `artifacts/first-send-default-v22/final-current/`；本地 mock Provider，无付费流量。首次绿测的最后一项曾错误读取 `run.input.modelId`，已依据公开 Run schema 改为 `run.modelId`，不弱化唯一Run或配置断言。

运行时与首发模型套件 **58 tests / 376 assertions** 通过，覆盖默认读取时输入、项目选择后保留、没有默认不猜选、失效默认、显式模型选择/关闭后的晚回包，以及原首发恢复与未知回执。严格 TypeScript、零警告范围 ESLint、内容/图标 guard、Prettier 和 diff 检查通过。

额外 migration-inventory 全量测试仍失败：其已有清单缺少18个先前交付的 client application commands，本次新 resolver 已独立登记，未借本单元补齐或削弱无关断言。该限制不记成检查通过。未运行全仓/native 门禁或旧 Lumen SSR，未安装依赖、推送或合并。自有临时 Host、Web preview、CC fixture 浏览器和服务均在 finally 清理。

并行 Goal/Plan 只读审查未找到新的 Host/导航主线断点。计划同 Run 审批完成后按钮卸载的焦点连续性仍需实际复现，不以源码推断声称已失败；Goal+Plan 共存与 `/agent` 语义保留为未决产品选择，不在此单元改变。
