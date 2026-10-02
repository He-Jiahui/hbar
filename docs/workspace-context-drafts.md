# Workspace context in Session drafts

Workspace selections and comments are captured as typed, session-owned draft context. A source selection or comment records its workspace-relative path, line range, quote, and file SHA-256. A diff comment records the captured cached/working-tree snapshot, side, hunk, line range, quote, and note. These values describe the snapshot the user selected; moving a Session copies them with their original workspace and path instead of rebinding them to the destination Workspace.

`draft.addWorkspaceContext`, `draft.removeWorkspaceContext`, and `draft.setWorkspaceContexts` are revision-checked draft operations. Exact semantic duplicates are idempotent on add; IDs are used for removal but are not part of duplicate identity. Drafts hold at most 12 contexts, each quote is bounded to 20,000 characters, and a note is bounded to 4,000 characters. Serialized text, including the existing composer text, path mentions, and context blocks, must stay within 200,000 characters.

The displayed text and existing mention spans remain the editable composer document. Run serialization appends a `Referenced workspace context` section with a safely fenced snapshot quote and optional comment. Attachments remain in their existing attachment fields. The Run acceptance matcher includes serialized contexts, so an accepted Run clears the context only when the same captured draft revision and content were submitted; a newer draft is preserved. An uncertain Run keeps the same receipt and draft-reconciliation path as other composer material.

Goal intent uses a separate objective serializer: it resolves path mentions but does not include quoted workspace context in the Host Goal objective. The Run still receives the expanded composer text with context. Local slash actions must leave a draft containing workspace context intact and require the user to resolve that context before executing an action that cannot carry it.

Selection intent comes from the visible file/diff UI, but Runtime validates it against the active preview snapshot and the existing Session/tab/workbench fences before creating draft context. Source selections are bound to the displayed file SHA-256; diff selections are projected from the exact active diff text and constrained to a compatible side and hunk. The snapshot proves what the user selected from the preview, not that the underlying Host file cannot change afterward.

## Focused verification

The core Runtime handoff suite passed with 32 tests and 200 assertions:

```text
bun test tests/composer-workspace-contexts-runtime.test.ts tests/composer-intent-runtime.test.ts tests/session-workspace-move.test.ts --timeout 20000
```

The file-workspace selection/fence suite also passed with 8 tests and 40 assertions in the same working tree. The full repository typecheck remains a baseline failure in unrelated app-shell preview fixtures and missing `@lumen/app-ui` declarations; it was not used as evidence for this core handoff. The React context test was not part of the core gate because this checkout lacks the optional `prop-types` dependency required by the MUI submodule.

Root's scoped strict TypeScript check of the Runtime entry and core/file-handler
tests passed, as did scoped ESLint, Prettier and the diff whitespace check. The
older file-reference test fixture had not been updated for `a99b3668`'s explicit
Session file target: it initially failed before opening its source file. The
fixture now supplies a real-shaped resolved launch target, echoes that target in
file reads, and uses session-scoped Git responses. No production target fence was
weakened to accommodate the test.

## Reference and scope

The prior `37ce66ea` file-reference feature intentionally only inserted a path
mention. This feature keeps that behavior and extends its public command with an
optional selection intent. Runtime rechecks the original preview ID, source
Session/tab/workbench and draft revision before deriving the quote itself. Source
intent carries offsets and the displayed SHA; diff intent carries the exact
displayed text and endpoints. Diff snapshots have no Host revision token: the
checks bind the current returned preview, not a new Host diff-version capability.

CC `e28d0a653481ef41b7a329411eeb2f0fd5656731` stores selected source lines and
comments in its per-Session `workspaceChatContextStore`, then formats those
references separately from the editable ChatInput text. The original
WorkspacePanel and WorkspaceDiffSurface renders in
`artifacts/file-selection-reference` provide the corresponding entry/layout
evidence. They use synthetic stores and in-memory workspace API responses, not a
native CC Host. Browser UI integration and its production-Web evidence are
documented separately; this core commit does not claim that UI acceptance yet.
