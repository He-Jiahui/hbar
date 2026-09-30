# First-send attachments

The no-tab composer uses the same attachment reservation/upload/reconciliation
mechanics as a Session composer, but has an explicit `draftId` owner. It is not a
fake Session. Browser file bytes remain in the existing bounded attachment source
controller; the canonical pre-session draft stores only metadata, transfer status
and confirmed artifact references.

`attachment.upload` and `attachment.query` already operate on Host-global artifact
storage. Selecting a file therefore requires neither a Workspace nor a Session.
The pre-session commands reuse those capabilities without changing Session
preparation and authorization for the existing `draft.*` command family.

On first Send, Runtime captures text, confirmed attachments and entry choices at
one draft revision. Unresolved transfers must be removed or resolved before it
creates a Session. Ordinary/Plan submissions may contain only attachments; Goal
submissions still require objective text. The created Session receives the same
confirmed references in its canonical composer draft, and the first ordinary or
Goal Run receives those references grouped as images and files. An accepted Run
receipt is the only point at which the pre-session draft clears them.

If creation finishes after navigation changes, the new Session keeps the seeded
text and attachments without submitting a Run or taking over the later selection.
The original pre-session draft also retains its confirmed references. Local
attachment edits are refused while that draft owns a pending first submission.

## Reference and verification boundary

CC `e28d0a653481ef41b7a329411eeb2f0fd5656731` implements no-tab attachment selection
in `desktop/src/pages/EmptySession.tsx`: the Files/Photos entry shares the Plus
popover with Slash commands, selected attachments sit above the editor, paste and
drop use the same intake, and attachment-only input is sendable. Hbar retains its
typed Host artifact contract rather than copying CC's browser attachment state.
Visual evidence and production-Web acceptance are recorded separately in
`pre-session-attachments-ui.md`.

Scoped verification on 2026-09-30:

- Pre-session draft, existing composer attachment, browser source controller and
  workspace boundary suites: **67 passed, 426 assertions**. Four new cases cover
  attachment-only promotion, Goal image/file promotion, unresolved-transfer
  blocking, and navigation-loss preservation.
- Existing attachment/file contract regression subset: **19 passed**.
- Strict TypeScript check of the changed Runtime entry closure and promotion
  tests passed; scoped ESLint and formatting passed.

The broad repository typecheck was attempted by the transfer implementation
agent; it still reports unrelated app-shell fixture and Lumen module diagnostics,
plus concurrent UI edits before they were finished. It is not reported as a
passing gate. This does not claim a native file-dialog or paid-provider test.
