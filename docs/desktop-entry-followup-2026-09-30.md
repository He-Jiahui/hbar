# Desktop entrance follow-up, 2026-09-30

This is a bounded current-state follow-up, not a full-parity completion report. Three gpt-6-luna/max agents independently inspected composer, navigation, and settings/files paths at hbar `f7065019`. The read-only CC desktop source is `D:/Git/cc-haha` at `e28d0a653481ef41b7a329411eeb2f0fd5656731`. Implementation and validation remain in the isolated `codex/session-launch-target` worktree; the dirty primary checkout is not part of these changes.

## Delivered next entrance

Exact slash confirmation was implemented and independently committed as `fb3fc324`. A whole, selected, owner-allowlisted command uses the configured send key; partial commands and Tab still complete. Suggestions close before the local action opens. The final production Web build passed 8 temporary-real-Host normal paths across two focused runs, with desktop/narrow screenshots inspected. See [the keyboard delivery record](desktop-slash-keyboard-confirmation.md) for red reproductions, final artifacts, and validation limits.

## Delivered message-selection entrance

CC wraps committed user/assistant authored text with `SelectableChatMessage` (`desktop/src/components/chat/MessageList.tsx:472-640`, usage at `:3741-3776`). A text selection exposes a labelled floating Add-to-chat action; clicking it stores a same-session reference with role, message ID, and the selected quote. Thinking and separate tool events do not use this wrapper. This entrance is now implemented in hbar: canonical core `519baafe` and message UI `ecd493fc`, each independently verified and committed.

New source-backed visual evidence is under `artifacts/chat-selection-reference/`. Its 8 role/locale/viewport cases produced 16 screenshots using the original private wrapper/menu, original UserMessage/AssistantMessage children, original AttachmentGallery, and original Zustand addReference action. The wrapper was exported only by the fixture's in-memory Vite transform; no CC source was edited. These are original-component renders with synthetic content, not a full CC Host/native application. No model, upload, profile, or filesystem API was called; browser requests stayed on the owned localhost fixture, with zero page errors.

- [Desktop assistant selection menu](../artifacts/chat-selection-reference/en-assistant-1440-menu.png)
- [Chinese narrow user selection menu](../artifacts/chat-selection-reference/zh-user-320-menu.png)
- [Chinese narrow assistant reference card](../artifacts/chat-selection-reference/zh-assistant-320-chip.png)
- [Source and interaction manifest](../artifacts/chat-selection-reference/capture-result.json)

Root inspected these captures and the manifest. The menu remains labelled at 320px. Its original SVG icon measures about 21px, to be mapped to the shared semantic icon scale rather than copied as a one-off size. The reference card's Material Symbols font was not loaded in this fixture and some ligatures appear as fallback text; the card does not prove original glyph/pixel-font fidelity. The owned reference server on port 49136 was stopped.

The delivered canonical `chat-selection` variant records `sourceSessionId`, `messageId`, `sourceRole`, and `quote`, without a fake file path or line range. Original Session identity is preserved when existing draft contexts are carried elsewhere. It reuses the 12-context, 20k-quote and 200k-serialized-input budgets, safe fences, removal, and accepted-Run clearing. Quotes are Run context and do not enter Goal objective text.

The local `draft.addConversationSelection` command checks the captured draft revision, loaded source identity and exact authored-text snapshot through a Runtime-injected reader. No new Host/storage command was added. The quote is native rendered selection text, not a Markdown-offset proof. UI selection can cross authored segments in one committed user/assistant message, but cannot cross thinking, tools, attachment metadata, controls or renderer-owned code chrome; synthetic streams remain unwrapped. The action is anchored at the visible selection focus and constrained to the owning reading pane rather than the page header or composer.

The final production Web/temporary-Host run passed 4/4 normal paths in 23.0s, including English 1440px, Chinese 320px, and existing file-context regressions. The focused suites passed 44 tests / 277 assertions, and scoped strict TypeScript, lint, formatting and content/icon/flow guards passed. Root inspected the final role/locale screenshots after rejecting an earlier offscreen-selection capture. See [the UI delivery record](conversation-selection-ui.md) and [the canonical core record](conversation-selection-drafts.md) for artifact hashes, fixture corrections and validation limits.

## Other current entrance differences

### Project organization and sorting

The original exported CC Sidebar was captured with its real organization and sorting submenus, original store action, three synthetic projects, and an in-memory preference API boundary. Root inspected the [English sorting submenu](../artifacts/project-sort-reference/en-1440-sort-submenu.png), [Chinese narrow organization submenu](../artifacts/project-sort-reference/zh-320-organize-submenu.png), and [source/interaction manifest](../artifacts/project-sort-reference/capture-result.json). Choosing Created time actually changed the synthetic project order and persisted `createdAt`.

The organization values are `project | recentProject | time`; the separate sorting values are `createdAt | updatedAt`, defaulting to `updatedAt`. CC ranks each project by its newest Session creation/modification time, not the Workspace creation date; changing sort clears the manual project order. Hbar currently offers Restore hidden/Refresh and pins-first/name ordering. Its per-Workspace Session lists are ID-paginated and the directory cache is bounded, so sorting only those loaded Sessions cannot establish global project recency.

The next sorting subfeature needs an explicit project-level Session-time summary and honest pagination/completeness semantics, with a bounded query strategy. A global unindexed `GROUP BY` is not made bounded merely by limiting output. Preserve pins and hidden filtering, define stable empty-project fallback, and keep organization modes separate from sorting. No sorting implementation is claimed here, and `Workspace.createdAt` is not a substitute for CC's Session-derived Created time.

### Provider default action

Root inspected [the original inactive-row actions](../artifacts/provider-default-reference/en-1440-provider-default-actions-visible.png), the before/after captures, and [the action manifest](../artifacts/provider-default-reference/capture-result.json). The real exported CC `ProviderSettings` and original store handlers were mounted with synthetic provider records and in-memory API methods. The original Set default action activates the provider globally, refreshes provider state, and sets the global current model to that provider's configured `models.main`; it is not a Session-only model setting.

Hbar still puts the global default model in another settings category. A corresponding row shortcut must have an explicit concrete-model/global-default meaning, retain the existing confirmation/CAS path, and not silently overwrite an explicit Session choice. This entrance has visual and action evidence now, but has not been implemented. The directly constrained 320px reference component has a cramped header and fallback icon-font ligatures; it does not establish full-shell responsive behavior or a layout to copy blindly.

### `/agent` task semantics

CC sends `/agent …` as a parent prompt, while hbar directly creates a child Session/Run through its Agent contract. The user's prior choice request remains pending. Do not silently select between these materially different behaviors or claim parity. This does not block independent entrance work.

Recent Files selected-code/comments, preview tabs, path/reading navigation, whole-file Add, and extension detail actions were not rediscovered as new gaps. This follow-up does not establish parity for PTY, native embedded Browser, Teams, installation/market flows, or other missing public capabilities. It adds no placeholder buttons and no backend capability claims.

Verification of this report is source/history inspection, the actual original-component captures/manifest, the completed keyboard feature's scoped checks and real-Host evidence, and document formatting/link review. It does not add another full-repository, native, or paid-provider validation pass. The overall desktop-experience goal remains active.
