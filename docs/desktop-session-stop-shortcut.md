# Current-session Stop entry and cancellation recovery

This migration unit follows cc-haha's contextual Stop keyboard entry. The
overall desktop UX migration remains open. The work is split at a real
dependency: truthful cancellation/recovery first, then the keyboard entry and
visible feedback. Source/visual baselines do not prove the new entry is shipped.

## Reference: what the original actually does

At local cc-haha `e28d0a65`, `useKeyboardShortcuts` handles Ctrl or Meta plus
literal `.` for the active tab. It is eligible while chat is non-idle or a local
or remote background Agent is running. Commit `888a5241` added that background
Agent eligibility; its source diff was inspected. `chatStore.stopGeneration`
sends `stop_generation`, locally changes chat to idle, flushes partial output,
clears pending permission UI and marks background Agent stopping intent.

The actual original hook, ChatInput and stopGeneration action were rendered in
an isolated controlled-transport fixture at English/Chinese × 1440/320. Both
modifier keys reached the active tab. Idle local/remote Agents remain eligible;
idle bash/dream tasks do not. These are original-component/action observations,
not a reference Host or full authenticated App run. Main-agent visual review
included the English 1440 and Chinese 320 original Stop controls.

Do not copy two observed defects as fidelity requirements: the original Windows
tooltip still names Cmd, and the original Stop shortcut acts through its modal;
changing chat to idle then moves focus from the modal input to the background
composer. It also permits repeated background-agent stop requests. The hbar
entry must preserve modal/focus ownership and the existing pending-action lock.

Evidence is under `artifacts/session-stop-shortcut/reference/`. The reference
repo's requested ego-browser skill is unavailable in this session; the isolated
fixture uses installed Edge/Playwright and original components. External/API
requests were blocked; two unrelated API attempts and an original ProseMirror
whitespace warning are retained, not described as a clean console. The owned
preview/browser were closed.

## hbar's current reproduced gap

At `88f387f`, a fresh production build produced `index-JoKDlqHm.js`, the same
asset as the prior verified code-block unit. Four real-Host fixtures at
English/Chinese × 1440/320 each started one non-paid local-fixture Run waiting
for write_file approval. In the composer and the session-owned Files pane,
Ctrl+. and Meta+. sent **zero cancellation commands**, and the original Run
remained waiting. Returning to the existing pointer Stop sent exactly one
operation.cancel and settled that Run as cancelled. The proposed file was
never approved or written; each fixture had one real Run, not zero Runs.

The final baseline passed all four explicit gap assertions in 13.8 seconds.
Evidence: `artifacts/session-stop-shortcut/baseline-final/` and
`baseline-final-results.json`. The first harness attempt had one complete case
and three setup timeouts: sidebar auto-close raced a stale Hide click, and
initial auto-expansion raced a stale project toggle. Traces proved those
selectors; the runner was corrected to recheck the resulting state, with no
product change. First-attempt failures remain separately retained.

All eight bounded baseline Host processes exited through their own stdin with
code 0. Exact-prefix temporary roots were removed only after exit. No native
window, protected PID or old retained root was queried or touched. The baseline
Host script was subsequently moved from its temporary e2e support location to
the ignored baseline artifact directory; that is not a new behavior test run.

## Required scope and recovery semantics

hbar's existing mouse entry targets the executing/waiting Run before a newer
queued Run. The new keyboard entry must use the same selection and public
runtime operation.cancel, not a new Client call or a second cancellation store.
Its scope is a confirmed current session/tab lifetime, including its own tool
page or split pane; Settings, Status, expanded workbench, foreign/pinned-project
tools and modal/palette/popover controls must not target a hidden conversation.

The original cc-haha stop-generation action also covers background Agents.
hbar's existing operation.cancel is a single-Run command. This unit must not
silently equate those contracts, stop the queue, or cancel unrelated child
Agents. Broader session-wide stopping remains a separately audited product
contract, not an implied capability of this shortcut.

