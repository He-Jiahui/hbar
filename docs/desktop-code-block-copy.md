# Contextual code-block reading and Copy

This unit migrates the ordinary Markdown code-block interaction, not the existing
whole-reply Copy or tool-output Copy. The overall desktop migration remains open.

## Reference and reproduced gap

Reference is local cc-haha `e28d0a65`. Original `MarkdownRenderer` mounts the
original `CodeViewer`, with its complete theme and Tailwind pipeline. Actual
English/Chinese 1440/320 captures establish a flowing language/total-line header,
right-hand Copy, a 20-source-line preview, and a bottom Expand/Collapse action.
Expanded code remains in its own scrollable body; keyboard toggling keeps focus
on the same button. Real clipboard checks prove that collapsed Copy includes all
25 fixture lines, without surrounding prose, fences, language or other blocks.

The same Markdown mounted in hbar's actual pre-feature message component has five
ordinary pre blocks, no code-block Copy, and one whole-reply Copy. Four reference
and four hbar isolated cases, plus newline checks, produced 20 final key PNGs.
These are original-component fixtures with synthetic content and blocked network,
not authenticated full cc-haha sessions. Both owned fixture servers/browsers were
closed. Main-agent visual review included Chinese 320 initial/last-line reference,
English 1440 collapsed/copied/expanded, and hbar Chinese 320 baseline. Evidence:
`artifacts/code-block-copy/reference/report.md` and its final evidence directories.

Two additional actual-Host baseline cases use frozen pre-feature P2 JavaScript
`index-Cefg9AVr.js`. English 1440 and Chinese 320 both fail specifically because
the authored pre exists but contextual code blocks are absent. No module/startup
failure is counted as the behavior red. Exact owned Host cleanup succeeded.

History distinguishes the gap from recent work: `cb4a241` added tool-result Copy,
not authored fenced-code Copy; `ec6556c` joined sanitized Markdown rendering and
Find's source projection. No evidence shows either commit removed a prior code
entry. This closes a remaining migration gap, not an attributed regression.

## Delivered behavior and boundaries

- Ordinary authored messages, live authored stream text, historical/current Plan
  documents, their before/after text, and Plan-exit document previews share the
  code entry. Hidden reasoning and tool payloads keep their separate semantics.
  Whole-message and tool-result Copy policies are unchanged.
- Language and total line count sit with a keyboard-accessible Copy. More than
  20 parsed lines offers Show more/Collapse. One preformatted body owns horizontal
  and bounded vertical scrolling; header/actions are normal flex flow. The preview
  does not alter the captured copy payload.
- Code is taken from the sanitized renderer AST, including fenced, indented and
  nested blocks. Only the renderer's extra terminal newline is removed. No trim,
  regex fence extraction, DOM-preview scraping or executable code is involved.
  Ordinary parsed CRLF/CR and intentional blank lines remain intact; existing Plan
  parsing can normalize its source to LF. The promise is complete **parsed code**,
  not byte-identical raw Markdown or original Plan source files.
- Local clipboard budget is 1,000,000 UTF-16 code units. Oversize is explicit and
  never silently truncated. Empty/whitespace-only code has no Copy action. These
  are deliberate hbar safety adaptations, unlike the reference's empty Copy that
  clears the clipboard. Unknown languages remain readable code.
- Clipboard writes capture session, message/source, text segment and AST offset
  occurrence. Duplicate equal code blocks are distinct targets. The feedback
  generation also follows source and runtime ownership, preventing late success
  after source A→B→A, stream changes, unmount or a new Host with repeated IDs.
  An already-issued OS clipboard write cannot be cancelled; only its obsolete
  local receipt is discarded. Success appears after real resolution, then resets
  after 1.5 seconds; failure/unavailable and manual retry remain beside the code.
- A new runtime owner restores the default folded state. Ordinary source appends
  do not undo the reader's explicit expansion. Read/copy remains available in
  archived history and does not execute, approve, retry or submit a Plan/Run.

Visible copy is a typed host-owned Chinese/English bundle, including line count
and recovery messages. Icons use the semantic small tier. Reference English-only
Copy/line labels on a Chinese page are not copied as an i18n regression. hbar keeps
its shared Lumen skin and plain code rendering; this unit does not claim exact
reference syntax-color or global typography parity.

## Find integration

Find's AST source index and UTF-16 spans are unchanged. A renderer-owned weak DOM
registration excludes only the actual header/footer chrome from the validated
text walk. An arbitrary data attribute or aria-hidden content is not trusted.
The complete filtered text still must equal the AST projection; altered authored
characters remain a mismatch. Ranges split at chrome barriers so a cross-block
match never selects a Copy button as prose.

Collapsed code uses one prefix plus one hidden tail, not a second full hidden
copy or a DOM-derived search index. Only an explicit, still-owned Find navigation
can request synchronous tail expansion. After that layout commit, the painter
revalidates scope/request/state/projection, original reveal identity and exact
connected row/segment, remaps, then reveals through nested scroll panes. Ordinary
paint, Copy feedback and stream updates cannot expand or re-scroll a block.
Current production tests assert the active tail Range text, intersection with
all clipping ancestors and center hit—not merely that a span exists in the DOM.

## Verification record

Core parser/renderer/message/Find tests passed 43 tests / 639 assertions. The new
clipboard helper passed 21 tests / 66 assertions; combined existing message/tool
clipboard regression passed 45 / 145. Find's maintained controlled-DOM browser
suite passed 17/17, including exact mapping, chrome barriers, fake attributes,
explicit reveal, stream/proposal segments and invalidated synchronous owners.
Its existing pure Find subset passed 26/26 / 507 assertions.

