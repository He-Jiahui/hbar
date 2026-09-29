# Goal and Plan: draft intent and durable Host mode

## Reference and interpretation

The reviewed reference images `D:/Git/cc-haha/img_preview/goal.png`, `goal2.png`, `goal3.png`, `no_goal.png`, `plan.png` and `plan2.png` show removable composer intent chips, a compact active/paused goal immediately above the composer, and expansion into a right-hand document editor. `no_goal.png` explicitly rejects the large empty-goal form.

These are untracked reference images, not evidence that the current tracked cc-haha application already implements that exact flow. Current cc-haha source instead exposes `/goal`, a header goal strip, Plan permission mode and task activity as three different concepts. The distinction is documented in `desktop-navigation-interaction-audit.md`. The hbar implementation follows the supplied screenshot intent without pretending Goal, read-only planning and task progress are the same backend entity.

## Implemented flow

- Goal is a per-session **draft intent** beside the attachment entry. Clicking its selected chip cancels that intent only; it does not clear a persisted goal, task list or the current prompt.
- Plan is a durable, per-session **Host mode** in the composer permission picker, not a one-send draft chip. Its selected state remains visible after sending and after reload. The user exits it explicitly through the picker. Goal preparation and Plan mode are mutually exclusive.
- The Host records each submitted message's `input.mode`: messages sent while Plan mode is active use `plan`, including successive sends; messages after explicit exit and ordinary Goal messages use `default`. Plan mode is enforced by the Host, including for tool calls, rather than being only a visual composer flag.
- Goal submission creates the requested durable goal, then admits the initial run through the existing draft/receipt machinery. It is a recoverable two-stage operation, **not an atomic Goal+Run transaction**. A saved goal plus rejected run is visibly partial. Retrying the unchanged objective reuses the prepared goal, including when repairing a model selection; it does not create another goal.
- Unknown Goal results are checked against Host facts, never blindly replayed. Unknown Run admission reuses the existing original receipt. Pending actions and stale targets are guarded. Reconciliation does not automatically send a previously uncertain goal draft.
- An unfinished goal remains visible immediately above the composer. Pause/resume/clear use its exact goal ID; resume relies on the Host continuation mechanism and does not submit an additional UI run. Clear has a local target-specific confirmation and preserves conversation history.
- The Goal strip keeps status and objective together as the primary reading group, with elapsed time, budget and actions in a secondary flex group. At 390/320px that group wraps beneath the objective instead of squeezing it to a few characters; no fixed content height or screenshot-coordinate placement is used.
- Pause means stopping **automatic continuation**, not a claim that an already running provider call has ended. Stop remains the explicit current-run cancellation control. Budget-limited/usage-limited states remain visible and direct users to execution/budget details rather than a misleading Resume option.
- Expand opens the original session's right-hand goal document directly. Objective editing has Save and Discard changes; budget/execution fields are progressively disclosed. The UI warns that replacing an objective resets goal usage counters. Derived lifecycle states are no longer arbitrary form-select options, and Host completion verification remains authoritative.
- The overview no longer routes an empty goal into a large creation form. It points to the composer flow. Agent task plans and advanced workflow state remain separate read-only information.

## Evidence and verification

`e2e/composer-goal-plan.spec.ts` uses the real temporary Host with a mock provider, in Chinese and English, and checks Goal intent selection/cancellation, initial Goal+Run acceptance, pause/resume, document edit/discard/save, clear cancel/confirm, and desktop/390/320 geometry. For Plan, it checks the selected permission entry, the Host's stored mode, two successive `plan` Runs, read-only rejection of a write tool, persistence after reload, and an explicitly exited `default` Run. Screenshots are under `artifacts/reference-ux-v2/hbar-goal-*.png`, `hbar-durable-plan-menu-*.png`, `hbar-plan-chip-*.png` and `hbar-goal-document-*.png`. These browser checks do not claim that the current native binary includes every later UI change.

The Goal geometry check additionally verifies that the complete secondary action group remains inside its strip and that narrow layouts give the objective a readable width before placing metrics/actions on the next flow line. The available `img_preview/goal2.png` is a design preview, while current tracked cc-haha source positions its Goal strip under the session header; this step corrects the observed hbar narrow-screen crowding without claiming those two reference positions are identical.

The real Run snapshot confirmed that the initial user Goal message is admitted once. A following empty-text run has `source: goal` plus the goal/continuation identity: it is the Host's automatic continuation, not a second UI submission. The fixture model's “Received: image attachment” text on that empty run is fixture behavior, not a real attachment operation.

Focused runtime tests cover partial/unknown recovery, unchanged-original-input retry, delayed completion, per-session isolation, draft preservation, exact Goal identity, subscription release and model repair. The existing Goal-state browser test continues to verify real budgets, live plan projection and guarded completion with the new entry paths.

This record covers the Goal entry and durable Plan-mode behavior. It does not by itself establish parity for every other cc-haha desktop entry or interaction; those units require their own current-source and rendered-UI evidence.
