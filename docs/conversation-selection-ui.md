# Conversation selection UI

`HbarConversationSelection` adds the visible-text “Add to chat” action to committed user and assistant messages in the active Session. It forwards one bounded quote and the canonical message-text snapshot to the existing `draft.addConversationSelection` command; it does not create a separate draft or submit a Run.

## Scope and interaction

- A normal pointer selection wholly inside authored text opens a nearby action. The same-message range may cross multiple prose or proposal-text segments, but it is rejected if it crosses a tool, thinking, control, attachment, image, hidden-content, or renderer-owned code-chrome boundary.
- The quote is the browser’s `Selection.toString().trim()`. The expected source is all canonical `text` blocks joined with `\n\n`, matching the Runtime stale-message fence rather than attempting to map rendered Markdown offsets.
- A session-level Shift-selection keyup listener updates the native browser selection when it remains inside one message. Prose is not made focusable solely to emulate keyboard selection; browser-specific initial keyboard selection behavior is not claimed by this module.
- Escape, outside pointer interaction, scrolling, resizing, message/draft target changes, and unmount close the temporary menu. Runtime errors are translated from typed error codes by host-owned labels; the existing draft remains intact.
- The action is available only for the current connected Session with a ready timeline and known, non-submitting composer state. Committed history remains selectable during an active Run; adding context does not submit that Run. Missing draft entries use revision `0`.

## Reference evidence

The source-backed reference captures are in `artifacts/chat-selection-reference/`: `en-assistant-1440-menu.png`, `zh-user-320-menu.png`, `zh-assistant-320-chip.png`, and `capture-result.json`. They show the adjacent selection action, its narrow-viewport wrapping, and the resulting composer chip. The capture is component-level visual evidence, not a complete desktop-session screenshot or recorded pointer trace.

The original CC implementation is `D:/Git/cc-haha/desktop/src/components/chat/MessageList.tsx:472-640`, with message integration at `:3741-3776`. It uses the selected visible quote and opens the action from a native text selection. The Hbar menu is a true fixed overlay anchored from a visible client rectangle of the measured Range, following the native selection's focus end. The anchor and action are bounded by the owning transcript pane intersected with the viewport, not the entire window. A completely clipped selection, or a pane too small for the action, does not show the menu. The message wrapper, error, and transcript remain in normal flow.

The original prominent message icon measured about 21px; the icon-scale skill maps this to the shared `lg` tier instead of a one-off icon size. The action preserves the observed 15px/600 label hierarchy and a 44px minimum hit target while allowing content growth. The content-contract skill keeps all visible action and recovery copy in the host's typed English/Chinese label adapter. The flow-layout guard permits only the exact measured menu container to overlay; its new exception is path-scoped and tested. Formatting the changed guard also normalized its existing formatting without changing the earlier guard behavior.

## Focused validation

`tests/conversation-selection-model.test.ts` covers canonical text snapshots, exact bounded quotes, revision validation, and Shift-selection key filtering. `e2e/conversation-selection.spec.ts` covers the browser flow with real message text, including a range across authored inline markup; browser verification is run separately from these pure model tests.

## Delivery verification

The final production Web build passed with 3,343 modules and output in `artifacts/conversation-selection-ui/web`: `index-DBy0LlwP.js` and `index-DECIsVTe.css`. The existing large-chunk warning remains. Against this exact bundle, the final temporary-real-Host run passed **4/4 tests in 23.0s**: the new English 1440px and Chinese 320px conversation-selection flows, plus both existing file-selection/source-diff-comment flows. The new paths verify user and assistant sources, native visible quotes across paragraphs/bold/inline code, Escape, deduplication, removal without changing the prompt, A/B draft isolation, original encoded source identities in Run input, no extra Run from adding context, and clearing after Run acceptance. Page-error collections and horizontal-overflow checks passed.

An initial narrow fixture raced navigation's automatic drawer closing and waited for a removed close button. It was corrected to await the selected tab and the actual closed drawer. An early passing capture was then rejected by Root's visual review because the programmatic source selection had scrolled above the transcript clipping pane, leaving the action near the header. The fixture now starts pointerdown before positioning the native Range, cancelling the existing bounded follow-latest correction as a normal user gesture does, and asserts that the selected text is actually inside its transcript viewport. The production action was separately constrained to the visible pane as described above. The final captures therefore do not reuse the earlier insufficient visual evidence.

Final screenshots are under `test-results/conversation-selection-ui-verified/`, in the locale-specific test directories. Root inspected `user-selection-menu-en-US-1440.png`, `user-selection-menu-zh-CN-320.png`, `assistant-selection-menu-zh-CN-320.png`, and `ready-context-cards-zh-CN-320.png`. Both role menu captures show the actual selected text, with the action inside the reading pane; the card capture shows the retained editable prompt and removable references. The accepted-clear captures are in the same directories.

The six focused model/copy/Runtime/Goal/Workspace-move suites passed **44 tests / 277 assertions** after the pane correction. Root's scoped strict TypeScript and zero-warning ESLint passed on the final component, owner, model, host-copy and E2E dependency graphs. Prettier, content-contract, icon-scale, flow-layout and flow-guard self-tests passed, as did `git diff --check`.

This is production Web/temporary-Host evidence, not a native Tauri build, real profile mutation, paid-provider run, or claim that the repository-wide gate is green. No dependencies were installed. The broader existing attachment-upload test failure is honestly recorded in [the canonical core record](conversation-selection-drafts.md); its implementation and test are unchanged. Browser-specific initial keyboard-only text selection is not claimed as verified.
