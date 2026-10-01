# Composer model, Goal and Plan entrances

This slice aligns the first-send composer with the visible CC desktop entrance hierarchy, without claiming native-desktop or complete feature parity.

## Reference and interpretation

- Read-only reference repository: `D:/Git/cc-haha`, checked at `e28d0a653481ef41b7a329411eeb2f0fd5656731`.
- Original-component renders: `D:/Git/hbar/artifacts/session-entry-recheck/reference-model-en-US-1440.png`, `reference-model-zh-CN-320.png`, `reference-execution-zh-CN-320.png`, and `reference-current-goal-en-US-1440.png`. These mount real CC components with synthetic stores and the reference theme; they are not a complete application or live Host session. The full-app empty-composer capture has the model picker closed and is not evidence of an open menu.
- The model picker groups models under provider headings and shows a visible selected-row check. Plan belongs in the execution-options menu. Goal is discoverable through the slash-command catalog. Existing Goal summaries stay near the conversation heading; no new header relocation was needed.

## Delivered behavior

- First-send models have Host-owned provider groups, selected-row background/check and raw model-ID search. The trigger retains its provider · model label. At most 60 choice rows are shown at once, with explicit expansion; an off-page selected row remains visible within that bound. Ungrouped choices keep their existing layout.
- The no-tab slash menu includes `/goal` alongside `/model` and `/settings`. `/goal` prepares the next message; `/goal <objective>` retains the objective as editable message text and prepares Goal mode. It does not create a Session or Goal before the user sends that message. `/goal clear` cancels the local unsent preparation; unsupported lifecycle arguments stay in the editor with nearby guidance.
- Goal preparation and durable Plan mode are independent first-send choices. Choosing either preserves the other choice, while the composer keeps the message, project, model and approval choice. Cancelling an unsent Goal leaves Plan selected; explicitly exiting Plan still uses the Plan execution menu.
- The local `preSessionDraft.setEntryMode` compatibility action changes only the requested Goal intent and preserves the Plan field (or vice versa). `setPlanMode` and Goal submission recheck the captured Host mode, so a Goal can create its first Run in Plan mode and remain read-only until the same Run receives an explicit approval. Capability, stale-revision and unknown-receipt failures leave the draft unchanged.
- Localized copy is owned by the Web Host adapter. Icons use the shared semantic tiers; ordinary content remains in flow layout.

## Verification

- Current Runtime tests: 84 passed / 517 assertions, including independent Goal/Plan choices, captured-mode checks, unchanged draft metadata, no-op revision behavior, capability rejection, unknown receipts and no Session/Goal creation on choice.
- Pure model-choice tests: 3 passed / 8 assertions, including multiple providers, raw model-ID search and the 60-row boundary.
- Current production Web build: 3,385 modules, passed. The pre-existing large-bundle warning remains.
- Model browser paths: 2 passed, English 1440px and Chinese 390px. Real owned temporary Host; opening, selecting, reopening, searching and Escape retain the unsent draft and create no additional Session.
- Current focused browser results: three paths passed in 23.4s (Chinese Goal lifecycle/Plan regression, coexistence and first-send slash); the English first-send slash also passed in the preceding run. The coexistence path exercises cancellation without mode loss, a first Plan Run with an active Goal, same-Run approval, and post-approval draft preservation at 390px/1440px. Automatic Goal continuation is disabled only in this UI fixture. Separate Host Goal accounting/continuation plus pure availability suites passed 27 tests / 113 assertions, including persisted Plan-mode deferral and wake after an explicit mode change.
- Red evidence: the new coexistence flow failed against the previous production asset because selecting Plan removed the prepared Goal. A stale narrow slash test also failed because it expected close-first focus with a fine pointer; its context now explicitly models touch, matching the existing policy introduced in `05ca9828`. Neither correction weakens the Goal/Plan state assertions.
- Changed TypeScript paths passed scoped strict typechecking and ESLint; formatting, diff checks and the model stylesheet's flow-layout guard passed. Root personally inspected the reference open-menu capture and current desktop/narrow model and Goal/Plan captures.
- Bun SSR component tests remain blocked by existing `prop-types` / `react-is` resolution failures in the Lumen/MUI workspace. They are not reported as passing. No dependency installation or native-desktop build was performed. Full repository checks are not claimed green.

Captures: `artifacts/pre-session-model-picker/{en-US,zh-CN}/{provider-group,selected-model-id-search}.png`; `artifacts/desktop-experience/pre-session-{slash-menu,goal-plan-switch,plan-goal-switch}-{en-US,zh-CN}.png`.

Current coexistence captures: `artifacts/goal-plan-coexistence-v31/screenshots/goal-plan-{prepared-390,approval-390,approved-1440}.png`. Root inspected all three: the Goal chip and Plan execution trigger coexist naturally, the current Goal stays near the heading, and the approved document stays in the original tool card. The narrow conversation owns its scroll; the pending screenshot shows its decision/footer rather than the full document. The `/tool` objective and English assistant response are deterministic local-model fixture content, not shipped UI copy. Goal + Plan semantics are a user-approved hbar adaptation; the reference captures do not prove a live CC Goal + Plan combination.

Remaining work includes arbitrary shared-branch checkout switching, immediate Create Branch parity, CC-style parent `/agent` dispatch, and the broader application-entrance audit. These changes do not complete the overall desktop-experience goal.
