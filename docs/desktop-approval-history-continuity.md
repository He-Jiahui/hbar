# Ordinary approval results survive reopening

This slice closes the ordinary approval history gap recorded in
[session decisions](desktop-session-decisions.md). It preserves the existing
original-tool location and localized cards; it does not change approval policy,
write execution, Plan mode or questionnaire cancellation semantics.

## Reference and reproduced cause

Read-only CC-haha revision: `e28d0a653481ef41b7a329411eeb2f0fd5656731`.
`desktop/src/components/chat/PermissionDialog.tsx:119-130,155-203,263-301`
retains the original request card and context after responding, replacing pending
actions with the responded state. `MessageList.tsx:3822-3831` renders that original
permission request. Root inspected the original component/theme previews at
`D:/Git/hbar/artifacts/reference-ux-v2/14-decisions-pending.png` and
`16-decisions-resolved.png`. Their outer layout and records are fixtures, not a
newly run full CC application or evidence of CC native focus/restart behavior.

hbar `092e4082` retained live outcomes but explicitly did not cover refresh history.
`7d9f0f78` subsequently added exact current-page resolved records for Plan exit only.
The current Storage query still filtered completed records to `exit_plan_mode`,
and the timeline's resnapshot retained only resolved Plan approvals. It was not a
regression introduced by the newer Agent or Search changes.

Against `b64e7d5c` / Web `index-CWUyLCFm.js`, the real Chinese Host path edited the
fixture file, confirmed the original approval and completed its Run. After reload
and reopening the same Session, the exact original card was absent. The new status
assertion failed in 14.3s; its trace and capture remain under
`artifacts/decision-continuity-v35/red-results/`.

## Current behavior and boundaries

- `session.snapshot` keeps pending approvals first and fills remaining capacity
  with persisted completed approvals associated with its bounded message page.
  The join still requires the original Session, Run, call ID, tool name and a real
  assistant call or tool result. It does not synthesize permission from a successful
  tool result or guess whether an error means rejection or cancellation.
- The existing 80-record ceiling is unchanged. History outside the requested
  message page is not returned; 80 pending requests can consume the entire capacity.
  No new RPC, schema status, database migration, permission capability or write
  retry is introduced.
- The timeline retains already verified resolved facts across a resnapshot, so
  cards on older loaded pages can remain readable. The existing 80-record cache
  bound still applies. Missing pending requests are not kept alive by that
  retention, and facts are not carried to another selected Session.
- Fresh UI instances can display the exact Allowed/Denied/Cancelled record without
  a local interaction action. Completed controls remain removed. The original
  parameter preview and nearby status keep the existing flex layout and Host copy;
  no new stylesheet, icon size or sample content is shipped.
- Explicit missed-event recovery remains read-only and original-target bound.
  Its controlled observer test intentionally does not apply the refreshed history
  to that observer, then proves the original follow recovery still works without
  repeating a decision. Ordinary completed snapshot facts are now independently
  asserted rather than retaining the old pending-only expectation.

Ordinary post-decision keyboard focus is a separate continuity check, not a
capability delivered here. Existing same-Run Plan focus ownership remains in place.
Historical questionnaire cancellation without an explicit fact is also unchanged.

## Verification

- Storage, timeline, Plan history and decision/recovery suites: **54 tests /
  339 assertions passed**, 6 files in 5.90s. New checks cover three real persisted
  statuses, exact identity/page boundaries, tool-result pages, pending priority at
  79/80, retained loaded history, removal of missing pending asks and Session isolation.
  A first fixture omitted the required `isError` field and was corrected before
  the final run; product validation was not relaxed.
- Production Web: 3,391 modules, `artifacts/decision-continuity-v35/web`,
  `index-BXFQ1DgS.js` / unchanged `index-Ddfvs7XW.css`. The existing large-chunk
  warning remains.
- Real temporary Host and this Web: **2/2 English/Chinese paths passed in 12.9s**.
  They retain the original call, one approval resolution and actual file change;
  reload restores one exact read-only card without another Run. Existing questionnaire
  selection, cross-Session answers, duplicate activation and answer restoration also
  pass. The tests use the local fixture model, not a paid provider.
- Root inspected final Chinese 320px restored approval and questionnaire captures:
  status, source fragments and confirmed answers remain readable in normal flow.
  Existing viewport checks were reused, not expanded into a new button/size matrix.
  Captures remain in `artifacts/decision-continuity-v35/final-results/`.
- Changed-path strict TypeScript, type-aware ESLint with zero warnings, formatting
  and diff checks passed. No TSX/CSS or localization bundle changed, so there is no
  new stylesheet/icon/content guard claim. Full-repository and native checks are
  not certified.

Three requested gpt-6-luna/max agents hit model capacity/429 in this turn; they
provided no completed review and are not counted as evidence. Root performed the
source/history diagnosis, visual inspection and real reproduction above. Owned
Host/browser/preview processes and temporary fixture data were cleaned up. Work
remains on `codex/session-launch-target`; no primary-checkout edits, installation,
native startup, push or merge occurred. The broader UX goal remains active.
