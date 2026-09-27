# Tool outcome and disclosure migration

This is one unit of the cc-haha desktop UX migration, not a claim that all
application entries or visual interactions already match. The preceding Stop
entry is committed as `1b40fd0`; its cancellation recovery owner is `87b2e55`.

## Observed reference and hbar gap

The original cc-haha checkout is `e28d0a65`. Unmodified ToolCallBlock,
ToolCallGroup, ActivityGroup, ToolResultBlock and their original theme/i18n
were actually rendered at English/Chinese × 1440/320. The isolated fixtures
use synthetic records, captured transport and the original stopGeneration
action, not an authenticated reference Host or actual tool execution.

Ordinary tools use a compact row and start collapsed, including errors.
Incoming errors preserve a closed row, and later results preserve the reader's
manual expansion. Enter/Space operate the header without moving focus; Escape
does not close it. The original Stopped state applies only to an unresolved
tool after a local stop transition. Results carrying isError, including supplied
cancellation/denial text, use the ordinary red error branch. It does not have
hbar's new typed six-way outcome palette. Success summaries are quiet, while
error summaries show a bounded first line. Output Copy is beside its own result
and copies the full body despite the display window.

The main agent inspected original wide/narrow overviews, the actual local
Stopped transition and expanded error output. The source audit also checked
the diffs of `52682a4c` (stopped unresolved tools), `12c01b7c` (shell output
windows) and `c896347b` (live/settled activity grouping). Evidence is under
`artifacts/tool-outcome/reference/`: 64 main-matrix PNGs, 16 same-node transition
PNGs, observations and cleanup reports. The requested reference ego-browser
skill is unavailable, so installed Edge/Playwright rendered the original
components. The fixture is not represented as a full original App run.

At hbar `1b40fd0`, two new actual Host/SDK fixtures (English 1440, Chinese 320)
each submitted one local-fixture write_file Run waiting for approval, then used
the real Stop button without approving it. Both Runs and exact approval events
were cancelled, but the persisted tool_result had only isError=true and the
text "User denied the tool call". Its compact row said Failed; the adjacent
approval correctly said Cancelled. Enter exposed the same incorrect original
denial text. The proposed file was never created. Both owned Hosts exited 0
through stdin and exact temporary roots were removed. Evidence:
`artifacts/tool-outcome/baseline/`.

Path history confirms the compact renderer introduced in `c49412b` maps every
isError to Failed, red styling and a failed count. Kernel approval handling
also collapses a cancelled wait into allowed=false/DENIED. These findings
describe the existing loss of distinction; they are not evidence that the
latest Stop commit removed a previously working tool-result classification.

## Canonical prerequisite

An optional typed `tool_result.outcome` records Host-owned settlement facts:

| Kind        | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| succeeded   | The returned tool result is not an error.                                  |
| failed      | An actual error, validation failure or non-cancellation failure occurred.  |
| denied      | A policy or persisted approval did not authorize the tool.                 |
| cancelled   | The Host has specific cancellation evidence for this call.                 |
| interrupted | Host shutdown/recovery interrupted the call.                               |
| unknown     | Execution intent existed but no final result was recorded before recovery. |

`executionStarted` means that the Host recorded durable execution intent. It
does not prove an external effect completed, or that cancellation rolled it
back. The content schema requires succeeded to agree with isError=false and
all other kinds with isError=true. Legacy results without outcome remain valid;
their text is not parsed to fabricate a cancellation or denial.

The execution gateway constructs the outcome independently of plugin-provided
details, outcome or hostFailure. The original Host signal is captured before
plugins or hooks can replace the mutable ToolContext property. A plugin error
merely named USER_CANCELLED does not establish a Host cancellation. Approval resolution carries its actual
persisted winning state; a losing cancel attempt cannot override an already
stored allow/deny. A failed cancellation persistence attempt may end an aborted
wait but does not manufacture a persisted approval. A bounded read first checks
whether a competing decision already won.

