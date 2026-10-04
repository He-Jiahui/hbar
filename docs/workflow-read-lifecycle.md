# Workflow read lifetimes during Session navigation

This repair keeps the existing Session tools, Activity layout and Goal/Plan execution semantics. It fixes two Runtime regressions found while validating the desktop navigation migration.

## Evidence and cause

Before the repair, `bun test tests/session-tool-visibility.test.ts` reproduced 14 passing and 2 failing tests. History inspection covered `cdf2b49c` (Session-owned tools), `92a93cd7` (read-only Activity Workflow) and `2e6bc5eb` (timeout/late-response fencing), including their actual diffs.

The read-only Activity addition introduced an abort race to settle owned reads without waiting for a transport that ignores cancellation. `releaseReads` used native `AbortController.abort()` without a command error; the native abort reason has no string command code, so it was reported as `EXECUTION_FAILED` instead of the retired-read `RESULT_UNKNOWN` result. It now aborts with an explicit `CommandError('RESULT_UNKNOWN', ...)`. The hidden Goals entry still leaves loading as a local `CANCELLED` state. This cancels UI reads and subscriptions, not Host execution or Workflow mutations.

The same addition selected cache disposal from `target?.panelId !== 'goals'`. After Surface removal there is no target, so Goals was inadvertently treated like disposable read-only Activity. The Runtime now remembers the original owner's kind alongside its instance ID. Retiring Activity deletes its read cache; retiring Goals preserves its entry/action metadata and settles loading. Generation fences remain monotonic, and reopening the same panel ID does not revive an old request or watcher. Generic unmarked panels retain their existing behavior.

## Focused verification

- `session-tool-visibility`, `workflow-workspace-runtime`, `session-tool-ownership` and `activity-workflow-model`: 35 tests, 309 assertions, zero failures in 13.23 seconds. Coverage includes ignored-abort old reads, panel-ID reuse, retired watch callbacks, hidden unknown/submitting actions, A/B Session separation and the existing 12-second timeout fence.
- Scoped strict TypeScript, zero-warning ESLint, changed-file Prettier and `git diff --check` pass.
- Isolated Web build: 3,376 modules, `index-CRJl3bji.js` and `index-CpCy4RwG.css`; existing large-chunk warning remains.
- One existing real-Host browser core flow passes in 3.7 seconds (6.0 seconds including setup): live Workflow delegation, a single Agent representation, keyboard child opening, parent return, Goal clear, retained unsent draft and another Session's empty Activity. The same flow naturally transitions from wide to narrow content, rather than repeating a button/viewport matrix. Browser page errors are empty. Pending-read cancellation itself is exercised by the deterministic Runtime tests, not claimed as a delayed-transport browser scenario.

The original CC `SessionActivityPanel` capture at `artifacts/activity-workflow-reference/zh-workflow.png` uses synthetic phases and a local drill-down callback at reference commit `e28d0a653481ef41b7a329411eeb2f0fd5656731`. It supports non-interactive progress headings and actual-Agent drill-down, not Hbar's backend lifecycle rules. Missing mascot images in this isolated reference render limit asset fidelity. Root inspected that capture and the fresh wide/narrow Hbar captures under `artifacts/activity-workflow/hbar-e2e/`; the manifest identifies the actual fresh build. Hbar captures reflect live local-fixture status changes, not a frozen screenshot model.

The browser uses a disposable temporary Host/storage/Git fixture and the local provider only; no paid provider, real profile, native desktop launch, installation, packaging, primary checkout edits or push occurs. Preview teardown may log `ECONNRESET`; the owned Host/preview are stopped and their ports released. Full repository checks and the known dependency-blocked SSR suite are not run. Overall CC desktop parity remains in progress; Guide now and Goal/Plan combination are separate execution semantics, unaffected by this repair.
