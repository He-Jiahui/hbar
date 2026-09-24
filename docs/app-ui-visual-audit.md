# App UI 真实参考视觉审计

`hbar-app-ui` 的 300 个注册项不是视觉验收结果。完整验收必须使用 React Bits Pro 的真实
Application UI 预览作为参考，并保留 Lumen 的黑白、玻璃、边缘光和主题 token。颜色可以
不同，但 DOM/ARIA 结构、阅读顺序、响应式流、几何边界、内容容量和交互反馈不能被颜色差异
掩盖。

## 运行矩阵

2026-09-24 用户调整：交互改按变化机制选样，不再逐按钮、逐输入方式和逐布局切换穷举；结构覆盖仍遍及全部变体。集中检查修复结果，关键状态保存真实原版/本地截图，等价行为记录依据并标注“推断、未逐项回放”。具体选样计划与流程见 [当前审计策略](reactbits-pro-visual-audit.md)。协议 25 默认要求逐变体的已审阅选样计划；尚未配置的变体先做结构/行为分析，不自动启动旧穷举任务。

```powershell
bun run app-ui:reactbits:discover -- --output artifacts/reactbits-pro-visual-audit/all
bun run app-ui:reactbits:audit -- --output artifacts/reactbits-pro-visual-audit/all --workers 2 --strict
```

默认矩阵为 38 个分类、300 个变体、4 个视口（1440×900、1024×768、390×844、320×720）
和 dark/light 两种主题，即 2400 组静态 source/local 配对。开发期可以使用
`--variants`、`--categories`、`--viewports`、`--themes` 缩小范围；缩小范围不能代替最终全量验收。
调试单个真实动作可对 `interactions` 加 `--cases <完整案例 ID[,其他 ID]>`；报告标记为
`selected-cases`，`compare` 不把随意缩小的调试集当作已审阅选样计划的完整通过证据。
必须等待静态捕获完成后再启动交互回放，不要并发启动这两个有前后依赖的阶段。
交互重放优先读取同一输出目录的 `capture-manifest.json` 画布尺寸；若调试结果另存目录，可用
`--source-output <静态捕获目录>` 指向对应的真实 source 清单。站点重载时 iframe 高度可能变化，
动作前会强制回到静态参考画布；目录哈希、画布指纹或源/本地实现不一致时不能复用旧案例。
浏览器外窗尺寸不等于原版 iframe 内容画布尺寸（例如 390 宽外窗中的 iframe 可能只有 356 宽）。
每次 live 捕获会记录 iframe 实际宽高与参考舞台 padding，并在本地隔离预览中复用相同可用空间；
本地组件自身已有的内边距会从舞台 padding 中扣除，避免同一空间重复计算。缺少这些元数据的
旧 source 缓存不能用于 `--local-only` 几何验收，必须重新捕获原版。

live 参考可通过以下变量配置：

- `HBAR_APP_UI_REFERENCE_URL`：React Bits Pro App UI 目录；
- `HBAR_APP_UI_REFERENCE_ROOT`：offline 清单和静态变体缓存根目录；
- `HBAR_APP_UI_SOURCE_INVENTORY` / `--source-inventory`：仅开发期复用已校验的 38/300 URL 清单，仍实时打开各变体原版 iframe；完整 `audit` 总是重新发现线上目录；
- `HBAR_APP_UI_AUDIT_OUTPUT_ROOT`：报告输出目录；
- `HBAR_APP_UI_VIEWPORTS` / `HBAR_APP_UI_THEMES`：开发期矩阵过滤；
- `HBAR_APP_UI_AUDIT_WORKERS`：有界并发；
- 单变体交互也按此上限并行重放不同动作，每个动作仍拥有独立浏览器上下文；多变体时按变体分配工作者，不叠乘并发数。
- `HBAR_APP_UI_CHROME_PATH`：Windows Chrome 路径；
- `HBAR_APP_UI_OFFLINE=1`：只使用已保存的 source inventory/cache，不猜测缺失映射。

offline 缓存必须包含 `source-inventory.json`，并可以按 `<source-id>.html` 或
`<source-id>/index.html` 提供变体页面。缺少缓存时命令失败，不回退到伪造组件或猜测 URL。

