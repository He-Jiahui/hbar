# 模型入口的首发前后连续性

本单元以 `6bb25901` 为基线，只在隔离 `codex/session-launch-target` 工作树调整
首发模型触发器的表达，不改变默认模型、思考配置、发送、审批或导航策略。
CC-haha、主工作区与共享 hbar-ui 保持只读。

## 视觉与源码依据

主 agent 查看 CC 随仓库提供的
`D:/Git/cc-haha/docs/images/app/zh-CN/composer-slash.webp`：
composer 的模型为模型名与下拉箭头，思考等级独立相邻；无首发特有的 Sparkles 图标。
readonly `ModelSelector.tsx:474-489,834-898` 与 `ChatInput` 表明空/已有会话共用此入口。
Provider 可出现在 tooltip/accessible name 或特定无 effort 分支，菜单继续保留 Provider 分组。
因此本次迁移的是主标签、图标角色和前后连续性，不声称参考永远隐藏 Provider 信息。
一名 gpt-6-luna/max agent 独立核对了这项参考与 hbar 的现有公开契约，未实施改动。

hbar 首发的 Provider 前缀来自 `38c5f40e` 的 `triggerLabel`，
Sparkles 来自 `8905cc49` 的首发页面；已有会话则使用 modelName 与 chevron。
它们是两套入口表达的历史差异，不是模型选择被发送到错误目标。
上一版生产 Web `artifacts/decision-focus-v37/web/` 的真实中文首发流程红测：
预期 `fixture`，实际 `Local fixture · fixture`，明确确认了可见标签跳变。
证据位于 `artifacts/model-continuity-v38/red-results/`。

## 已完成

- 首发 trigger 直接使用 Host modelName，复用已有 choice label，移除只用于前缀拼接的文案字段。
  菜单原有 Provider heading、能力 detail、模型 ID 搜索、选中标记与实际 ID callback 都保留。
- 公开 ChoicePicker 的 leading icon 可显式省略；首发模型不再传 Sparkles，仍有 shared sm chevron。
  原来带 Folder 等图标的调用点不变，没有修改数据 schema 或增加假选项。
- 首发模型的字重、gap、长名称截断边界与已有会话一致，完整名称可通过 Host-owned title 查看。
  CSS 保持正常 flex 和 intrinsic flow，只约束 control 容量，不固定内容高度或使用坐标布局。
- 思考等级继续独立显示真实选择；无默认/加载/失效/无目录等状态沿原有效性投影与就近恢复入口。
  不因视觉变更重设 draft、选择默认等级、写 Provider 配置或另建 Session/Run。
- 同名模型的 compact trigger 可相同，菜单仍按 Provider/ID 区分；新中文长名称 SSR 夹具覆盖该取舍。

## 实际验证

- 最终生产 build 成功，3394 modules：
  `artifacts/model-continuity-v38/web/assets/index-rmuiZNPH.js` /
  `index-kJ-Xa3qy.css`，保留已有大 chunk 警告。
- 真实临时 Host **6/6，通过 19.7 秒**：中英文首发→已有会话的模型名、单 chevron、
  600 字重与相同 effort；Host 确认该 effort 和唯一首发 Run；首发后继续编辑草稿、
  打开模型菜单→Escape 返回 trigger。另覆盖真实默认解析、Provider 分组/搜索、
  live catalog 更新而不覆写显式选择。未新增按钮 × 尺寸矩阵。
- 主 agent 查看最终 en1440 与 zh320 的四张首发前后配对截图，
  位于 `artifacts/model-continuity-v38/final-results/` 的两个 thinking-entry 目录：
  `model-ready-before-first-send-<locale>.png`、`model-ready-after-first-send-<locale>.png`。
  首次截图复核发现字重还不一致，已补齐后重新构建、重跑并查看最终画面。
- 单元、SSR、choice bounds/model validity/catalog 回归 **23 tests / 123 assertions** 通过。
  首个新增 SSR 断言误用了 aria-pressed，实际现有 choice 使用 aria-current；
  已更正为真实选中语义并验证选中的是第二个 Provider，不改产品以迁就测试。
  Bun 的既有 tsconfig override directory-mismatch 诊断仍出现，最终测试退出 0。
- 作用域 strict TypeScript、类型感知 ESLint 零警告、内容/图标/flow guard、
  Prettier 与 diff 检查通过。

全部使用临时 Host、独占 localhost preview 与 local-fixture；没有商业调用、真实配置变更、
依赖安装、全仓门禁、原生 build/smoke、push 或 merge。
临时 Host/browser/preview 随测试结束清理；关闭阶段 Vite ECONNRESET 不代表流程失败。
这是模型入口连续性子功能，不等于整体 desktop UI 迁移完成。
