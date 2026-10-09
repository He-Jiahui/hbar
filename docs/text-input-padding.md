# 文本输入间距审计

审计日期：2026-10-09。覆盖当前 Web/Desktop 共用的业务输入界面。

## 结果与间距契约

静态扫描 196 个 TSX 文件，发现 98 处文本输入声明，分布在 48 个文件中。当前业务使用的 79 处声明通过 Lumen 输入和组合框契约获得统一留白；其余 19 处来自未挂载的旧业务适配或未注册的原生 Schema 回退渲染器。声明数量不是运行时实例数量：Schema 字段、列表行和编辑器由宿主数据生成。

聊天 CodeMirror 编辑区不以 JSX input/textarea 声明生成，单独核对为已符合四周 12px；其光标、提及、输入法与草稿绑定保持原有实现。

| 控件               |   上下 padding |    左右 padding |
| ------------------ | -------------: | --------------: |
| 单行 s             |  0.25rem / 4px | 0.625rem / 10px |
| 单行 m             | 0.375rem / 6px |  0.75rem / 12px |
| 单行 l             |   0.5rem / 8px | 0.875rem / 14px |
| 聊天与多行文本     | 0.75rem / 12px |  0.75rem / 12px |
| 设置表单 slot 内容 | 0.75rem / 12px |  0.75rem / 12px |

像素值以默认 16px 根字号换算。共享 `--lumen-input-padding-block` 与 `--lumen-input-padding-inline` 与按钮间距独立；全局 s/m/l 和控件显式 size 都生效。所有文本控件使用 border-box。数字、密码、搜索和只读字段仍使用原有输入、校验与可访问契约。

## 已修正的覆盖规则

- 共享设置表单：slot 的 main 增加四周 12px，标题、说明、继承来源、错误及控件一起内缩。此前数据库“聊天保留天数”标题距外框仅 1px，1440px 与 320px 均可复现；修正后距内侧边界至少 12px。
- 聊天搜索：移除零 padding，消费单行输入间距。
- 聊天模型搜索与新聊天选项搜索：编辑区保留分档 padding，前缀图标到文字的距离只由编辑区内边距承担；外框保留图标侧留白并统一承担焦点描边，避免局部输入描边压到前缀图标，清除按钮保持原有焦点行为。原零间距规则可追溯到 `05ca9828`。
- 新聊天编辑器：去除 workbench 的 4px 覆盖，恢复四周 12px。
- 提议计划与退出计划反馈：从上下 10px 统一为 12px。
- 自定义回答：多行文本继承 12px，私密单行字段继承 s/m/l，移除把两者混用的 10px/12px 覆盖。

## 完整声明清单

“已修正（共享）”表示该业务入口消费本次共享间距；“已修正（共享及业务）”同时修正了所属业务覆盖；“未在当前业务使用”表示核对生产入口后没有挂载，保持其原有代码和其他任务改动。

