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

The data prerequisite is ready for its independent commit. The visible outcome
labels, consistent default disclosure, group counts and final production/native
UI acceptance are **not yet delivered** at this checkpoint. They remain required
work on top of this contract, not optional polish. The V1 full-run result above
is not represented as a final-source all-green suite.
