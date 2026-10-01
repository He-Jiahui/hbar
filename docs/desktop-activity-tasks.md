# Desktop Activity task progress

This slice aligns the core task-progress reading flow, not every CC task or workflow capability. The user's chosen empty-Session Workspace-move behavior remains unchanged: keep the current model and thinking level. Work is isolated in `codex/session-launch-target`; the dirty primary checkout is untouched.

## Reference and design

Read-only CC source is `D:/Git/cc-haha` at `e28d0a653481ef41b7a329411eeb2f0fd5656731`. `desktop/src/components/activity/sessionActivityModel.ts:121-130` puts Tasks first among nonempty Activity sections. `SessionActivityPanel.tsx:735-769` places completed/total progress alongside the heading; task rows use compact status markers, completed strike-through and ellipsis rather than becoming independent editor cards.

Root captured the original exported panel and button with three synthetic tasks (completed/in-progress/pending), a long title, and one synthetic Agent. [Original Tasks view](../artifacts/activity-tasks-reference/zh-tasks.png) and [capture manifest](../artifacts/activity-tasks-reference/manifest.json) record the boundary: local Activity toggle, no Host/model/profile calls, CC source unmodified. Missing reference mascot assets are not icon-fidelity evidence. The initial fixture used the wrong stylesheet path and timed out; correcting it to the actual `theme/globals.css` produced the inspected reference.

Two requested gpt-6-luna/max agents read actual CC and hbar source in this slice. Reference audit confirmed Goal header/slash lifecycle, permission-owned Plan mode, existing ExitPlanMode approval, and task-first dynamic Activity groups. It did not establish a new missing Plan approval feature: hbar already has that flow. These are source audits; Root owns the visual capture, implementation and browser checks.

## Delivered behavior and ownership

Activity now shows Tasks before Runs and Subagents. These are the current Session's real canonical `PlanState.plan` steps, including status and completed/total progress. The existing input-area `composerIntent.facts.snapshot` and sequenced `GoalPlanFeed` remain the facts owner. The view does not read private events, create another task store, fetch a second snapshot on mount, or infer tasks from prose. Ordinary Plan changes and clear tombstones update the open pane without manual Refresh.

Task rows are read-only. Viewing them does not submit a Run, change execution mode, open the plan editor or alter the draft. Original step order is retained; completed rows remain visible. A confirmed zero-step plan omits the section. Loading and error states are explicit, with retry inside Tasks; a disconnected Activity warns that its shown facts may be stale. Old or foreign Session snapshots are excluded before rendering. The existing refresh entrance also refreshes shared Goal/Plan facts for its captured visible Session.

The Plan contract caps steps at 100 (each title at 4,000 characters). The Activity body is the sole scroll region; the outer tool-pane body does not add a competing scroller. Section headings, progress, rows and margins use flex flow. Long task text is ellipsized, with complete title/status in tooltip and accessible row name. Icons reuse semantic `md`; typed English/Chinese labels remain in the Web host. No fake task-edit or Goal-control buttons were added.

## Verification

- Pure projection and existing live Goal/Plan suites: **9 tests / 60 assertions passed**. They cover zero/one/normal/100 steps, reject 101 via the real schema, retain same-Session facts during read recovery, and exclude foreign/cleared facts. The existing feed suite covers sequence races, clear tombstones, reopen and disposal.
- Production Web build passes, with the existing >1,500 kB chunk warning. Final assets: `artifacts/activity-tasks/web/assets/index-CN4qxDXI.js` and `index-MdX3t5BD.css`, 3,368 modules.
- Final targeted task flow plus the existing two-locale Run/child-Agent flows: **3/3 passed in 15.4 seconds**, output `test-results/activity-tasks-final`. The task flow verifies Plan updates without manual refresh, completed count, 100-row pane scrolling, clear/recreate, another Session with no foreign task, and unchanged composer draft. It uses public Plan commands and synthetic Sessions, without any model Run or paid provider. The Run/Agent fixtures use only their existing local-fixture model. Root inspected the [wide](../artifacts/activity-tasks/hbar-e2e/zh-tasks-wide.png) and [narrow](../artifacts/activity-tasks/hbar-e2e/zh-tasks-narrow.png) screenshots; [manifest](../artifacts/activity-tasks/hbar-e2e/manifest.json) ties them to the production asset.
- Affected strict TypeScript and scoped zero-warning ESLint pass after correcting a test's unchecked array index and moving cleanup validation outside its `finally` body. Content/icon/flow guards pass. Browser page-error assertions pass; Vite logs socket `ECONNRESET` when a temporary Host exits, so warning-free server logs are not claimed.

Full-repository, native desktop build/installation and the dependency-blocked SSR suite were not performed or certified. No primary checkout merge or push is part of this delivery.

## Remaining differences

CC tasks combine CLI Task/Todo tools and scoped transcript history. This implementation projects hbar's existing canonical execution Plan; it does not recreate CC's task files, infer stopped status merely because a foreground Run ended, or manufacture historical task groups. CC's main Activity input also excludes activeGoal: Goal is a separate header/slash lifecycle, not part of checklist completed/total. Hbar therefore keeps Goal in the conversation header and its dedicated controls rather than treating Goal aggregation into Activity as missing parity. The subsequent [Workflow entrance](desktop-activity-workflow.md) adds the current real focus/delegates and child drill-down, without inventing full phase history. Global parent/background-running aggregation remains separate work. `/agent` execution semantics are unchanged pending the earlier user choice. The overall experience goal remains active.
