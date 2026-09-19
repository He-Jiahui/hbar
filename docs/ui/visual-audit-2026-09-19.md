# 2026-09-19：组件现状审计、Prompt 与表单控件修复

上级：[UI 总计划](index.md)。对应 R0.1、R1.2a、R1.3。此记录区分已验证修复和待实施的整页重设计。

## 1. 环境与证据范围

- 初始代码 HEAD：`de1cb95`；组件库已有大量用户未提交修改，已保留。
- 本轮代码修复：`8408735`，仅包含 Composer.css、独立生产组件预览、fixture、视觉脚本与生产 E2E 截图断言。
- 本轮浏览器：本地 Chrome headless 组件审核、Playwright Web E2E；没有使用真实付费模型。
- 独立输入组件：中英文×浅深色×1440/1024/390/320，共 16 个常规组合；另有附件、长输入、错误、运行和禁用 5 个场景。
- 修复前后各 21 张截图和几何报告，另有真实 Host fixture 生产会话截图。本轮没有执行新的 Tauri 实窗审核，也没有采集 cc-haha 当前运行版本。

此前已看的 cc-haha 产品图来自其仓库 `docs/images/app/zh-CN`，相关图片提交 `107bfc86`（2026-07-31）。这些参考用于确定空间和层级，不冒充本轮实时浏览器截图。

## 2. 已复现问题与根因

**症状：** 独立生产入口的深色 Prompt 出现白色原生 textarea；文字使用默认 monospace；添加附件按钮约 30×23 CSS px，发送约 32×25。其他模型按钮已有组件样式，造成同一工具行风格和尺寸不一致。

**证据：** `before/report.json` 记录 textarea 背景 `rgb(255, 255, 255)`、边框 `1px`、字体 `monospace`。截图直接展示白色输入区及灰色原生按钮。

**历史：** `4c0465f` 引入受控 Composer 的布局样式，但没有提供完整控件外观；旧工作台仍可能提供补充规则。`6ec3b46` 替换旧外壳后，这种样式依赖暴露。已证实的是组件独立样式不完整；历史正常截图不足，不能把全部 UI 问题都归因于单个提交。

## 3. 修复与二次看图

- 输入框显式使用主题文字、透明背景、继承字体和无内层原生边框；保留清晰键盘焦点。
- 输入、按钮和附件采用 scoped box-sizing；长输入有最大高度和内部滚动。
- 发送、停止、附件、移除按钮使用一致最小 `2.25rem` 点击区域；发送强调色与停止危险色分开。
- 工具行按正常 flex 流换行；长模型标签可换行，附件名称省略并保留完整 title；移除按钮不被挤走。
- 错误在输入附近显示，主题/禁用状态保持可读。

第一轮截图中发送/停止仍丢失强调背景。人工检查后发现共同 `:is(...)` 选择器含 `.attachment-chip button`，导致 specificity 高于独立 tone 规则。已改用低优先级共同规则，并补“主操作背景不能透明”的回归断言。此问题说明几何和行为通过仍不足以完成视觉验收。

## 4. 本地截图入口

图片属于忽略的 artifacts，当前工作区可打开；全新 clone 需要运行脚本生成 after。before 需保留证据或在隔离历史版本重建。

快速查看：[窄屏修复前后对照](../../artifacts/ui-redesign/prompt/comparison.png)、[21 场景截图索引图](../../artifacts/ui-redesign/prompt/after-contact-sheet.png)。索引图用于整体浏览，细节判断仍查看原始截图。

| 证据       | 修复前                                                                             | 修复后                                                                           |
| ---------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 浅色桌面   | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-light-1440.png)           | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-light-1440.png)           |
| 深色窄屏   | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-dark-320.png)             | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-dark-320.png)             |
| 附件长名称 | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-dark-320-attachments.png) | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-dark-320-attachments.png) |
| 运行/停止  | [before](../../artifacts/ui-redesign/prompt/before/zh-CN-dark-320-running.png)     | [after](../../artifacts/ui-redesign/prompt/after/zh-CN-dark-320-running.png)     |

