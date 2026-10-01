# 首发模型与思考选择的失效恢复

本单元基于隔离 `codex/session-launch-target` 的 `40e5af01`，继续处理
首发目录变化后的内容真实性。CC-haha 为只读 `e28d0a65`；不修改用户主工作区、
真实 Provider 配置或已确认的“切项目保留当前模型与思考等级”规则。

## 参考、历史与复现

主 agent 查看 CC 的完整 `docs/images/app/zh-CN/model-picker.webp` 与
`desktop/src/components/controls/ModelSelector.tsx:437` 起的选择派生：
模型和独立思考入口紧邻 composer，目录来自实际 Provider 数据。
该源码在 effort 不受支持时会派生显示 fallback，但仅凭这段显示逻辑，
不能断言 CC 的 canonical 首发选择也被改写。本次迁移保留入口位置和就近恢复，
不机械照搬显示 fallback；hbar 继续尊重用户明确选择和 Host 的有效性检查。

`1b16ec3b` 的首发思考组件将不受支持的 level 显示为 model default；
`e49bc47e` 是类型导入调整。`e36e4910` 让存活首发页接收最新目录，
但不改写 draft，因此此前的显示 fallback 与 canonical choice 不一致会暴露出来。
Host 首发 preflight 本来就会拒绝移除的模型或不受支持的思考等级，
不是最近 Files 评论提交造成的发送问题。

真实临时 Host 复现：选择模型与 `high`，保留草稿，然后把该 Provider 的
支持等级改为 `low/medium`。基线生产资产 `index-C3_X9Xoh.js` 显示 `medium`，
Send 仍可用，draft 却保留 `high`。新增用例在“Send 应禁用”断言失败；
证据保存在 `artifacts/selection-validity-v29/red/`，主 agent 查看实际失败画面。
模型移除而其他 Provider 仍存在是同类源码确认缺口，并在最终真实流程覆盖；
基线 RED 在思考断言已停止，不冒称也独立执行了模型移除 RED。

## 已交付行为

- runtime 提供纯有效性投影，只有 ready 目录确认模型或思考失效。
  它不修改 canonical draft，不猜选第一项，不改变任何 Provider 默认值。
- 思考 trigger 仍显示原来选择的等级，失效时标记 invalid；输入区就近说明
  需要确认一个可用等级。发送禁用，草稿与项目不变。
- 可用等级从当前实际模型提供。即使仅剩一个等级，也保留恢复入口，
  Enter 或指针确认后才能应用；单纯打开再点走或 Escape 不应用 fallback。
  正常滑动预览、取消及原有确认流程保持不变。
- 所选模型被移除时，trigger 显示宿主提供的“模型不可用”，不误称默认模型，
  不在列表伪造一个可选记录。用户选另一个实际模型后即可沿原草稿发送。
- 中文/英文恢复文案属于 web Host 的类型化 copy；组件包不导入 web locale。
  沿既有 flex 内容流显示提示，未新增 CSS 坐标、固定内容高度、图标尺寸或列表模型。
- 本地导航 slash actions 仍可用于恢复。Host preflight 保留为目录变化与发送之间
  的竞态保护，不用 UI 禁用代替后端校验。

## 验证与边界

最终生产构建 `artifacts/selection-validity-v29/web/`：
JS `index-CJWhhNoY.js` / CSS `index-BUG_tiWa.css`，3385 modules，保留既有大 chunk 警告。
临时 Host 49168、Vite preview 49169，仅 localhost mock/local-fixture，无付费流量。

- **5/5 E2E，23.1s**：中文390px连续经历等级失效、仅查看/取消、确认恢复、
  单等级恢复、模型移除、重选并提交唯一用户 Run；既有实际默认模型首发、
  live catalog 更新与中英文普通思考流程均通过。
- **64 tests / 405 assertions**：选择有效性、模型目录和首发 draft runtime。
- 全部8个改变的源文件/测试通过 scoped strict TypeScript、零警告 ESLint、
  Prettier；三个 TSX 的 content/icon guards 与 diff 检查通过。
- 最终截图在 `artifacts/selection-validity-v29/final/`；主 agent 查看思考失效、
  模型移除与恢复三张实际画面。中文提示自然换行，草稿与相关入口仍完整可见。
  行为和首次 Run 归属依据测试断言，不仅依据截图。

诊断阶段新测试曾有括号语法错误与 finally 中直接抛出清理检查的问题；
已修正并重新运行上述检查，不把失败记成通过。清理 helper 仍校验临时目录所属
和固定前缀后才移除。临时 Host 关闭时出现 Vite ECONNRESET；连续流程 pageerror 为空。

本单元不声称全仓门禁、旧 Lumen SSR、原生窗口或完整 desktop 迁移通过；
未运行 native、安装依赖、推送或合并。Goal+Plan、`/agent` 与审批等待 Guide 的
未决语义保持不变，见[当前复核](desktop-core-continuity-current.md)。