| 声明文件                                                                                                                        | 数量 | 状态                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ---: | -------------------- |
| [apps/web/src/AppearanceSettings.tsx](../apps/web/src/AppearanceSettings.tsx)                                                   |    1 | 已修正（共享）       |
| [apps/web/src/DescriptorSettingsForm.tsx](../apps/web/src/DescriptorSettingsForm.tsx)                                           |    2 | 未在当前业务使用     |
| [apps/web/src/FileNavigation.tsx](../apps/web/src/FileNavigation.tsx)                                                           |    1 | 未在当前业务使用     |
| [apps/web/src/GitContextSwitcher.tsx](../apps/web/src/GitContextSwitcher.tsx)                                                   |    1 | 未在当前业务使用     |
| [apps/web/src/GitPanel.tsx](../apps/web/src/GitPanel.tsx)                                                                       |    1 | 未在当前业务使用     |
| [apps/web/src/PairingPage.tsx](../apps/web/src/PairingPage.tsx)                                                                 |    2 | 未在当前业务使用     |
| [apps/web/src/PluginRow.tsx](../apps/web/src/PluginRow.tsx)                                                                     |    2 | 未在当前业务使用     |
| [apps/web/src/PreSessionLanding.tsx](../apps/web/src/PreSessionLanding.tsx)                                                     |    1 | 已修正（共享）       |
| [apps/web/src/prompt-templates-page.tsx](../apps/web/src/prompt-templates-page.tsx)                                             |    5 | 已修正（共享）       |
| [apps/web/src/react-bits/components/ActivitySurface.tsx](../apps/web/src/react-bits/components/ActivitySurface.tsx)             |    1 | 未在当前业务使用     |
| [apps/web/src/react-bits/components/ModelPickerSurface.tsx](../apps/web/src/react-bits/components/ModelPickerSurface.tsx)       |    1 | 未在当前业务使用     |
| [apps/web/src/react-bits/components/PromptInputSurface.tsx](../apps/web/src/react-bits/components/PromptInputSurface.tsx)       |    1 | 未在当前业务使用     |
| [apps/web/src/react-bits/components/SessionSidebarSurface.tsx](../apps/web/src/react-bits/components/SessionSidebarSurface.tsx) |    2 | 未在当前业务使用     |
| [apps/web/src/react-bits/components/UserInputSurface.tsx](../apps/web/src/react-bits/components/UserInputSurface.tsx)           |    2 | 未在当前业务使用     |
| [apps/web/src/schedules-page.tsx](../apps/web/src/schedules-page.tsx)                                                           |    6 | 已修正（共享）       |
| [packages/app-react/src/agent-model-picker.tsx](../packages/app-react/src/agent-model-picker.tsx)                               |    1 | 已修正（共享）       |
| [packages/app-react/src/agent-policy-editor.tsx](../packages/app-react/src/agent-policy-editor.tsx)                             |    1 | 已修正（共享）       |
| [packages/app-react/src/chat-search-view.tsx](../packages/app-react/src/chat-search-view.tsx)                                   |    1 | 已修正（共享及业务） |
| [packages/app-react/src/command-palette.tsx](../packages/app-react/src/command-palette.tsx)                                     |    4 | 已修正（共享）       |
| [packages/app-react/src/composer-model-picker.tsx](../packages/app-react/src/composer-model-picker.tsx)                         |    1 | 已修正（共享及业务） |
| [packages/app-react/src/deleted-session-workspace.tsx](../packages/app-react/src/deleted-session-workspace.tsx)                 |    1 | 已修正（共享）       |
| [packages/app-react/src/extension-workspace.tsx](../packages/app-react/src/extension-workspace.tsx)                             |    1 | 已修正（共享）       |
| [packages/app-react/src/file-context-surfaces.tsx](../packages/app-react/src/file-context-surfaces.tsx)                         |    1 | 已修正（共享）       |
| [packages/app-react/src/file-workspace-changes.tsx](../packages/app-react/src/file-workspace-changes.tsx)                       |    1 | 已修正（共享）       |
| [packages/app-react/src/file-workspace-tree.tsx](../packages/app-react/src/file-workspace-tree.tsx)                             |    1 | 已修正（共享）       |
| [packages/app-react/src/goal-plan-workspace.tsx](../packages/app-react/src/goal-plan-workspace.tsx)                             |    2 | 已修正（共享）       |
| [packages/app-react/src/lumen-agent-workspace.tsx](../packages/app-react/src/lumen-agent-workspace.tsx)                         |    3 | 已修正（共享）       |
| [packages/app-react/src/lumen-file-workspace.tsx](../packages/app-react/src/lumen-file-workspace.tsx)                           |    1 | 已修正（共享）       |
| [packages/app-react/src/lumen-provider-editor.tsx](../packages/app-react/src/lumen-provider-editor.tsx)                         |   11 | 已修正（共享）       |
| [packages/app-react/src/lumen-schema-components.tsx](../packages/app-react/src/lumen-schema-components.tsx)                     |    4 | 已修正（共享）       |
| [packages/app-react/src/lumen-workspace-shell.tsx](../packages/app-react/src/lumen-workspace-shell.tsx)                         |    1 | 已修正（共享）       |
| [packages/app-react/src/onboarding-readiness.tsx](../packages/app-react/src/onboarding-readiness.tsx)                           |    1 | 已修正（共享）       |
| [packages/app-react/src/plan-exit-decision.tsx](../packages/app-react/src/plan-exit-decision.tsx)                               |    1 | 已修正（共享及业务） |
| [packages/app-react/src/pre-session-choice-picker.tsx](../packages/app-react/src/pre-session-choice-picker.tsx)                 |    1 | 已修正（共享及业务） |
| [packages/app-react/src/pre-session-location-picker.tsx](../packages/app-react/src/pre-session-location-picker.tsx)             |    2 | 已修正（共享）       |
| [packages/app-react/src/pre-session-slash-editor.tsx](../packages/app-react/src/pre-session-slash-editor.tsx)                   |    1 | 已修正（共享及业务） |
| [packages/app-react/src/prompt-template-editor.tsx](../packages/app-react/src/prompt-template-editor.tsx)                       |    2 | 已修正（共享）       |
| [packages/app-react/src/proposed-plan.tsx](../packages/app-react/src/proposed-plan.tsx)                                         |    1 | 已修正（共享及业务） |
| [packages/app-react/src/queued-user-runs.tsx](../packages/app-react/src/queued-user-runs.tsx)                                   |    1 | 已修正（共享）       |
| [packages/app-react/src/sandbox-profile-settings.tsx](../packages/app-react/src/sandbox-profile-settings.tsx)                   |    8 | 已修正（共享）       |
| [packages/app-react/src/session-branch-target-control.tsx](../packages/app-react/src/session-branch-target-control.tsx)         |    2 | 已修正（共享）       |
| [packages/app-react/src/session-find-view.tsx](../packages/app-react/src/session-find-view.tsx)                                 |    1 | 已修正（共享）       |
| [packages/app-react/src/session-interactions.tsx](../packages/app-react/src/session-interactions.tsx)                           |    2 | 已修正（共享及业务） |
| [packages/app-react/src/session-navigation-row.tsx](../packages/app-react/src/session-navigation-row.tsx)                       |    2 | 已修正（共享）       |
| [packages/app-react/src/skill-import-panel.tsx](../packages/app-react/src/skill-import-panel.tsx)                               |    1 | 已修正（共享）       |
| [packages/app-react/src/workspace-display-names.tsx](../packages/app-react/src/workspace-display-names.tsx)                     |    2 | 已修正（共享）       |
| [packages/app-react/src/workspace-folders.tsx](../packages/app-react/src/workspace-folders.tsx)                                 |    3 | 已修正（共享）       |
| [packages/schema-react/src/standard.tsx](../packages/schema-react/src/standard.tsx)                                             |    3 | 未在当前业务使用     |

