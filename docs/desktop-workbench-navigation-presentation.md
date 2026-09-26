# 自适应工具区与进出焦点

本单元落实 [工作台后续审计](desktop-workbench-navigation-followup-audit.md) 的 P1：Files、Monitoring、Agents、Goals 共用的容器、调宽及进出焦点。参考是 cc-haha 的有界并排、工具就近操作和独立工作台返回，不复制其 900px 原组件已经发生的裁切。按会话保留显隐（P2）、多文件预览标签（P3）仍是独立后续范围。

## 参考、旧行为与历史

参考基线 `cc-haha e28d0a65` 的 `SessionChatSurface` / `ActiveSession` 用正常 flex 流并排聊天和工具，separator 以实际宽度每次调整 32 CSS px；`WorkbenchPanel` 的展开、Back、X 是不同的动作。发布图 `docs/images/app/en/workspace-changes.webp`、`workspace-diff.webp` 与本轮原组件实际挂载证据见上面的审计。原组件 fixture 不包含完整 cc App、Host 或 native，不把它当成整套参考桌面验收。

hbar 原共享 UI 历史 `fa0b2b9d9b` 明确采用 `<80rem` fixed drawer，宿主 v2 描述也声明 medium drawer。旧实现不是偶发偏移：900/390/320 中工具会遮住仍可 Tab 的背景入口，X / Expand 之后焦点落 BODY。`2c68156` 保留原审计；新维护测试另在未修改的旧生产资源 `index-BUjyaW7Q.js` 上留下中英两项预期红测：背景焦点、关闭焦点与展开焦点失败，数据保留与零 Run 则成立。

## 实现语义

| 情况                      | 新的行为                                                          | 保留的边界                                                  |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| 主区余量足够              | main 与 tool 正常 flex 并排，separator 占真实流空间               | 不覆盖模型、工具栏和会话正文                                |
| 主区余量不足              | tool 成为当前页面；main 同 DOM 折叠到零宽并 inert                 | 不卸载草稿、附件、文件 owner；不是伪造的 modal drawer       |
| 工具 X / 无更高交互的 Esc | 只关闭原工具，返回仍可用的原入口，否则具名主区／当前 tab          | 不归档、不取消 Run、不保存文件                              |
| Files Expand              | 同一 panelInstanceId 进入独立工作台；焦点随已提交视图进入具名区域 | 捕获原 workspace/session/tab 实例；旧异步结果不接管新上下文 |
| 工作台 Back / X           | Back 回来源；X 走原关闭／邻项规则                                 | 不混同文件内 Back to files，不复活退役来源                  |
| 更高 native dialog        | 确认框仍可见可操作，Esc 优先属于它                                | 关闭之后才恢复下层可用焦点；不自动批准或停止运行            |

`apps/web/src/shell-layout.json` 升级为 v3；v1/v2 迁移保留原侧栏显示、宽度及其他模块选择。主区最低 20rem、工具最低 20rem、separator 0.375rem；判断依据是侧栏分配之后的实际 `.lumen-app-body` 宽度及 root font，不是 viewport 80rem。因而默认字号下 900px + 打开的 272px 侧栏进入 tool page，收起侧栏后同一窗口可并排。没有 ResizeObserver 或测量尚未就绪时安全降级为 page。窗口收窄只限制呈现，不改写保存的偏好宽度。

separator 的键盘左右每次改变 32 CSS px；Home/End 到实际可用上下界。pointer 拖动仅预览，抬起提交一次，取消／丢失 capture 回退预览。宿主通过原 `layout.commit` 的 revision CAS 保存 20–36rem 偏好；不创建第二份业务宽度 store。冲突或保存失败在当前工具旁使用宿主中英文案提示和显式重试，重试只把宽度合入最新布局；没有持久端口时不宣称已保存设备设置。

焦点 owner 只保存短期 DOM 引用，不镜像导航事实。身份包括 runtime、导航 workspace/session、tab id+instanceKey、panel kind/target/binding。跨会话、跨页面和过期结果不会恢复旧来源；Esc 让位于 native dialog、menu/popover、combobox、展开 details、IME 和已处理的按键。

