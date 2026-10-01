# Desktop navigation: final entry audit, 2026-09-26

> **Current status index (read-only source review at hbar `5c83ef3c`, 2026-10-01).**
> This file preserves the historical entry matrix below; its baseline rows are not
> a current regression report. A fresh source and retained-evidence review found no
> new core navigation break in the main paths. The delivered current anchors are
> [chat search and its Host contract](desktop-chat-search-host.md),
> [the framed sidebar Search entry](desktop-sidebar-search-entry.md),
> [workspace organization (Projects/recent Projects/Time, hide, reorder and alias)](desktop-workspace-organization.md),
> [the project-row quick-create path](desktop-project-shortcut.md),
> [controlled session/workbench tabs](desktop-tabs-host-integration.md),
> [session tool ownership](desktop-session-tool-ownership.md), and
> [parent/background activity aggregation](desktop-sidebar-parent-activity.md).
> The current review did **not** rerun E2E, rebuild the app, start a Host/native
> window, or change product code, so these links are retained evidence rather than
> a new test result. In particular, the historical rows below that say “Commands
> only/no chat search”, “no visible tabs”, or “no hide/reorder/alias” must be read
> against the later feature records above, not reported as current gaps. The
> remaining bounded semantic difference is intentional: established sessions keep
> their registered workspace; project/branch launch controls apply to an empty
> first-send session, as documented in [session project context](desktop-session-project-context.md).

| Historical wording checked in this audit                 | Current source/feature anchor                                                                    | Retained proof scope (not rerun in this review)                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| “Commands only/no chat search”                           | `lumen-workspace-shell.tsx:1176-1208`; `session.recent/search` Host contract                     | `e2e/chat-search.spec.ts`; en/zh, 1440/320, recent/body search, hidden/archive rules, keyboard reopen/close                                      |
| “No hide/reorder/alias or Time organization”             | `lumen-workspace-shell.tsx:1257-1294,1374-1447,1461-1570`; `workspaceActivity` organization      | `e2e/sidebar-organization.spec.ts`; project/recent/time, alias, pin, drag/keyboard move, time paging and focus                                   |
| “Project quick create remains behind the menu”           | `lumen-workspace-shell.tsx:1573-1581`; `newSession()` at `:892-897`                              | `e2e/workspace-session-entry.spec.ts`; chooser paging, row quick-create, current-project follow, draft retention and invalid/valid path handling |
| “No visible session tabs”                                | `workspace-tabs.tsx:24-55`; runtime `MAX_WORKSPACE_TABS=32`, capture/restore/workbench ownership | `e2e/workspace-tabs-host.spec.ts`; independent drafts, close scopes, 32-cap, narrow overflow and unknown activity close                          |
| “Session/tool switching is not source-owned”             | session/workspace keyed draft/tool state and pinned Files binding                                | `e2e/session-tool-ownership.spec.ts`; A/B/C drafts, attachment/dirty Files, pinned cross-project Files, workbench return and archive/close       |
| “Parent/background activity is absent from project rows” | shared `SessionActivityIndicator` and Host `session.sidebar.list` summary                        | `docs/desktop-sidebar-parent-activity.md` and its retained real-Host E2E/screenshots; direct-child/background boundaries                         |

## Scope and evidence

This is an entry/ownership audit, **not a declaration that the complete cc-haha
desktop experience has been migrated**. P1 tool presentation, P2 session-owned
tools and P3 file previews close important flows but do not cover search,
project organization, every shortcut or missing native workbenches.

Baseline: hbar `a62f098` after P3 `0ee3099`, P2 `cdf2b49`, P1 `090fc0e`;
cc-haha `e28d0a653481ef41b7a329411eeb2f0fd5656731`. Product was read only.
Pre-existing Cargo, kernel, plugin SDK, desktop-smoke, web-shell, package and
other UI changes were preserved. No index operation or commit was performed
by the audit owner. The later sidebar implementation is a separate unit and
must not retroactively turn this baseline red evidence green.

Evidence levels used below:

- **Published:** personally inspected original
  `D:/Git/cc-haha/docs/images/app/en/session-new.webp` and
  `D:/Git/cc-haha/docs/images/app/zh-CN/h5-sessions.webp`. They show navigation
  hierarchy, Search chats/Refresh/Batch placement, project/session rows and
  narrow sidebar, but do not prove drag or menu actions.
