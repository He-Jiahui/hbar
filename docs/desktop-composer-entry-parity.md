# Composer model, Goal and Plan entrances

This slice aligns the first-send composer with the visible CC desktop entrance hierarchy, without claiming native-desktop or complete feature parity.

## Reference and interpretation

- Read-only reference repository: `D:/Git/cc-haha`, checked at `e28d0a653481ef41b7a329411eeb2f0fd5656731`.
- Original-component renders: `D:/Git/hbar/artifacts/session-entry-recheck/reference-model-en-US-1440.png`, `reference-model-zh-CN-320.png`, `reference-execution-zh-CN-320.png`, and `reference-current-goal-en-US-1440.png`. These mount real CC components with synthetic stores and the reference theme; they are not a complete application or live Host session. The full-app empty-composer capture has the model picker closed and is not evidence of an open menu.
- The model picker groups models under provider headings and shows a visible selected-row check. Plan belongs in the execution-options menu. Goal is discoverable through the slash-command catalog. Existing Goal summaries stay near the conversation heading; no new header relocation was needed.

## Delivered behavior

- First-send models have Host-owned provider groups, selected-row background/check and raw model-ID search. The trigger retains its provider · model label. At most 60 choice rows are shown at once, with explicit expansion; an off-page selected row remains visible within that bound. Ungrouped choices keep their existing layout.
- The no-tab slash menu includes `/goal` alongside `/model` and `/settings`. `/goal` prepares the next message; `/goal <objective>` retains the objective as editable message text and prepares Goal mode. It does not create a Session or Goal before the user sends that message. `/goal clear` cancels the local unsent preparation; unsupported lifecycle arguments stay in the editor with nearby guidance.
- Choosing Plan while Goal is prepared directly replaces the unsent Goal setup. Its row explains that replacement. The Add menu in Plan mode explicitly offers “Exit Plan mode and prepare a Goal.” Both directions preserve the message, project, model and approval choice.
- The new local `preSessionDraft.setEntryMode` action changes mutually exclusive Goal/Plan fields in one revision. Existing lower-level setters keep their conflict checks. Capability and stale-revision failures leave the draft unchanged. This action never cancels an existing Host Goal.
- Localized copy is owned by the Web Host adapter. Icons use the shared semantic tiers; ordinary content remains in flow layout.

## Verification

- Runtime tests: 47 passed / 315 assertions, including atomic switching, unchanged draft metadata, no-op revision behavior, capability rejection and no Session/Goal creation on choice.
- Pure model-choice tests: 3 passed / 8 assertions, including multiple providers, raw model-ID search and the 60-row boundary.
- Production Web build: 3,325 modules, passed after fixing the missing public `localGoalSlash` export exposed by the first build attempt.
- Model browser paths: 2 passed, English 1440px and Chinese 390px. Real owned temporary Host; opening, selecting, reopening, searching and Escape retain the unsent draft and create no additional Session.
- Goal/slash browser paths: 4 passed in 14.9s, both locales. Goal first-send creates one Goal and one first Run. Slash-menu discovery, both Goal/Plan switch directions and text preservation were exercised; the narrow slash/switch path is 320px.
- Changed TypeScript paths passed scoped strict typechecking and ESLint; formatting, diff checks and the model stylesheet's flow-layout guard passed. Root personally inspected the reference open-menu capture and current desktop/narrow model and Goal/Plan captures.
- Bun SSR component tests remain blocked by the existing `prop-types` resolution failure in the Lumen/MUI workspace. They are not reported as passing. No dependency installation or native-desktop build was performed. Full repository checks are not claimed green.

Captures: `artifacts/pre-session-model-picker/{en-US,zh-CN}/{provider-group,selected-model-id-search}.png`; `artifacts/desktop-experience/pre-session-{slash-menu,goal-plan-switch,plan-goal-switch}-{en-US,zh-CN}.png`.

Remaining work includes arbitrary shared-branch checkout switching, immediate Create Branch parity and the broader application-entrance audit. These changes do not complete the overall desktop-experience goal.