Inspection identified a prerequisite in the existing cancellation path:
`packages/client/src/run.ts` omitted operation.cancel from lost-response
classification, and `drafts.executeRun` classified only RESULT_UNKNOWN as an
unknown cancellation. TIMEOUT/DISCONNECTED after dispatch could therefore be
presented as a retryable failure. Source history `ed2f07d` explicitly added the
submit/retry classification but retained delegated cancellation; `c6c2e52`
added action command/phase ownership for retry recovery, not cancellation state
reconciliation. This is a remaining lifecycle gap, not proof that either commit
removed a previously working cancellation recovery feature.

The gap was then reproduced against the exact canonical Client and draft-owner
sources from `88f387f`: a build-time source loader reads those two files through
git show and records SHA-256, without modifying the working tree or hand-writing
an old implementation. Both new invariants fail for the intended reason: the
adapter retains TIMEOUT instead of RESULT_UNKNOWN, and the owner records failed
instead of unknown. This controlled two-module historical comparison uses the
current unchanged dependencies; it is not a whole historical App reconstruction.
Evidence: `artifacts/session-stop-shortcut/canonical-cancel-red.log` (0 passed,
2 failed) and `build-cancel-baseline.ts`. The initial bundler invocation did not
persist its in-memory output; its missing-test-path diagnostic was corrected
before this actual behavior red, not counted as the defect.

Cancellation acknowledgment is distinct from terminal completion. A lost ACK
must keep the original operation locked against automatic replay. Recovery may
read the exact original operation through operation.get; it is an observation,
not an actor-specific cancellation receipt. Reading running/queued/waiting after
a lost response cannot prove the original cancel failed. cancelRequested means
accepted/pending, while cancelled/completed/failed/interrupted must retain their
actual distinct operation outcomes. Drafts and attachments are not consumed.

## Implementation and verification checkpoint

The cancellation recovery prerequisite now has a typed local application
command, `runAction.reconcileCancellation({sessionId, operationId})`. It uses
the existing public operation.get and never issues a second operation.cancel.
The existing bounded runActions owner records request versus state-read phase,
the observed operation status, and whether the actual port Promise is still in
flight. No duplicate cancellation store or new Host endpoint was introduced.

The Client validates cancellation ACK shape and target and classifies lost or
unverifiable replies as unknown. The runtime applies the same rule to public
Run ports, captures the original target, rejects duplicate/accepted/unknown
cancellation and prevents Retry from bypassing unresolved cancellation. A
definite Host rejection remains distinct and can be retried explicitly.
Arbitrary Error.message and arbitrary uppercase error codes do not enter the
action's visible error field.

The 30-second deadline bounds the caller's wait, not the underlying port's
execution. Aborted/timed-out physical reads retain their slots until settlement;
the owner permits at most 32 such reads and retains at most 100 actions without
evicting an in-flight request. Disposal and exact action identity suppress old
publication. A returned old DTO is not permission for the future UI to show a
new success or move focus; it must consult its own lifetime and current state.

Final focused cancellation/runtime/execution tests passed 61 tests / 309
assertions; separate draft/Run/tab-close regressions passed 46 / 224, for
107 / 533 across eight non-overlapping files. The two historical defect
invariants also pass against the new source. Strict scoped ESLint, TypeScript
and formatting passed. The application-command inventory now includes the
new local command; its focused checks passed.

An additional maintained real-Host test uses the actual Kernel, authenticated
SDK and AppRuntime. A genuine pending write_file Run is cancelled on the Host,
but the executed ACK is withheld and replaced with TIMEOUT at the transport
boundary. Pending and unknown states block another cancel. A deliberately
wrong-session read is rejected without binding, then the correct original
operation read confirms cancelled; later foreign-session recovery is rejected
locally. Its instrumented runtime transport records one cancel and two reads
(including the deliberately mismatched read), zero retries. Separate setup and
assertion observers also read Host state. The original full draft object, newer
text/revision, other-session draft and navigation survive; there is one real Run,
one cancellation-request event, no approved tool and no created target file.
This integration passed 1 test / 33 assertions, with owned Host/Kernel/root
cleanup. An initial fixture-only error compared a draft command's small return
value with the full draft; it was corrected to capture and compare the actual
draft snapshot, not reported as a product defect.

