# Workspace Activity Runtime Owner

`createWorkspaceActivity` owns the sidebar's activity sort preference and the
bounded ordered projections returned by `workspace.activity.list` and
`session.activity.list`. It does not replace the ordinary `workspace.list`
contract: picker, navigation, and existing Workspace lookup behavior continue to
use their existing owners.

## Preference and query lifecycle

The host-scoped client preference key is `workspaceActivitySortBy`. Its accepted
values are `createdAt` and `updatedAt`; a missing key means `updatedAt`. The owner
waits for preference hydration before its first explicit refresh or page request.
Changing the sort uses the existing `preferences.set` compare-and-swap command,
then discards old activity cursors and loads a first page for the selected sort.

If preference restore or a sort write has an unknown result, the owner exposes
`preferenceStatus: "error"` and keeps the last locally confirmed order. An
explicit `workspaceActivity.refresh` or `workspaceActivity.loadMore` performs a
read-only preference refresh first. It adopts the persisted sort before querying
and never retries an uncertain write as part of reconciliation. A failed
preference read leaves the previous order and the preference error visible.

`workspaceActivity.refresh({})` refreshes the Workspace page and each currently
tracked Session group, including previously opened groups that are now collapsed.
The refresh-all path uses four workers. Passing `workspaceId` refreshes only that group's
first Session page. `workspaceActivity.loadMore` accepts either the Workspace
scope or a Workspace ID for a Session group. A stale cursor gets one bounded
first-page restart; a second failure remains an explicit page error. Query
generations and abort signals prevent superseded pages from replacing newer
state.

## Canonical records and bounded projections

Activity pages store ordered Workspace and Session IDs plus the activity fields
needed to order Workspace rows. The canonical Workspace and Session records
remain in the Directory owner; the activity owner does not keep a second DTO
cache. Accepted Session pages are projected through the existing Session
projection fence before their IDs and cursor become visible.

Workspace activity uses pages of at most 60 rows, up to 200 ordered Workspace
rows, and up to 20 separately requested pinned summaries. This retains at most
220 activity/pinned Workspace records in the canonical Directory map, in
addition to its 200-record ordinary Workspace budget. Pinned rows are ordered by
the selected activity timestamp, null activity sorts last, and Workspace ID
breaks ties. The existing pin owner still decides which pins are missing; the
existing organization owner still applies hidden-project visibility after the
pin-first projection.

Expanded Session groups also use pages of at most 60. Up to 220 Workspace groups
may be tracked, with at most 900 retained Session IDs total. The canonical
Directory Session map remains capped at 1,000 records, leaving room for the
selected Session and ordinary reads. Reaching an ID cap leaves a cursor-backed
`hasMore` indication and sets `limitReached`; exceeding the expanded-group cap
is rejected without adding an unbounded group entry.

## Incremental updates

Confirmed Session facts update any matching visible Session group and increase
known Workspace activity maxima locally. New or archived Sessions, or activity
for a Workspace outside the loaded page, schedule a bounded page refresh rather
than re-querying on every streamed token. Equivalent confirmed facts are
deduplicated by Workspace, sequence, activity timestamps, and archive state.
Changing the pin set refreshes the Workspace activity query so pinned summaries
remain resolved outside the ordered page.

The focused Runtime coverage verifies that a second Session page preserves the
accepted first page and that explicit refresh can recover a previously failed
preference restore by reading (not writing) the persisted sort.

## Delivery verification

The Runtime, existing navigation/directory and pin suites passed together: 18 tests / 96 assertions. The combined activity/data/menu-model run passed 23 tests / 122 assertions. The affected Runtime/Shell/copy/E2E dependency graph passed strict TypeScript, and scoped lint, formatting and diff checks passed. Full-repository and native gates are not certified by this slice.

Integration caught two new defects before delivery: a root discriminated-union command input was not accepted by CommandRegistry's strict-object descriptor, and releasing empty activity retention unnecessarily replaced the Directory snapshot during disposal. The command now uses a strict object with scope refinement, and unchanged projections preserve snapshot identity. The existing disposal regression was kept and passed; its assertion was not weakened. The first browser build exposed the invalid command definition and is not passing evidence. Production UI results are recorded separately in the menu delivery document.
