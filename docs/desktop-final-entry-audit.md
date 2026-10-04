# Desktop 全入口复核：当前差距与交付边界

本轮参考仍为本地 cc-haha Desktop `e28d0a65`，hbar 审查基线为
`a62f098`（包含多文件预览 `0ee3099`）。这是一轮新的有限入口矩阵和差距取证，
不是全部体验已经迁移完成的声明，也不以旧 P1／P2／P3 的通过记录替代当前界面。

后续实施状态：侧栏调宽已由 `ea0e3a5` 交付，设置内容独立恢复由 `ff44d6d` 交付；本轮图片缩略图与历史回看也已接通并完成真实原生验收，详见 [图片交付记录](desktop-image-resources.md)。下表是原审计时点的发现，后续交付不自动关闭其余项目组织、会话内查找或能力合同差距。

## 三个独立审查方向

| 范围                                               | 逐入口记录                                            | 新确认的主要差距                                                               |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 会话、模型、permission、Goal／Plan、输入与消息     | [会话矩阵](desktop-conversation-final-entry-audit.md) | 图片上传后只能看名称，发送后的图片也没有回看入口；参考提供缩略图与原位画廊     |
| 主导航、项目／会话、菜单、页签、返回与快捷键       | [导航矩阵](desktop-navigation-final-entry-audit.md)   | 已有侧栏宽度描述，但没有用户调宽入口；全局聊天搜索不能被 Commands 替代         |
| 设置分类、Provider、模型／默认项、外观、用量与扩展 | [设置矩阵](desktop-settings-final-entry-audit.md)     | 动态选项读取失败时，未保存草稿会禁用整表刷新；已有只读内容重试能力没有 UI 入口 |

矩阵区分四类结果：已对齐的行为、明确保留的 hbar 适配、已有能力但漏掉交互的缺口、
需要新的后端／安全／产品契约才能提供的能力。截图按原组件隔离挂载、发布图片、
当前生产 App 和真实原生窗口区分，不能相互冒充。

这次新证据中，原侧栏实际经历 280 → 键盘 300 → 拖拽 420 → 刷新 420 → 重置 280；
hbar 在同类边缘拖拽下仍是 272，且没有侧栏 separator。设置故障只注入一次
`settings.getThinkingLevels` 内容读取失败，保留真实 Host 其余通信；没有调用
`settings.apply`，因此能明确区分“重试选项”与“保存或放弃草稿”。各自的完整测量、
截图与运行失败记录见对应矩阵。

## 主线补充复核：问卷和普通工具审批

主线从当前代码独立构建 `artifacts/desktop-final-entry-audit/decision-web-dist`，
产物为 `index-fbz8IPGL.js`／`index-BBy3EzVG.css`，3069 modules；执行现有
`e2e/session-decisions-entry.spec.ts`，英文／中文 **2 passed，10.8s**。

实际覆盖普通 edit 工具原位审批、完整原文／替换文、1440／390／320、键盘批准与重复输入
只产生一次确认、问卷题签键盘切换、跨会话保留答案、提交后的持久结果、刷新回看。
fixture 的 edit 写入只发生在测试生成的临时目录；模型为 local fixture，不连接商业模型。
不把这两条测试外推为所有 Plan 审批、问卷故障、原生窗口或完整会话流程已重验。

主线亲看了以下新截图：

- [英文宽屏原位审批](../artifacts/desktop-final-entry-audit/decisions-results/session-decisions-entry-to-e5f04-in-confirmed-outcomes-en-US/approval-pending-en-US-1440.png)
- [中文窄屏问卷答案](../artifacts/desktop-final-entry-audit/decisions-results/session-decisions-entry-to-e7d09-in-confirmed-outcomes-zh-CN/questionnaire-selected-zh-CN-320.png)

这部分可以保留现有入口。参考 AskUserQuestion 的多选／改为对话仍不是当前单选公共合同
的等价能力；已交付的事实和恢复边界见[决策交付记录](desktop-session-decisions.md)。

## 独立实施顺序与尚未关闭的范围

1. 侧栏调宽：复用版本化布局描述和 CAS 保存，补拖拽／键盘／重置／失败恢复，保留窄屏全页导航、
   原会话草稿、Files 和右工具宽度。原参考有折叠窄轨，hbar 没有；本单元保留显式 Hide／Show，
   不借调宽新增另一套导航模式。该项需要自己的当前构建、浏览器、原生和提交证据。
2. 设置内容读取恢复：在相关选项区域重试已有 `settingsForm.refreshContent`，不清草稿、不自动保存，
   并把缺模型／模型不可用和暂时读失败分开表达。不得移除 dirty 时禁整表刷新的保护。
3. 安全图片回看：先落实鉴权字节读取、容量／MIME／解码限制、原目标关联、取消和 URL 释放，
   再迁移 composer／消息缩略图与画廊；不能直接把认证令牌放进图片 URL。

其余项目组织、会话内查找和快捷键仍见导航矩阵，不因上述三个单元完成便自动关闭。
全局全文搜索、PTY、任意内嵌 Browser、Team、市场和定时任务需要真实产品与安全契约，
不能靠新增可点击外壳声称基本一致。

本轮还单独重跑了 `tests/lumen-canonical-boundary.test.ts`：**2 pass／1 fail**，
唯一失败仍为外部 `QuoteAuthentication.tsx:native-visible-control`。
没有修改该并行功能；当前审计和专项交互通过不能被写成全仓门禁全绿。
后续并行工作树还在变化时，完整 gate 的结果必须绑定实际运行时点另行记录。

本报告只是审查阶段的交付。总体 Goal 保持未完成，后续每个子功能通过相关验证后独立提交。