Storage recovery writes unknown for a durable intent without a result and
interrupted when no execution was recorded. Existing settled results remain
unchanged. The additive field survives normal reopen and JSONL reconstruction;
no database column migration or new transport endpoint is required. It does not
backfill historical results whose original reason was not retained.

## Canonical verification and delivery boundary

The first frozen prerequisite passed 54 focused tests (303 assertions). Its
full Bun run was 2887 pass / 4 fail across 403 files. Two failures were source
guards interpreting the Stop file's comment as JSX; comment-only follow-up
`a2ff9c1` fixes those, with both guards plus Stop model tests passing 58/58.
The remaining failures concern the Wizard plan-list selector and existing
Lumen authentication native controls, outside this unit. Full lint reports
the existing missing react/no-unused-prop-types rule in Lumen authentication;
it is not a clean all-repository gate.

Independent review then found the mutable-signal provenance flaw. Two actual
Kernel regression tests first failed on V1: forged cancellation was accepted,
and replacing the signal before approval prevented real cancellation from
ending the wait. Capturing the original Host signal fixes both. Final contract,
Kernel, storage, Plan-exit Host and cancellation-recovery Host tests pass
30/30 (184 assertions). Main's wider final-source rerun, also including storage,
path-layout, Run-failure storage and Plan-exit storage regressions, passes
56/56 (308 assertions across nine files). Root TypeScript, scoped strict ESLint and formatting
pass on the corrected prerequisite. Expected injected persistence failures
are logged by the three fault tests; no approval receipt is fabricated.
The review is clear after the signal correction. Detailed logs and the red
tests remain under `artifacts/tool-outcome/`.

The data prerequisite is independently committed as `b86ed9a`. The V1 full-run
result above is not represented as a final-source all-green suite.

## Compact tool UI

The following UI unit uses only the canonical result joined by the existing
session/Run/call ID/tool-name projection. Six precise result kinds have required
Host-owned English and Chinese labels. A legacy error with no outcome shows
Incomplete, not an invented cancellation, denial or confirmed execution failure.
A legacy non-error keeps the existing completed-result presentation. An absent
result says No result yet; neither streaming nor a Run's terminal state is used
to fabricate a tool outcome. Activity summaries count these states separately;
only canonical failed results increment the failure count or use danger styling.

Every tool disclosure starts closed, including failures and reloaded history.
New results do not force it open or move focus. The existing per-call identity
preserves a reader's current expansion; changing session/message/call identity
starts a new disclosure. The aggregate activity still follows live state until
the reader pins its choice. Approval/Plan decision controls remain siblings,
so folding tool input/output does not hide a required decision.

Only actual errors and incomplete legacy errors show a short diagnostic preview.
It reads at most 8192 UTF-16 units, removes terminal control sequences and shows
at most 72 graphemes plus an ellipsis from the first nonempty line. The raw output
is untouched. Extracted SessionToolDetails retains safe input serialization,
the 12000-character display window, explicit full-content expansion and the
separate million-code-unit Copy limit. Copy remains beside the original output,
never copies the diagnostic preview, and never triggers a retry/execution.
The existing pane owns scrolling; this unit adds no list cap, positioning or
alternate history store.

Focused rendering/model/copy/Stop regression: 51 pass, 490 assertions across
five files, plus 5 localized outcome/count rendering tests, 132 assertions.
The historical SSR tests now render the extracted detail unit to verify its
capacity and safe content; they no longer require failed tools to start open.
Actual browser tests verify that those details remain reachable by disclosure.

