# Desktop 元素清单

由 `bun scripts/audit-desktop-elements.ts --write` 从运行时入口、命名延迟加载、barrel 导出和 JSX 生成。完整的元素、槽位、内容来源、可访问名称、动作目标、状态来源和待处理问题见 [类型化清单](desktop-elements.json)。

入口：`apps/web/src/main.tsx`。相关 TSX 模块 146 个；元素 3744 个。实际构建输入核对：passed。

## 类别与展示边界

| 类别        | 元素 | pending | 设计职责                                                                |
| ----------- | ---: | ------: | ----------------------------------------------------------------------- |
| structure   | 1158 |       9 | Lumen flow 容器、区域、页面与工具标题；业务组件拥有区域组合。           |
| text        | 1094 |     302 | LumenContentText 明确用途；具名文案与真实数据由宿主提供。               |
| interaction |  933 |       0 | Lumen 控件与共享浮层；稳定目标、键盘、焦点和就近反馈。                  |
| form        |  279 |       0 | 类型化字段、草稿、校验与保存；Schema 展示由宿主适配。                   |
| collection  |  137 |       0 | 稳定记录、分页／虚拟化与窗格滚动；标题、副文本与元数据各有归属。        |
| technical   |   75 |       0 | 原文、代码、Markdown、图示与媒体的专用 renderer；辅助操作仍使用 Lumen。 |
| feedback    |   61 |       0 | 空、加载、运行、成功、失败、恢复与取消的宿主状态及语义反馈。            |
| platform    |    7 |       4 | Tauri 标题、托盘与通知；操作系统展示，宿主提供文案。                    |

## 按生产模块核对