[生产会话完整截图](../../artifacts/ui-redesign/prompt/production-session.png)证明修复已进入真实生产组合，同时仍显示旧外壳、竖排工具按钮和大块 Usage；不能将这张图描述为重设计完成。

## 5. 验证结果

| 检查                                       | 实际结果                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `bun scripts/verify-hbar-app-ui-prompt.ts` | 21 场景通过；0 pageerror；溢出、点击区域、输入外观、焦点、IME、发送、停止、附件移除通过 |
| before/after 人工看图                      | 检查浅色桌面、深色窄屏、中英文长标签、附件、错误、运行状态；修正第一轮 tone 问题        |
| flow/content/icon guards                   | 通过本次修改样式与新增预览入口检查                                                      |
| `bun run check`，Node heap 8 GiB           | 通过 lint、typecheck、366 tests、2853 assertions                                        |
| `bun run build`                            | 通过，2387 modules                                                                      |
| `bun run test:e2e`                         | 5 tests 通过；新增生产截图断言后重跑 connected 场景通过                                 |
| Prettier / git diff checks                 | 本次明确文件通过                                                                        |
| Tauri 实窗、cc-haha 实时截图               | 本轮未执行，不计为通过                                                                  |

## 6. 仍待修复的问题账本

| ID    | 证据/发现                                        | 影响                                        | 归属任务       |
| ----- | ------------------------------------------------ | ------------------------------------------- | -------------- |
| UI-01 | 当前生产截图竖排五个大工具按钮                   | 抢占横向空间，导航层级不清                  | R2.3/R4.1      |
| UI-02 | Usage 大标题、大卡片和空白图表区域               | 输入区/统计挤压消息                         | R1.5/R3.4      |
| UI-03 | 窄屏外壳把侧栏和底部按钮叠在内容上方             | 首屏有效信息少                              | R2.6           |
| UI-04 | 单 focusedPanelId 决定整个主页面                 | 工具替换聊天，返回上下文不完整              | R2.1/R2.2      |
| UI-05 | 通用 Schema 设置页面仍使用旧 renderer 和页面结构 | ProviderEditor 已迁移，其余表单视觉仍不统一 | R5.1/R5.3      |
| UI-06 | 文件行灰色原生按钮及重复标题                     | 与组件库其他控件不一致                      | R1.5/R4.2      |
| UI-07 | 命令目录占整页并突出 raw JSON                    | 任务上下文中断，结果难扫描                  | R5.8           |
| UI-08 | Web 入口与 document.css 固定 dark                | 主题能力与组件预览不一致                    | R1.1           |
| UI-09 | 多个 Shell/目录变体/受控组件并存                 | 易再次选错实现或叠加壳                      | R0.2/R2.3/R6.2 |

UI-01–09 是待办，不因 Prompt 的修复或全库检查通过而关闭。后续每个修复增加自己的证据与 commit，避免把“已规划”写成“已实现”。

## 7. R1.3 表单控件视觉与交互验证

`hbar-app-ui` 生产入口已公开受控的 Field、Input、Textarea、Select、CheckBox、ComboBox 和 MultiSelect。字段文案、说明、错误、空态、加载态、选项和移除标签均由宿主提供；Field 通过 context 把说明/错误 ID 和 `aria-invalid` 关联到实际控件。ComboBox 支持宿主控制的查询、展开、动态结果、加载态和分页动作；MultiSelect 保留重复去重后的选择与已失效 ID，允许增删多个思考等级。

独立浏览器入口覆盖中英文、浅深色、1280/390 宽度，以及错误、长文本、禁用、加载和展开列表，共 13 张截图。几何报告中的桌面控件宽度为 319/654 CSS px，窄屏为 332 CSS px；输入和选择控件高度为 37.59–38 CSS px，所有控件均在面板和视口内，无横向溢出，0 pageerror。

第一轮实际交互发现复选框的透明原生输入只有 1px，装饰图标截获点击。最终改为完整 18px 原生 checkbox 直接参与 flex 流，不再叠放透明输入与装饰层；重新执行 13 个截图场景后，复选框点击、ComboBox 键盘检索/选择/关闭、MultiSelect 增删、焦点可见性和禁用状态全部通过。