A second agent reviewed the frozen cancellation code and tests with no blocking
findings; it did not claim to independently rerun them. Reports are
`artifacts/session-stop-shortcut/cancellation-host-verification.md` and
`recovery-review.md`. The production Web build passes with
`index-BH5hNEtc.js` and unchanged `index-C4a6JQ3-.css`; the existing large-chunk
warning remains. No launcher/resource rebuild or new native acceptance was
performed for this runtime-only prerequisite.

The main-agent full repository run completed with **2801 passed, 2 failed,
28468 assertions across 398 files** (330.87 seconds). Both failures are in
untouched UI checks: the wizard registry still expects the older plan-list
markup after concurrent billing-upgrade work (`5e4b23a`), and the canonical
Lumen boundary reports native controls in authentication components. Full lint
also retains the unavailable react/no-unused-prop-types rule in authentication
primitives at line 44. No unrelated UI source or assertion was changed to make
these checks green. Logs: `artifacts/session-stop-shortcut/full-tests.log` and
`full-lint.log`. Root TypeScript passed; scoped lint passed. This is not an
all-green repository claim.

At the prerequisite commit `87b2e55`, the keyboard entry, shortcut discovery
and visible tool-page recovery notice were not yet implemented. The following
UI continuation uses that same verified application-command owner.

## Contextual keyboard and visible recovery

The workspace shell now scopes Ctrl+. / Meta+. to a connected, ready current
session and its exact workspace/tab lifetime. Keyboard events are handled in
the bubble phase and re-read public runtime snapshots immediately before
dispatch. Exactly one of Ctrl/Meta is required; repeats, IME/229, Alt/Shift,
prevented events, native modals, open popovers and visible menu/listbox owners
are excluded. Settings, Status, expanded workbench, sidebar/outside focus and
foreign/project-only tools cannot cancel a hidden conversation. A session-owned
Files page remains eligible even while its main conversation is inert.

Keyboard, composer Stop and the explicit activity-row Cancel share the same
read-only eligibility model. The executing/waiting Run remains preferred to a
newer queued Run; an in-flight or uncertain primary cancellation never falls
through to the queue. Explicit row cancellation may target its own queued Run.
Pointer callbacks additionally require the original immutable navigation
snapshot, so returning A → B → A does not resurrect a saved old A callback.
The activity presentation no longer calls a successful Run retry a pending
cancellation, and physical request locks also disable its pointer entry.

The only local state is the selected feedback target. Sending, requested,
unknown, checking and each distinct terminal outcome are projected from the
existing exact Run/action. The notice occupies normal flow near the composer
or in the matching tool wrapper, never an absolute overlay or four copied Stop
controls. Returning to a session can recover unresolved canonical actions;
completed notices are not resurrected across tab/owner lifetimes. Promise
completion does not focus, navigate, reopen or publish another UI success.

Unknown/requested results offer **Check result**, calling only the original
`runAction.reconcileCancellation`. A definite rejection offers explicit Stop
retry only while that original Run is still active and the request is settled.
Neither an active state read nor a timeout is proof that replay is safe. The
host supplies all localized text, distinguishes the original Run's actual
terminal outcome from accepted cancellation, and never renders arbitrary
transport diagnostics. Stop's title/accessibility name includes the host
platform's Ctrl+. or ⌘. hint, using existing Lumen controls and icon tiers.

The initial production candidate `index-CH9S04MT.js` passed six real-Host
browser cases (English/Chinese × 1440/320 plus two lost-result cases). These
used 14 real local-fixture Runs, ten UI cancellations, four separately counted
observer queue-cleanup cancellations, four recovery reads and six attachment
uploads. No tool approval, file execution, Run retry or UI Run submission was
performed. For the unknown-result cases, the fixture withholds the original
session's real events as well as replacing its successful cancellation reply;
it does not fabricate an operation or mutate application stores. Six owned
Hosts exited 0 and their exact temporary roots were removed. Candidate evidence
and first-pass counts are retained under `browser-candidate/`; later changes
and final acceptance are recorded below rather than attributed to this build.

