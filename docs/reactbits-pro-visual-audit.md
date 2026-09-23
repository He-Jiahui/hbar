# React Bits Pro / lumen-app-ui 视觉审计

这套审计以 React Bits Pro 的公开 App UI 变体页为真实参考，把每个源变体与
`lumen-app-ui` 的隔离预览按相同的内容、视口、主题和交互逐项配对。原始图片、差异图
和 JSON 报告只写入被 Git 忽略的 `artifacts/`，不把第三方页面或测试数据提交到仓库。

## 覆盖矩阵

- 发现：38 个分类、300 个变体，并与 `packages/hbar-app-ui/src/specs.ts` 的本地注册表逐 ID 校验。
- 静态截图：1440×900、1024×768、390×844、320×720 四个视口；dark/light 两个主题。
- 画布校准：记录原版 iframe 实际内容宽高和舞台 padding，并以相同可用空间渲染本地隔离预览；外窗宽度不能直接当成组件可用宽度。
- 语义快照：组件根节点尺寸、水平溢出、前五层 DOM 结构、控件的 name/role/disabled/expanded/pressed/selected/state。
- 交互截图：每个视口和主题重新加载源与本地页面，对每个真实可见控件逐一覆盖 hover、focus、click、文本填充、Enter/Space press 及适用的 select/toggle/expand/menu/tab/drag/upload/download；同构控件也分别保留 before/after，不以代表案例代替。
- 反馈比较：对静态图和交互图计算尺寸差、归一化 MAE/RMSE、变化像素比例，并比较源/本地交互前后反馈幅度。

## 命令

```powershell
# 只发现并校验 React Bits Pro 的 38/300 清单
bun run app-ui:reactbits:discover -- --output artifacts/reactbits-pro-visual-audit/all

# 选定变体做四视口×双主题静态截图
bun run app-ui:reactbits:capture -- `
  --variants hbar-app-ui-card-11 `
  --output artifacts/reactbits-pro-visual-audit/card-11 `
  --workers 2

# 同一变体做所有视口/主题的真实交互 before/after 截图
bun run app-ui:reactbits:interactions -- `
  --variants hbar-app-ui-card-11 `
  --output artifacts/reactbits-pro-visual-audit/card-11

# 生成 structure-report.json、visual-report.json 和交互差异图
bun run app-ui:reactbits:compare -- --output artifacts/reactbits-pro-visual-audit/card-11

# 对全部 300 个变体依次执行发现、静态采集、交互回放和比较
bun run app-ui:reactbits:audit -- --output artifacts/reactbits-pro-visual-audit/all --workers 2 --strict
```

`--variants` 接受本地 ID（例如 `hbar-app-ui-card-11`）或源 ID（例如 `card-11`），
`--categories` 可以只跑一个分类；`HBAR_APP_UI_REFERENCE_URL`、
`HBAR_APP_UI_PREVIEW_URL` 和 `HBAR_APP_UI_CHROME_PATH` 可用于切换参考地址、本地预览地址
和 Windows Chrome 路径。
单变体调试可用 `--source-inventory <已捕获清单路径>` 避免每次重新访问 38 个类别页；
此模式仍实时捕获变体 iframe，完整 `audit` 不复用旧清单。`--local-only` 的缓存还必须包含
iframe 实际画布宽高与舞台 padding，旧缓存不能据此宣称几何验收通过。

## 结果阅读

- `source-inventory.json`：真实页面清单和本地注册表的映射证据。
- `capture-manifest.json`：每个 `source`/`local` 截图和快照的 1:1 记录。
- `structure-report.json`：根节点尺寸差、树节点/标签序列、控件数量、文本容量和溢出结果。
- `visual-report.json`：静态配对、交互配对、差异图片路径，以及每种交互源/本地反馈幅度。
- `interactions/<variant>/<theme>/<viewport>/<case>/{source,local}/`：可人工打开的真实 before/after 截图和快照。

源颜色和本地颜色不强制像素一致；本项目保留 Lumen monochrome/glass token。门禁关注的是
DOM/ARIA 语义、内容容量、流式布局、响应式边界和交互反馈是否与源变体同构。发现差异后，
先用报告中的实际源结构更新宿主内容契约，再修改 Lumen 组件，最后重跑同一个变体的完整矩阵。
