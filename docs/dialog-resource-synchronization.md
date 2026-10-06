# 弹窗样式与桌面资源同步修复

## 症状和证据

用户截图中的“添加供应商”窗口有一圈亮色矩形外框，窗口缩成窄长单列，暗色工作台被偏亮的灰色遮罩覆盖。
本轮没有在业务组件另加一层 CSS 覆盖，而是检查共享 Lumen 样式、Git 历史和实际部署资源。

- 当前源码与 `dist/web` 已包含全窗口 modal owner、浏览器默认 popover 边框清除、60% medium 尺寸和单层主题遮罩。
- `dist/desktop-resources/web` 仍是更早的资源：modal root 只有 `inset: 0`，没有明确的全窗口宽高、零 margin 和零 border。
- Tauri 的 Host 使用 `HBAR_WEB_ROOT=resources/web`；开发 debug 资源在 `dist/desktop-resources`，安装版资源在自身的 `runtime` 目录。更新 `dist/web` 不会自动更新这份 Host 页面。
- 将旧桌面资源原样复制到隔离 preview 后，在真实临时 Host 的中文供应商入口复现了同样的白框与窄长布局。新增回归直接测得 modal root 的浏览器默认边框为 **3px**，`expect(0px)` 红测。

相关历史：`22de980d`／Lumen `e9f519cdd7` 已修正 viewport owner 和子窗口尺寸；Lumen `5550317f3a` 已修正主题遮罩和重复着色。
本轮确认的问题是桌面运行资源没有带上这些修复，不是这几个提交的源码再次被业务 CSS 覆盖。

参考：https://pro.reactbits.dev/docs/app-ui/app-dialog/app-dialog-1 — 保持标题、可滚动主体和固定底部操作的层级。
参考：https://pro.reactbits.dev/docs/app-ui/app-dialog/app-dialog-3 — 保持表单校验、草稿与底部操作；不重做供应商编辑交互。

## 修复与同步入口

本轮重新构建 Web，并把完整新资源同步到 `dist/desktop-resources/web`。保留已有共享 Lumen 浮层契约，不在供应商页复制遮罩、定位或尺寸规则。

新增单命令入口：

```text
bun run build:desktop-web
```

它只重新构建、发布桌面使用的 Web 资源，不重建 Host／Bun／N-API／Tauri，不安装软件、不结束其他进程，也不修改用户配置。
`scripts/build-host.ts` 同样复用 `syncDesktopWebResources`，避免维护两套发布路径。

发布先把完整 Web 构建复制到生成目录内的唯一 staging，核对入口未在复制过程中变化，再通过 rename 替换整个旧包。
复制／校验失败时不动旧包；替换失败时恢复旧包。若恢复也失败，则保留旧包及 staging 并报告恢复路径，不能清掉唯一可恢复副本。
生成目录必须是普通目录，拒绝链接输出目标。过时资产随旧生成包一起移除，不保留新入口搭配旧 CSS 的混合资源。

已加载旧资源的窗口仍需要重新加载。工程目录中的 debug 程序在重新启动 Host 后使用更新资源；
已安装版本使用自身 `runtime`，需要后续正式构建／更新安装包。本轮没有生成 EXE 或安装包，也没有重启用户正在使用的软件。

## 验证范围

新增 `e2e/provider-dialog-style.spec.ts` 在实际应用、真实临时 Host 中验证中文和英文：

- 2048×1228 桌面、390×844 窄窗口、再恢复桌面；
- 根容器零边框／零 margin／透明背景、完整 viewport、body portal 和 native top layer；
- medium 的 60% 宽高、紧凑窗口 100%、无横向溢出、底部操作保持可见；
- 输入草稿在 resize 后不丢失，协议下拉 Escape 仅关闭子层，不关闭父弹窗。

最终使用同步后的 **桌面 Web 资源副本**，而不是仅用当前源码组件，运行四个 E2E 文件 **8/8 通过**：
新增供应商窗口中英文两条、既有尺寸两条、top-layer／fallback 遮罩两条、供应商目录布局中英文两条。
主 agent 亲看桌面和窄屏截图，外框消失、暗色背景方向正确、桌面表单恢复双列对齐。
资源发布器 **4 项单测／14 个断言通过**；改动 TypeScript 文件严格 ESLint 通过，Web 构建通过。

资源发布器及依赖图的严格类型检查通过。包含 UI 的定向检查仍被现有 Lumen／应用组件的 13 条类型诊断阻挡；
不能把浏览器验收通过写成全仓 typecheck 通过。没有运行完整 E2E、真实商业模型或用户原生窗口验收。

旧包红测截图与 trace、新包中英文截图保存在忽略的 `artifacts/popup-style/`，不是业务示例内容。