The initial controlled code-copy browser matrix passed 6/6: real React components
with an injected clipboard, StrictMode, independent occurrences, pending/retry,
source/owner/segment transitions, timer, capacities, folding, long translated text,
forced colors and current/historical Plan before/document/after. A first fixture
diagnostic display had truncated a recorded 199-character value to 100; that was
fixed in the fixture, with failed output retained, not relabeled as product Copy
truncation. Dedicated PlanExit cases were then added after independent review.

Candidate V2 (`index-CKakVQKD.js`) passed 4/4 actual-Host code workflows and 11/11
existing Find/tool-Copy/message-reading regressions. Its actual-Host cases verify
the OS clipboard, per-occurrence source, full 25-line copy while folded, Find tail
reveal, A/B drafts, reload of canonical history, and archived read/copy. Reload is
not a claim that an in-memory draft persists across an application restart.
Archive is an explicit observer setup write (one per case), separate from zero
browser business mutations and zero Run records. Initialization commits synthetic
messages with correlation IDs; it does not create or execute Run records.

At the V2 checkpoint, the full repository suite completed with **2755 passed,
1 existing authentication-family Lumen boundary failure, 28231 assertions across
395 files**. Full lint has the existing unavailable `react/no-unused-prop-types`
rule at `packages/lumen-app-ui/src/authentication/primitives.tsx:44`.
Logs are `artifacts/code-block-copy/full-tests.log` and `full-lint.log`. Unrelated
wizard work changed concurrently and was not included in this unit. These checks
are not an all-green repository claim.

## Final resource checkpoint

Final V3 adds the explicit optional PlanExit clipboard port and owner-only fold
reset. JavaScript: `index-JoKDlqHm.js`; CSS: `index-C4a6JQ3-.css`; JS SHA-256:
`A0A4A041915C16492CC7382667474BA4D4BEDB191A41CE831DB82B33006F62F7`.
Frozen `artifacts/code-block-copy/web-v3`, `dist/web` and desktop-resource JS
hashes agree. The Host/Web resources were built in the verified Visual Studio
environment; the existing native launcher was not rebuilt.

Final V3 parser/helper/message/Find tests passed **64 tests / 705 assertions in
5 files**. The separately executed existing Plan-exit/decision/proposal subset
passed **13 tests / 144 assertions in 3 files**. TypeScript and the scoped strict
lint, formatting, content, icon, flow and whitespace checks passed. The final
content-contract check covered eight changed React/fixture files.

The completed controlled React lifecycle matrix passed **8/8**, including two
additional actual `HbarSessionDecision` → Plan-exit preview cases. Pending,
allowed, denied and disconnected previews remain readable/copyable. Feedback
drafts survive pending/failure/retry; owner replacement resets folding and drops
old acknowledgments, whereas ordinary source appends retain expansion. All
Plan decision/reconcile/answer/submit callbacks stayed at zero. These are
injected-clipboard component tests, not real-Host or native claims.

Final V3 actual-Host browser workflows passed **4/4** at English/Chinese ×
1440/320. Each records the expected final asset, zero observed browser business
mutations, zero Run rows and no page errors or console warnings. One observer
archive setup write per case remains explicitly separate. All four owned Hosts
exited with code 0 through their own stdin, and exact temporary roots were
removed (`bBDfEc`, `nu3csi`, `tClwIM`, `sstWgq`). See
`artifacts/code-block-copy/v3-final-results.json` and
`artifacts/code-block-copy/browser/v3-final/*/result.json`.

## Native verification and cleanup

The final resource passed **4/4 real Windows WebView2 cases**, English/Chinese ×
900×600/1440×960, using the existing debug launcher and fresh isolated Host
profile. All eight actual OS clipboard writes contained their original complete
long/short parsed body (Windows readback uses CRLF), including all 25 long lines
while the preview showed 20. Keyboard toggles verified 20→25→20 and same-button
focus. Find revealed the exact tail Range through its clipping ancestors; Escape
returned focus to the unchanged original composer draft. Main-agent visual
review included English 1440 folded/copied and Chinese 900 tail-find screenshots.

The native report records the exact final V3 resource hash, zero Run records,
zero catalog-classified UI Host writes, zero paid-provider requests, and empty
page-error/console arrays. Preseeded synthetic historical messages are explicitly
separate from model execution. Verification, 24 PNGs and scroll geometry are in
`artifacts/code-block-copy/native/hbar-native-session-code-block-copy-yev7T1/`.

The first bounded native attempt (`C19n3s`, workspace `pi6KzV`) failed before Copy:
the first code action remained outside the viewport after programmatic scrolling.
The screenshot showed the conversation bottom, with no page errors. Source
inspection found a possible race with the existing 250ms initial end-position
correction, but no frame trace proves that precise timing. The ignored runner
was adjusted to express real reading intent with hover plus mouse wheel before
its unchanged strict visibility checks; no product code, force-click, injected
scroll state or extra sleep was added. A separately authorized fresh attempt
then measured genuine scrollTop changes, 618→0 at 900 and 258→0 at 1440, in both
languages and passed all four cases. This proves real-user reachability, not an
unsupported claim that a product scrolling defect was fixed.

Both captured native process chains were stopped with executable/argv/creation/
parent identity guards; both cleanup error arrays are empty. Only successful
profile `yev7T1` and workspace `QAvLkm` were removed. The first failed profile and
workspace remain for diagnosis; all older retained fixtures were untouched.
Protected PIDs were neither queried nor stopped. Native evidence is independent
of earlier original-component, controlled-browser and V2 regression results.