## 证据和门禁

每次运行都写入被 Git 忽略的 `artifacts/reactbits-pro-visual-audit/<run-id>/`：

- `manifest.json`：参考 URL、源目录哈希、视口/主题矩阵和静态/交互计数；
- `source-inventory.json` / `local-inventory.json`：38/300 发现与本地映射；
- `capture-manifest.json`：每个 source/local 截图、上下文截图和语义快照；
- `structure-report.json`：DOM/ARIA/几何/文本容量/溢出/截断/控件形状；
- `interaction-report.json`：已审阅选样计划中每个实际动作的操作前后状态；访问状态的完整控件清单保存在语义快照中，未回放的等价项单列推断依据；
- `interaction-run.json`：所选变体、视口、主题、源目录与本地实现代码/fixture 的续跑指纹；同一输出目录仅在指纹一致时复用。每个动作在全新浏览器上下文中重放，只有源/本地截图和快照均完整、且动作/画布指纹未变化的 `comparison.json` 才能续用；错误和残缺案例重新测试。静态清单也记录实现指纹；代码变化后的旧截图不能标记为验收通过。
- `visual-report.json`：静态和交互截图差异、尺寸差、MAE/RMSE、变化像素和反馈幅度；
- `review-ledger.json`：逐变体、逐交互的 passed/needs-fix 记录；
- `report.html`：可人工浏览的汇总表。

交互必须从 React Bits Pro iframe 真实 DOM 发现，不能只读取本地 `profile.controls`。即使
多个控件有相同 `tag/type/role`，仍保留各自稳定 ID；是否需要单独回放按行为差异判断，不仅按控件形状合并。每个选中的真实动作保存
`before.png`、`after.png`、`source-state.json`、
`lumen-state.json` 和 `comparison.json`。结果分类为 `matched`、`lumen-different`、
`missing`、`source-no-op`、`blocked`、`not-applicable` 或 `error`。旧的
`semantic-shape-representatives` 报告只可用于定位问题，不能用于全量验收。

`--strict` 至少阻断以下情况：缺失 source/local 配对、控件数量或类型不一致、横向溢出、文本
截断、未分类交互和缺少交互反馈。原版文档页的导航/浮层在捕获时隐藏，iframe 保留原始内容画布；
每一条交互还需要完整的前后截图，并比较原版与本地的变化像素比例（容差取 2 个百分点与原版
变化幅度的 35% 中较大者）。仅 DOM 不变的 `source-no-op` 不能豁免视觉反馈差异；局部视口/
主题的调试报告也不能标记为全矩阵 `passed`。Lumen token 的颜色、玻璃背景和阴影不作为通过
依据，也不能屏蔽几何差异。

## 类别修复边界

AI Usage 1 的选样示例已固化在 `scripts/reactbits-audit-sampling.ts`：30d／90d 两种数据投影、
代表日柱 hover、另一日柱 focus、失焦恢复提示、切换后的周柱明细，以及极窄屏键盘返回 7d。
共七个真实源／本地案例，不重复每根柱子的所有手势。其余同类点、主题与宽度标为
`inferred-not-replayed`；该选样计划不能代替其它七个 Usage 变体的独立结构分析。
本地 `bun scripts/verify-hbar-app-ui-usage.ts --overview-only` 额外检查断点、德语长文案、
空态、32 点溢出与短宿主可达性。原版短预览的顶部裁切须单列人工差异，不能伪装成主题差异。

按 38 个类别逐类修复，每一类包含该类所有变体。先记录源 iframe 的语义父子关系、区域、
控件顺序、状态和响应式流，再用 flex/正常文档流实现；只有真实 dialog/menu/drawer/
popover overlay 才能使用定位。内容、文案、集合和容量继续由宿主 contract 提供，不能在可复用
组件中硬编码源文案或伪造记录。图标使用共享语义尺寸等级；每个类别通过后独立提交子模块、
wrapper、fixture、测试和审计证据。

变体清单中的“注册”与“完整视觉/交互审计通过”必须分开记录。只有 `review-ledger.json`
中静态矩阵、真实交互、page/console error、溢出、结构硬门禁全部通过，才允许标记为已验收。