分隔条通过公开 `resizeRef` 属于准确的工具区域；从 split 缩窄时它被隐藏，焦点会转到可用工具，不能留在隐藏分隔条。命令面板不发生 resize 也有独立闭环：记录 modal 接管前的原工具编辑框，取消后仅当原目标仍匹配且焦点落 BODY/无效节点时恢复原框，否则退到同一具名 aside；用户主动选择的其他有效控件优先。React 直接移除 dialog 时，通过过滤的 dialog 子树变更观察处理，不只依赖已脱离文档节点上的 `open` 属性变化。

不能给 main 用 `display:none` / `hidden`：祖先隐藏会使其中已经打开的 `dialog.showModal()` 变成零尺寸却继续锁住 top layer。因此 main 用正常流零宽 + overflow clip + inert，保留 native dialog 的 top-layer 绘制；窄侧栏占页时，包含 `dialog:modal` 的 frame 同样保留正常流零宽。确认框关闭而侧栏仍占页时先落到可见侧栏控制，用户明确收起侧栏后再恢复原工具。

共享 `LumenAppShell` 新契约是 opt-in；hbar 生产壳始终传描述。未传 `toolLayout` 的其他旧消费者保留旧行为，不声称整个组件库所有壳都已迁移。没有新增图标尺寸、重复标题／X、Browser 或 Terminal 占位入口。

## 验证记录

最终生产资源为 **`index-CnyYjy-U.js` / `index-BjMvxqM0.css`**，3058 modules，根 Web 构建 2.30 秒，Host resources 构建成功。现有大 bundle 提示仍在；这不是重新构建桌面 exe。

- 定稿后的新单元及既有 persistence/app-react 回归：**64 pass / 0 fail / 371 assertions，6 文件，22.15 秒**。覆盖几何、字体/zoom、无测量、V1/V2 迁移、容量/非法宽度、CAS 冲突/重试、中英保存反馈、原焦点/过期所有权、modal/侧栏、分隔条和无 resize 的命令面板返回。不是只检查 class 名。
- 维护入口 `e2e/workbench-navigation-presentation.spec.ts` 最终 **6/6 通过，49.0 秒**：en/zh × 1440/1280/1279/900/390/320 × 四工具的 48 个状态；每状态 24 步 Tab、pointer Close、草稿保留及无整页横溢；键盘/鼠标调宽与 reload 恢复；真实 Files dirty/path/material 经 Settings、Status、palette、Expand、Back 后仍保留，只有明确 Save 才写原文件；真实 local-fixture Run 的原审批、Stop 和 native 关闭确认框三条跨尺寸返回链。输出 `artifacts/workbench-navigation-presentation/final-confirmed-results/`，当前截图/观察在 `final/`。未调用商业 provider，审批中的 `write_file` 未批准执行。
- 既有五个 suite 首次21/22通过，唯一失败在 `file-workbench-tabs.spec.ts:36` 的启动准备：`isVisible(Expand)` 后，项目自动展开，随后 click 永久等待已经变为 Collapse 的旧 locator；实际尚未进入任何工具／文件操作。Git 历史与 `c6c2e784` 原始差异证实此检查后点击自测试创建时就存在。单项重跑1/1、原整文件再跑3/4仍复现同竞态后，只把这四行准备改成等待实际具名 OpenSession 行并点击，保留全部草稿／文件／tab／焦点断言。修正后的整文件 **4/4通过，13.6秒**，不是通过重试偶然绿来宣布解决。
- 相同冻结资源上的最终五个旧 suite **22/22通过，1.2分钟**：Files 阅读2、Files 工作台4、workspace tabs4、settings context2、session execution access10。结果在 `artifacts/workbench-navigation-presentation/final-existing-regression-results/`，前面的21/22与3/4红记录均保留。新矩阵有62张最终PNG与观察JSON，主线和导航 agent 已检查宽/窄、长路径、dirty编辑、展开与原生确认框代表画面。临时45065/45067端口已释放。
- 共享受控 Edge DOM：en/zh 同 DOM 草稿、900 侧栏开关、root font 20/16、键盘/指针调宽、取消零保存、pending 重复零额外保存、失败回 props、disabled 零保存、sidebarOpen + native dialog →320 的可见和 12 步 Tab、缺 RO 降级均通过，pageerror 为空。证据在 `artifacts/workbench-tool-layout/evidence/`，此层没有 Host 或文件业务。
- 实际 `HbarWorkspaceShell` + focus hook + StrictMode 隔离 UI 中英2/2再次通过，包含 native dialog 取消、窄侧栏和命令面板无 resize 返回；`artifacts/workbench-navigation-followup/focus-probe-results.json` 明确标注 `host:false` / `syntheticTool:true`，不代替上一项真实 Host 验收。
- 根定向严格 lint、类型检查、宿主 TSX content/icon 与 CSS flow guards 已通过。早先 typecheck 曾遇到共享/根 React Ref cleanup 品牌类型不一致和并行 authentication 的两个 exactOptional 错误；前者由本单元通过公开 ref 类型与 void cleanup 修复，后者由其原任务独立修复，未夹带。
- 共享组件直接 TS、声明和 Vite 构建通过；标准 `pnpm typescript`、`pnpm proptypes`、`pnpm docs:api` 均在 packageManager 检查被预期 12.3.4 / 当前 11.19.0 阻断。没有安装全局工具、绕过并声称这些标准命令通过，亦没有生成未经验证的 API 文档。

