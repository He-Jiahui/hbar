# Session launch drafts

`sessionLaunchDraft.*` is a Runtime-owned state surface for configuring the launch target of an already-created, still-empty Session. It is separate from the pre-session composer draft: it does not copy or modify text, model, attachments, Goal, Plan, navigation, or Session identity. It never creates a Session or submits a Run.

The public entry is keyed by `sessionId` and includes the owning `workspaceId`, a local compare-and-set `revision`, the observed Host `hostRevision`, the selection, preparation phase/error, and a `targetRevision` only after readiness is confirmed. Local selection edits increment only the local revision; they do not write to Host. `prepare` hands the immutable selection to the existing `PreSessionLaunchPreparation` adapter, which owns stable request keys and receipt recovery. A ready `targetRevision` can be attached to a later Run request as `expectedLaunchTargetRevision`; the Run admission gate remains responsible for atomically verifying that fence.

`open` and `prepare` require the exact idle navigation session/workspace, a non-archived session, an unlocked target owned by that session/workspace, and an empty one-message timeline snapshot. A failed check does not create state or start Host preparation. Re-opening an existing entry preserves its local choice. Stale `setSelection` requests fail with `COMMAND_CONFLICT`.

Available commands are `sessionLaunchDraft.open`, `read`, `setSelection`, `prepare`, `reconcile`, `cancel`, and `close`. If the required timeline or preparation capability is not configured, opening or preparing fails closed with `CAPABILITY_UNAVAILABLE`; it does not silently treat an unsupported session as a shared project checkout. `cancel` delegates to the captured Host operation. `close` only releases an idle or terminal local entry; unresolved operations must be reconciled or cancelled first. Closing, disposal, navigation changes, and preparation errors do not delete a Host worktree.

This module is a Runtime contract only. It does not claim a user-facing Location control, branch-creation integration, Session replacement flow, automatic navigation cleanup, or full UI/native parity. Branch creation and target selection remain separately owned capabilities.

The following Runtime wiring uses the shared typed launch-choice port for `sessionLaunchBranchCreation.capture/create/reconcile/adopt/cancel`. Its separate `sessionLaunchBranchCreation` reader stores creation state for the existing Session owner. The historical input/entry field `draftId` carries that Session ID; it does not point to a second text draft. The adapter rejects another navigation target, archived/unverified access, unresolved preparation, and loaded non-empty history before branch creation. A public Runtime integration test creates and selects a branch for the original Session while proving the composer draft object and navigation remain unchanged and no launch preparation is dispatched. The Runtime integration plus old/new branch creation and launch core suites passed 10/10 (68 assertions); scoped strict TypeScript, ESLint and formatting/diff checks passed. Browser exposure and visual verification still land separately.

Validation: the focused core suite passed 5/5 (32 assertions). Root also ran the core, immutable preparation adapter and both branch-choice adapter suites together: 28/28 (147 assertions). Owned-file strict TypeScript, typed ESLint, formatting and diff checks passed. These are Runtime tests with injected ports, not real Git mutation, browser screenshots, a native desktop smoke test, or a full-repository check.

Follow-up to `5b785e39`: a state-subscription regression reproduced a fresh
preparation publishing `preparing → idle → ready`. The newly created adapter
was unnecessarily reconciled before it owned any receipt, exposing an idle
projection during active work. Recovery is now limited to an existing adapter;
normal first preparation stays busy until ready, while the lost-selection
receipt recovery test still passes. The three focused Runtime suites passed
10/10 (69 assertions), including the new phase-sequence assertion.
