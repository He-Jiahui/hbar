# Exact slash command keyboard confirmation

## Reference evidence

The read-only CC desktop reference is `D:/Git/cc-haha` at `e28d0a653481ef41b7a329411eeb2f0fd5656731`. In `desktop/src/components/chat/ChatInput.tsx:549-553`, the composer identifies a slash command only when the filtered token exactly matches an item. At `:902-916`, the configured send key submits that exact selected item; Enter and Tab otherwise complete the selected token. `:710-735` routes the explicit model, settings, and panel actions locally.

The original-component visual captures `D:/Git/hbar/artifacts/desktop-final-entry-audit/conversation/reference-plus-en-US-320.png` and `reference-model-en-US-1440.png` support the slash/model entry hierarchy and menu placement. They are visual captures; they do not record a keyboard interaction. The keyboard comparison above is source-backed.

Before this change, hbar's active-session CodeMirror handler chose any visible slash suggestion before checking whether the key was the configured send shortcut. Thus a typed, exact `/model` first gained a trailing space and needed another send key to open the picker. The first-send textarea used the same completion-first rule for its locally owned `/model`, `/settings`, and `/goal` actions.

## Delivered behavior

- On an active Session, only an exact, selected slash command in the host-supplied slash choices and explicitly allowed by its owner runs from the configured send key. The current owner allows `/model`, `/settings`, `/agents`, `/cost`, and `/help`; `/goal` and `/agent` remain out of that list.
- In the no-Session first-send editor, the existing local `/model`, `/settings`, and `/goal` choices use the configured send key when typed exactly. `/goal` prepares Goal mode and clears its token; it does not create a Session or send a Run.
- Partial command text still completes with Enter, and Tab remains a completion key even for an exact token. Non-allowlisted items, body text, unknown slash text, and a command whose active token is not exact do not enter the local action route.
- The change delegates to the existing submit paths, retaining their Host, session/workspace, readiness, attachment, pending, and revision checks. Agent task semantics are unchanged.
- The suggestion menu closes before an exact command is handed to the existing local action. Otherwise the new direct path could leave `/model` suggestions visible behind the model picker after its input token was cleared. Root found this in the screenshots, reproduced it with a failing visible-menu assertion, and fixed both editors without changing the local action itself.
- The menu hint now distinguishes Tab completion from confirmation with the configured send shortcut.

The new `e2e/composer-slash-keyboard.spec.ts` covers both locales: partial Enter, exact Tab, exact `/model` with Enter, switching the existing General setting to modifier Enter and using Control+Enter, plus Shift+Enter and an IME composition key event. The Chinese path also captures the same modifier shortcut at 320px. The existing `e2e/pre-session-slash-entry.spec.ts` preserves its Tab path, adds partial Enter completion, confirms exact `/model` opens the existing picker, and confirms bare `/goal` prepares the local Goal intent without creating a Session.

## Verification record

Root reproduced the issue against the frozen production bundle from `f7065019` with the English new E2E path: the earlier partial Enter and Tab assertions passed, then the exact `/model` + Enter path failed because the picker did not appear. The failure was recorded under `test-results/slash-keyboard-red/`. This is the pre-change red result, not a post-change verification.

The final production Web build passed (3,339 modules), at `artifacts/slash-keyboard-confirmation/web`, with `index-B_UMnGYC.js` and `index-DTf7FUNR.css`. The real temporary-Host browser checks passed in two focused runs against this same final bundle:

- `composer-slash-keyboard.spec.ts` and `pre-session-slash-entry.spec.ts`: 4 passed, 14.3s, English and Chinese; configured Enter/Control+Enter, partial/Tab completion, cleared suggestion menus, no unintended Run, first-send Goal preparation, and the Chinese 320px path.
- `composer-slash-entry.spec.ts`: 4 passed, 24.0s, English and Chinese; existing local navigation, attachment preservation, and Goal start/replacement/clear behavior.

An earlier narrow keyboard test tried to interact with the background composer while the first model picker was still open. It was corrected to close that picker before resizing and opening the next one. The focus and no-Run assertions were retained; no production behavior was relaxed for that fixture correction. The separate stale-suggestion regression failed under `test-results/slash-keyboard-stale-menu-red/` before the explicit editor dismissal fix.

The final desktop and narrow screenshots were personally inspected and preserved as `artifacts/slash-keyboard-confirmation/exact-picker-en-US-1440.png` and `artifacts/slash-keyboard-confirmation/modifier-picker-zh-CN-320.png`. They show the existing model picker with its search focus and no leftover slash suggestion menu. These are production Web/temporary-Host captures, not native Tauri screenshots.

Pure slash/mention and workspace-boundary tests passed 11/11 with 84 assertions. Root's scoped strict TypeScript check of the changed editor, owner, copy, and test entries passed. Scoped zero-warning ESLint, formatting, content/icon guards, and `git diff --check` passed. The repository-wide typecheck still exits 2 on existing unrelated preview/declaration errors; this is not a claim that the whole repository gate is green. The editor SSR component test was not run because the existing `prop-types`/MUI barrel resolution problem is already recorded in `docs/desktop-composer-entry-parity.md`. No dependencies were installed, and no native or paid-provider run was performed.