真实 Windows 原生最终使用已有 debug launcher 加上述新 Host/Web 资源。中英 × 900×600/1440×960 的16个工具案例、2条 Files 草稿/展开/Back/持久宽度链、6条 palette 返回链全部通过，40张PNG存在，`passed:true` / `errors:[]`。没有提交 Run、隐式保存文件或调用商业 provider。证据：[完整验证](../artifacts/workbench-navigation-followup/native/hbar-native-session-workbench-layout-pWYzO9/verification.json)、[中文900工具页](../artifacts/workbench-navigation-followup/native/hbar-native-session-workbench-layout-pWYzO9/files-sidebar-page-zh-CN-900.png)、[英文1440命令面板返回](../artifacts/workbench-navigation-followup/native/hbar-native-session-workbench-layout-pWYzO9/files-palette-return-en-US-1440-split.png)、[清理](../artifacts/workbench-navigation-followup/native/hbar-native-session-workbench-layout-pWYzO9/cleanup.json)。900-sidebar-page 指 Ctrl+K 前验证为 page；命令面板打开会按既有策略折起侧栏，返回已为 split，不宣称整个链侧栏始终展开。原生没有320窗口，320证据来自真实 Host 浏览器与隔离 Edge。

原生 owned desktop26608 / supervisor18060 / Host18392 已双重复核退出，9443释放，本轮两个临时目录已删除；旧受保护进程9572/48668未触碰。此前 native 首轮因 sidebar click 的测试 TOCTOU 失败，已按实际目标状态修正 helper，失败证据保留，不把它当产品错误。

开发中保留了真实分隔条焦点、modal 侧栏和 palette BODY 红测，修复后按新资产重跑。测试自身的多同名 status/Cancel/region、搜索控件角色、900已处于1023px以下却预期跨断点，以及 Settings 已卸载来源却仍要求原触发点等错误也分别修正；没有 force click、手动补产品焦点、删掉原稿或弱化归属断言。

**冻结产品后的完整 `bun run check` 最终 exit0**：原生工具构建、根严格 lint、根 typecheck 全部通过，完整 Bun **1976 pass / 0 fail / 14587 assertions，348 文件，249.92 秒**；日志 `artifacts/workbench-navigation-presentation/final-frozen-check.log`。这是上述 Cny 资源源代码的检查，不拿早期1972/1972或开发时测试进程已加载旧 owner、随后新测试落盘导致的1/2项红测替代定稿结果。并行 Authentication 的早先 lint/type 错误由其原任务修复并独立提交，本单元未改其文件。

完整门禁结束后仅调整上述旧 E2E 的启动定位并整理文档，未再改产品／Bun 单元测试；两个 E2E 文件额外严格 lint、格式和根 typecheck 再次通过，其后执行最终浏览器回归。

共享实现已独立提交 `7c3ed8f962`，仅六个工具布局路径；并行 Authentication 自有提交 `31f10ea2ba` 是其父提交，不包含在本单元的文件差异里。

## 仍然不算完成的内容

本单元没有改会话间工具显隐策略、文件多预览标签、内嵌 Browser / PTY、安全契约、Host 名单全局增量或通用 desktop smoke。上层 Goal 仍 active：每个入口和跨版面逻辑继续按参考证据、真实公共能力、独立验证及提交推进。完整仓库存在其他任务的未提交改动，交付提交只包含本单元明确路径。