人工查看了[深色桌面](../../artifacts/ui-redesign/form-controls/zh-CN-dark-1280.png)、[浅色窄屏](../../artifacts/ui-redesign/form-controls/en-US-light-390.png)、[展开列表](../../artifacts/ui-redesign/form-controls/zh-CN-dark-1280-open.png)、错误、长文本和加载截图。字段层级、双列到单列的流式换行、错误就近呈现、多选标签容量和弹层边界符合当前目标。此处只关闭通用控件任务；ProviderDialog、Schema renderer 和设置页面组合仍属于 R5.1–R5.3。

## 8. R5.2 ProviderEditor 结构化页面

本切片将原来的扁平 Schema 表单替换为命令驱动的结构化 ProviderEditor。参考证据包括 cc-haha 的[侧栏布局](../../../cc-haha/img_preview/layout_adj.png)、[模型选择层级](../../../cc-haha/img_preview/models.png)及其设置页与供应商编辑器；复刻目标是紧凑设置页的信息层级、模型选择与详情的父子关系，不复制其具体业务字段或坐标。

修复前的[生产截图](../../artifacts/web-b3/provider-dialog.png)中，供应商配置是单列长表单：模型只有一个扁平 ID，能力和价格与供应商连接字段混排，页面外层还有大圆角卡，无法表达“一个供应商包含多个模型”。新的页面将内容分为连接、凭据、模型列表和所选模型详情；新增供应商先搜索 PI 预设，编辑时可以从相同协议和地址的目录继续增加模型。供应商和模型可分别隐藏，模型可设为默认并维护多选思考等级。所有写操作仍通过 `providerEditor.*` 命令，API Key 不进入只读状态投影。

第一轮截图发现两个实际布局问题：390 宽度时 flex 主区被压缩后允许正文越过固定 footer 绘制；1024 宽度的模型区位于内部滚动区域，首屏截图没有覆盖。修复后由主区独占滚动、header/footer 保持在各自流中，并增加滚动后的模型区截图和主区/footer 几何断言。另一项看图修正是隐藏初始空表单的全量红色校验，只在相关草稿路径被编辑后就近显示错误。

| 场景       | 截图与人工观察                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新增空态   | [1440](../../artifacts/ui-redesign/provider-editor/after/add-desktop-1440.png)：必填标记可见，初始未触碰字段不显示错误，模型空态与自定义入口明确                                                                                     |
| 预设展开   | [1440](../../artifacts/ui-redesign/provider-editor/after/add-preset-open-1440.png)：精确的 OpenAI 结果置顶，长地址截断，弹层未被相邻区域裁切                                                                                         |
| 多模型编辑 | [1440](../../artifacts/ui-redesign/provider-editor/after/desktop-1440.png)：GPT-4 与 GPT-5.4 同时可见；默认模型、价格、能力和多个思考等级可扫描                                                                                      |
| 中等宽度   | [顶部](../../artifacts/ui-redesign/provider-editor/after/tablet-1024.png)、[模型区](../../artifacts/ui-redesign/provider-editor/after/tablet-1024-models.png)：连接/凭据/模型按单列流排列，footer 不覆盖滚动内容                     |
| 窄屏       | [顶部](../../artifacts/ui-redesign/provider-editor/after/mobile-390.png)、[模型区](../../artifacts/ui-redesign/provider-editor/after/mobile-390-models.png)：操作保持可达且无横向溢出；外层侧栏仍占据首屏 40dvh，继续归属 UI-03/R2.6 |
| 删除确认   | [1440](../../artifacts/ui-redesign/provider-editor/after/delete-confirm-1440.png)：使用原生 modal 顶层、明确目标和危险动作；Escape 关闭后焦点恢复到触发按钮                                                                          |

验证结果：17 个定向 Bun 测试与 153 个断言通过；全仓 TypeScript 类型检查通过；本切片 ESLint、flow/content/icon guards、Prettier 与 `git diff --check` 通过；Web production build 通过（2390 modules）；真实 Host 的 connected Playwright 场景通过。E2E 实际执行预设搜索、OpenAI 选择、从目录加入 GPT-5.4、设为默认、保存凭据、三视口滚动和删除确认焦点恢复。截图已逐张人工查看。本切片没有执行 Tauri 实窗，因此不把桌面平台视觉矩阵记为完成。

