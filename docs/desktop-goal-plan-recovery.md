# Desktop Goal / Plan recovery

## Reference and scope

This increment follows the local cc-haha desktop reference at
`e28d0a653481ef41b7a329411eeb2f0fd5656731`: execution mode belongs beside the
composer; the current Goal belongs below the session header. The rendered
reference evidence is in `artifacts/session-entry-recheck/` and
`artifacts/goal-lifecycle/`. The reference mounts are isolated, typed mounts of
the original components, not screenshots of an authenticated cc-haha session.

The current Goal strip in that reference does **not** supply Pause, Resume or
Clear. Those are hbar capabilities retained in the same local context. Recovery
feedback is an hbar reliability extension, not a claim of pixel-identical source
behavior. hbar keeps its four real approval choices; it does not invent support
for cc-haha's five-mode permission taxonomy.

The before-state audit in `artifacts/goal-plan-entry-recheck/report.md` found:

- An unknown Goal control could be checked from two places without a shared
  busy state. A failed read then displayed both Check and Refresh, plus a raw
  failure code. The UI branches originated in `9f3ee84`.
- An unknown Plan transition continued to display an ordinary approval choice
  as selected and editable. The mode projection originated in `a40a6ce`.
- A delayed mode read spanning A → B → A could publish A's old default after an
  inactive-session change. A regression reproduced this before the fix.

## Owned behavior

`37e240c` owns Goal snapshot reconciliation. The original action stays unknown
while a shared read is checking, fails or loses its session/connection lifetime.
There is one recovery action per surface, shared between the header and Goal
help. No recovery read resends Pause, Resume or Clear. A physical snapshot slot
is retained until its actual request settles, even if logical cancellation or
the 30-second deadline has fired. Limits are 32 physical reads and 100 entries.

`2de6db9` exposes actual Plan reads and invalidates reads spanning navigation
away from their session. An unknown write retains its original operation and
can only be checked by reading. Ordinary approval selection is remembered but
not presented as effective while the execution mode is unresolved.

The views receive English/Chinese copy from the Host's typed label contract.
Loading, changing, checking, unknown and failed execution states have distinct
trigger labels. Recovery remains inspectable and closeable; ordinary choices
are frozen until mode confirmation. Arbitrary command errors are not rendered.
Existing semantic icon tiers and flex-flow layouts are retained.

Visual inspection of the first passing 320px browser matrix found that Plan's
failed-check explanation was below the disabled option list. It was moved with
its recovery action to the top of the popover body. This is an intentional
feedback-priority change: the current problem and next action are visible before
the choices that cannot yet be used. Confirmed-mode layout is unchanged.

Snapshot comparisons establish **current state**, not an exact durable mutation
receipt. This increment does not redesign unknown Goal creation / Run submission
receipts, introduce a new Host idempotency protocol, or change Goal continuation
semantics under Plan mode.

## Verification record

Runtime verification completed before the independent commits:

- Goal: 66 tests / 429 assertions, including the real 30-second deadline,
  bounded physical requests, same-original checks, A/B/A, disconnect, wrong
  session output, archive and dispose.
- Plan: 45 tests / 196 assertions, including the red-then-green inactive-session
  change regression and retained unknown-write checks.
- Root TypeScript, scoped strict ESLint, Prettier and staged diff checks passed.
- Goal view / availability / execution access: 34 tests / 268 assertions passed.
- Execution picker / design-system guards: 38 tests / 267 assertions passed,
  including localized state projections and recovery-before-options ordering.

The V3 browser candidate (`index-DYmmP8X7.js`) passed all 12 real-Host recovery
cases (English/Chinese × 1440/900/320): original unknown Goal checks, shared busy
state, safe failures, late session replies, Plan selection freezing, Escape and
Close, A/B/A checks, and explicit Plan exit restoring the remembered Ask choice.
Six existing Goal/Plan preparation/exit regression cases also passed. Vite's
old regression proxy logs connection resets when fixture Hosts stop; these are
not renderer exceptions. The maintained new fixture asserted no renderer or
console errors and zero Runs, and all 12 roots were removed after exit code 0.

A full repository test run during V2/V3 work completed with **2643 passed,
1 failed, 27562 assertions, 388 files**. The failure is the existing canonical
Lumen boundary test for native controls in the unrelated authentication family.
Full lint also remains blocked by the unrelated missing
`react/no-unused-prop-types` rule in `hbar-ui/.../authentication/primitives.tsx`.
Neither issue was disabled or modified here. Logs are in
`artifacts/goal-plan-recovery/full-tests.log` and `full-lint.log`; this is not a
claim that the final later focus change passed a full rerun.

The maintained browser fixture uses a fresh temporary real Host and public
commands, disables Goal auto-continuation before creating any Goal, and delays
or replaces only real response envelopes. It never fabricates a successful
response or inserts application state. Each scenario verifies zero Runs and
removes only its exact owned temporary root after an acknowledged stdin stop.

