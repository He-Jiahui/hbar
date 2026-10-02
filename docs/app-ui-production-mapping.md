# Production mapping audit for selected App UI recipes

This is a read-only audit captured from the working tree on 2026-10-02. It does not
change the 300-ID inventory, migration ledger, render report, or selection. The
render report proves 300/300 static preview mounts with no page errors or overflow;
it does not prove production wiring.

## Selected IDs

The following IDs are the exact existing-feature-recipe and new-feature-recipe
rows from artifacts/app-ui-migration-audit/render-report.json:

| Family | Selected variants |
| --- | --- |
| Agent Activity | 1, 2, 3, 4, 5, 6, 7 |
| Agent Approval | 1, 2, 6 |
| Agent Plan | 1, 2, 5 |
| AI Chat | 1, 2, 4, 5, 6, 7, 9 |
| AI Usage | 1, 2, 5, 7, 8 |
| Analytics | 2, 3, 5, 12 |
| App Dialog | 1–7 |
| App Shell | 4, 9 |
| App Sidebar | 3, 5, 6 |
| Card | 2, 6, 8 |
| Command Menu | 1, 2, 3, 4, 6 |
| Dashboard | 1, 2, 10 |
| Data Table | 1, 2, 4, 6, 7, 8 |
| Editor | 2, 3, 5 |
| Empty State | 1, 2, 4, 5 |
| File Manager | 1, 3 |
| Filtering | 2, 3, 4, 7 |
| Forms | 1, 2, 4 |
| Integrations | 1, 2 |
| Kanban | 1, 4, 6 |
| List | 1, 2, 5, 8, 12 |
| Mobile | 5 |
| Monitoring | 1, 2, 5, 8, 9 |
| Navbar | 1, 6, 11 |
| Notifications | 1–6 |
| Onboarding | 3, 6 |
| Prompt Input | 1–7 |
| Scheduling | 1, 3, 4 |
| Settings Form | 1, 3, 5, 6 |
| Tool Calls | 1–5 |
| Wizard | 7 |

## Confirmed production composition

- Session conversation uses LumenAiChat01 in packages/app-react/src/lumen-session-workspace.tsx:2565. No production consumer was found for selected AI Chat 2, 4, 5, 6, 7, or 9.
- Prompt composer selects LumenPromptInput01, 04, or 07 in packages/app-react/src/prompt-composer.tsx:16. PromptTemplateEditor also consumes LumenPromptInput04.
- Session runtime composes LumenAgentActivity03 and LumenAgentApproval01, and LumenToolCalls01/06 in packages/app-react/src/lumen-session-workspace.tsx:1309,1616 and session-message.tsx:306. Activity variants 1, 2, 4–7 and Tool Calls 2–5 have no numbered production consumer.
- Goal workspace selects LumenAgentPlan01/02 in packages/app-react/src/goal-plan-workspace.tsx:150. The current working tree run-board detail imports LumenAgentPlan05 in apps/web/src/run-board-page.tsx:2,90; verify that root-owned change before treating Agent Plan 5 as closed-loop.
- Usage production now consumes LumenUsage01 at packages/app-react/src/lumen-status-workspace.tsx:583 and settings-usage.tsx:177, LumenUsage02 at settings-usage.tsx:207, LumenUsage05 through HbarUsageBudget at packages/app-react/src/usage-budget.tsx:41, LumenUsage07 through HbarUsageRequests at packages/app-react/src/usage-requests.tsx:129, and LumenUsage08 at packages/app-react/src/lumen-status-workspace.tsx:867. Usage 5/7/8 therefore have real numbered consumers; the remaining behavior boundary is Host persistence/error/recovery evidence for those runtimes.
- Dashboard production now consumes LumenDashboard01 and LumenDashboard10 in packages/app-react/src/lumen-status-workspace.tsx:529, and LumenDashboard02 in the usage composition at :865. Their content is Host-derived dashboardContent and the status query actions at :530-558. This is a composition of dashboard recipes around the status workspace, not three separate navigations.
- Run board selects LumenKanban01/04/06 in apps/web/src/run-board-page.tsx:72 and packages/app-react/src/run-board.tsx:83. Host actions resolve open to app.setSession, retry to run.retry, and cancel to operation.cancel in apps/web/src/run-board-page.tsx:23-31. The current detail dialog also consumes LumenAgentPlan05 at apps/web/src/run-board-page.tsx:93 with status, workspace, session and cost facts; it remains a single run detail dialog, not another navigation surface.
- Notifications are Host-backed through packages/app-react/src/notifications.tsx; the web app mounts variant 6 in apps/web/src/App.tsx:1097, while notifications-page.tsx defaults to variant 1.
- Onboarding readiness consumes LumenOnboarding3Reference and LumenOnboarding6Reference in packages/app-react/src/onboarding-readiness.tsx:27,42, with Host readiness and configure/open actions.
- Scheduling consumes LumenScheduling03 and 04 inside the new-schedule page and LumenScheduling01 for the calendar shell in apps/web/src/schedules-page.tsx:193,251,454; runtime refresh/reconcile/create actions are connected to the schedule API.
- Integrations 1/2, editor 2/3/5, file manager 1/3, settings forms 1/3/5/6, monitoring 1, and shell/sidebar/navbar recipes are composed through dedicated app-react adapters. Remaining gaps are persistence/installation/fresh strict evidence, not missing recipe imports.

## Current behavior gaps

1. Usage 5/7/8 and Dashboard 1/2/10 are now mounted, but their runtime actions need end-to-end persistence and failure/recovery evidence. `HbarUsageRequests` has an explicit `onOpenRequest` callback, while the status workspace's Usage 8 compact widget is display-only by design.
2. The run-board detail's AgentPlan05 body is supplied from the selected run's plan facts. Verify retry/cancel result feedback and stale selected-run fencing; do not add another navigation surface.
3. Selected AI Chat 2/4/5/6/7/9, Activity 1/2/4–7, and Tool Calls 2–5 remain represented by shared slot/primitives or custom Host views rather than separate numbered pages. Their Host actions must remain covered by the session tests; catalog presence alone is not evidence.
4. Notification watermark and typed bell changes are present in commits `e0236203` and `9b410772` with current working-tree integration in `apps/web/src/App.tsx`, `apps/web/src/notifications-page.tsx`, and `packages/app-react/src/notifications.tsx`; native desktop permission/toast/restart recovery remains pending.
5. Full production validation remains pending: fresh typecheck, lint, package builds, browser interaction evidence, and the nine-step migration validation matrix. The 300/300 static render report remains preview-only evidence.

## Scope boundary

Out-of-scope rows (accounts, billing, chat/social, comments, feedback, support,
and other rows marked out-of-scope in the render report) are deliberately not
counted as production migration gaps here.
