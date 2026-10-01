# Desktop sidebar organization: CC-haha reference migration

## Reference and design decisions

Read-only reference: `D:/Git/cc-haha`, revision
`e28d0a653481ef41b7a329411eeb2f0fd5656731`. This slice follows the original
`desktop/src/components/layout/Sidebar.tsx`, `SidebarTaskList.tsx` and
`sidebarTaskGroups.ts`, not a redrawn screenshot.

The original Sidebar was rendered with synthetic sessions and in-memory
preferences in an isolated browser fixture. The ignored evidence is under
`artifacts/project-sort-reference-v5/`; its manifest records the original
components, source revision, local calendar dates, browser sizes and mock
boundary. Root inspected the English 1440 px time view and checked organization
submenu, plus the Chinese 320 px time view. This is original component evidence,
not a capture of the full native CC application. Material Symbols may display
fallback glyphs in the reference fixture.

| Entrance                                           | Reference behavior                                                                                            | hbar migration                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Projects / Tasks heading → More → Organize sidebar | By project, Recent projects, By time; checked choice                                                          | The same three controlled choices before the separate Sort condition submenu                               |
| By project                                         | Project groups ordered by effective display name                                                              | Host resolves aliases and locale-aware order across all projects before pagination; pins remain first      |
| Recent projects                                    | Project groups ordered by session creation/update activity                                                    | Existing creation/update choice remains separate from organization                                         |
| By time                                            | Flat cross-project task list, active first; then Today, Yesterday, Previous 7 days, Previous 30 days, Earlier | Global Host feed; local-calendar grouping by Session.updatedAt; workspace context on each row              |
| Brand → task toggle                                | Switch into time view, or return to previous grouped mode                                                     | Bell toggle uses the same organization owner as the menu; previous grouped mode is saved with current mode |
| Time row                                           | Open the task with its project context                                                                        | Reuse existing open, rename, archive and batch-selection handlers                                          |

Organization is a view preference, not a project or session navigation action.
The selected session, composer draft, model and thinking level remain unchanged.
The time view ignores project pins and the creation/update sort choice. Hidden
projects are excluded by the Host query and defensively by the view. Normal
content is flex flow; only the evidenced trigger-bound menus use overlays. The
sidebar pane remains the single scroll owner. All new labels and execution
status text are typed host-owned English/Chinese copy; icons use existing
semantic size tiers.

## hbar execution adaptation and remaining parity

CC's running set also includes running background agent work owned by a parent
session. The new hbar feed summarizes **direct nonterminal Runs** using durable
Host facts (queued, running, waiting for approval, stopping). It does not infer
agent ownership from arbitrary child sessions or parse plugin-private events in
Storage. A child session with its own active Run can be listed independently.
This does not yet claim parent-background-agent aggregation parity.

CC stores the previous grouped mode in a component ref. hbar saves it together
with the current mode, so a reload can still return to the previous grouping.
CC evaluates the clock when its memo recalculates; the existing hbar minute
clock also recalculates date groups. Neither behavior is evidence of a native
calendar scheduler.

Manual project drag ordering is outside this slice. The default migrated
organization and sort rules are deterministic; no hidden manual order is
invented. No native installation, real provider call, real profile mutation,
primary-worktree merge or push is part of this change.

## Delivery and verification

- `42f84fd5`: pure calendar grouping and five unit tests (18 assertions), strict
  affected-graph TypeScript, lint, format and guards.
- `f6e153e6`: public project organization and global direct-Run queries, schema
  14, and non-token activity hints. Backend checks and the existing activity API
  regressions passed: seven tests, 65 assertions.
- `1f40da89`: one Runtime owner for organization preferences, shared retention
  and global refresh. Runtime checks plus existing canonical Directory regressions
  passed: 11 tests, 66 assertions. Refreshes larger than 200 rows accept and publish
  validated cursor prefixes, not an atomic 900-row replacement.
- Final production Web assets: `index-Drhcp_lG.js` and `index-CW6X3naw.css`,
  3,359 modules. Build succeeded with the existing large-chunk warning; this is
  not a bundle-performance certification.
- Root ran `e2e/sidebar-organization.spec.ts` and the existing
  `e2e/workspace-sort.spec.ts` on those exact assets: **3/3 passed in 19.6 s**,
  recorded in `test-results/sidebar-organization-v6`. The new normal flows check
  English 1440 px and Chinese 320 px, aliases/pins/hidden project order, six date
  groups, 60 + 9 row paging, menu checked states and Escape focus, mode persistence,
  and offscreen mock cancellation updating the time row while retaining all 69
  loaded IDs. In-mode navigation, draft, model and thinking are preserved.
- Root inspected all four final captures in
  `artifacts/sidebar-organization/hbar-e2e/`, including top/bottom time views and
  the narrow submenu. The final visual adjustment left-aligns row metadata and
  removes the redundant leading chat icon from time rows only. Content/icon/flow
  guards, integrated strict TypeScript, scoped lint/format and diff checks pass.
- SSR row/menu checks currently stop at the repository's missing `prop-types`
  dependency in the existing MUI import path. No dependency installation or
  mocking is used to relabel those checks as passing.
- A full-repository TypeScript run also has unrelated preview/declaration
  diagnostics; targeted checks do not certify the entire repository or native
  desktop.

Earlier browser attempts found test-fixture assumptions, not reasons to change
the production contract: the selected fixture needed an explicit local model to
render thinking controls; equal-time Earlier rows are paginated by ID rather than
creation order; and the pre-existing hbar draft owner is in-memory across a full
page reload. The final tests retain the in-mode draft assertion and limit reload
verification to persisted organization, selected tab and Host model configuration.
The old sort regression now observes `workspace.sidebar.list`, the new sidebar
query, while its order expectations remain verified against Host facts. No
production draft persistence is claimed or added in this slice.
