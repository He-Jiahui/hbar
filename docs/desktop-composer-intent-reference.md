# Goal and Plan: composer intent and local goal control

## Reference and interpretation

The reviewed reference images `D:/Git/cc-haha/img_preview/goal.png`, `goal2.png`, `goal3.png`, `no_goal.png`, `plan.png` and `plan2.png` show removable composer intent chips, a compact active/paused goal immediately above the composer, and expansion into a right-hand document editor. `no_goal.png` explicitly rejects the large empty-goal form.

These are untracked reference images, not evidence that the current tracked cc-haha application already implements that exact flow. Current cc-haha source instead exposes `/goal`, a header goal strip, Plan permission mode and task activity as three different concepts. The distinction is documented in `desktop-navigation-interaction-audit.md`. The hbar implementation follows the supplied screenshot intent without pretending Goal, read-only planning and task progress are the same backend entity.

## Implemented flow

- Goal/Plan are mutually exclusive, per-session **draft intents** beside the attachment entry. Clicking the selected chip's X cancels only that intent; it does not clear a persisted goal, task list or the current prompt.
- The selected Plan chip visibly reads “下条仅规划 / Next: plan only” even without hover. Its cancel name carries the same one-send scope; after submission it returns to the short “计划 / Plan” entry. This communicates the actual hbar Run mode without portraying it as cc-haha's persistent permission preset.
- Every submitted composer message carries an explicit `input.mode`: Plan uses `plan`; ordinary and Goal messages use `default`. The UI does not accidentally inherit an invisible persistent planning mode.
- Goal submission creates the requested durable goal, then admits the initial run through the existing draft/receipt machinery. It is a recoverable two-stage operation, **not an atomic Goal+Run transaction**. A saved goal plus rejected run is visibly partial. Retrying the unchanged objective reuses the prepared goal, including when repairing a model selection; it does not create another goal.
- Unknown Goal results are checked against Host facts, never blindly replayed. Unknown Run admission reuses the existing original receipt. Pending actions and stale targets are guarded. Reconciliation does not automatically send a previously uncertain goal draft.
- An unfinished goal remains visible immediately above the composer. Pause/resume/clear use its exact goal ID; resume relies on the Host continuation mechanism and does not submit an additional UI run. Clear has a local target-specific confirmation and preserves conversation history.
- Pause means stopping **automatic continuation**, not a claim that an already running provider call has ended. Stop remains the explicit current-run cancellation control. Budget-limited/usage-limited states remain visible and direct users to execution/budget details rather than a misleading Resume option.
- Expand opens the original session's right-hand goal document directly. Objective editing has Save and Discard changes; budget/execution fields are progressively disclosed. The UI warns that replacing an objective resets goal usage counters. Derived lifecycle states are no longer arbitrary form-select options, and Host completion verification remains authoritative.
- The overview no longer routes an empty goal into a large creation form. It points to the composer flow. Agent task plans and advanced workflow state remain separate read-only information.

## Evidence and verification

`e2e/composer-goal-plan.spec.ts` uses the real temporary Host with a mock provider, in Chinese and English, and checks chip select/cancel, initial Goal+Run acceptance, pause/resume, document edit/discard/save, clear cancel/confirm, actual Plan mode in the persisted Run, and desktop/390/320 geometry. The one-send Plan label is checked both before sending and after it resets, with desktop and 320px screenshots. Screenshots are under `artifacts/reference-ux-v2/hbar-goal-*.png`, `hbar-plan-chip-*.png` and `hbar-goal-document-*.png`. A rebuilt Windows x64 release was also checked in an isolated native WebView2 profile for the visible selected Plan label; the general desktop smoke remains separately subject to its current appearance-marker assertion.

The real Run snapshot confirmed that the initial user Goal message is admitted once. A following empty-text run has `source: goal` plus the goal/continuation identity: it is the Host's automatic continuation, not a second UI submission. The fixture model's “Received: image attachment” text on that empty run is fixture behavior, not a real attachment operation.

Focused runtime tests cover partial/unknown recovery, unchanged-original-input retry, delayed completion, per-session isolation, draft preservation, exact Goal identity, subscription release and model repair. The existing Goal-state browser test continues to verify real budgets, live plan projection and guarded completion with the new entry paths.

This unit does not yet claim the complete Plan proposal review/implementation flow, rich message hierarchy, permissions menu, activity relocation or compact usage entry. They are separate remaining interaction units.
