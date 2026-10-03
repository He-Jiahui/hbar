# 工作台纵向伸展与底部区验收

被测主仓库提交：`2d8bf77a`，canonical 子模块：`8446abca8d`。分支为 `codex/hbar-app-ui`。
这是对用户截图所示侧栏底部操作和会话输入区上浮问题的定向修复，不替代前一轮真实供应商用量回执。

## 症状、原因与修复

短消息复现中，2048×1207 视口的 composer 底边在 576.48，工作区底边在 1206，空出约 630 的垂直空间。
canonical AI Chat 的受控 body 沿用了预览的三行 Grid，缺失 header 时 body 占据内容高度的第一行；
Sidebar 受控 `nav/section` 插槽包装未向下传递 flex 高度。相关接入提交为 `185c5a5445` 和 `dc152e590e`，
本轮以当前代码与 DOM 回归复现确认这两处布局断点，没有对所有历史版本做 bisect。

- `bd600ddf26` / `5ec60240`：受控 AI Chat 使用 header、可伸展 body、composer 的 flex 分区；Sidebar 插槽向下传递面板高度。
- `8446abca8d` / `2d8bf77a`：原生 900×600 加标题栏后，顶部和底部固有内容超出可用高度；允许侧栏 header 收缩并滚动，列表保留一行交互空间。
- 中间消息区与工程列表独立滚动；底部区保持正常文档流和内容高度。普通内容未使用绝对定位、固定坐标或截图高度。

## 验证证据

| 检查       | 实际结果                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 工程检查   | 根 `bun run lint`、`bun run typecheck`、Web build 通过；短窗口后续修改的定向严格 ESLint 通过                                        |
| canonical  | `npx --yes pnpm@12.3.4 --dir hbar-ui -F @lumen/app-ui build` 通过，含 TypeScript 和类型产物                                         |
| 基础回归   | controlled slots、conversation、FlexLayout adapter 共 20 测试、56 断言通过                                                          |
| 布局 E2E   | `workbench-vertical-fill.spec.ts` 6/6 通过（42.8s）：中英文、深浅色、空/短/长内容、81 会话与 130 条历史、独立滚动和草稿刷新恢复     |
| 浏览器尺寸 | 2048×1207、1440×960、900×600、900×560、390×844；无水平溢出，底部区贴合各自面板，列表有可用高度                                      |
| 菜单回归   | 会话 context menu 中英文 2/2 通过，保留上一轮 Popover 顶层行为                                                                      |
| 原生       | desktop release 和 NSIS 构建通过；独立 profile 的真实 Tauri/WebView2 窗口在三种尺寸通过，`pageErrors=[]`、验收 Session `runCount=0` |
| guards     | 两个新增 flow 样式、修改 TSX 的内容与图标 guards、Prettier 与 `git diff --check` 通过                                               |

原生几何见 [geometry.json](../artifacts/vertical-fill/native/geometry.json)：

| 原生内窗  | 输入区底边留量 | 侧栏底边留量 | 消息区高度 | 工程列表高度 |
| --------- | -------------: | -----------: | ---------: | -----------: |
| 1600×1000 |              2 |            3 |        603 |       386.94 |
| 1200×800  |              2 |            3 |        383 |       186.94 |
| 900×600   |              2 |            3 |        135 |         86.5 |

单位为 CSS px，底边留量对应面板边框。已人工检查[中文宽屏](../artifacts/vertical-fill/zh-CN-short-2048.png)、
[原生最小窗口](../artifacts/vertical-fill/native/native-900-600.png)和窄屏截图。
日志、探针和截图保存在被忽略的 `artifacts/`，产品源代码与浏览器回归已独立提交。
本轮没有重跑完整 731 文件集或完整 `desktop-smoke.ts`；原生证据只覆盖本次布局、草稿及窗口尺寸。

## 持久化桌面收尾

隔离验证结束后，已重新启动新 release 桌面 PID 22408。真实 Host PID 39312、端口 59932 的
`healthz` 返回 200、`ready=true`，实例仍为 `cf9d675a-7ea9-4ef7-98fc-ee550a51ffb3`。
用户安装目录没有覆盖；供应商配置和历史使用原持久化环境，没有读取或修改供应商密钥，也没有新增付费模型请求。