## 9. R1/R2 AppShell 与工程会话侧栏

本切片用 `hbar-app-ui/workbench` 的公开壳层契约重建应用骨架。AppShell 现在明确拥有 sidebar、header、main、tool 和 overlay 插槽；AppSidebar 只负责品牌区、主操作、独立滚动的工程会话树和底部状态区。`app-react` 读取 `presentation.sidebarOpen`，所有展开/收起、打开命令、状态、设置、扩展和选择会话仍通过公开命令完成。树本身的工程折叠属于局部 UI 状态。

视觉层级参考了 cc-haha 的[侧栏布局](../../../cc-haha/img_preview/layout_adj.png)和 JetBrains 工作台的边界关系。当前实现按本项目计划保留顶部“新建会话”和命令入口，将工程与会话树作为唯一伸缩滚动区，把只读服务状态和管理入口固定在底部。扩展管理暂时保留为较低优先级入口，待设置页面增加正式的扩展分组后迁入设置。

第一轮真实截图验证了旧 UI-03 的根因：旧 CSS 在窄屏把侧栏设为 `40dvh` 并与正文上下堆叠。新壳层在小于 64rem 时把侧栏作为真实抽屉覆盖层，默认显示完整正文；选择会话或导航到页面后自动收起。1024 宽度仍使用桌面侧栏，390 宽度使用 17rem 抽屉和右侧关闭区域。流式布局守卫原来只识别 modal/menu；本切片让守卫按技能文档同时识别 sidebar/tool drawer，并补了自测。

| 场景           | 截图与人工观察                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 离线桌面       | [中文 1440](../../artifacts/ui-redesign/shell/sidebar-zh-CN-1440.png)：主操作、工程树、服务状态和管理入口分区清楚；主页面不再继承壳层大 padding                                                                                     |
| 离线窄屏       | [正文 390](../../artifacts/ui-redesign/shell/content-en-US-390.png)、[抽屉 390](../../artifacts/ui-redesign/shell/drawer-en-US-390.png)：正文首屏完整；抽屉覆盖而不挤压正文，背景点击区可关闭                                       |
| 真实 Host 桌面 | [1440](../../artifacts/ui-redesign/shell/connected-sidebar-1440.png)：工作区、会话、更新时间、选中态和连接状态来自 Host 数据                                                                                                        |
| 真实 Host 中宽 | [1024](../../artifacts/ui-redesign/shell/connected-sidebar-1024.png)：侧栏与主页面保持边界，无横向页面溢出；同时暴露会话工具栏文字竖排，继续归属 UI-01                                                                              |
| 真实 Host 窄屏 | [正文 390](../../artifacts/ui-redesign/shell/connected-content-390.png)、[抽屉 390](../../artifacts/ui-redesign/shell/connected-drawer-390.png)：切换到窄屏自动收起，抽屉中的活动会话和底部入口可达；聊天头部裁切继续归属会话页重构 |

验证结果：全仓 ESLint（Node heap 8 GiB）、TypeScript、375 个 Bun 测试（2931 个断言）、flow/content/icon guards、Prettier 和 Web production build 通过；离线四组合 E2E 与真实 Host connected E2E 共 5 项通过。截图逐张人工查看。UI-03 在 Web 壳层关闭；UI-01、UI-02、UI-04 和各业务页面视觉问题没有因壳层修复而关闭。

## 10. R2 主页面、工具与模态出口

Web 组合根不再用 `focusedPanelId` 串行决定全部可见内容。`presentation.page` 只选择 session/settings/status 主页面，`toolInstanceId` 选择 files/monitoring/agents/goals 工具，`modalInstanceId` 选择 commands/settings-editor。AppShell 的 tool 和 overlay 插槽进入实际组合；工具组件读取明确 instanceId，因此打开命令模态不会让工具误读焦点目标。扩展管理尚未迁入设置 Schema，迁移前通过兼容模态呈现，不再替换会话主页面。