Frozen production Web asset `index-Dxd--v8b.js`, SHA-256
`80942BE9996A9AFB227ED8ED92CAAA2A93B08131F9E6D99CED3DCCAF1B8A02D7`,
uses the unchanged `index-DHHK91sr.css`. The real Host matrix is 16/16:
English/Chinese × 1440/320 × cancelled/denied/failed/succeeded. Each submits one
local-fixture Run; only cancelled/denied cases request write approval and neither
is allowed. Failure/success cases only read an absent/preseeded file. Exact
result outcome, initial/reloaded closed state, Enter/Space focus and 32 actual
clipboard readbacks pass. No additional Run, retry or file write is introduced
by disclosure/reload/Copy. All 16 owned Hosts exit 0 through stdin and their
fresh roots are removed. There are 72 screenshots, zero page/console errors and
no document overflow. Evidence: `artifacts/tool-outcome/browser-final/`.

The local-fixture model may author a separate "Tool failed" assistant reply
after an isError result. That is original message content, not the tool-row
label, and is not rewritten or hidden by this UI. A completed enclosing Run
does not imply every tool succeeded; this distinction is explicitly tested.

Controlled production React lifecycle verification passes 12/12 across both
locales and widths, with 60 screenshots: same-node pending-to-error without
focus theft, reader-pinned expansion, identity changes, Escape preservation,
six canonical states and legacy absence, exact full Copy, and 0/1/100/101 rows
with long copy. These are component props and an injected clipboard, not Host
or fault-execution evidence. First-run 8/12 was a test assertion error about
72 graphemes plus ellipsis; the corrected exact expected string passes.

The final-source full Bun run is 2905 pass / 3 fail across 405 files (30239
assertions). Failures are the concurrent Wizard empty-list strategy/plan-list
selectors and Lumen authentication control boundary. After the parallel Wizard 6
commit `bac63dc`, those three files were rechecked: 31 pass / 2 fail; the
empty-list strategy passes, while the registry plan-list selector and Lumen
authentication boundary still fail. Root typecheck passes;
full lint still reports the same missing authentication rule. Scoped strict
lint, formatting and content/flow/icon guards pass. No full-repository green
claim is made. Independent UI review found no blocking issue. The older
tool-result-copy E2E selectors were maintained for the new root attributes and
reviewed/typechecked, but that older suite was not rerun in this unit.

## Native acceptance

The existing debug desktop launcher, without a launcher rebuild, passes
16/16 cases on newly built Host resources and the same frozen Web SHA above:
English/Chinese × native 900×600/1440×960 × four outcomes. Sixteen actual
local-fixture Runs, four UI cancellations, four UI denials, zero Allow decisions
and zero proposed file writes. Default collapse, exact canonical outcome,
Enter/Space focus, original draft before reload, reload identity and 32 actual
WebView2 clipboard readbacks pass. The main agent inspected native Chinese
900 cancellation and English 1440 expanded failure. There are no page errors,
console warnings/errors or document overflow.

The first fresh native fixture verified its cancellation status but failed
programmatic screenshot alignment at 900×600. Original evidence and its two
isolated temporary directories are retained. Source and history (`0916211a99`
in hbar-ui) show that measured conversation positioning is interrupted by user
wheel/pointer/scroll-key input, not a programmatic scrollIntoView. The runner
now expresses real wheel reading intent and verifies movement before normal
alignment. It retains full pane/viewport containment, center hit testing and
four stable frames; product code and visibility assertions were not weakened.
The exact first-run race was not instrumented and is not claimed as proven.

The second run uses fresh roots, records wheel-before/after positions and
completes all sixteen cases. Its exact owned desktop/supervisor/Host process
chain was closed after PID, executable, full argv, creation-time and parent
checks; both successful temporary roots were removed. The first run's owned
processes also closed, but its failed roots were not reused or removed. Native
cleanup uses verified owned process handles, whereas browser fixtures use stdin.
Protected PIDs and all previously retained roots were untouched. Evidence:
`artifacts/tool-outcome/native/hbar-native-session-tool-outcome-R2guEo/`.

This unit does not claim real native shutdown/crash fault injection for the
interrupted/unknown kinds; their persistence is tested through storage recovery,
and rendering through pure, SSR and controlled React tests. It also does not
complete the larger desktop navigation migration. Tool-family/path summaries
and other remaining entry points require their own reference audit and unit.
