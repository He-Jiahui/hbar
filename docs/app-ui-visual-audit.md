# App UI 真实参考视觉审计

`hbar-app-ui` 的 300 个注册项不是视觉验收结果。完整验收必须使用 React Bits Pro 的真实
Application UI 预览作为参考，并保留 Lumen 的黑白、玻璃、边缘光和主题 token。颜色可以
不同，但 DOM/ARIA 结构、阅读顺序、响应式流、几何边界、内容容量和交互反馈不能被颜色差异
掩盖。

## 运行矩阵

```powershell
bun run app-ui:reactbits:discover -- --output artifacts/reactbits-pro-visual-audit/all
bun run app-ui:reactbits:audit -- --output artifacts/reactbits-pro-visual-audit/all --workers 2 --strict
```

默认矩阵为 38 个分类、300 个变体、4 个视口（1440×900、1024×768、390×844、320×720）
和 dark/light 两种主题，即 2400 组静态 source/local 配对。开发期可以使用
`--variants`、`--categories`、`--viewports`、`--themes` 缩小范围；缩小范围不能代替最终全量验收。

live 参考可通过以下变量配置：

- `HBAR_APP_UI_REFERENCE_URL`：React Bits Pro App UI 目录；
- `HBAR_APP_UI_REFERENCE_ROOT`：offline 清单和静态变体缓存根目录；
- `HBAR_APP_UI_AUDIT_OUTPUT_ROOT`：报告输出目录；
- `HBAR_APP_UI_VIEWPORTS` / `HBAR_APP_UI_THEMES`：开发期矩阵过滤；
- `HBAR_APP_UI_AUDIT_WORKERS`：有界并发；
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
- `interaction-report.json`：从真实控件清单按语义控件形状覆盖的操作前后状态；完整控件清单仍保存在语义快照中；
- `visual-report.json`：静态和交互截图差异、尺寸差、MAE/RMSE、变化像素和反馈幅度；
- `review-ledger.json`：逐变体、逐交互的 passed/needs-fix 记录；
- `report.html`：可人工浏览的汇总表。

交互必须从 React Bits Pro iframe 真实 DOM 发现，不能只读取本地 `profile.controls`。每种
交互动作按 `tag/type/role` 语义形状选取确定性代表，避免同一反馈路径被数十个同构控件重复放大；
每个代表动作都在新页面状态中回放，并保存 `before.png`、`after.png`、`source-state.json`、
`lumen-state.json` 和 `comparison.json`。结果分类为 `matched`、`lumen-different`、
`missing`、`source-no-op`、`blocked` 或 `not-applicable`。

`--strict` 至少阻断以下情况：缺失 source/local 配对、控件数量或类型不一致、横向溢出、文本
截断、未分类交互和缺少交互反馈。Lumen token 的颜色、玻璃背景和阴影不作为通过依据，也不
能屏蔽几何差异。

## 类别修复边界

按 38 个类别逐类修复，每一类包含该类所有变体。先记录源 iframe 的语义父子关系、区域、
控件顺序、状态和响应式流，再用 flex/grid/正常文档流实现；只有真实 dialog/menu/drawer/
popover overlay 才能使用定位。内容、文案、集合和容量继续由宿主 contract 提供，不能在可复用
组件中硬编码源文案或伪造记录。图标使用共享语义尺寸等级；每个类别通过后独立提交子模块、
wrapper、fixture、测试和审计证据。

变体清单中的“注册”与“完整视觉/交互审计通过”必须分开记录。只有 `review-ledger.json`
中静态矩阵、真实交互、page/console error、溢出、结构硬门禁全部通过，才允许标记为已验收。