命令目录和供应商编辑器使用 `hbar-app-ui` 原生 `<dialog>` 顶层。组件新增 chromeless 模式，让内部页面保留自己唯一的一套标题和动作，同时由原生 dialog 提供 inert 背景、焦点圈定、Escape 和关闭后焦点恢复。真实交互发现内层删除确认的 `cancel` 会冒泡并关闭外层供应商编辑器；NativeDialog 现已在处理 cancel 后停止传播，重新执行 Escape 后只关闭确认层并把焦点还给“删除供应商”。

| 场景          | 截图与人工观察                                                                                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 命令模态      | [1440](../../artifacts/web-b4/command-palette.png)、[390](../../artifacts/ui-redesign/outlets/command-en-US-390.png)：底层会话保留且 inert，目录和参数区在自身范围滚动；窄屏保持单列                                                                                                          |
| 供应商模态    | [1440](../../artifacts/ui-redesign/provider-editor/after/desktop-1440.png)、[390](../../artifacts/ui-redesign/provider-editor/after/mobile-390.png)：设置页保留在底层，编辑器标题/操作不重复，内层删除确认可独立关闭                                                                          |
| 扩展兼容模态  | [1440](../../artifacts/web-b5/extensions.png)：会话留在底层；插件列表拥有独立滚动范围，待 R5 迁入设置分类                                                                                                                                                                                     |
| 工具并排/抽屉 | [1440](../../artifacts/web-b5/file-manager.png)、[1024](../../artifacts/ui-redesign/outlets/files-1024.png)、[390](../../artifacts/ui-redesign/outlets/files-390.png)：聊天实例持续存在，宽屏并排、中宽右侧抽屉、手机全宽单面板；文件工具内部仍同时挤入列表与编辑器，继续归属 R4 文件工具重构 |

E2E 明确断言工具打开时会话标题仍存在、status 主页面替换会话、命令/供应商/扩展具有 dialog 语义、供应商底层设置页仍存在、关闭后返回原上下文。UI-04 在 Web 组合根关闭；兼容 `focusedPanelId` 只为尚未迁入设置的扩展入口保留，不能新增依赖。

验证结果：全仓 ESLint（Node heap 8 GiB）、TypeScript、376 个 Bun 测试（2938 个断言）、flow/content/icon guards、Prettier 和 Web production build 通过；5 项 Playwright 场景通过。真实 Host E2E 覆盖四类工具切换、三个管理页分区、命令模态、扩展兼容模态、供应商模态和嵌套删除确认的 Escape/焦点恢复。

## 11. R3 会话页、时间线与紧凑用量

会话页现在只保留一个 PageHeader：标题使用 Session 名称，上下文显示工作区，右侧五个图标动作分别通过 `app.openPanel` 或 `app.openSettings` 命令打开文件、监控、子 Agent、目标与计划和 Session 设置。打开中的工具有选中反馈，再次点击同一动作通过 `app.closePanel` 关闭。旧的竖排文字工具栏已经删除；组件为每个图标保留宿主提供的 tooltip 和可访问名称。

`hbar-app-ui` 的 Conversation 新增可组合 header 和 afterMessages 插槽。生产页面隐藏组件的重复标题，但保留 section 的可访问名称；Message、Activity、Approval 和 Questionnaire 进入同一个独立滚动时间线。消息正文与输入区都使用 52rem 上限的阅读列，用户消息使用较窄的弱背景块，助手消息保持全文宽度。原来头像文本和作者文本重复显示成 “You You” 的问题通过 Conversation 自身样式修复。

CompactUsage 新增真正的 `inline` 密度：Session 只显示总 token、剩余预算、预计金额和 token 速率，不再渲染大标题、sparkline、进度条和四项统计卡，也不再由 app-react 的后代选择器隐藏组件内部元素。输入/输出 token 的详细拆分继续位于 Monitoring。运行活动从 composer 上方移入时间线后，composer 只承载提示词输入和最多两行的用量摘要。

