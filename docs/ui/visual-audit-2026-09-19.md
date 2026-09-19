# 2026-09-19：组件现状审计与 Prompt 修复

上级：[UI 总计划](index.md)。对应 R0.1、R1.2a。此记录区分已验证修复和待实施的整页重设计。

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

| ID    | 证据/发现                                      | 影响                             | 归属任务       |
| ----- | ---------------------------------------------- | -------------------------------- | -------------- |
| UI-01 | 当前生产截图竖排五个大工具按钮                 | 抢占横向空间，导航层级不清       | R2.3/R4.1      |
| UI-02 | Usage 大标题、大卡片和空白图表区域             | 输入区/统计挤压消息              | R1.5/R3.4      |
| UI-03 | 窄屏外壳把侧栏和底部按钮叠在内容上方           | 首屏有效信息少                   | R2.6           |
| UI-04 | 单 focusedPanelId 决定整个主页面               | 工具替换聊天，返回上下文不完整   | R2.1/R2.2      |
| UI-05 | Provider/Schema 表单仍使用原生控件，编辑占整页 | 视觉不统一，缺少真正父子弹窗关系 | R1.3/R5.1–R5.3 |
| UI-06 | 文件行灰色原生按钮及重复标题                   | 与组件库其他控件不一致           | R1.5/R4.2      |
| UI-07 | 命令目录占整页并突出 raw JSON                  | 任务上下文中断，结果难扫描       | R5.8           |
| UI-08 | Web 入口与 document.css 固定 dark              | 主题能力与组件预览不一致         | R1.1           |
| UI-09 | 多个 Shell/目录变体/受控组件并存               | 易再次选错实现或叠加壳           | R0.2/R2.3/R6.2 |

UI-01–09 是待办，不因 Prompt 的修复或全库检查通过而关闭。后续每个修复增加自己的证据与 commit，避免把“已规划”写成“已实现”。