- **Original component:** this audit renders the unchanged original `Sidebar`,
  `useSidebarResize`, store actions and theme in an isolated wrapper, with
  synthetic session records and stubbed I/O. The right-hand explanation area is
  explicitly **not** the original AppShell or chat. Real pointer/keyboard
  transitions prove the component's behavior, not original Host/native behavior.
- **Current hbar:** isolated production bundle `index-fbz8IPGL.js` /
  `index-BBy3EzVG.css`,3069 modules,697ms build, actual temporary Host, independent
  browser context, English/Chinese and1440/320. Settings/Status Back, A/B switch,
  menus, Ctrl+K and Files were clicked; original composer text stayed intact and
  both original sessions had zero Runs. This is browser evidence, not Tauri.
- **Source/retained tests:** identified explicitly for paths not re-executed.
  Existing P1–P3 evidence is reused rather than re-running their whole suites.

All new artifacts are under
`artifacts/desktop-final-entry-audit/navigation/`. The source and screenshots
are local audit outputs, not maintained tests or product fixtures. The first
reference attempt intercepted a Vite `/src/api/` module using an overly broad
route and did not mount; that harness error is recorded in
`reference-startup-failure.txt`. Restricting interception to the actual
fixture-origin `/api/` endpoint fixed it. It is not a cc-haha product failure.

## Bounded entry matrix

“Aligned” below means the named flow is delivered, not pixel-identical styling.
“Adaptation” means an explicit semantic/platform difference; “gap” means an
existing capability is not yet given the reference's entry/interaction; “contract”
means UI alone cannot honestly claim parity.

