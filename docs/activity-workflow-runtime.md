# Activity Workflow owner

The existing Workflow workspace owner now permits read-only `workflowWorkspace.refresh` from a visible Session-owned Activity surface as well as Goals. `acceptCheck`, `applyPatch` and evidence editing/navigation still require Goals; Activity does not acquire execution authority by displaying progress. Public `workflow.get` / `workflow.updated` and `agent.result.get` remain the fact sources. No plugin-private event parsing or new Host endpoint is added.

Workflow DTOs expose one current focus and at most 128 delegations, not CC's multi-phase title history. Records are validated against the captured parent, Agent ID and non-self child before projection. Existing Agent navigation accepts that Workflow owner record as a verified Activity source, rechecks public Host facts and reuses the existing ephemeral child/parent Back relation. This does not submit a Run or apply a patch.

Reads subscribe before their snapshot query. A single latest pending Workflow snapshot and serialized Agent resolution prevent each notification from creating an independent fan-out; Agent lookups remain batches of eight. Same-Workflow older revisions are rejected. Clear/no-Workflow notifications received during the initial read cannot be rolled back by that read's stale response. Full snapshot notifications have no event sequence for comparing two different Workflow identities; this is not claimed to establish a new cross-Workflow durable replay protocol.

The initial read has a 12-second deadline and AbortSignal propagation. Closing/hiding Activity releases its read/watch/projection; a new visible instance reloads. Goals retain their previous cached-editor behavior. A dedicated transport connection port refreshes visible owned Workflow consumers after reconnection. Watch notifications are schema/Session checked and missing Agent results remain absent, not fabricated child targets. A transport that ignores AbortSignal can continue an already-dispatched physical read; UI cancellation only prevents its stale result from committing.

## Verification

The focused Workflow owner + Agent navigation suite passes **16 tests / 81 assertions**. New paths prove Activity read/child/Back with no acceptance mutation, watch release and projection cleanup, subscribe-before-read clear protection, and foreign-event rejection. Existing Goals row-action and Agent source-race tests remain intact. Affected strict Runtime TypeScript and scoped zero-warning ESLint pass, with formatting and diff checks.

The first new cleanup regression showed that closing a Session tool hides it rather than deleting its surface. Activity-specific hidden projections now release immediately; Goals cached data are preserved. The source/history baseline is `cdf2b49c` (Session tools) and `870d9c98` (Activity Agent source), not an asserted single introducing commit for all prior Workflow read races.

Subsequent independent source review found that the first timeout guard did not check an aborted controller after each await. The owner now includes that signal in its current-read predicate; a dedicated 12-second regression confirms that a transport ignoring cancellation cannot publish its late snapshot. Malformed watch payloads explicitly map to `INVALID_OUTPUT`. This repairs `92a93cd7`, without altering the UI fixture or adding authority.

No full-repository/native/paid-provider validation is claimed. Visual and temporary-real-Host workflow entrance verification belongs to the subsequent UI slice.
