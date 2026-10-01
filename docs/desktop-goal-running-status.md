# Current Goal execution status

The header Goal strip distinguishes the persistent Goal lifecycle from current-session activity. A confirmed nonterminal Run overrides the displayed lifecycle label while it is queued, running, or waiting for approval. Pausing Goal continuation does not stop that Run: Pause/Resume still follow the canonical Goal status, and Stop remains the current Run action. Once the Run settles, the strip returns to the canonical paused/active/budget label.

## Reference and boundary

The original CC `desktop/src/pages/ActiveSession.tsx` computes activity from preparation, non-idle chat state, and visible background tasks. Its `ActiveGoalStrip` displays `chat.activeGoal.running` ahead of the paused/active label. An isolated original-page fixture confirms a paused Goal displays “自循环运行中” while streaming, and “已暂停” when idle; CC source and CSS are unchanged.

Hbar uses the existing selected-session timeline projection, not another local Run store or the partially loaded sidebar directory. The override is connected and fenced by the timeline Session identity. This slice covers the current Session's own nonterminal Runs only; parity for background-child activity in this Goal strip is not yet implemented. Copy is supplied by the host in English and Chinese. Complete Goals remain hidden, and Goal control commands and identity guards are unchanged.

## Verification

- `e2e/goal-running-status.spec.ts`: temporary real Host with the local provider; active Goal → approval-held Run → Pause continuation → Stop Run → paused display. It also verifies draft preservation, a long objective with naturally wrapping narrow layout, and switching to an independent Goal. The pending write is never approved.
- The focused browser flow passed in 4.4 seconds (7.1 seconds including setup). Earlier attempts passed the execution assertions but timed out at the final navigation because the sidebar remained hidden after narrowing the viewport; the final test explicitly reopens it before navigation.
- Scoped strict TypeScript, zero-warning ESLint, content/icon/flow guards, formatting and Web build are checked for this slice. Native desktop packaging and an installed-app smoke test are not run.
- The two focused composer-intent runtime/reconciliation test files pass: 42 tests, 359 assertions, exit 0.
- Existing SSR tests cannot start because the workspace lacks `prop-types`/`react-is`; no dependency installation or unrelated repair is included.

Local visual evidence is generated under the ignored `artifacts/goal-running-reference-v12/`: `zh-paused-running.png`, `zh-paused-idle.png`, `hbar-paused-running.png`, and `hbar-paused-idle-narrow.png`. The reference fixture uses synthetic stores and blocks Host/provider traffic; hbar screenshots use the real temporary demo Host. The capture maps four observed malformed Windows font URLs to the same bundled CC font files, without changing reference files or downloading assets.
