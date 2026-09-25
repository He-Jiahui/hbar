# Desktop composer: durable Plan mode

Reference: `D:/Git/cc-haha/docs/images/app/zh-CN/permission-modes.webp` and
`D:/Git/cc-haha/desktop/src/components/controls/PermissionModeSelector.tsx` show Plan in the
composer-left execution menu. The hbar menu now places the session-scoped Plan entry beside
the existing next-send tool-approval choices. These are **different Host contracts**:
`mode.get/set(sessionId)` stores Plan/default for the session; approval choices are captured
for one Run and do not call `permission.set`. While Plan is active, the approval rows cannot
be changed until the user exits Plan, and their existing one-send choice is retained. The
Host still rejects write-effect tools in Plan mode regardless of that approval choice.

The menu's Plan row reports confirmed Host state, never an optimistic local toggle. The
mode reader reloads when changing sessions, invalidates on the selected session's
`mode.changed` notification, masks stale state on disconnect, re-reads on reconnect, and
reads Host truth before every ordinary composer send so a notification missed during a
disconnect cannot silently reuse a stale mode. A pending or
uncertain write masks the previous mode and blocks sends; reconciliation only reads
`mode.get`, never repeats `mode.set`. A read that still shows the previous value cannot
prove the original write will never arrive, so the operation remains unknown. The Host's
existing `mode.set` does not expose a durable per-key receipt, so this slice does **not**
claim to prove that a lost write was never delivered, especially across a client restart.

Two ordinary sends remain Plan until explicit Exit Plan mode persists default. Proposal
“Implement” is a separate, one-time Run with explicit default input: it does **not** change
the durable session mode or imply that cc-haha's ExitPlanMode permission-choice workflow
has been implemented. The menu states this next to the action.

Production Host visual evidence:

- `artifacts/reference-ux-v2/hbar-durable-plan-menu-en-US-1440.png`
- `artifacts/reference-ux-v2/hbar-durable-plan-menu-zh-CN-320.png`

`e2e/composer-goal-plan.spec.ts` checks English/Chinese, 1440/320, keyboard End and
scroll-visible Plan, no horizontal page overflow, persistent consecutive sends, explicit
exit, reload, and the rejected `write_file` tool result with no file created. A tool error
may be handled by the agent and its Run can still complete; denial is asserted from the
tool-result fact and absent file, not from Run status alone.
`e2e/composer-plan-mode-recovery.spec.ts` checks a dropped successful Host reply, frozen
composer, read-only recovery without a second write, and session switching. The runtime
unit tests cover known rejection, read failure/uncertainty, notification during a read,
silent reconnect followed by fresh capture, and late cross-session responses.
