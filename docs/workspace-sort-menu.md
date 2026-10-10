# Projects and Sessions header sort menu

`WorkspaceHeaderSortMenu` owns the Projects and Sessions header's More menu. It receives the selected `WorkspaceActivitySortBy`, pending/availability flags, action callbacks, and all visible text from its host. It offers the two source-backed sort choices, plus the existing restore-hidden and refresh actions. It does not expose CC-haha's organize modes because Hbar does not implement those modes in this menu.

The sort submenu is a fixed, bounded set of two choices. Restore hidden appears only when its host-provided count is greater than zero; refresh always appears. The short menus grow with their rows. Their overlay containers cap themselves to the available viewport and allow scrolling only when the viewport cannot show the natural content. The owning runtime persists the selection and supplies the ordered workspace/session projection. Choosing a sort does not create or open a session, change navigation, or change the meaning of the session row's last-updated caption.

## Source evidence

The reference is the original exported CC-haha `Sidebar` at revision `e28d0a653481ef41b7a329411eeb2f0fd5656731`, captured in `artifacts/project-sort-reference/`. Its `Sort condition` flyout has checked `createdAt` and `updatedAt` choices, with “Created time” and “Updated time” copy (Chinese: “创建时间” and “更新时间”). The separate organization options (“By project”, “Recent projects”, and “By time”) are not sort choices and are not added here. Restore hidden and refresh remain in Hbar's existing header-menu entrance; they are Hbar actions, not part of the captured CC-haha sort evidence.

The artifact README and capture reports identify the evidence boundary: the fixture mounts the original Sidebar with synthetic sessions and replaces preference writes in memory. It does not demonstrate Host, native-shell, profile, model, or real filesystem integration. At the wide viewport the sort flyout opens beside its row; at 320px it flips to remain inside the viewport. The implementation measures its actual trigger and row rectangles, uses those measurements to place native top-layer popovers, and keeps all menu content in flex flow.

## Interaction and ownership

- The More trigger retains the `workspace-organization-menu` test root and exposes `data-workspace-menu-trigger` for focus recovery.
- `Sort condition` opens a nested menu. Up/Down and Home/End move among enabled choices; Right opens the flyout; Left or Escape closes the flyout and returns focus to its row. Escape from the main menu returns focus to More.
- Native popover light-dismiss closes the main menu on outside click or Escape. The child flyout closes on pointer interaction outside its own row and content, while clicks elsewhere in the main menu remain usable.
- Both sort options expose `role="menuitemradio"` and `aria-checked` from the controlled selection. A pending update disables only sort changes and displays the host-supplied pending message next to the trigger.
- Icon glyphs use the existing semantic `LumenIcon` tiers; hit-area dimensions remain separate from glyph size, with a larger touch target on coarse pointers.

## Verification scope

The DOM-free placement test passes for the measured wide and narrow viewport cases. The authored SSR component test covers host-supplied English and long Chinese labels, the checked option, pending/disabled state, and optional restore action, but remains unrun because importing the current app-ui barrel is blocked by the missing `prop-types` dependency. The original-source fixture is visual evidence only; production interaction and persistence are owned by the Hbar runtime and shell-host E2E.

## Production integration and verification

The Shell now reads the persisted Runtime activity projection for both project and Session rows. Project groups use each project's latest unarchived Session timestamp, not the Workspace creation date; nested Session rows follow the same chosen creation/update sort. Pins remain first and hidden IDs remain excluded. The ordinary project picker retains ID-based discovery and its existing presentation. Switching sort does not select a Session or modify its draft. Session date captions continue to show update time, as in the original CC Sidebar.

Labels come from the typed English/Chinese Web copy bundle. Icons use shared semantic tiers and the existing Lumen theme; the migration preserves entrance hierarchy and interaction semantics rather than copying CC's palette or missing fixture icon font. Only the two measured top-layer menu containers receive the path-scoped layout-guard exception. Menu rows remain flex flow.

Wide layouts can open the flyout on mouse hover. In constrained layouts, where the flyout would cover its own parent row, click or keyboard opens it instead. This was corrected after a real 320px pointer click was intercepted by the newly hovered flyout; the test was not changed to force-click through the overlay. Nested arrow keys are consumed by the child menu, and Escape returns first to Sort condition, then to More. Both locale flows verify those paths.

Final build: `artifacts/workspace-sort/web`, JS `index-YdfZ0jnW.js`, CSS `index-BaSs1SAu.css`. Build passed with the existing large-chunk warning; no bundle-size or native performance result is claimed. The final temporary-real-Host run is `test-results/workspace-sort-v4`: three tests passed in 19.5s, comprising the new two-locale sort flow and two existing hide/restore regressions. The sort fixture creates six projects and 120 Sessions; its update leader lies outside the first 100 ID rows. The flow checks Host-backed group and Session order, appending all 115 primary-project Sessions without dropping the first page, pin/hidden preservation, current Session/draft preservation, persisted selection after reload, viewport bounds, checked state, and keyboard focus. No Run or external model request is executed.

- `English wide created-time menu`（历史产物未随当前仓库提供；原路径：`../artifacts/project-sort-reference/hbar-e2e/en-US-1440-created-sort-submenu.png`）
- `Chinese narrow created-time menu`（历史产物未随当前仓库提供；原路径：`../artifacts/project-sort-reference/hbar-e2e/zh-CN-320-created-sort-submenu.png`）
- [Runtime ownership, limits and regressions](workspace-activity-runtime.md)
- [Session activity query](session-activity.md)

Root inspected the actual wide/narrow production screenshots. Affected-graph strict TypeScript, scoped lint/formatting, content/icon/flow guards and the guard self-test passed. The combined relevant unit run passed 23 tests / 122 assertions. Full-repository/native checks and dependency-blocked SSR rendering are not passing evidence. This slice does not add CC's separate organization modes or manual project ordering and does not complete the overall desktop-experience goal.

The first browser build failed Runtime construction because of the new command descriptor shape; Runtime commit `2900e143` corrects it and the disposal regression without weakening existing tests. The second build passed the old hide/restore paths but exposed the constrained-hover click issue. Those failed runs are retained as diagnostic artifacts, not delivery evidence. Temporary fixture data is removed after the owned Host stops; the preview and fixture processes are checked closed at handoff.