| 场景             | 截图与人工观察                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 真实 Host 空会话 | [1440](../../artifacts/ui-redesign/session/after/desktop-1440-empty.png)：单一标题栏、五个横向图标、空态、输入和两行用量没有重复壳层  |
| 真实 Host 有消息 | [1440](../../artifacts/ui-redesign/session/after/desktop-1440.png)：用户/助手消息、Agent activity 和输入区共用阅读列；活动属于时间线  |
| 中等宽度         | [1024](../../artifacts/ui-redesign/session/after/tablet-1024.png)：标题与工具保持一行，旧竖排栏消失，消息与输入未被侧栏挤坏           |
| 窄屏             | [390](../../artifacts/ui-redesign/session/after/mobile-390.png)：应用栏、页面标题、五个图标、消息、活动、输入和两行用量均在视口内     |
| 工具并排         | [1440](../../artifacts/web-b5/file-manager.png)：文件图标选中且 Session 保持可见；同时再次确认 File Manager 内部两列挤压问题属于 R4.2 |

Playwright 除业务闭环外还量化断言：1440、1024、390 三个宽度下五个页面动作必须位于同一水平行且 `writing-mode` 为 horizontal，PageHeader 不得横向溢出，Conversation 时间线与 composer 左右边界误差不超过 1 CSS px，inline Usage 高度不超过 48 CSS px。三档截图均逐张查看；没有用测试通过替代人工看图。

本切片关闭 UI-01 和 UI-02。R3.2 的 Plan 归属、R3.5 的长历史滚动锚点/流式快速切换/断线恢复仍未完成。文件工具在 24rem 抽屉中把列表和编辑器并排导致文件名逐字断行，是当前最明显的生产视觉缺陷，继续归属 R4.2。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；379 个 Bun 测试、2960 个断言通过；Web production build 与 Usage 独立预览验证通过；flow/content/icon guards、Prettier 和 `git diff --check` 通过；Playwright 离线中英文桌面/窄屏与真实 Host connected 场景共 5 项通过。真实场景执行了文件、监控、子 Agent、目标与计划、Session 设置、发送、审批、取消和各页面返回路径。

## 12. R4.2 文件工具列表与详情

真实截图确认旧文件工具的故障不是单个文字换行问题：24rem 抽屉内同时放置最小 14rem 的目录列和编辑器，剩余详情宽度接近一个字符；工具自身又按内容宽度收缩，没有填满 AppShell 的 drawer。旧页面还同时显示外层 “File manager”、组件内 “File manager”和空详情，形成重复标题与无效区域。

文件工具现在使用明确的 `browser/document` 子视图。`fileWorkspace.openEntry` 打开目录时进入 browser、打开文本时进入 document；新增 `fileWorkspace.showBrowser` 只切回列表并保留当前文档草稿。文件读取使用 generation，返回列表后到达的旧读取结果不能重新打开详情。所有切换继续经过命令注册与只读状态投影，React 没有直接改运行时状态。

WorkspaceFiles 的 embedded 形态移除重复标题与路径，文件行使用组件自己的紧凑按钮、语义图标、hover/focus 和省略规则。FileDocument 显示 basename、完整路径 tooltip、返回、刷新、编辑状态和 footer；工具内容明确占满 drawer。未保存时刷新被禁用。保存冲突继续显示编辑器并保留草稿，用户选择“重新加载源文件”后还需在原生 dialog 中确认“丢弃并重新加载”；确认动作捕获原文件路径。非 UTF-8、过大和已删除文件使用宿主本地化原因，不伪装成可编辑文本。

| 场景     | 截图与人工观察                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面列表 | [1440](../../artifacts/ui-redesign/file-tool/after/list-1440.png)：目录与文件使用完整 24rem 工具列，页面标题不重复                                                               |
| 桌面详情 | [1440](../../artifacts/ui-redesign/file-tool/after/document-1440.png)：返回、basename、编辑器和保存状态在同一单面板层级                                                          |
| 中等宽度 | [列表](../../artifacts/ui-redesign/outlets/files-1024.png)、[详情](../../artifacts/ui-redesign/file-tool/after/document-1024.png)：右侧 drawer 被内容完整填充，聊天保留在背景    |
| 窄屏     | [列表](../../artifacts/ui-redesign/outlets/files-390.png)、[详情](../../artifacts/ui-redesign/file-tool/after/document-390.png)：工具占满 390px 单面板，列表和编辑器不会同时出现 |