| Entry / user intent                 | Original cc-haha entry and behavior                                                                                                                | Current hbar / classification                                                                                                                                                                       | Evidence and remaining boundary                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main navigation hierarchy           | Brand/collapse, New session, Scheduled, Skills Market; Search/Refresh/Batch; project groups; bottom Settings                                       | Brand/hide, New session, Commands/Refresh; projects; bottom Host status, Status center, Settings. **Adaptation**, not complete feature parity                                                       | Published images; `Sidebar.tsx:1018–1107,1461–1475`; hbar `lumen-workspace-shell.tsx:714–793`; actual1440/320                                                                                                                                                           |
| Hide/show sidebar                   | Desktop collapses to icon rail; H5 becomes dismissible drawer                                                                                      | Explicit hide/show; no collapsed icon rail, narrow sidebar occupies usable page width. **Intentional adaptation**                                                                                   | Original `AppShell.tsx:312–352`, globals rail/drawer; hbar shared `workbench.tsx:129–149`, `workbench.css:458–477`; actual320                                                                                                                                           |
| **Resize sidebar**                  | Edge separator; pointer, Left/Right, double-click reset; remembered expanded width; drag past minimum collapses/drag out opens                     | Width already described and rendered, **no sidebar resize control**; tool separator is unrelated. **Highest ready-to-build gap**                                                                    | Original hook `useSidebarResize.ts:29–147`; hbar `App.tsx:907`, `workbench.tsx:38–59,129–149`; actual original280→300→420/reload/reset vs hbar272→272                                                                                                                   |
| Global New session                  | New-session view, then chooses working project/context; Cmd/Ctrl+N                                                                                 | Creates a real session in explicit/current/default workspace; picker when ambiguous; button and Ctrl/Cmd+N. **Adaptation with real Host intent**                                                    | hbar shell `519–551`; `workspace-navigation-actions.ts`; existing project shortcut tests; no claim reference creates the same entity at the same instant                                                                                                                |
| New session in project              | SquarePen at project row, stops row event; binds original directory                                                                                | Project row SquarePen binds original workspace; one common action, no duplicate menu entry. **Aligned**                                                                                             | Original `Sidebar.tsx:1334–1346`; hbar shell `877–883`; [shortcut delivery](desktop-project-shortcut.md)                                                                                                                                                                |
| Open/new project                    | Header folder-plus opens new blank project or existing folder; project editor can name/create; context may include branch/worktree                 | “Open workspace” dialog lists existing workspace plus explicit Host path; public `workspace.create` validates real directory. **Partial/adapted**                                                   | Original `Sidebar.tsx:1849–1864`, `ProjectEditorModal.tsx`; hbar shell `619–703`; no local chooser for arbitrary remote Host, no claim directory creation/branch workflow exists                                                                                        |
| Project expand/select               | Project chevron expands group; session row changes selected conversation; recent project organization is separate                                  | Chevron only expands roster; named row opens explicit `{workspaceId,sessionId}` and activates existing/new tab. **Aligned**                                                                         | hbar shell `816–953`; actual A/B draft preserved; pending/late-target protection retained                                                                                                                                                                               |
| Pin project                         | Project menu Pin/Unpin; project ordering preference                                                                                                | Project menu Pin/Unpin, host/device preference reconciliation and scoped failure. **Aligned with stronger explicit failure**                                                                        | Original `Sidebar.tsx:1525–1530`; hbar shell `854–932`; existing pin tests; actual menu present                                                                                                                                                                         |
| Hide/reorder/alias projects         | Project menu Edit display name, Hide/Restore; header Organize by project/recent/time, created/updated sorting; project dragging                    | Only pin and fixed group ordering; no Hide/restore-hidden, manual order or display alias UI. **Client-preference gap**, not missing filesystem rename                                               | Original `Sidebar.tsx:405–457,1504–1543,1868–1920`; hbar actual menu has Files/Settings/Pin/Archived/Refresh. Requires a separate bounded preference schema, not `workspace.rename` invention                                                                           |
| Session row metadata                | Compact title + relative updated time, running spinner/worktree mark; Task view groups running/day                                                 | Title + secondary updated date; workspace tabs show known activity, sidebar row itself does not. **Partial gap**                                                                                    | Original `Sidebar.tsx:291–309,2310–2351`; hbar `session-navigation-row.tsx:247–275`, `workspace-tabs.tsx:15–21`. `session.list` DTO has no activity fact; use existing observed session state or bounded `session.activeOperations`, never infer idle from absent cache |
| Session rename                      | Right-click → Rename; inline input; Enter/blur finishes, Escape exits                                                                              | Visible row-more menu → Rename; explicit Save/Cancel, CAS expectedTitle, nearby unknown/read-only reconciliation. **Adaptation**, common task complete                                              | Original `Sidebar.tsx:886–902,1480–1500`; hbar `session-navigation-row.tsx:148–310`; current menus actually opened; retained rename tests cover stale target                                                                                                            |
| Session removal                     | Right-click → Delete with confirmation; removes source history, closes corresponding tab                                                           | Archive confirmation explicitly preserves history; only confirmed archive retires tab, unknown retains; loaded archived view remains read-only. **Intentional non-equivalence**                     | Original `Sidebar.tsx:763–774,1630–1637`; public hbar `workspaces.ts:83–98`; [archive audit](desktop-navigation-archive-audit.md), [execution gate](desktop-external-archive-readonly-audit.md)                                                                         |
| Restore archived session            | No equivalent session undelete proved; project Restore means hidden project preference                                                             | Project menu → Archived sessions, bounded First/Next; explicit Restore does not open/navigate; manual open afterwards. **hbar capability, not copied cc restore**                                   | `session-archive.tsx`, `session-archive.ts`; actual project menu; retained archive E2E                                                                                                                                                                                  |
| Bulk management                     | Search-adjacent Batch; select/group/shift-range; confirm Delete selected; report successful/failed original IDs                                    | No bulk-archive list UI. **Gap plus unresolved mutation contract**, not a missing button only                                                                                                       | Original `Sidebar.tsx:776–847,1096–1158,1638–1668`; hbar single `session.archive` exists, but no atomic bulk receipt. A separate bounded per-item coordinator could be specified; cannot rename cc Delete or promise all-or-nothing with the single API                 |
| Session fork                        | Fork belongs to transcript boundary, not original row Rename/Delete menu                                                                           | Message-local fork/eligibility/receipt and new tab delivered; row menu intentionally lacks duplicate Fork. **Aligned boundary**                                                                     | hbar `lumen-session-workspace.tsx:503–522`, `workspaces.ts:99–145`; row menu absence is not proof backend lacks fork                                                                                                                                                    |
| **Search chats**                    | Sidebar Search, Cmd/Ctrl+K; recent8; text search50 sessions, up to3 snippets/session, truncation; mouse/↑↓/Enter/Escape/IME; opens matched session | Ctrl+K opens **Commands**, with command-name filtering and parameter forms, not conversation search. `session.list.title` is title-only. **Real gap / new Host search contract and privacy choice** | Original `GlobalSearchModal.tsx:12–15,95–146,189–208,225–317`; hbar shell `413–425`, `command-palette.tsx:250–318`; actual screenshot explicitly named commands-not-search; no message search DTO verified                                                              |
| Current-view find                   | Ctrl/Cmd+F; original scoped Range highlights plus virtual conversation index; next/previous/count                                                  | No application-owned Ctrl+F scoped find entry found. Browser native find cannot certify virtual/unloaded history. **Bounded local UI gap**, full-history semantics need explicit scope              | Original `useKeyboardShortcuts.ts:68–73`, `FindInPageModal.tsx:15–36,130–175`; hbar onlyCtrlK/New shortcut handlers. A truthful first version must say “loaded conversation” and exclude sidebar/composer/hidden tools                                                  |
| Refresh roster / external changes   | Search-adjacent Refresh; focus/visibility refresh, preserves rendered list while index rebuilds                                                    | Adjacent Refresh + per-project Refresh, bounded scan/get reconciliation, observational navigation. **Delivered with known capacity adaptation**                                                     | hbar `session-roster-refresh.ts:9–13`; [roster record](desktop-session-roster-refresh.md); ≤1000 scan/30s, visible truncation, not globally complete incremental indexing                                                                                               |
| Open session tabs / close / reorder | Top horizontal tabs, drag, individual X, close others/left/right/all; active work confirmation                                                     | Bounded32 tabs, mouse + keyboard reorder, original scope snapshot, safe Run-close decisions, persisted view refs. **Aligned/adapted**                                                               | Original `TabBar.tsx:360–400,439–524,676+`; hbar `workspace-tabs.tsx:133–164`; P1/P2 retained actual Host evidence; closing view is not archive/cancel                                                                                                                  |
| Settings and Status return          | Settings is a tab; status/usage mostly Settings/activity or conversation controls                                                                  | Global/session/workspace Settings is a page with explicit Back; Status center is a separate page with Back. **Intentional adaptation, return complete**                                             | Original `Sidebar.tsx:1466–1474`, `ContentRouter.tsx`; hbar `surfaces.ts`, `lumen-settings-workspace.tsx`, `lumen-status-workspace.tsx`; this audit actually clicked Settings/Status→Back with same draft                                                               |
| Session tool buttons                | Contextual Files/Browser, Terminal/activity/agents according to source session                                                                     | Files/Monitoring/Agents/Goals on conversation header, now owned per session; project Files is explicit pinned override. **Delivered layout/ownership adaptation**                                   | P1/P2 [presentation](desktop-workbench-navigation-presentation.md); no claim four hbar tools equal every original tool                                                                                                                                                  |
| Tool width/page/keyboard/focus      | Resizable workbench; compact and expanded presentation with original ownership                                                                     | P1 available-body split/page, tool resize, source return/focus, native modal safety; page navigation never covered by inert background tool. **Delivered**                                          | `090fc0e`; retained P1E2E/native; current actual Files shows one tool separator, confirming sidebar resizer still absent                                                                                                                                                |
| Files and preview tabs              | Changed/All, tree/filter, document/diff, multi-preview tab strip, expand/back                                                                      | Real file.find/tree, document and distinct staged/worktree diffs, protected draft/unknown close,32refs, per-preview reading state. **Delivered with explicit semantic differences**                 | P3 `0ee3099`; [P3 delivery](desktop-file-preview-tabs.md). cc HEAD-combined diff is not hbar staged/working; no automatic restart persistence or fabricated image preview                                                                                               |
| Browser                             | Native session-owned embedded WebView; address/history/reload/picker                                                                               | Automation Host commands are not a safe embedded UI. **Platform/security contract blocked**                                                                                                         | [Browser boundary](desktop-browser-preview-boundary.md); ignored spike found WebSocket bypassing resource-request sandbox. No relabeling screenshots/iframe as parity; local preview trust choice unresolved                                                            |
| Terminal                            | Interactive PTY dock/tabs, resize, shell lifecycle                                                                                                 | Desktop runtime terminal UI returns CAPABILITY_UNAVAILABLE; ordinary tool output is not PTY. **Missing interactive Host/platform contract**                                                         | Original Terminal references in [remaining workbench audit](desktop-workbench-remaining-audit.md); runtime `index.ts:597`                                                                                                                                               |
| Agent/Team entry                    | Independent agent-run view, Team topology/member inbox                                                                                             | Agents/child session/run inspection has real contracts and paths; no equivalent Team mailbox/membership replay. **Partial/contract**                                                                | [remaining workbench audit](desktop-workbench-remaining-audit.md); no mock graph or menu should imply Team backend                                                                                                                                                      |
| Scheduled / Skills Market           | Top-level desktop Scheduled/Market; mobile intentionally hides those two entries                                                                   | hbar workflow/skill management has narrower public abilities; no equivalent schedule/marketplace browse/install flow verified. **Contract/product-scope gap**                                       | Original `Sidebar.tsx:1034–1065`; existing commands are not proof of recurring job scheduler or marketplace service                                                                                                                                                     |
| Global shortcuts / Stop             | New, Search, scoped Find, app zoom, Cmd/Ctrl+. Stop                                                                                                | New and Commands implemented; tool Escape and tab keys implemented; no app-wide Ctrl+. Stop or app zoom mapping identified. **Shortcut gap with existing targeted cancel**, not absent Stop UI      | Original `useKeyboardShortcuts.ts:40–89`; hbar shell/key focus handlers; any Stop shortcut must bind captured active Run and honor modal/IME/editing scope                                                                                                              |
| Connection / diagnostics            | Original startup error retry, session connection status, Settings diagnostic surfaces                                                              | Sidebar named Host status/reconnect + Status dashboard/usage/Git and Settings diagnostics. **Adapted entry**                                                                                        | Actual connected1440/320; offline/error semantics come from existing dedicated tests, not re-proved by a connected screenshot                                                                                                                                           |

