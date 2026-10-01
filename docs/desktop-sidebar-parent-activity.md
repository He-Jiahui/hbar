# Desktop sidebar: parent background work

## Reference and interaction

The read-only CC-haha reference is `D:/Git/cc-haha/desktop` at `e28d0a653481ef41b7a329411eeb2f0fd5656731`. Two gpt-6-luna/max review Agents examined the reference and hbar boundaries. The original `Sidebar.tsx` and `SidebarTaskList.tsx` were rendered with synthetic local Session/store state, no reference source edits, live model, or real profile.

CC keeps a Session in the first `In progress` group when its foreground is idle but a visible background Agent still runs. A compact running spinner sits to the right of the title; the second line contains only the owning directory. When background work settles, the Session returns to its date bucket. The reference's attention branch replaces the running spinner with a warning indicator. CC does not itself propagate a separate child Session's approval state to its parent; hbar's public background-child aggregate uses its existing approval-precedence summary for that case.

Reference evidence: `artifacts/parent-activity-reference-v10/zh-background-working.png`, `zh-background-settled.png`, and `manifest.json`. The capture imports the existing original-Sidebar fixture and changes only local synthetic stores. Material-symbol font ligatures in unrelated fixture controls are not used as icon evidence.

## hbar behavior

- Time sidebar puts an idle parent in `In progress` while its immediate, non-fork child has a queued/running/waiting-for-approval Run. Aggregation is performed before Host paging; it is not limited to children already rendered in the browser.
- The title line is normal flex flow: title, existing relative time, then a shared `sm` (14px) state icon. Running/cancelling rotates the icon; queued uses an hourglass; approval uses a warning icon with no spin. Reduced-motion disables rotation.
- The second line contains only the Host-owned Workspace display name and folder icon. Removing the duplicate state text avoids competing truncation at normal sidebar width. Full status is available through the indicator's Host-owned localized accessible label and title. Idle rows have no indicator.
- Clicking the Session row still opens that Session. Detailed Agent navigation remains in the existing Activity entrance; opening a child and returning retains the parent's input draft. No new click target or cancellation command is introduced on the sidebar icon.
- Cancelling the last child Run settles the aggregate and moves the parent back to its date bucket through the existing live activity hint. Forks are independent and do not keep their source conversation busy.

The typed metadata contract includes the actual execution state and localized label together. React does not decode Agent private events, keep a separate status store, or embed visible copy. See `docs/sidebar-activity-runtime.md` for the direct-child summary, hidden/archived-child and non-recursive boundaries. Project/recent-project row status parity remains a separate gap; this change covers the Time/task view only.

## Verification

`e2e/sidebar-parent-activity.spec.ts` runs one core workflow using a temporary real demo Host, a disposable Git workspace and `local-fixture` only: idle parent with zero own Runs → running child → cancel → child waiting for approval → Activity detail and Back → cancel → parent leaves In progress. Pending file writes are never approved. It checks canonical public summaries, live sidebar update, state animation, natural row width and retained draft.

Final rendered evidence is under `artifacts/sidebar-parent-activity/hbar-e2e`: `zh-child-working.png`, `zh-child-waiting.png`, `zh-child-settled.png`, `manifest.json`. The final Web asset is pinned by the test; source screenshots are inspected directly. Checks target the core workflow, not a per-button or repeated size matrix.

Scoped strict TypeScript, ESLint, formatting and content/icon/flow guards are run for the changed entries. The existing SSR test's metadata assertions are updated, but executing that isolated test is blocked before its body by the pre-existing missing `prop-types` import in the read-only UI submodule; no dependencies were installed. Web build succeeds with its existing large-bundle warning. Playwright Host teardown may emit a Vite WebSocket `ECONNRESET`; browser page errors are recorded independently in the evidence manifest.
