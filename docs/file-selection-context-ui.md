# Selected code and inline comments in the composer

This closes the gap between adding a whole file path and adding the exact code
the user is discussing. Whole-file **Add to chat** remains unchanged. A source
text selection now exposes a labelled nearby Add action; source line numbers
open an inline note editor, and diff line numbers open a note editor below the
selected range. Shift-click extends a range without losing an already typed
note. Diff ranges retain their old/new
side and hunk rather than copying raw patch headers into the prompt.

Adding never sends a Run or navigates away from Files. The owning Session gains
compact removable references above the composer, beside the existing materials.
Each card shows its kind, file name, visible line range and optional note; the
full path is available in its title, and quote contents have an explicit
disclosure. A long file name can truncate without hiding the range. Lists and
quotes have bounded scrolling. Removing a card preserves the other cards, text,
mentions and uploaded attachments. The Runtime owns the references; the React
component only holds text selection, note form state and local action feedback.

Ordinary default/Plan submissions accept context as material even without text.
Goal still requires objective text, and its objective excludes appended code
quotes. Local slash actions cannot silently consume a context-bearing draft.
Existing generic attachment chips are retained when image projection is absent;
the custom slot does not suppress materials just because contexts are present.

## Visual reference

CC source revision: `e28d0a653481ef41b7a329411eeb2f0fd5656731`.
The reference fixture imports the original `WorkspacePanel` (`CodeSurface` and
`FloatingSelectionMenu`), `WorkspaceDiffSurface`, `AttachmentGallery`, theme CSS
and original reference store. It uses synthetic Session/repository data and
in-memory workspace API responses, not a native CC Host or paid provider.

Root inspected the styled desktop/narrow selected-text action, source comment
editor, diff comment editor and resulting reference card:

- [CC selected-text menu, desktop](../artifacts/file-selection-reference/desktop-1440-source-selection-menu.png).
- [CC selected-text menu, narrow](../artifacts/file-selection-reference/narrow-320-source-selection-menu.png).
- [CC source inline note](../artifacts/file-selection-reference/desktop-1440-source-inline-comment-editor.png).
- [CC diff inline note, desktop](../artifacts/file-selection-reference/desktop-1440-diff-comment-editor.png).
- [CC diff inline note, narrow](../artifacts/file-selection-reference/narrow-320-diff-comment-editor.png).
- [CC resulting source card](../artifacts/file-selection-reference/desktop-1440-source-reference-added.png).

The first fixture attempt lacked Tailwind scanning and was rejected as visual
evidence. These files were regenerated after importing the original theme and
scanning original CC sources. The fixture does not reproduce the native shell or
icon-font bootstrap; some Material Symbols tokens render as text. It supports
component structure, placement and interactions, not full-app/font pixel parity.
The adjacent README and `capture-result.json` record provenance, synthetic DOM
Range selection, viewports, allowed origins and zero page errors. Port 49126 was
stopped after capture; CC/Main source was not edited.

Hbar's final production-Web captures use temporary real Host/Git workspaces:

- [Selected code, 320px Chinese](../artifacts/file-selection-context/source-selection-zh-CN-320.png).
- [Inline diff note, desktop](../artifacts/file-selection-context/diff-comment-en-US-1440.png).
- [Ready composer with visible ranges](../artifacts/file-selection-context/ready-contexts-zh-CN-320.png).

Source/diff rows and inline editors use flex flow. Only the observed selection
menu floats; its position comes from measured DOM Range/menu rectangles and is
clamped to the viewport. The flow guard permits only that exact container in its
own stylesheet and has a self-test rejecting the same rule in another file or
on its children. Icons use shared semantic tiers and all visible action copy is
provided by the Web composition root in English and Chinese.

Visual QA also corrected the inherited Files feedback paragraph's flex growth:
it now takes its natural content height instead of pushing the source halfway
down a tall reading pane. No content height or screenshot coordinates were used
to place code, notes or cards.

## Acceptance

Final bundle: `artifacts/file-selection-context/web`, `index-COvBLKe9.js` and
`index-DTf7FUNR.css`.

- Production Web + temporary real Host/Git: **4/4 passed**.
  Two new en/zh cases cover selected source, source note, same-side diff range
  and note, existing mention/material preservation, desktop/320px layout,
  typed-note preservation while extending a source/diff range, individual
  removal, Session isolation, one accepted Run with exact kept code
  and notes, then empty composer/cards. Two existing en/zh whole-file Add cases
  preserve the original path-only workflow, workbench owner and dirty recovery.
- First-send mixed file/photo regression on this final bundle: **2/2 passed**,
  each exercising English/Chinese Plan and Goal with no early Session/Run,
  unchanged material identities and an empty actual Session composer afterward.
  Captures stay in this feature's `first-send-regression` directory, not the
  earlier photo evidence directory.
- Relevant Runtime/copy/boundary regression suite: **57 tests / 333 assertions**.
  This includes existing tests; it is not a newly added fault matrix.
- Scoped strict TypeScript, zero-warning ESLint, TS/TSX/CSS/copy/test/document
  Prettier, content/icon/flow guards and flow-guard self-test passed.

The first browser pass reached the completed card/removal state but timed out
trying to open a sidebar item after entering narrow mode. The test now opens
both Sessions while the sidebar is visible and switches through their tabs;
there was no product change to force the narrow sidebar open. The final normal
flow uses the actual UI controls. Source text selection is established by a DOM
Range and mouseup, as recorded for the reference; this is not a claim of native
pointer/file-dialog acceptance.

The attempted Bun React SSR test hit the existing MUI-barrel `prop-types`
resolution issue before rendering (also reproduced by the old attachment SSR
test). No dependency was installed or UI barrel mocked to hide it. Actual cards
and interaction are verified by the production browser instead. The full repo
typecheck remains red on unrelated preview/MUI baseline errors. Native Tauri,
real paid providers and exhaustive fault/recovery matrices were not run.
