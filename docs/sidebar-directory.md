# Sidebar directory queries

The public contract entry is `@hbar/contracts/sidebar-directory`. The Host exposes three read-only commands through the existing `command.execute` directory dispatcher:

- `workspace.sidebar.list` supplies the sidebar's Workspace rows for the `project` and `recentProject` organizations.
- `session.activity.global.list` supplies a global time-ordered Session page with Workspace context and a compact execution summary.
- `session.sidebar.list` supplies a Workspace's timestamp-ordered Session page with the same execution summary, for project/recent-project rows.

Pages are bounded to 200 rows with a default of 60. Workspace and global cursors include directory, display-name and hidden-organization revisions. The per-Workspace Session cursor includes directory revision, Workspace ID and selected timestamp sort. Changed revisions return `STALE_CURSOR`; cursor parameter mismatches return `INVALID_INPUT`.

## Workspace organization

`workspace.sidebar.list` accepts `organization: "project" | "recentProject"`, `sortBy: "createdAt" | "updatedAt"`, `locale: "en-US" | "zh-CN"`, an optional cursor, a limit, and up to 20 unique `includeWorkspaceIds`. It excludes hidden Workspaces in both organizations. Requested Workspace summaries outside the current page are returned in `includedItems`; they do not change page order or cursor position.

`project` orders visible Workspaces by `Intl.Collator(locale)` over their effective display name. A collator tie uses Workspace ID's UTF-8/BINARY order. `sortBy` does not change this alphabetic order, but it remains part of the strict cursor and must match the request. The Host streams Workspace rows from SQLite and retains only the best `limit + 1` candidates in a bounded max heap. This keeps JavaScript candidate memory proportional to the page size; each page still scans the Workspace roster.

`recentProject` orders visible Workspaces by the selected latest non-archived Session timestamp descending, then puts Workspaces without a non-archived Session last, with Workspace ID's UTF-8/BINARY order for ties. The timestamp fields are computed from all non-archived Sessions, including child Sessions. They do not fall back to Workspace creation time.

The effective display name is the Host/data-root alias from `workspace_display_names_state` when one exists, otherwise `Workspace.name`. It never falls back to the filesystem path. The display-name snapshot supports at most 2,000 aliases and 256 KiB of encoded data. Alphabetic ordering uses the requested locale; it does not depend on a browser-only preference.

## Global Session time feed

`session.activity.global.list` takes an optional cursor and a limit. It returns all visible, non-archived Sessions across Workspaces, ordered by nonterminal workload first, then `Session.updatedAt` descending, then Session ID in UTF-8/BINARY order. The cursor contains the active phase, timestamp, and Session ID tie-break, so equal timestamps page without skipping or repeating a Session.

Each item includes the canonical Session, canonical Workspace context, its effective Workspace display name, and `execution`. The summary counts `queued`, `running`, and `waiting_approval` Runs of the Session and its immediate non-fork children. `activeCount` includes queued Runs and `queuedCount` is its queued subset. State priority is `cancelRequested`, `waiting_approval`, `running`, `queued`, then `idle`. A queued-only Session is distinguishable from one whose Run is executing. The summary contains no prompt, model input, or tool arguments.

An idle parent stays active while a direct background child works, using public `Session.parentId`, persisted Runs and Storage's `session.forked` marker. Independent forks are excluded; grandchildren are not recursively counted. No private `agent.created` event is decoded and no global Agent table is introduced. Archived/hidden children still contribute to a visible parent because hiding is not cancellation; their own rows remain filtered. This summary is neither a tab-close policy nor a Goal-completion signal.

The global page reads revisions, visible Sessions, Workspace context, aliases and summary in one Storage Worker transaction. Schema 14 advances directory revision when Runs are inserted, deleted, or change Session/status/start/end fields, including claim's `queued` to `running` transition without a Session event. Schema 15 additionally invalidates parent-link changes and indexes `(sessionId,type)` event lookup. Hidden-organization/display-name changes invalidate applicable cursors through their own persisted revisions. A partial nonterminal-Run index supports active-Run lookup; this change does not claim a measured latency improvement or constant-time queries.

## Project Session feed

`session.sidebar.list` accepts the same `workspaceId`, `sortBy`, cursor and limit as `session.activity.list`. It returns `{ revision, items: [{ session, execution }], nextCursor }`. Timestamp order is unchanged: activity indicators do not hoist rows in project mode. The selected Session page and execution summaries are read in one transaction, using the same aggregate SQL/state precedence as the global Time feed. No per-Session network calls or plugin history reads are needed. A missing Workspace fails explicitly. The old `session.activity.list` response remains unchanged.

Connected clients receive a global `host.changed` hint with kind `session-activity` after a Run is claimed and after the durable `run.queued`, `run.status`, `run.settled`, or `run.cancelRequested` events are published. Stream tokens do not produce these invalidation hints.

The global query returns a bounded page but scans session/run activity as needed to rank it. No command claims constant-time work as the Host directory grows.

## Verification

`tests/sidebar-directory.test.ts` covers locale ordering/aliases, recent-activity continuation, hidden filtering, stale cursors, direct Run states, a deep active Session, live invalidation, parent/child/fork/grandchild boundaries, schema-14 upgrade, and project-summary parity without changing timestamp order. Existing `tests/workspace-activity.test.ts` and `tests/session-activity.test.ts` remain in the affected contract graph.
