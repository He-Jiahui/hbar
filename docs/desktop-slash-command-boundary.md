# Composer 斜杠入口：行为矩阵与公开能力边界

2026-09-25 只读审计；本文件是下一独立 UI 子功能的约束，不表示 hbar 已有斜杠菜单。cc-haha 为参考项目，hbar 为待迁移项目。导航 `@` 提及由另一子功能负责；此处不修改任何 composer 代码或执行协议。

## 参考实际语义

cc-haha `desktop/src/components/chat/composerUtils.ts:44-73,91-118,157-175,237-254,338-370` 区分静态 fallback、会话发现命令、技能与 Agent，并仅在空白后的 `/` token 中触发搜索。`desktop/src/components/chat/ChatInput.tsx:534-553,566-631,891-926` 与 `SlashCommandMenu.tsx:77-197` 实现输入过滤、系统/技能分组、上下选择、Tab/Enter 补全与 Escape；选择一项一般**只是替换草稿 token**，不自动执行。完整精确命中时 Enter 可以按发送配置提交。最终 `ChatInput.tsx:706-739,836-850` 仅拦截已知桌面 UI 动作；其余连同参数作为普通消息发送给参考 Agent/CLI，不可据此推定 hbar Host 解析同样的 `/` 命令。

| 参考输入类型 | cc-haha 点击/发送结果 | hbar 已有真实事实源 | 迁移判断 |
| --- | --- | --- | --- |
| `/mcp`、`/skills`、`/save-workflow`、`/help`、`/status`、`/cost`、`/context` | 发送后打开本地 panel，不发普通消息（`composerUtils.ts:44-52,237-254`; `ChatInput.tsx:710-717`; `LocalSlashCommandPanel.tsx:1050-1066`）。 | `skill.list` 仅提供全局技能 `id/path/scope`；Host catalog 可列已声明 palette surface 的命令；会话用量等为不同契约。 | 只可为有真实读数的局部 panel 单独接线。不可把 `/save-workflow`、CLI 费用/上下文/MCP 详情视为已同等可用，也不可用空 panel 冒充功能。 |
| `/config`、`/plugin`、`/memory`、`/doctor`，别名 `/settings`、`/plugins` | 发送后打开对应设置页并清 composer 草稿（`composerUtils.ts:54-64,237-247`; `ChatInput.tsx:719-727`）。 | hbar 有设置/扩展工作区、`system.diagnose` 公开查询（`packages/contracts/src/commands/system.ts:78`）。 | 仅存在真实目的页时可本地导航；注意原会话/草稿目标、键盘返回与权限作用域。`/doctor` 不等于一键修复。项目记忆页尚需单独证实，不从 cc 名称推断。 |
| `/model` | 发送后打开参考模型选择并清输入（`composerUtils.ts:249-251`; `ChatInput.tsx:729-736`）。 | hbar 已有 composer 的模型选择状态和 typed 命令。 | 可复用既有 picker 入口，但先分辨补全（草稿）和确认（本地动作），不能在菜单点击时静默改模型。 |
| `/goal`、`/compact`、`/clear`、`/review`、`/commit`、`/pr`、`/init`、`/login`、`/logout`、`/vim` 等 fallback；以及动态 Agent/技能命令 | 未命中桌面拦截器时，整个文本交给参考 Agent/CLI（`composerUtils.ts:91-118,185-211`; `ChatInput.tsx:740-850`）。是否成功取决于参考 CLI。 | hbar 的 Goal/Run/Git 等各有独立公开命令，且 `skill.list` 没有 `skill.invoke`；普通 `run.submit` 输入是会话文本。 | **不能**把名称直接列成可执行的 hbar slash 命令，也不能让菜单补全误承诺 CLI 工作流。若只插入文本，须诚实说明只是普通消息，不能声称会执行 `/compact` 等。Goal 若走本地动作，需另立与 cc 相应的参数/确认语义。 |
| 未知 `/anything` 或在正文中的 `/token` | 有效触发范围中无匹配时按普通输入保留；非 token 位置不抢键盘。 | hbar 的普通草稿/Run 保留原文本能力。 | 不丢用户文本；`@` 提及、IME、换行和命令筛选互不抢夺；未识别内容不能自动调用 `command.execute`。 |

## 可复用的发现与执行契约，不等同于 slash 语法

- `packages/contracts/src/index.ts:948-960` 的 `command.catalog` 是分页发现；`packages/client/src/command-catalog.ts:4-29` 负责 Host 描述符的版本、幂等和执行；`packages/app-runtime/src/command-palette.ts:32,85-101,148-168,233-280,365-415` 已实现搜索、按 `surfaces:['palette']` 过滤、容量上限 1,000、typed 参数表单、可用性及未知结果状态。这套元数据可作为**真实可用桌面动作**的目录与安全路由依据，不应让 composer 将任意 palette command 直接插成 Agent 文本或绕过表单执行。
- `packages/contracts/src/commands/extensions.ts:56-60,132-139` 的 `skill.list` 只保证全局 `id/path/scope`，既没有项目/插件来源与描述，也没有技能独立执行命令。`packages/app-runtime/src/extension-workspace.ts:99-119` 已在扩展页读取它。若未来要展示可调用技能，需新的公开可调用性/作用域契约，不能靠文件路径或插件私有对象推断。
- cc-haha 的 fallback 命令（`composerUtils.ts:91-118`）混合了本地 UI、参考 CLI 原生命令和可能需多步流程的动作；照抄列表是虚假能力。`command.catalog` 公开的 `system.diagnose`、`goal.*`、`plugin.*` 等属于 hbar 自己的 Host 命令，不自动获得 `/doctor`、`/goal`、`/plugin` 的聊天语义。

## 下一独立子功能的可检验最小范围（建议）

先做搜索/补全的草稿交互以及少量已有真实本地入口（例如模型选择、设置已有页、只读诊断）；定义 typed 条目 `id/kind/label/description/availability/submitBehavior`，由宿主给中英文案和真实 catalog 数据。点击只插入或明确打开相应 UI；发送本地动作前按原草稿、附件、会话、焦点和取消边界确认，未知文本仍正常提交。用中英、长标签、320/1440、键盘上下/Tab/Enter/Escape、IME、`@` 混用、跨会话草稿与 Host 失败测试区分「补全」和「执行」。任何新增 `/goal` 等写操作均为后续独立契约/测试子功能，不混在菜单视觉提交内。