| 模块                                                                                                                       | 表面                                             | 元素 | 已声明用途文本 | 未分类文本 | 其他待处理 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---: | -------------: | ---------: | ---------: |
| [apps/web/src/App.tsx](../../apps/web/src/App.tsx)                                                                         | workbench / global-pages                         |   82 |              9 |          0 |          0 |
| [apps/web/src/AppearanceSettings.tsx](../../apps/web/src/AppearanceSettings.tsx)                                           | settings                                         |   42 |             11 |          0 |          0 |
| [apps/web/src/GeneralSettings.tsx](../../apps/web/src/GeneralSettings.tsx)                                                 | settings                                         |   63 |             33 |          0 |          0 |
| [apps/web/src/GlobalFeaturePage.tsx](../../apps/web/src/GlobalFeaturePage.tsx)                                             | workbench                                        |    7 |              2 |          0 |          0 |
| [apps/web/src/LanguageApp.tsx](../../apps/web/src/LanguageApp.tsx)                                                         | workbench                                        |    1 |              0 |          0 |          0 |
| [apps/web/src/NotificationDesktopBridge.tsx](../../apps/web/src/NotificationDesktopBridge.tsx)                             | global-pages                                     |    1 |              0 |          1 |          0 |
| [apps/web/src/NotificationPageButton.tsx](../../apps/web/src/NotificationPageButton.tsx)                                   | global-pages                                     |    5 |              0 |          1 |          0 |
| [apps/web/src/PreSessionLanding.tsx](../../apps/web/src/PreSessionLanding.tsx)                                             | session                                          |   36 |              5 |          0 |          1 |
| [apps/web/src/SettingsPageFocusBoundary.tsx](../../apps/web/src/SettingsPageFocusBoundary.tsx)                             | settings                                         |    1 |              0 |          0 |          0 |
| [apps/web/src/SkillImportPanel.tsx](../../apps/web/src/SkillImportPanel.tsx)                                               | workbench                                        |    1 |              0 |          0 |          0 |
| [apps/web/src/StatusUsageFeatures.tsx](../../apps/web/src/StatusUsageFeatures.tsx)                                         | status-and-usage                                 |    1 |              0 |          0 |          0 |
| [apps/web/src/ToolPaneLayoutFeedback.tsx](../../apps/web/src/ToolPaneLayoutFeedback.tsx)                                   | workbench                                        |    3 |              1 |          0 |          0 |
| [apps/web/src/WorkspaceTabsController.tsx](../../apps/web/src/WorkspaceTabsController.tsx)                                 | workbench                                        |   14 |              3 |          0 |          0 |
| [apps/web/src/lazy-surface.tsx](../../apps/web/src/lazy-surface.tsx)                                                       | workbench                                        |    8 |              2 |          0 |          0 |
| [apps/web/src/main.tsx](../../apps/web/src/main.tsx)                                                                       | workbench                                        |    3 |              0 |          0 |          0 |
| [apps/web/src/notifications-page.tsx](../../apps/web/src/notifications-page.tsx)                                           | global-pages                                     |   12 |              0 |          3 |          0 |
| [apps/web/src/onboarding-page.tsx](../../apps/web/src/onboarding-page.tsx)                                                 | global-pages                                     |    4 |              0 |          1 |          0 |
| [apps/web/src/prompt-templates-page.tsx](../../apps/web/src/prompt-templates-page.tsx)                                     | global-pages                                     |   60 |              0 |         17 |          0 |
| [apps/web/src/run-board-page.tsx](../../apps/web/src/run-board-page.tsx)                                                   | agents-and-activity                              |   22 |              0 |         13 |          0 |
| [apps/web/src/schedules-page.tsx](../../apps/web/src/schedules-page.tsx)                                                   | global-pages                                     |   77 |              0 |         16 |          0 |
| [packages/app-react/src/action-icon-button.tsx](../../packages/app-react/src/action-icon-button.tsx)                       | workbench                                        |    2 |              0 |          0 |          0 |
| [packages/app-react/src/activity-agents-view.tsx](../../packages/app-react/src/activity-agents-view.tsx)                   | agents-and-activity                              |   19 |              0 |          8 |          0 |
| [packages/app-react/src/activity-tasks-view.tsx](../../packages/app-react/src/activity-tasks-view.tsx)                     | agents-and-activity                              |   14 |              0 |          5 |          1 |
| [packages/app-react/src/activity-workflow-view.tsx](../../packages/app-react/src/activity-workflow-view.tsx)               | agents-and-activity                              |   28 |              0 |         10 |          0 |
| [packages/app-react/src/agent-model-picker.tsx](../../packages/app-react/src/agent-model-picker.tsx)                       | agents-and-activity                              |   34 |             10 |          0 |          0 |
| [packages/app-react/src/agent-policy-editor.tsx](../../packages/app-react/src/agent-policy-editor.tsx)                     | agents-and-activity                              |   29 |              8 |          0 |          0 |
| [packages/app-react/src/agent-tool-open.tsx](../../packages/app-react/src/agent-tool-open.tsx)                             | agents-and-activity                              |    4 |              0 |          1 |          0 |
| [packages/app-react/src/chat-search-view.tsx](../../packages/app-react/src/chat-search-view.tsx)                           | session                                          |   43 |             19 |          0 |          0 |
| [packages/app-react/src/code-block-copy-action.tsx](../../packages/app-react/src/code-block-copy-action.tsx)               | files-and-reading                                |    7 |              0 |          2 |          0 |
| [packages/app-react/src/command-palette.tsx](../../packages/app-react/src/command-palette.tsx)                             | commands                                         |   63 |              0 |         10 |          0 |
| [packages/app-react/src/composer-add-menu.tsx](../../packages/app-react/src/composer-add-menu.tsx)                         | composer-and-launch                              |   14 |              1 |          0 |          0 |
| [packages/app-react/src/composer-agent-notice.tsx](../../packages/app-react/src/composer-agent-notice.tsx)                 | agents-and-activity                              |    5 |              1 |          0 |          0 |
| [packages/app-react/src/composer-attachments.tsx](../../packages/app-react/src/composer-attachments.tsx)                   | composer-and-launch                              |   17 |              4 |          0 |          0 |
| [packages/app-react/src/composer-background-agents.tsx](../../packages/app-react/src/composer-background-agents.tsx)       | composer-and-launch                              |    8 |              1 |          0 |          0 |
| [packages/app-react/src/composer-goal-recovery.tsx](../../packages/app-react/src/composer-goal-recovery.tsx)               | goals-and-plans                                  |    3 |              1 |          0 |          0 |
| [packages/app-react/src/composer-intent-blocked.tsx](../../packages/app-react/src/composer-intent-blocked.tsx)             | composer-and-launch                              |   17 |              6 |          0 |          0 |
| [packages/app-react/src/composer-intent-controls.tsx](../../packages/app-react/src/composer-intent-controls.tsx)           | goals-and-plans                                  |   37 |             12 |          0 |          0 |
| [packages/app-react/src/composer-mention-editor.tsx](../../packages/app-react/src/composer-mention-editor.tsx)             | composer-and-launch                              |   29 |             11 |          0 |          0 |
| [packages/app-react/src/composer-model-picker.tsx](../../packages/app-react/src/composer-model-picker.tsx)                 | composer-and-launch                              |   50 |             16 |          0 |          0 |
| [packages/app-react/src/composer-permission-picker.tsx](../../packages/app-react/src/composer-permission-picker.tsx)       | composer-and-launch                              |   60 |             26 |          0 |          0 |
| [packages/app-react/src/composer-slash-menu.tsx](../../packages/app-react/src/composer-slash-menu.tsx)                     | composer-and-launch                              |    9 |              3 |          0 |          0 |
| [packages/app-react/src/composer-workspace-contexts.tsx](../../packages/app-react/src/composer-workspace-contexts.tsx)     | composer-and-launch                              |   23 |              7 |          0 |          0 |
| [packages/app-react/src/conversation-selection.tsx](../../packages/app-react/src/conversation-selection.tsx)               | session                                          |    5 |              1 |          0 |          0 |
| [packages/app-react/src/echarts-chart.tsx](../../packages/app-react/src/echarts-chart.tsx)                                 | workbench                                        |    1 |              0 |          0 |          1 |
| [packages/app-react/src/extension-collection-feedback.tsx](../../packages/app-react/src/extension-collection-feedback.tsx) | settings                                         |    7 |              4 |          0 |          0 |
| [packages/app-react/src/extension-pagination.tsx](../../packages/app-react/src/extension-pagination.tsx)                   | settings                                         |    5 |              1 |          0 |          0 |
| [packages/app-react/src/extension-plugin-detail.tsx](../../packages/app-react/src/extension-plugin-detail.tsx)             | settings                                         |   67 |             36 |          0 |          0 |
| [packages/app-react/src/extension-skill-detail.tsx](../../packages/app-react/src/extension-skill-detail.tsx)               | settings                                         |   70 |             27 |          0 |          0 |
| [packages/app-react/src/extension-workspace.tsx](../../packages/app-react/src/extension-workspace.tsx)                     | settings                                         |   75 |             25 |          0 |          0 |
| [packages/app-react/src/file-context-surfaces.tsx](../../packages/app-react/src/file-context-surfaces.tsx)                 | files-and-reading                                |   19 |              0 |          3 |          0 |
| [packages/app-react/src/file-markdown-code-block.tsx](../../packages/app-react/src/file-markdown-code-block.tsx)           | files-and-reading                                |   14 |              0 |          4 |          0 |
| [packages/app-react/src/file-markdown-preview.tsx](../../packages/app-react/src/file-markdown-preview.tsx)                 | files-and-reading                                |    7 |              0 |          2 |          0 |
| [packages/app-react/src/file-preview-tabs.tsx](../../packages/app-react/src/file-preview-tabs.tsx)                         | files-and-reading                                |   13 |              0 |          3 |          0 |
| [packages/app-react/src/file-workspace-changes.tsx](../../packages/app-react/src/file-workspace-changes.tsx)               | files-and-reading                                |   53 |              0 |         20 |          0 |
| [packages/app-react/src/file-workspace-tree.tsx](../../packages/app-react/src/file-workspace-tree.tsx)                     | files-and-reading                                |   48 |              0 |         17 |          0 |
| [packages/app-react/src/floating-surface.tsx](../../packages/app-react/src/floating-surface.tsx)                           | workbench                                        |    1 |              0 |          0 |          0 |
| [packages/app-react/src/goal-continuation.tsx](../../packages/app-react/src/goal-continuation.tsx)                         | goals-and-plans                                  |    7 |              0 |          2 |          0 |
| [packages/app-react/src/goal-execution-state.tsx](../../packages/app-react/src/goal-execution-state.tsx)                   | goals-and-plans                                  |    5 |              0 |          3 |          0 |
| [packages/app-react/src/goal-lifecycle.tsx](../../packages/app-react/src/goal-lifecycle.tsx)                               | goals-and-plans                                  |   31 |              0 |         10 |          4 |
| [packages/app-react/src/goal-plan-workspace.tsx](../../packages/app-react/src/goal-plan-workspace.tsx)                     | goals-and-plans                                  |   50 |              0 |         19 |          0 |
| [packages/app-react/src/lumen-agent-workspace.tsx](../../packages/app-react/src/lumen-agent-workspace.tsx)                 | agents-and-activity                              |   78 |             24 |          0 |          0 |
| [packages/app-react/src/lumen-disclosure.tsx](../../packages/app-react/src/lumen-disclosure.tsx)                           | workbench                                        |    6 |              1 |          0 |          0 |
| [packages/app-react/src/lumen-file-workspace.tsx](../../packages/app-react/src/lumen-file-workspace.tsx)                   | files-and-reading                                |   49 |              0 |          9 |          0 |
| [packages/app-react/src/lumen-flex-layout-adapter.tsx](../../packages/app-react/src/lumen-flex-layout-adapter.tsx)         | workbench                                        |    3 |              0 |          0 |          0 |
| [packages/app-react/src/lumen-provider-editor.tsx](../../packages/app-react/src/lumen-provider-editor.tsx)                 | settings                                         |  127 |             16 |          0 |          0 |
| [packages/app-react/src/lumen-schema-components.tsx](../../packages/app-react/src/lumen-schema-components.tsx)             | workbench                                        |   11 |              0 |          0 |          0 |
| [packages/app-react/src/lumen-schema-presentation.tsx](../../packages/app-react/src/lumen-schema-presentation.tsx)         | workbench                                        |    6 |              1 |          0 |          0 |
| [packages/app-react/src/lumen-session-workspace.tsx](../../packages/app-react/src/lumen-session-workspace.tsx)             | session                                          |   84 |             15 |          0 |          2 |
| [packages/app-react/src/lumen-settings-workspace.tsx](../../packages/app-react/src/lumen-settings-workspace.tsx)           | settings                                         |   47 |             12 |          0 |          0 |
| [packages/app-react/src/lumen-status-workspace.tsx](../../packages/app-react/src/lumen-status-workspace.tsx)               | status-and-usage                                 |  151 |             52 |          0 |          0 |
| [packages/app-react/src/lumen-workspace-shell.tsx](../../packages/app-react/src/lumen-workspace-shell.tsx)                 | workbench                                        |  152 |             32 |          0 |          0 |
| [packages/app-react/src/markdown-code-content.tsx](../../packages/app-react/src/markdown-code-content.tsx)                 | files-and-reading                                |    3 |              0 |          3 |          0 |
| [packages/app-react/src/markdown-diagram.tsx](../../packages/app-react/src/markdown-diagram.tsx)                           | files-and-reading                                |   30 |              0 |          4 |          0 |
| [packages/app-react/src/message-file-reference.tsx](../../packages/app-react/src/message-file-reference.tsx)               | files-and-reading                                |    5 |              0 |          2 |          0 |
| [packages/app-react/src/message-image-preview-context.tsx](../../packages/app-react/src/message-image-preview-context.tsx) | settings                                         |    1 |              0 |          0 |          0 |
| [packages/app-react/src/message-image-preview.tsx](../../packages/app-react/src/message-image-preview.tsx)                 | files-and-reading                                |   15 |              5 |          0 |          0 |
| [packages/app-react/src/message-literal-text.tsx](../../packages/app-react/src/message-literal-text.tsx)                   | session                                          |    6 |              2 |          0 |          0 |
| [packages/app-react/src/message-markdown.tsx](../../packages/app-react/src/message-markdown.tsx)                           | files-and-reading                                |   29 |              5 |          0 |          0 |
| [packages/app-react/src/mobile-header-menu.tsx](../../packages/app-react/src/mobile-header-menu.tsx)                       | settings / workbench                             |   14 |              0 |          2 |          0 |
| [packages/app-react/src/notifications.tsx](../../packages/app-react/src/notifications.tsx)                                 | global-pages                                     |    2 |              0 |          1 |          0 |
| [packages/app-react/src/onboarding-readiness.tsx](../../packages/app-react/src/onboarding-readiness.tsx)                   | global-pages                                     |    8 |              0 |          1 |          1 |
| [packages/app-react/src/plan-exit-decision.tsx](../../packages/app-react/src/plan-exit-decision.tsx)                       | goals-and-plans                                  |   25 |              7 |          0 |          0 |
| [packages/app-react/src/pre-session-approval-picker.tsx](../../packages/app-react/src/pre-session-approval-picker.tsx)     | composer-and-launch                              |   38 |             11 |          0 |          0 |
| [packages/app-react/src/pre-session-choice-picker.tsx](../../packages/app-react/src/pre-session-choice-picker.tsx)         | composer-and-launch                              |   31 |             10 |          0 |          0 |
| [packages/app-react/src/pre-session-landing.tsx](../../packages/app-react/src/pre-session-landing.tsx)                     | composer-and-launch                              |    6 |              0 |          0 |          0 |
| [packages/app-react/src/pre-session-launch-status.tsx](../../packages/app-react/src/pre-session-launch-status.tsx)         | status-and-usage                                 |    7 |              0 |          1 |          0 |
| [packages/app-react/src/pre-session-location-picker.tsx](../../packages/app-react/src/pre-session-location-picker.tsx)     | composer-and-launch                              |   85 |             31 |          0 |          0 |
| [packages/app-react/src/pre-session-slash-editor.tsx](../../packages/app-react/src/pre-session-slash-editor.tsx)           | composer-and-launch                              |    3 |              0 |          0 |          0 |
| [packages/app-react/src/pre-session-thinking-picker.tsx](../../packages/app-react/src/pre-session-thinking-picker.tsx)     | composer-and-launch                              |   13 |              4 |          0 |          0 |
| [packages/app-react/src/prompt-composer.tsx](../../packages/app-react/src/prompt-composer.tsx)                             | composer-and-launch                              |    4 |              0 |          0 |          0 |
| [packages/app-react/src/prompt-template-editor.tsx](../../packages/app-react/src/prompt-template-editor.tsx)               | global-pages                                     |   16 |              0 |          5 |          0 |
| [packages/app-react/src/proposed-plan-message.tsx](../../packages/app-react/src/proposed-plan-message.tsx)                 | goals-and-plans                                  |   16 |              1 |          0 |          0 |
| [packages/app-react/src/proposed-plan.tsx](../../packages/app-react/src/proposed-plan.tsx)                                 | goals-and-plans                                  |   21 |              5 |          0 |          0 |
| [packages/app-react/src/provider-list-view.tsx](../../packages/app-react/src/provider-list-view.tsx)                       | settings                                         |   42 |             14 |          0 |          0 |
| [packages/app-react/src/provider-settings.tsx](../../packages/app-react/src/provider-settings.tsx)                         | settings                                         |   20 |              6 |          0 |          0 |
| [packages/app-react/src/queued-user-runs.tsx](../../packages/app-react/src/queued-user-runs.tsx)                           | workbench                                        |   43 |             13 |          0 |          0 |
| [packages/app-react/src/run-board.tsx](../../packages/app-react/src/run-board.tsx)                                         | agents-and-activity                              |    1 |              0 |          0 |          0 |
| [packages/app-react/src/runtime.tsx](../../packages/app-react/src/runtime.tsx)                                             | settings                                         |    2 |              0 |          0 |          0 |
| [packages/app-react/src/sandbox-profile-settings.tsx](../../packages/app-react/src/sandbox-profile-settings.tsx)           | settings                                         |  157 |             33 |          0 |          0 |
| [packages/app-react/src/session-activity-indicator.tsx](../../packages/app-react/src/session-activity-indicator.tsx)       | agents-and-activity                              |    3 |              0 |          0 |          0 |
| [packages/app-react/src/session-activity-workspace.tsx](../../packages/app-react/src/session-activity-workspace.tsx)       | agents-and-activity                              |   27 |              0 |         10 |          0 |
| [packages/app-react/src/session-agent-branch.tsx](../../packages/app-react/src/session-agent-branch.tsx)                   | agents-and-activity                              |   13 |              0 |          5 |          0 |
| [packages/app-react/src/session-archive.tsx](../../packages/app-react/src/session-archive.tsx)                             | session                                          |   58 |             24 |          0 |          0 |
| [packages/app-react/src/session-empty-hero.tsx](../../packages/app-react/src/session-empty-hero.tsx)                       | session                                          |    4 |              0 |          2 |          0 |
| [packages/app-react/src/session-execution-notice.tsx](../../packages/app-react/src/session-execution-notice.tsx)           | session                                          |    6 |              0 |          2 |          0 |
| [packages/app-react/src/session-find-view.tsx](../../packages/app-react/src/session-find-view.tsx)                         | session                                          |   12 |              2 |          0 |          0 |
| [packages/app-react/src/session-find.tsx](../../packages/app-react/src/session-find.tsx)                                   | session                                          |    3 |              0 |          0 |          0 |
| [packages/app-react/src/session-images-model.tsx](../../packages/app-react/src/session-images-model.tsx)                   | settings                                         |    1 |              0 |          0 |          0 |
| [packages/app-react/src/session-images.tsx](../../packages/app-react/src/session-images.tsx)                               | files-and-reading                                |   33 |              5 |          0 |          0 |
| [packages/app-react/src/session-interactions.tsx](../../packages/app-react/src/session-interactions.tsx)                   | session                                          |   53 |             20 |          0 |          0 |
| [packages/app-react/src/session-launch-location.tsx](../../packages/app-react/src/session-launch-location.tsx)             | session                                          |   15 |              2 |          0 |          0 |
| [packages/app-react/src/session-live-status.tsx](../../packages/app-react/src/session-live-status.tsx)                     | status-and-usage                                 |    3 |              0 |          1 |          0 |
| [packages/app-react/src/session-message.tsx](../../packages/app-react/src/session-message.tsx)                             | session / status-and-usage / agents-and-activity |   59 |             11 |          0 |          0 |
| [packages/app-react/src/session-monitoring.tsx](../../packages/app-react/src/session-monitoring.tsx)                       | status-and-usage                                 |   21 |              0 |          8 |          0 |
| [packages/app-react/src/session-navigation-row.tsx](../../packages/app-react/src/session-navigation-row.tsx)               | session                                          |   33 |              8 |          0 |          0 |
| [packages/app-react/src/session-project-context.tsx](../../packages/app-react/src/session-project-context.tsx)             | session                                          |   13 |              6 |          0 |          0 |
| [packages/app-react/src/session-roster-feedback.tsx](../../packages/app-react/src/session-roster-feedback.tsx)             | session                                          |    3 |              1 |          0 |          0 |
| [packages/app-react/src/session-run-activity.tsx](../../packages/app-react/src/session-run-activity.tsx)                   | agents-and-activity                              |   33 |             14 |          0 |          0 |
| [packages/app-react/src/session-stop.tsx](../../packages/app-react/src/session-stop.tsx)                                   | settings                                         |    8 |              0 |          3 |          0 |
| [packages/app-react/src/session-tool-details.tsx](../../packages/app-react/src/session-tool-details.tsx)                   | session                                          |   35 |              0 |          7 |          0 |
| [packages/app-react/src/session-tool-feedback.tsx](../../packages/app-react/src/session-tool-feedback.tsx)                 | session                                          |    9 |              0 |          6 |          0 |
| [packages/app-react/src/session-tools-menu.tsx](../../packages/app-react/src/session-tools-menu.tsx)                       | session                                          |   12 |              0 |          3 |          0 |
| [packages/app-react/src/session-usage-control.tsx](../../packages/app-react/src/session-usage-control.tsx)                 | status-and-usage                                 |   14 |              0 |          5 |          0 |
| [packages/app-react/src/settings-content-recovery.tsx](../../packages/app-react/src/settings-content-recovery.tsx)         | settings                                         |    5 |              3 |          0 |          0 |
| [packages/app-react/src/settings-usage.tsx](../../packages/app-react/src/settings-usage.tsx)                               | settings                                         |   26 |              0 |         13 |          1 |
| [packages/app-react/src/sidebar-caption.tsx](../../packages/app-react/src/sidebar-caption.tsx)                             | workbench                                        |    2 |              2 |          0 |          0 |
| [packages/app-react/src/sidebar-search-entry.tsx](../../packages/app-react/src/sidebar-search-entry.tsx)                   | workbench                                        |    4 |              2 |          0 |          0 |
| [packages/app-react/src/sidebar-time-view.tsx](../../packages/app-react/src/sidebar-time-view.tsx)                         | workbench                                        |    7 |              1 |          0 |          0 |
| [packages/app-react/src/skill-import-panel.tsx](../../packages/app-react/src/skill-import-panel.tsx)                       | settings                                         |   34 |              0 |         16 |          2 |
| [packages/app-react/src/storage-location-settings.tsx](../../packages/app-react/src/storage-location-settings.tsx)         | settings                                         |   21 |             11 |          0 |          0 |
| [packages/app-react/src/system-diagnostics.tsx](../../packages/app-react/src/system-diagnostics.tsx)                       | status-and-usage                                 |   37 |              0 |         13 |          0 |
| [packages/app-react/src/tool-output-image-links.tsx](../../packages/app-react/src/tool-output-image-links.tsx)             | files-and-reading                                |    2 |              0 |          0 |          0 |
| [packages/app-react/src/tool-result-copy-action.tsx](../../packages/app-react/src/tool-result-copy-action.tsx)             | workbench                                        |    6 |              0 |          2 |          0 |
| [packages/app-react/src/usage-budget.tsx](../../packages/app-react/src/usage-budget.tsx)                                   | status-and-usage                                 |    5 |              0 |          1 |          0 |
| [packages/app-react/src/usage-features.tsx](../../packages/app-react/src/usage-features.tsx)                               | status-and-usage                                 |    3 |              0 |          0 |          0 |
| [packages/app-react/src/usage-requests.tsx](../../packages/app-react/src/usage-requests.tsx)                               | status-and-usage                                 |    6 |              0 |          2 |          0 |
| [packages/app-react/src/workflow-overview.tsx](../../packages/app-react/src/workflow-overview.tsx)                         | agents-and-activity                              |   90 |             37 |          0 |          0 |
| [packages/app-react/src/workspace-display-names.tsx](../../packages/app-react/src/workspace-display-names.tsx)             | workbench                                        |   35 |             13 |          0 |          0 |
| [packages/app-react/src/workspace-folders.tsx](../../packages/app-react/src/workspace-folders.tsx)                         | workbench                                        |   71 |             19 |          0 |          0 |
| [packages/app-react/src/workspace-header-sort-menu.tsx](../../packages/app-react/src/workspace-header-sort-menu.tsx)       | workbench                                        |   43 |             10 |          0 |          0 |
| [packages/app-react/src/workspace-organization.tsx](../../packages/app-react/src/workspace-organization.tsx)               | workbench                                        |    8 |              3 |          0 |          0 |
| [packages/app-react/src/workspace-sidebar-rail.tsx](../../packages/app-react/src/workspace-sidebar-rail.tsx)               | workbench                                        |   23 |              0 |          0 |          0 |
| [packages/app-react/src/workspace-tabs-close-dialog.tsx](../../packages/app-react/src/workspace-tabs-close-dialog.tsx)     | workbench                                        |   11 |              2 |          0 |          0 |
| [packages/app-react/src/workspace-tabs.tsx](../../packages/app-react/src/workspace-tabs.tsx)                               | workbench                                        |   19 |              2 |          0 |          0 |
| [packages/schema-react/src/form.tsx](../../packages/schema-react/src/form.tsx)                                             | workbench                                        |    8 |              0 |          0 |          0 |
| [packages/schema-react/src/presentation.tsx](../../packages/schema-react/src/presentation.tsx)                             | workbench                                        |    8 |              0 |          0 |          0 |