### Final verification and observed corrections

The controlled browser suite uncovered two real pre-release defects, both kept
as red evidence. First, closed native details can leave geometry on a nested
menu; the original visibility predicate therefore blocked normal Stop. The
local overlay test now also asks the browser's `checkVisibility()`. Second,
turning Check into a native disabled button blurred it during readback. The
same button now uses `aria-disabled`, disabled visual state and the existing
fresh runtime eligibility guard. Repeated Enter/Space sends no extra read,
and the button stays focused through Check → checking → terminal Dismiss.
No general focus helper or shared Lumen primitive was changed for either fix.

The final maintained lifecycle suite passed **6/6** in 11.7 seconds against the
actual development React runtime, with first-mount setup=2/cleanup=1 assertions
proving StrictMode effect replay. Earlier production-bundled fixture runs did
not prove this replay and are not presented as doing so. Cases cover both
languages, held replies, A/B/ABA, tab recreation, replaced/unmounted owners,
stale saved callbacks, unknown/failed reads, wrong-session reads, offline
recovery, accepted versus terminal facts, explicit safe retry, IME/modifiers,
prevented/repeated keys, native overlays, and 320px long copy/forced colors.
This suite uses injected public ports and synthetic snapshots: no Host, model
provider or submitted Run. Evidence: `lifecycle/strict-final-results/` and
`lifecycle/evidence/`; first red and V2 traces are retained separately.

Final production Web assets are `index-tSCMdKyB.js` / `index-DHHK91sr.css`.
The JavaScript SHA-256 is
`202832C743A2761A43216BBA8BB382CA22721C21E5C3800158A3F202D6B38109`.
The complete real-Host browser matrix passed **6/6** again in 26.3 seconds,
with the same separate 14-Run/10-UI-cancel/4-observer-cancel/4-read/6-upload
counts. English readback retained the exact Check/Dismiss DOM and focus;
Chinese readback respected a deliberate move to the file editor. All six
new Host roots exited 0 through owned stdin and were removed after exact-root
validation. Final evidence: `browser-final/` and `final-results.json`.

The existing Windows desktop launcher then loaded this exact production asset
and SHA from newly built Host resources. **All four native cases passed**:
English/Chinese × 900×600/1440×960, Meta+. in the file tool and Ctrl+. in the
composer. Each case submitted one real local-fixture Run waiting for write_file
approval; the UI cancelled exactly that Run. The four drafts, dirty file
contents, original focused DOM nodes and unchanged disk file were verified;
no approval or proposed file write occurred. Native page errors and warning/
error console entries were empty. The main agent visually reviewed Chinese
900 and English 1440 captures and the final browser recovery/long-copy images.

Native evidence is `native/hbar-native-session-stop-shortcut-RRNaCu/`.
Exact launcher/Host/supervisor identity checks and directory cleanup passed;
the newly owned profile `RRNaCu` and workspace `ajo4gE` were removed. Protected
PIDs and all earlier retained roots were untouched. There was one native launch,
no automatic restart and no launcher rebuild. Only Web/Host/native-query resources
were built; existing Vite chunk-size and Cargo configuration/linker warnings
remain recorded.

Final targeted UI/selection/focus regressions passed **181 tests / 817 assertions
across eight files**. The earlier focused cancellation+copy checks passed
66 / 506 across five files (overlap is not added to the 181 count). Root
TypeScript, strict lint for all eighteen current source/test/document paths as
applicable, Prettier and diff checks passed. The full repository run during this
unit was **2864 passed / 2 failed / 29861 assertions / 400 files**, 318.41 seconds.
The two existing wizard-registry and authentication-control-boundary failures
were independently rechecked after concurrent commit `0771ebe` and remained
failures. Full lint still reports the one missing react/no-unused-prop-types rule
in the unrelated authentication primitive. This is not an all-green repository
claim, and no foreign source or expectations were changed to hide the failures.
