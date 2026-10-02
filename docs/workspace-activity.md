# Workspace activity query

`workspace.activity.list` is a read-only, Host-owned page for ordering workspaces by
the activity of their Sessions. It keeps the existing ID-ordered `workspace.list`
contract unchanged.

The query supports `sortBy: "createdAt" | "updatedAt"`; the default is
`"updatedAt"`. For each workspace it returns `latestSessionCreatedAt` and
`latestSessionUpdatedAt`, computed from non-archived Sessions in that workspace.
Child Sessions count. A workspace with no non-archived Sessions has `null` for both
fields and sorts after workspaces with timestamps. Equal timestamps sort by
workspace ID ascending. These fields describe Session activity; `Workspace.createdAt`
is not used as a fallback.

The cursor contains `sortBy`, the directory activity `revision`, the last selected
timestamp (nullable), and the last workspace ID. A cursor used with another sort is
invalid. If a relevant Workspace or Session fact changes between pages, the query
returns `STALE_CURSOR`; the caller must restart from the first page. The activity
revision and page rows are read in one SQLite transaction. The same transaction
reads up to 20 requested `includeWorkspaceIds` and returns existing summaries outside
the current page in `includedItems`; these rows do not affect page order or cursor.
The combined page and included summary count is at most 220.

Schema migration 13 adds per-workspace indexes for active Session creation and
update time and triggers a persisted directory activity revision when Workspace
metadata or Session workspace, archive, creation, or update fields change. Each
page performs two indexed top-one Session lookups per Workspace and orders the
Workspace results. The Session history lookup is indexed, but the outer ordering
still scales with the number of Workspaces; this query does not claim constant work
for an unbounded Workspace roster. It does not build a full-history group-by or a
separate activity snapshot table.

This contract and storage query are the backend foundation only. The current
workspace sidebar still uses `workspace.list` until its sort preference, pin
handling, hidden filter, and stale-cursor recovery are integrated with this query.

The normal client path uses the existing `command.execute` directory dispatcher;
the read-only directory adapter also accepts this query. No legacy RPC method or
new Host endpoint was added. Focused storage/service checks passed 2 tests / 12
assertions, and the affected contract, Kernel, Storage, client adapter and test
graph passed scoped strict TypeScript. Scoped lint and formatting were checked.
Formatting the touched Kernel composition root also normalizes existing wrapping;
its complete diff was verified as the formatted baseline plus one activity-query
binding, with no additional behavioral change. Browser/Host checks and sidebar
integration are recorded separately when delivered.
