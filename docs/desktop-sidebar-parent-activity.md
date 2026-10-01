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

The typed metadata contract includes the actual execution state and localized label together. React does not decode Agent private events, keep a separate status store, or embed visible copy. See `docs/sidebar-activity-runtime.md` for the direct-child summary, hidden/archived-child and non-recursive boundaries.

## Project and recent-project rows

The project-row extension follows CC's original `Sidebar.tsx` project hierarchy at the same reference revision. The rendered reference is `artifacts/grouped-activity-reference-v11/zh-project-child-working.png` and `zh-project-child-settled.png`, with the original component and synthetic local background task state. In CC the row reads title → running spinner → worktree branch (when present) → relative time, without a second directory line. Waiting approval is only separately represented in CC's Time view; hbar deliberately carries its canonical approval warning into both modes so it is not mistaken for active execution.

hbar project/recent-project rows use the shared `SessionActivityIndicator` before relative time, keep titles start-aligned, retain existing row-open and batch-selection callbacks, and do not gain another button. The Host's new `session.sidebar.list` preserves Workspace/timestamp order and supplies each row's own/direct-background-child summary in the same transaction. Runtime retains those facts in its existing bounded page owner and preserves loaded rows while refreshing. It does not fetch Run histories for each row or reuse only the loaded Time-feed prefix.

The default recent-project mode and the alphabetic project mode use the same Session-row renderer and snapshot query. This extension is verified through the default grouped mode and one round-trip to Time, not a repeated organization/size matrix. Error/retry behavior is checked in the owner test; a real Client-adapter/Host test guards the read-only query's whitelist.

## Verification

`e2e/sidebar-parent-activity.spec.ts` runs one core workflow using a temporary real demo Host, a disposable Git workspace and `local-fixture` only: idle parent with zero own Runs → grouped running indicator → Time view → cancel → child waiting for approval → grouped warning → Activity detail and Back → cancel → both modes clear activity. Pending file writes are never approved. It checks canonical public summaries, live sidebar update, state animation, natural row width and retained draft.

Final rendered evidence is under `artifacts/sidebar-parent-activity/hbar-e2e`: `zh-child-working.png`, `zh-child-waiting.png`, `zh-child-settled.png`, and their `zh-project-child-*` counterparts, with `manifest.json`. The final Web asset is pinned by the test; screenshots are inspected directly. Checks target the core workflow, not a per-button or repeated size matrix.

The first grouped browser run reproduced a `METHOD_NOT_FOUND` error before Session navigation: the new Runtime query was absent from the Client's read-only adapter whitelist. The adapter was fixed in `d8f99022`, with a real Host regression test; the workflow was rerun successfully. This failure is not counted as a passing run.

Scoped strict TypeScript, ESLint, formatting and content/icon/flow guards are run for the changed entries. The existing SSR test's metadata assertions are updated, but executing that isolated test is blocked before its body by the pre-existing missing `prop-types` import in the read-only UI submodule; no dependencies were installed. Web build succeeds with its existing large-bundle warning. Playwright Host teardown may emit a Vite WebSocket `ECONNRESET`; browser page errors are recorded independently in the evidence manifest.