## Next implementation: sidebar width, not a new navigation system

This is the highest-confidence small full loop: repeated long project/session
labels are clipped at the fixed272px sidebar even though the layout contract
already allows a remembered width. The original component makes that boundary
interactive, and the same intent needs neither a new Host query nor a second
workspace state store.

Original implementation and history:

- `D:/Git/cc-haha/desktop/src/hooks/useSidebarResize.ts:29–147`, introduced by
  `8eba29bd`: live drag updates the shell variable; settled drag stores width;
  keyboard step20; double-click resets280. Store clamps240–480px
  (`stores/uiStore.ts:29–40`). Drag-collapse has hysteresis180/200.
- `components/layout/AppShell.tsx:329–352` mounts named vertical separator only
  off mobile; `useMobileViewport.ts:3` uses767px. Shared reference theme owns
  the edge affordance (`globals.css:1786–1821`), not screenshot coordinates.
- At320, original Sidebar component is280px and resizer absent. The original
  H5 published image demonstrates drawer context; this audit wrapper does not
  claim to re-prove its backdrop/focus or native Electron behavior.

Current hbar seams, pinned to the audit baseline:

- `apps/web/src/shell-layout.ts:5–18`: canonical `projects.size`12–24rem,
  default17rem in `shell-layout.json`; normalization retains oldV1/V2 values.