Playwright 在三档宽度分别断言工具 workspace 与 AppShell drawer 的四条边误差不超过 1 CSS px、没有内部横向溢出，并逐次检查 `data-view` 只能为 browser 或 document。真实 Host 流程打开、编辑、保存、返回列表后再次在 1024/390 打开相同文件；运行时测试验证保存期间的新编辑不会被旧回执覆盖、冲突保留草稿、返回列表不清除草稿。R4.2 关闭；二进制/过大文件由现有 Host 读取错误进入明确不可编辑状态，当前没有虚构二进制预览器。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；379 个 Bun 测试、2968 个断言通过；Web production build、File Manager 独立预览的滚动/窄屏/本地化验证、flow/content/icon guards、Prettier 和 `git diff --check` 通过；5 项 Playwright 场景通过并重新生成、逐张查看以上真实 Host 截图。本节结果取代第 10、11 节中“文件工具内部仍待 R4.2 修复”的旧状态记录。

## 13. R4.3 当前会话 Monitoring

旧 Monitoring 使用通用 MetricStrip 大卡片一次展开 6 项摘要、2 项延迟和 6 项执行指标；24rem 工具中的 unavailable 说明被放大并折成多行，标题和文字关闭按钮也占用大量首屏。数据虽然来自可靠的 Usage 投影，信息层级却让所有数字同时抢占注意力。

`hbar-app-ui/workbench` 现在提供宿主数据驱动的 CompactMetrics 与 BarSeries。前者用普通 flex 流显示标签、值和可选 detail，不包含页面业务文案；后者根据有限数值自行归一化，忽略非有限值并呈现宿主标签。Session Monitoring 默认只展开总 token、费用、速率、运行/尝试、缓存以及 token 时间线；延迟、执行统计和模型用量使用原生 `details` 按需展开。空报告与单项 unavailable 分为长空态和短值，不再把说明句塞入每个指标。

页面标题、说明和图标关闭动作缩成工具头，内容明确占满 drawer。Usage gap 继续以就近状态条显示。组件只读取 `controls.usage`，没有按 Session 推算无法证实的 CPU，也没有创建第二份统计状态。

| 场景       | 截图与人工观察                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面默认态 | [1440](../../artifacts/ui-redesign/monitoring/after/desktop-1440.png)：摘要和 token 时间线位于首屏，三组次级详情保持收起              |
| 桌面展开态 | [1440](../../artifacts/ui-redesign/monitoring/after/desktop-1440-expanded.png)：执行统计在原位置展开，页面继续由一个工具滚动区承载    |
| 中等宽度   | [1024](../../artifacts/ui-redesign/monitoring/after/tablet-1024.png)：24rem drawer 被内容填满，指标保持双列紧凑排列                   |
| 窄屏默认态 | [390](../../artifacts/ui-redesign/monitoring/after/mobile-390.png)：全宽工具没有横向溢出，标题、摘要、时间线和折叠入口均可见          |
| 窄屏展开态 | [390](../../artifacts/ui-redesign/monitoring/after/mobile-390-expanded.png)：执行统计在单列阅读顺序中展开，值与标签没有被压成逐字换行 |

Playwright 在 1440、1024 和 390 三档宽度断言 Monitoring 工作区与 AppShell drawer 四条边对齐且无横向溢出，并读取每个时间桶的真实几何。当前 Host fixture 返回大量零值桶和最后一个非零桶，所以视觉上只有最右侧细柱；实测每桶宽度仍至少 1 CSS px，非零柱高度至少 8 CSS px。这是实际数据分布，不是用假数据填充的图形，也不是 CSS 收缩故障。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；380 个 Bun 测试、2980 个断言通过；Web production build 通过（2395 modules）；flow/content/icon guards、Prettier 和 `git diff --check` 通过；5 项 Playwright 场景通过。真实场景在三档宽度检查工具边界、溢出与时间桶几何，重新生成并人工查看默认态和展开态截图。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在后续集中验收中补齐。

