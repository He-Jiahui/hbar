# Session activity query

`session.activity.list` provides a workspace-scoped, read-only page for sidebar rows that must follow Session creation or update time. It returns non-archived Sessions, including nested Sessions, in descending `createdAt` or `updatedAt` order. Equal timestamps use ascending Session ID, so each page has a stable seek boundary. `sortBy` defaults to `updatedAt`; `limit` defaults to 60 and is bounded from 1 to 200.

The cursor records the workspace, sort, timestamp, Session ID, and the persisted global directory activity revision. The Host reads the revision and page in one SQLite transaction. Any intervening workspace or Session activity change advances that revision, so a later request with an old cursor fails with `STALE_CURSOR` and the caller can restart from page one. Cursors for another workspace or sort are rejected as `INVALID_INPUT`.

The query seeks directly in `sessions` by `(workspaceId, archived, createdAt DESC, id ASC)` or `(workspaceId, archived, updatedAt DESC, id ASC)`, using the schema 13 indexes. It does not derive activity from Session history or load earlier `session.list` ID pages. The existing `session.list` ordering and response stay unchanged.

This is exposed through the existing generic command dispatch as `session.activity.list`; it does not add a legacy RPC method. Kernel directory-query errors preserve storage error codes such as `STALE_CURSOR`.

## Verification

The focused Session and Workspace activity suites passed together: 4 tests / 23 assertions. They cover crossed creation/update times, a newest Session outside the ordinary ID page, equal-time keyset continuation, archived exclusion, nested Sessions, and mismatched/stale cursors. The rejection checks use explicit awaited catches, consistent with the existing Workspace test; Bun's asynchronous rejection matcher stalled on the Worker-backed stale query during fixture development, while an ordinary awaited query completed correctly.

The affected Storage/Kernel-query/Client/test dependency graph passed strict TypeScript. Scoped ESLint, Prettier and the diff check passed. The Client read-only adapter accepts the new command. This backend slice does not yet claim Sidebar integration or native verification. A full-repository typecheck attempted during concurrent UI development did not pass; broader preview/UI declarations and unfinished concurrent integration are outside this backend gate.