- `apps/web/src/App.tsx:798–810,907–925`: canonical layout supplies sidebar width;
  only the tool has a commit coordinator.
- `packages/app-react/src/lumen-workspace-shell.tsx:119–122,583–590`: pass-through
  width exists, no typed sidebar resize entry.
- `hbar-ui/packages/lumen-app-ui/src/workbench.tsx:38–59,129–149`: sidebar flex
  container is the correct shared seam. Existing tool separator is owned by the
  body and must not be reassigned to the sidebar.
- Reuse `layout.commit` expectedRevision and existing client-preference port;
  `apps/web/src/tool-pane-layout.ts:15–30,42–90` is a behavior precedent, not a
  reason to copy a second canonical layout state.

Recommended boundary agreed with the root:

1. A named, keyboard-focusable, vertical **flow separator** adjacent to the
   sidebar; live pointer preview, one settled save, root-rem-aware min/max. Left
   shrinks, Right grows; Home/End bounds, Enter/double-click reset; Escape and
   pointercancel abandon transient width without a write.
2. Keep hbar's existing explicit Hide/Show. **Do not add a new icon rail or
   drag-to-collapse merely to mimic cc**: hbar's hidden state has no rail and its
   session/tool focus/navigation policy differs. Clamp width rather than invent
   an unexplained new navigation mode. No passive resize should change saved
   width or automatically select a project.