The clear-confirmation follow-up has separate before evidence in
`artifacts/goal-plan-recovery/clear-focus-v2-corrected/`: both English 1440px and
Chinese 320px lost focus to BODY after Cancel and after a successful Clear.
Those were real browser failures with preserved draft and zero Runs, not SSR
inferences. The repair composes an explicit composer Goal button ref through the
session view. Cancel returns to the still-current Clear button. Successful Clear
returns only after its own acknowledgement and a confirmed empty Goal, within
the same view lifetime. A bounded UI focus lease is revoked on user input,
replacement Goal, unknown/failure, navigation, runtime replacement or unmount;
it does not cache business facts or use a global sibling selector. Eight pure
focus-policy tests supplement real-browser boundary scenarios.

## Final browser candidate

The final UI candidate is V5, `index-ivXHN-br.js`, with SHA-256
`1F90B7704DE6725C3B7E2256FC8094BC4A12AF2A530715F453349B5A050CA867`.
The frozen browser directory, `dist/web`, and the newly built
`dist/desktop-resources/web` contain the same JavaScript. The existing desktop
launcher was not rebuilt. Build warnings about the large main chunk and the
existing Cargo configuration/linker output remain visible.

V5 verification completed (the V4 matrix also passed before a final generic
submission-error wording correction, covered by an additional regression test):

- **22 / 22** maintained real-Host cases: the 12 recovery cases plus 10 Clear
  focus cases covering normal Cancel/confirmation, active focus moves, A/B/A,
  replacement Goal and unknown acknowledgement without replay or inherited
  focus return. All 22 fresh fixture roots stopped with exit code 0 and were
  removed; 58 screenshots and matching facts remain in
  `artifacts/goal-plan-recovery/browser-v5/`.
- **6 / 6** existing preparation / Plan exit browser regressions.
- **78 tests / 553 assertions** across the six focused view/focus/access suites.
- Root TypeScript, scoped strict ESLint, formatting, content/icon guards and
  diff checks passed. No new stylesheet or arbitrary icon size was introduced.

The maintained cases use `dist/web` after a normal web build. To reproduce an
audited frozen bundle, set `HBAR_GOAL_PLAN_RECOVERY_WEB_DIST`, optionally set
`HBAR_GOAL_PLAN_RECOVERY_EXPECTED_ASSET`, and run the two maintained specs
`e2e/goal-plan-recovery.spec.ts` and `e2e/goal-clear-focus.spec.ts` with Playwright.
`HBAR_GOAL_PLAN_RECOVERY_EVIDENCE` selects a separate output directory. The
fixture itself uses a fresh port-zero Host; it never attaches to a user Host.

The first isolated native attempt stopped before entering any interaction case:
the first `goal.create` returned `EXECUTION_FAILED` after hot plugin configuration.
Its captured
desktop/supervisor/Host identities were cleaned up successfully; only the new
failed profile `hbar-native-session-goal-plan-recovery-ATdfRs` and workspace
`hbar-native-workspace-goal-plan-recovery-jzgs8H` were retained. Evidence is in
the matching directory under `artifacts/goal-plan-recovery/native/`. Native
success is not inferred from the passing browser suite. Read-only persisted
facts show auto-continuation false, one initialized session, no Goal and zero
Runs. Historical service capture (`be305f9`) plus plugin remount (`fb64989`)
suggest a stale Goal service reference after hot configuration, but the exact
throw mechanism is not proven. This Host issue is not changed by this UI unit.

The revised native fixture prepares configuration only before launch in a new,
empty owned profile, verifies it through the public StoragePort, closes the
preparation Kernel, and rechecks with native `plugin.inspect` before any Goal.
It uses the exact same data-root layout; Goal creation and all UI operations
remain real public Host commands. Each initialization stage is recorded, and
any subsequent native result is recorded separately below.

### Native V5 acceptance

The subsequent fresh profile `hbar-native-session-goal-plan-recovery-AnAB97`
passed all **4 / 4** native cases: English/Chinese × 900×600/1440×960, using the
existing launcher and the exact V5 asset. Strong assertions covered Plan exit
restoring Ask and trigger focus; original Goal Pause/Resume; Clear cancellation
returning to the original Clear; acknowledged Clear returning to composer Goal;
draft preservation, viewport geometry and zero Runs. No renderer or console
errors were observed. Runtime writes were exactly eight `mode.set`, eight
`goal.set` and four `goal.clear`; no paid-provider request was made.

The runner exited 0, the exact captured process cleanup reported no errors,
and its new profile and workspace `hbar-native-workspace-goal-plan-recovery-MVspn4`
were removed. The earlier failed profile was not reused or deleted. Twenty-eight
native screenshots, preseed proof, stage records, verification and cleanup remain
under `artifacts/goal-plan-recovery/native/hbar-native-session-goal-plan-recovery-AnAB97/`.
Native response faults were not injected: the browser real-Host suites provide
that evidence, while this native run proves actual desktop interaction/focus.

This is one increment of the desktop experience migration, not completion of
the overall goal. The next bounded candidate is independent Plugins/Skills
collection reads and truthful empty states; the read-only evidence and remaining
contract gaps are listed in
`artifacts/goal-plan-recovery/next-extensions-audit.md`.
