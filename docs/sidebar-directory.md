# Sidebar directory queries

The public contract entry is `@hbar/contracts/sidebar-directory`. The Host exposes two read-only commands through the existing `command.execute` directory dispatcher:

- `workspace.sidebar.list` supplies the sidebar's Workspace rows for the `project` and `recentProject` organizations.
- `session.activity.global.list` supplies a global time-ordered Session page with Workspace context and a compact direct-Run status summary.

Both pages are bounded to 200 rows. Their default page size is 60. Every cursor is tied to the query parameters and the revision of the directory, Host display-name snapshot, and hidden-Workspace organization snapshot. A changed revision returns `STALE_CURSOR`; a cursor used with another organization, sort, or locale returns `INVALID_INPUT`.

## Workspace organization

`workspace.sidebar.list` accepts `organization: "project" | "recentProject"`, `sortBy: "createdAt" | "updatedAt"`, `locale: "en-US" | "zh-CN"`, an optional cursor, a limit, and up to 20 unique `includeWorkspaceIds`. It excludes hidden Workspaces in both organizations. Requested Workspace summaries outside the current page are returned in `includedItems`; they do not change page order or cursor position.

`project` orders visible Workspaces by `Intl.Collator(locale)` over their effective display name. A collator tie uses Workspace ID's UTF-8/BINARY order. `sortBy` does not change this alphabetic order, but it remains part of the strict cursor and must match the request. The Host streams Workspace rows from SQLite and retains only the best `limit + 1` candidates in a bounded max heap. This keeps JavaScript candidate memory proportional to the page size; each page still scans the Workspace roster.

`recentProject` orders visible Workspaces by the selected latest non-archived Session timestamp descending, then puts Workspaces without a non-archived Session last, with Workspace ID's UTF-8/BINARY order for ties. The timestamp fields are computed from all non-archived Sessions, including child Sessions. They do not fall back to Workspace creation time.

The effective display name is the Host/data-root alias from `workspace_display_names_state` when one exists, otherwise `Workspace.name`. It never falls back to the filesystem path. The display-name snapshot supports at most 2,000 aliases and 256 KiB of encoded data. Alphabetic ordering uses the requested locale; it does not depend on a browser-only preference.

## Global Session time feed

`session.activity.global.list` takes an optional cursor and a limit. It returns all visible, non-archived Sessions across Workspaces, ordered by direct nonterminal Run activity first, then `Session.updatedAt` descending, then Session ID in UTF-8/BINARY order. The cursor contains the active phase, timestamp, and Session ID tie-break, so equal timestamps page without skipping or repeating a Session.

Each item includes the canonical Session, canonical Workspace context, its effective Workspace display name, and `execution`. The execution summary counts direct `queued`, `running`, and `waiting_approval` Runs only; `activeCount` includes queued Runs and `queuedCount` is its queued subset. State priority is `cancelRequested`, `waiting_approval`, `running`, `queued`, then `idle`. A queued-only Session is therefore distinguishable from one whose Run is executing. The summary contains no prompt, model input, or tool arguments.

This contract intentionally reports direct Runs only. It does not claim that a parent Session is active because a child Agent is running; Agent state remains owned by the Agent plugin, and there is no persisted global Agents table to query here.

The global page reads the three revisions, visible Sessions, Workspace context, aliases, and direct-Run summary in one Storage Worker transaction. Schema version 14 advances the directory activity revision when Runs are inserted, deleted, or change Session/status/start/end fields. This includes the storage claim's `queued` to `running` transition, which does not itself append a Session event. Hidden-organization or display-name changes also invalidate either query's cursor through their own persisted revisions.

Connected clients receive a global `host.changed` hint with kind `session-activity` after a Run is claimed and after the durable `run.queued`, `run.status`, `run.settled`, or `run.cancelRequested` events are published. Stream tokens do not produce these invalidation hints.

The global query returns a bounded page but scans session/run activity as needed to rank it. Neither command claims constant-time work as the Host directory grows.

## Verification

`tests/sidebar-directory.test.ts` covers locale-aware alphabetic ordering, aliases, equal-name ID ties, recent-activity ties and continuation, hidden Workspace filtering, alias/organization stale cursors, all direct Run states, a queued-to-running stale cursor, a Session outside the older 2,000-row canonical directory projection, and the Run activity invalidation hint. Existing `tests/workspace-activity.test.ts` and `tests/session-activity.test.ts` remain in the affected contract graph.