3. Narrow390/320 remains existing full-width navigation; no separator/tab stop,
   preserve desktop preference for return.900 must be verified according to the
   actual shared sidebar breakpoint and remaining main/tool width, not an
   assumed1280 viewport rule. Larger sidebar may legitimately cause the P1
   tool to become page presentation; it must not discard Files/drafts or kill
   an already open native dialog.
4. Width is device/Host-scoped layout preference, not session data. Preserve
   unrelated tool preferred width/visibility on CAS retries; disabled pending
   persistence, local saving/failure/manual retry; distinguish applied locally
   from persisted. No blind write on unknown restore and no global toast-only
   failure. No side effects on Run, session, file or Provider.

### Fresh baseline measurements and screenshots

The original component's real pointer/key script passed in both locales:
280 initial → Right300 → pointer420 → reload420 → double-click280; no separator
at320, no root overflow, pageerror0. hbar actual Host measured272 before and
after an attempted100px boundary drag; separator count0 without a tool and1
with Files. The desired sidebar-resize assertion is explicitly **red**
(`Expected:1, Received:0`) in both `hbar-*.json`; the evidence collector exiting0
does not make that unmet expectation pass. A drag selects ordinary page text
instead, saved separately from normal screenshots.

- [Original component, desktop expanded](../artifacts/desktop-final-entry-audit/navigation/cc-original-sidebar-dragged-en-US-1440.png)
- [Original component, narrow Chinese](../artifacts/desktop-final-entry-audit/navigation/cc-original-sidebar-zh-CN-320.png)
- [Current hbar desktop](../artifacts/desktop-final-entry-audit/navigation/hbar-sidebar-en-US-1440.png)
- [Current hbar failed edge drag](../artifacts/desktop-final-entry-audit/navigation/hbar-sidebar-drag-selects-text-en-US-1440.png)
- [Current hbar narrow Chinese](../artifacts/desktop-final-entry-audit/navigation/hbar-sidebar-zh-CN-320.png)
- [Current hbar tool-only separator](../artifacts/desktop-final-entry-audit/navigation/hbar-tool-only-resize-en-US-1440.png)
- [Original project organization menu](../artifacts/desktop-final-entry-audit/navigation/cc-original-organization-menu-en-US-320.png)
- [Current project actions](../artifacts/desktop-final-entry-audit/navigation/hbar-project-menu-en-US-320.png)
- [Current Commands, not Search chats](../artifacts/desktop-final-entry-audit/navigation/hbar-commands-not-search-en-US-1440.png)

## Acceptance and subsequent priorities

Sidebar implementation needs English/Chinese1440/900/390/320 real Host tests:
pointer + keyboard/reset, Escape/cancel0writes, save/reload, Hide/Show, session
A/B composer and Files dirty state, Settings/Status return, independent tool
width, long names/no root overflow, original-target persistence failure and
manual retry. A narrow transition cannot overwrite the desktop preference.
Tests must use isolated profiles and owned processes; old protected PIDs9572
and48668 are never targets. An active native dialog during presentation changes
remains an important P1 regression, not a reason to hide/unmount its ancestor.

After that, the strongest remaining navigation candidates are:

1. **Local scoped find** with honest loaded-history limits, real next/previous
   and focus return, rather than another opaque command. Full Search chats
   remains separate until privacy/index/archive/deletion/query pagination are
   chosen and supplied by a bounded Host contract.
2. **Project organization/hide/display alias** as bounded host/device
   preferences, with a reachable Restore-hidden entry and no mutation of the
   real directory or its session history. This can follow the existing pin
   owner; manual reordering must not pretend the loaded bounded roster is the
   complete global list.

Sidebar running indicators are also useful, but a cache miss is not an idle
fact. A local projection of already observed activity can be delivered without
query fan-out; global correctness would require an explicit bounded summary
contract rather than polling every session forever. Terminal, arbitrary embedded
Browser, Team, marketplace and recurring schedules are not visual-only commits.

This audit does not modify products, old tests or shared dist. The new maintained
sidebar-resize test and product implementation are subsequent owned work and
must carry their own fresh asset, lint/typecheck/E2E/native evidence.