## 验证与边界

- 共享控件浏览器矩阵：浅色/深色 × s/m/l × 1440/768/320，共 18 个场景；检查空值、placeholder、长中文/路径、数字、密码、禁用、只读、错误、显式尺寸和按钮零间距作用域。
- 实际业务组件矩阵：两种主题和三档尺寸的 6 个用例，每个用例检查三种宽度。渲染真实聊天搜索、新聊天编辑器、模型选择窗口、计划反馈、普通与私密回答，验证留白、清除、焦点恢复和多行输入。
- 真实临时 Host：中英文数据库设置检查两种主题与三种宽度；新聊天与当前聊天模型搜索、聊天编辑区和聊天搜索验证清除、焦点恢复、换行、跨宽度草稿保留以及图标到文字的 12px 距离。检查聊天光标和选区可见，光标到内容边界至少 12px；重命名覆盖桌面 Escape 取消、窄屏草稿保留、按钮取消及提交后的树行焦点恢复。所有数据来自临时测试目录及本地 fixture 模型。
- 本次新增 28 个浏览器用例通过（共享 18、业务 6、真实 Host 4）；另复用并通过 4 个现有用例（中英文新聊天模型选择，以及包含输入法合成事件、滚动和提交的聊天提及用例）。相关 Bun 单元与组件测试共 27 个通过。
- 旧 `session-rename.spec.ts` 的英文用例在第 98 行失败，仍断言 `.hbar-app-react-session-target` 获得焦点。`b414d9fa` 已将树模式的该节点改为内容 div，焦点归还 `role="treeitem"`；本次真实 Host 用例按当前树行契约验证取消与保存成功。保留此已有用例失败记录，不将其报告为通过。
- 隐藏的下拉校验 input、文件选择器、复选框、单选框、滑块及只读代码展示不计入可见文本框。设计参考预览中的独立变体不在本次整改范围。
- 整改只修改共享样式和业务覆盖，保持宿主文案、状态、事件、ref、校验和持久化契约。没有新增配置项或数据迁移。
- 本次范围的严格 TypeScript、ESLint、格式、内容/图标/流式布局规范、48 条清单链接与 Web 生产构建通过。期间并行资源模块改动曾导致两处依赖类型错误；最新范围检查已通过。全仓类型检查仍有 CLI PluginInfo、旧模块引用与旧测试夹具等已有错误，不能据此声称全仓门禁通过。
- Lumen 包使用已安装的 TypeScript 检查并通过，由主仓 Web 构建实际消费。当前 pnpm 启动器为 11.19，子模块要求 12.3.4，未额外安装或宣称 pnpm 包级门禁通过；本次未运行原生 Desktop 打包。

截图与详细运行输出位于忽略目录 `artifacts/text-input-padding/` 和 `.dev/text-input-padding/`。