## 14. R4.4 子 Agent 列表、创建与详情

旧页面在 24rem 工具列中永久并排创建表单和 Agent 列表，两侧还分别设置最小宽度。真实截图中列表只剩几个字符宽，任务目标、模型和操作被逐字竖排；大标题、说明、刷新和关闭文字按钮又挤占首屏。这个故障与 R4.2 文件工具相同，根因是把桌面双栏结构直接塞入狭窄工具区，而不是缺少单个换行样式。

Agent 工具现在由 `agentWorkspace.showList`、`agentWorkspace.showCreate` 和 `agentWorkspace.showAgent` 持有 `list/create/detail` 子视图及明确的 `selectedAgentId`。默认只显示可扫描列表；创建表单和单个 Agent 详情各自独占工具宽度。创建成功后使用 Host 返回的 `agentId` 进入详情，返回列表保留已创建实体；刷新详情时若目标已不存在，则回到列表。React 只读取 Zustand 投影并执行命令，没有用局部 state 复制业务视图或草稿。

创建页复用 `hbar-app-ui/forms` 的 Field、Input、Textarea 和 Select，模型默认值继续来自当前会话配置；任务、标题、模型、Token 预算、思考等级与审批模式仍由原有命令草稿持有。页面明确说明任务与预算属于当前会话下的新子会话。详情复用 CompactMetrics 显示父会话、模型、预算和创建时间；取消绑定当前 `agentId`，打开会话先成功执行 `app.setSession` 再关闭原工具，导航失败时不会先丢失当前上下文。

| 场景       | 截图与人工观察                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面空列表 | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-empty.png)：单一列表视图、紧凑图标动作与居中空态，旧创建栏不再常驻                          |
| 桌面创建   | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-create.png)：表单独占工具宽度，目标、模型和预算没有被第二列挤压                             |
| 桌面详情   | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-detail.png)：创建回执、状态、任务、归属指标、打开会话和取消作用于同一明确 Agent             |
| 桌面列表   | [1440](../../artifacts/ui-redesign/agents/after/desktop-1440-list.png)：返回后任务、状态、模型、预算与时间可在一行组内快速扫描                           |
| 中等宽度   | [1024](../../artifacts/ui-redesign/agents/after/tablet-1024-list.png)：右侧 drawer 被完整填充，列表不会与创建表单重新并排                                |
| 窄屏列表   | [390](../../artifacts/ui-redesign/agents/after/mobile-390-list.png)：全宽工具保留三项图标动作与完整任务摘要，没有横向页面溢出                            |
| 窄屏详情   | [390](../../artifacts/ui-redesign/agents/after/mobile-390-detail.png)：父会话使用可读的“当前会话”，本地化创建时间不再拆出孤立的 AM，两个目标动作保持可达 |
| 窄屏创建   | [390](../../artifacts/ui-redesign/agents/after/mobile-390-create.png)：六个字段和提交动作按单列自然滚动，844px 高度下完整表单可达                        |

Playwright 在 list/create/detail 每次切换后检查只存在一个对应主视图，并在 1440、1024 和 390 三档宽度断言 Agent 工作区与 AppShell drawer 四条边对齐且无横向溢出。真实 Host 流程创建预算为 5,000 tokens 的子 Agent，验证返回详情、返回列表、跨断点重开详情和重开创建表单。截图均来自重新构建的 production preview 并逐张人工查看；第一次视觉回归误读了旧 `dist/web`，在重建后重新执行并用新截图取代，未把旧产物作为结论。

验证结果：全仓 ESLint（Node heap 8 GiB）和 TypeScript 通过；380 个 Bun 测试、2991 个断言通过；Web production build 通过（2395 modules）；flow/content/icon guards、Prettier 和 `git diff --check` 通过；5 项 Playwright 场景通过。真实 Host 场景完成创建、详情、返回列表和跨三档宽度重开子视图，以上八张截图均在最终产物上重新生成并人工查看。本切片没有执行 Tauri 实窗，因此桌面平台视觉矩阵仍需在后续集中验收中补齐。