## 审计含义

- `semantic`：文本 context 已声明；`composed`：通过 Lumen 或独立业务组件组合；这两项只证明源码边界，不代替行为与容量验收。
- `pending`：存在未归属文本、原生业务元素或平台文案契约。逐项处理后重新生成，不将原生标签按名称机械替换为完成。
- `renderer-boundary`：只允许登记的专用 renderer 片段；`schema-boundary`：通用 Schema 渲染，Desktop 必须注入 Lumen 展示适配。
- `contentSources`、`targetSources` 和 `stateSources` 保存真实源码表达式；大型 JSX 组合保留源码行号与依赖引用，子元素另有独立记录。未出现属性不等于没有隐式依赖，需结合组件 props、ViewModel 与行为验收。
- `flow` 的组件归属描述表示需要核对对应组件容量与滚动契约，不能视为已证明虚拟化或可滚动。
- 清单同时保留未进入入口图的 TSX 与参考／兼容边界。最终必须和实际生产构建输入及页面回归共同核对。

## 未进入生产入口图的 TSX

- `apps/web/src/ActivityPanel.tsx`
- `apps/web/src/ChatSessionChrome.tsx`
- `apps/web/src/DescriptorSettingsForm.tsx`
- `apps/web/src/DiagnosePanel.tsx`
- `apps/web/src/FileNavigation.tsx`
- `apps/web/src/FloatingLayer.tsx`
- `apps/web/src/GitContextSwitcher.tsx`
- `apps/web/src/GitDiffViewer.tsx`
- `apps/web/src/GitPanel.tsx`
- `apps/web/src/PairingPage.tsx`
- `apps/web/src/PatchViewer.tsx`
- `apps/web/src/PluginDiagnostics.tsx`
- `apps/web/src/PluginRow.tsx`
- `apps/web/src/PromptComposer.tsx`
- `apps/web/src/RendererBoundary.tsx`
- `apps/web/src/SettingsNavigation.tsx`
- `apps/web/src/SystemTerminalPanel.tsx`
- `apps/web/src/ThemeRuntimeSync.tsx`
- `apps/web/src/react-bits/AnimatedList.tsx`
- `apps/web/src/react-bits/GlareButton.tsx`
- `apps/web/src/react-bits/GlassIconButton.tsx`
- `apps/web/src/react-bits/GlassSurface.tsx`
- `apps/web/src/react-bits/LineSidebar.tsx`
- `apps/web/src/react-bits/SpotlightCard.tsx`
- `apps/web/src/react-bits/components/ActivitySurface.test.tsx`
- `apps/web/src/react-bits/components/ActivitySurface.tsx`
- `apps/web/src/react-bits/components/ChatApprovalSurface.tsx`
- `apps/web/src/react-bits/components/ChatMessageSurface.tsx`
- `apps/web/src/react-bits/components/ChatQueueSurface.tsx`
- `apps/web/src/react-bits/components/ChatStreamSurface.tsx`
- `apps/web/src/react-bits/components/ChatSurfaces.test.tsx`
- `apps/web/src/react-bits/components/ModelPickerSurface.test.tsx`
- `apps/web/src/react-bits/components/ModelPickerSurface.tsx`
- `apps/web/src/react-bits/components/PromptInputSurface.test.tsx`
- `apps/web/src/react-bits/components/PromptInputSurface.tsx`
- `apps/web/src/react-bits/components/RunOutcomeSurface.tsx`
- `apps/web/src/react-bits/components/SessionSidebarSurface.test.tsx`
- `apps/web/src/react-bits/components/SessionSidebarSurface.tsx`
- `apps/web/src/react-bits/components/ToolCallSurface.tsx`
- `apps/web/src/react-bits/components/ToolResultSurface.tsx`
- `apps/web/src/react-bits/components/UserInputSurface.tsx`
- `apps/web/src/react-bits/production.tsx`
- `apps/web/src/react-bits/reference/ReferenceBlueprints.tsx`
- `apps/web/src/react-bits/reference/ReferenceFixtureRoute.tsx`
- `apps/web/src/react-bits/reference/ReferenceGallery.tsx`
- `apps/web/src/react-bits/reference/ReferencePreviewFrame.tsx`
- `apps/web/src/react-bits/reference/primitives/ReferencePrimitives.tsx`
- `apps/web/src/react-bits/reference/reference-variant.tsx`
- `apps/web/src/react-bits/reference/variants/agent-activity/agent-activity-1.tsx`
- `apps/web/src/react-bits/reference/variants/agent-activity/agent-activity-2.tsx`
- `apps/web/src/react-bits/reference/variants/agent-activity/agent-activity-3.tsx`
- `apps/web/src/react-bits/reference/variants/agent-activity/agent-activity-4.tsx`
- `apps/web/src/react-bits/reference/variants/agent-activity/agent-activity-5.tsx`
- `apps/web/src/react-bits/reference/variants/agent-activity/agent-activity-6.tsx`
- `apps/web/src/react-bits/reference/variants/agent-activity/agent-activity-7.tsx`
- `apps/web/src/react-bits/reference/variants/agent-approval/agent-approval-1.tsx`
- `apps/web/src/react-bits/reference/variants/agent-approval/agent-approval-2.tsx`
- `apps/web/src/react-bits/reference/variants/agent-approval/agent-approval-3.tsx`
- `apps/web/src/react-bits/reference/variants/agent-approval/agent-approval-4.tsx`
- `apps/web/src/react-bits/reference/variants/agent-approval/agent-approval-5.tsx`
- `apps/web/src/react-bits/reference/variants/agent-approval/agent-approval-6.tsx`
- `apps/web/src/react-bits/reference/variants/agent-approval/approval-observed.tsx`
- `apps/web/src/react-bits/reference/variants/agent-plan/agent-plan-1.tsx`
- `apps/web/src/react-bits/reference/variants/agent-plan/agent-plan-2.tsx`
- `apps/web/src/react-bits/reference/variants/agent-plan/agent-plan-3.tsx`
- `apps/web/src/react-bits/reference/variants/agent-plan/agent-plan-4.tsx`
- `apps/web/src/react-bits/reference/variants/agent-plan/agent-plan-5.tsx`
- `apps/web/src/react-bits/reference/variants/agent-plan/agent-plan-6.tsx`
- `apps/web/src/react-bits/reference/variants/agent-plan/plan-observed.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-1.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-2.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-3.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-4.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-5.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-6.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-7.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-8.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/ai-chat-9.tsx`
- `apps/web/src/react-bits/reference/variants/ai-chat/observed-chat.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-1.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-2.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-3.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-4.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-5.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-6.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-7.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/ai-usage-8.tsx`
- `apps/web/src/react-bits/reference/variants/ai-usage/usage-observed.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-1.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-10.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-11.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-12.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-13.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-14.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-15.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-16.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-2.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-3.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-4.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-5.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-6.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-7.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-8.tsx`
- `apps/web/src/react-bits/reference/variants/analytics/analytics-9.tsx`
- `apps/web/src/react-bits/reference/variants/app-dialog/app-dialog-1.tsx`
- `apps/web/src/react-bits/reference/variants/app-dialog/app-dialog-2.tsx`
- `apps/web/src/react-bits/reference/variants/app-dialog/app-dialog-3.tsx`
- `apps/web/src/react-bits/reference/variants/app-dialog/app-dialog-4.tsx`
- `apps/web/src/react-bits/reference/variants/app-dialog/app-dialog-5.tsx`
- `apps/web/src/react-bits/reference/variants/app-dialog/app-dialog-6.tsx`
- `apps/web/src/react-bits/reference/variants/app-dialog/app-dialog-7.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-1.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-2.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-3.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-4.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-5.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-6.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-7.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-8.tsx`
- `apps/web/src/react-bits/reference/variants/app-shell/app-shell-9.tsx`
- `apps/web/src/react-bits/reference/variants/app-sidebar/app-sidebar-1.tsx`
- `apps/web/src/react-bits/reference/variants/app-sidebar/app-sidebar-2.tsx`
- `apps/web/src/react-bits/reference/variants/app-sidebar/app-sidebar-3.tsx`
- `apps/web/src/react-bits/reference/variants/app-sidebar/app-sidebar-4.tsx`
- `apps/web/src/react-bits/reference/variants/app-sidebar/app-sidebar-5.tsx`
- `apps/web/src/react-bits/reference/variants/app-sidebar/app-sidebar-6.tsx`
- `apps/web/src/react-bits/reference/variants/app-sidebar/app-sidebar-7.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-1.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-10.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-11.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-12.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-13.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-14.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-2.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-3.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-4.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-5.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-6.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-7.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-8.tsx`
- `apps/web/src/react-bits/reference/variants/authentication/authentication-9.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-1.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-2.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-3.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-4.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-5.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-6.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-7.tsx`
- `apps/web/src/react-bits/reference/variants/billing/billing-8.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-1.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-10.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-11.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-2.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-3.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-4.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-5.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-6.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-7.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-8.tsx`
- `apps/web/src/react-bits/reference/variants/card/card-9.tsx`
- `apps/web/src/react-bits/reference/variants/chat/chat-1.tsx`
- `apps/web/src/react-bits/reference/variants/chat/chat-2.tsx`
- `apps/web/src/react-bits/reference/variants/chat/chat-3.tsx`
- `apps/web/src/react-bits/reference/variants/chat/chat-4.tsx`
- `apps/web/src/react-bits/reference/variants/chat/chat-5.tsx`
- `apps/web/src/react-bits/reference/variants/chat/chat-6.tsx`
- `apps/web/src/react-bits/reference/variants/command-menu/command-menu-1.tsx`
- `apps/web/src/react-bits/reference/variants/command-menu/command-menu-2.tsx`
- `apps/web/src/react-bits/reference/variants/command-menu/command-menu-3.tsx`
- `apps/web/src/react-bits/reference/variants/command-menu/command-menu-4.tsx`
- `apps/web/src/react-bits/reference/variants/command-menu/command-menu-5.tsx`
- `apps/web/src/react-bits/reference/variants/command-menu/command-menu-6.tsx`
- `apps/web/src/react-bits/reference/variants/comments/comments-1.tsx`
- `apps/web/src/react-bits/reference/variants/comments/comments-2.tsx`
- `apps/web/src/react-bits/reference/variants/comments/comments-3.tsx`
- `apps/web/src/react-bits/reference/variants/comments/comments-4.tsx`
- `apps/web/src/react-bits/reference/variants/comments/comments-5.tsx`
- `apps/web/src/react-bits/reference/variants/comments/comments-6.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-1.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-10.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-11.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-12.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-13.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-14.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-2.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-3.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-4.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-5.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-6.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-7.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-8.tsx`
- `apps/web/src/react-bits/reference/variants/dashboard/dashboard-9.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-1.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-2.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-3.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-4.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-5.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-6.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-7.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-8.tsx`
- `apps/web/src/react-bits/reference/variants/data-table/data-table-observed.tsx`
- `apps/web/src/react-bits/reference/variants/editor/editor-1.tsx`
- `apps/web/src/react-bits/reference/variants/editor/editor-2.tsx`
- `apps/web/src/react-bits/reference/variants/editor/editor-3.tsx`
- `apps/web/src/react-bits/reference/variants/editor/editor-4.tsx`
- `apps/web/src/react-bits/reference/variants/editor/editor-5.tsx`
- `apps/web/src/react-bits/reference/variants/empty-state/empty-state-1.tsx`
- `apps/web/src/react-bits/reference/variants/empty-state/empty-state-2.tsx`
- `apps/web/src/react-bits/reference/variants/empty-state/empty-state-3.tsx`
- `apps/web/src/react-bits/reference/variants/empty-state/empty-state-4.tsx`
- `apps/web/src/react-bits/reference/variants/empty-state/empty-state-5.tsx`
- `apps/web/src/react-bits/reference/variants/feedback/feedback-1.tsx`
- `apps/web/src/react-bits/reference/variants/feedback/feedback-2.tsx`
- `apps/web/src/react-bits/reference/variants/feedback/feedback-3.tsx`
- `apps/web/src/react-bits/reference/variants/feedback/feedback-4.tsx`
- `apps/web/src/react-bits/reference/variants/feedback/feedback-5.tsx`
- `apps/web/src/react-bits/reference/variants/feedback/feedback-6.tsx`
- `apps/web/src/react-bits/reference/variants/file-manager/file-manager-1.tsx`
- `apps/web/src/react-bits/reference/variants/file-manager/file-manager-2.tsx`
- `apps/web/src/react-bits/reference/variants/file-manager/file-manager-3.tsx`
- `apps/web/src/react-bits/reference/variants/file-manager/file-manager-4.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-1.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-2.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-3.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-4.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-5.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-6.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-7.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-8.tsx`
- `apps/web/src/react-bits/reference/variants/filtering/filtering-9.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-1.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-10.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-11.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-12.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-2.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-3.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-4.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-5.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-6.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-7.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-8.tsx`
- `apps/web/src/react-bits/reference/variants/forms/forms-9.tsx`
- `apps/web/src/react-bits/reference/variants/integrations/integrations-1.tsx`
- `apps/web/src/react-bits/reference/variants/integrations/integrations-2.tsx`
- `apps/web/src/react-bits/reference/variants/integrations/integrations-3.tsx`
- `apps/web/src/react-bits/reference/variants/integrations/integrations-4.tsx`
- `apps/web/src/react-bits/reference/variants/integrations/integrations-5.tsx`
- `apps/web/src/react-bits/reference/variants/integrations/integrations-6.tsx`
- `apps/web/src/react-bits/reference/variants/kanban/kanban-1.tsx`
- `apps/web/src/react-bits/reference/variants/kanban/kanban-2.tsx`
- `apps/web/src/react-bits/reference/variants/kanban/kanban-3.tsx`
- `apps/web/src/react-bits/reference/variants/kanban/kanban-4.tsx`
- `apps/web/src/react-bits/reference/variants/kanban/kanban-5.tsx`
- `apps/web/src/react-bits/reference/variants/kanban/kanban-6.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-1.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-10.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-11.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-12.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-2.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-3.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-4.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-5.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-6.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-7.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-8.tsx`
- `apps/web/src/react-bits/reference/variants/list/list-9.tsx`
- `apps/web/src/react-bits/reference/variants/mobile/mobile-1.tsx`
- `apps/web/src/react-bits/reference/variants/mobile/mobile-2.tsx`
- `apps/web/src/react-bits/reference/variants/mobile/mobile-3.tsx`
- `apps/web/src/react-bits/reference/variants/mobile/mobile-4.tsx`
- `apps/web/src/react-bits/reference/variants/mobile/mobile-5.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-1.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-10.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-2.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-3.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-4.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-5.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-6.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-7.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-8.tsx`
- `apps/web/src/react-bits/reference/variants/monitoring/monitoring-9.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-1.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-10.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-11.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-12.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-13.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-14.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-2.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-3.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-4.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-5.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-6.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-7.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-8.tsx`
- `apps/web/src/react-bits/reference/variants/navbar/navbar-9.tsx`
- `apps/web/src/react-bits/reference/variants/notifications/notifications-1.tsx`
- `apps/web/src/react-bits/reference/variants/notifications/notifications-2.tsx`
- `apps/web/src/react-bits/reference/variants/notifications/notifications-3.tsx`
- `apps/web/src/react-bits/reference/variants/notifications/notifications-4.tsx`
- `apps/web/src/react-bits/reference/variants/notifications/notifications-5.tsx`
- `apps/web/src/react-bits/reference/variants/notifications/notifications-6.tsx`
- `apps/web/src/react-bits/reference/variants/onboarding/onboarding-1.tsx`
- `apps/web/src/react-bits/reference/variants/onboarding/onboarding-2.tsx`
- `apps/web/src/react-bits/reference/variants/onboarding/onboarding-3.tsx`
- `apps/web/src/react-bits/reference/variants/onboarding/onboarding-4.tsx`
- `apps/web/src/react-bits/reference/variants/onboarding/onboarding-5.tsx`
- `apps/web/src/react-bits/reference/variants/onboarding/onboarding-6.tsx`
- `apps/web/src/react-bits/reference/variants/onboarding/onboarding-7.tsx`
- `apps/web/src/react-bits/reference/variants/paywall/paywall-1.tsx`
- `apps/web/src/react-bits/reference/variants/paywall/paywall-2.tsx`
- `apps/web/src/react-bits/reference/variants/paywall/paywall-3.tsx`
- `apps/web/src/react-bits/reference/variants/paywall/paywall-4.tsx`
- `apps/web/src/react-bits/reference/variants/paywall/paywall-5.tsx`
- `apps/web/src/react-bits/reference/variants/paywall/paywall-6.tsx`
- `apps/web/src/react-bits/reference/variants/paywall/paywall-7.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-input-1.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-input-2.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-input-3.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-input-4.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-input-5.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-input-6.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-input-7.tsx`
- `apps/web/src/react-bits/reference/variants/prompt-input/prompt-observed.tsx`
- `apps/web/src/react-bits/reference/variants/scheduling/scheduling-1.tsx`
- `apps/web/src/react-bits/reference/variants/scheduling/scheduling-2.tsx`
- `apps/web/src/react-bits/reference/variants/scheduling/scheduling-3.tsx`
- `apps/web/src/react-bits/reference/variants/scheduling/scheduling-4.tsx`
- `apps/web/src/react-bits/reference/variants/scheduling/scheduling-5.tsx`
- `apps/web/src/react-bits/reference/variants/scheduling/scheduling-6.tsx`
- `apps/web/src/react-bits/reference/variants/scheduling/scheduling-7.tsx`
- `apps/web/src/react-bits/reference/variants/settings-form/settings-form-1.tsx`
- `apps/web/src/react-bits/reference/variants/settings-form/settings-form-2.tsx`
- `apps/web/src/react-bits/reference/variants/settings-form/settings-form-3.tsx`
- `apps/web/src/react-bits/reference/variants/settings-form/settings-form-4.tsx`
- `apps/web/src/react-bits/reference/variants/settings-form/settings-form-5.tsx`
- `apps/web/src/react-bits/reference/variants/settings-form/settings-form-6.tsx`
- `apps/web/src/react-bits/reference/variants/support/support-1.tsx`
- `apps/web/src/react-bits/reference/variants/support/support-2.tsx`
- `apps/web/src/react-bits/reference/variants/support/support-3.tsx`
- `apps/web/src/react-bits/reference/variants/support/support-4.tsx`
- `apps/web/src/react-bits/reference/variants/support/support-5.tsx`
- `apps/web/src/react-bits/reference/variants/tool-calls/tool-calls-1.tsx`
- `apps/web/src/react-bits/reference/variants/tool-calls/tool-calls-2.tsx`
- `apps/web/src/react-bits/reference/variants/tool-calls/tool-calls-3.tsx`
- `apps/web/src/react-bits/reference/variants/tool-calls/tool-calls-4.tsx`
- `apps/web/src/react-bits/reference/variants/tool-calls/tool-calls-5.tsx`
- `apps/web/src/react-bits/reference/variants/tool-calls/tool-calls-6.tsx`
- `apps/web/src/react-bits/reference/variants/wizard/wizard-1.tsx`
- `apps/web/src/react-bits/reference/variants/wizard/wizard-2.tsx`
- `apps/web/src/react-bits/reference/variants/wizard/wizard-3.tsx`
- `apps/web/src/react-bits/reference/variants/wizard/wizard-4.tsx`
- `apps/web/src/react-bits/reference/variants/wizard/wizard-5.tsx`
- `apps/web/src/react-bits/reference/variants/wizard/wizard-6.tsx`
- `apps/web/src/react-bits/reference/variants/wizard/wizard-7.tsx`
- `apps/web/src/react-bits/semantic.tsx`
- `apps/web/src/workbench/WorkbenchHeader.tsx`
- `apps/web/src/workbench/WorkbenchNavigation.tsx`
- `apps/web/src/workbench/WorkbenchStatusBar.tsx`
- `packages/app-react/src/prompt-template-picker.tsx`
- `packages/schema-react/src/list.tsx`
- `packages/schema-react/src/standard.tsx`
