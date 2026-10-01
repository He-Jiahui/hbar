# Desktop Activity: child-Agent entrance migration

## Original reference and design

Root inspected CC-haha at `e28d0a653481ef41b7a329411eeb2f0fd5656731`, especially `desktop/src/components/activity/SessionActivityButton.tsx`, `SessionActivityPanel.tsx`, `sessionActivityModel.ts` and Sidebar's running set. The original ListChecks button opens Activity; the SubAgents section presents a count, compact objective/name row, status, and enter chevron. Row click supplies the original parent Session, task/tool-use identity and title to the real navigation callback. The Sidebar separately counts a parent's running background tasks as ongoing work.

The original button and panel were rendered with two synthetic Agent rows at English 1440px and Chinese 320px. Root clicked the running row and checked its captured source payload. Original component captures and manifest are under the ignored `artifacts/activity-agents-reference-v7/` path. No CC source, Host, profile or provider was changed. These are isolated component renders, not a full CC native application. The mascot image assets are absent in this fixture, so the captures prove hierarchy, status and interaction, not mascot/pixel fidelity.

## Delivered hbar behavior

The existing session toolbar entrance is now named Activity, not Active runs, because it opens both real groups: Runs and Subagents. Monitoring remains a separate usage tool; Agents remains a separate creation/management tool. No fake Team, Sources or background-shell group is added.

Subagents are read from public parent-scoped Agent records, not reconstructed from transcript text. Loaded ongoing items appear before completed history. Compact rows preserve a visible status and enter chevron at 320px; long objectives are ellipsized, with complete tooltip and accessible name. Existing semantic `md` Bot and `sm` chevron icons replace reference mascot imagery. The pane remains the single scroll owner; section headings, rows, counts and errors use normal flex flow. English/Chinese copy is typed and host-owned.

Click or keyboard Enter opens the actual child Session tab through the existing verified Agent source path. The original parent tab and unsent draft remain intact; Back returns to that parent incarnation. Opening performs no Agent creation or Run submission. A navigation failure appears beside the originating row, which remains available for retry. The group has independent read-error/retry feedback and preserves confirmed rows. Empty confirmed Agent groups are omitted, while unsupported/loading/error states are not falsely presented as empty.

Host activity hints update both visible groups without requiring manual Refresh. A child created by an external fixture client appears in the open pane, and cancellation updates that same row. Hidden/closed panes stop reading and release their projections. Agent pages are 50 rows, with at most 200 displayed; refresh retains the loaded prefix count through checked bounded pages. Agent API cursors have no revision contract, so this is not claimed to be an atomic Agent snapshot. See [Runtime ownership and limits](activity-agent-projection.md).

## Verification and delivery

- Runtime core `870d9c98`, followed by capacity fix `de90a358`. The latter handles a short page leaving 151 rows: the next query requests 49, not 50. The combined Runtime/Agent-navigation suite passes **22 tests / 116 assertions**, including prior regressions, parent paging, retained read errors, coalesced status hints, hidden late responses, foreign parents, capacity and verified child/Back.
- Final production Web: `artifacts/activity-agents/web`, JS `index-srUtr1qU.js`, CSS `index-CbRaQZgr.css`, 3,365 modules. Build passed with the existing large-chunk warning, not a performance certification.
- Final `session-activity-entry.spec.ts` + existing `agent-child-return.spec.ts`: **5/5 passed in 25.8 seconds**, output `test-results/activity-agents-final-v7`. This includes English/Chinese, 1440/320, visible Agent creation and waiting/cancelled hints without manual refresh, keyboard child navigation, parent Back/draft preservation, parent isolation and prior lost-read retry. The fixture uses a real temporary Host and local-fixture provider only. Child writes remain unapproved and are cancelled; the original parent approval writes only its disposable test file. No paid provider or real profile is used.
- The two Activity paths were rerun on the same assets after adding artifact manifests; per-locale manifests and final images are under `artifacts/activity-agents/hbar-e2e/`. Root inspected all four final UI images and both original reference images. The initial multi-line objective row was visually corrected to the compact reference scan pattern before final delivery.
- Affected strict TypeScript, scoped zero-warning ESLint, format, content/icon/flow guards and diff checks pass. The preview logs `ECONNRESET` when temporary Host sockets close during teardown; browser page-error assertions pass. No claim of warning-free server logs is made.

Native build/installation, full-repository checks and the known dependency-blocked SSR rendering were not performed or certified by this slice. Both requested luna/max audit agents reported missing tools or unreadable dispatches; Root performed the source inspection, original capture, implementation and verification. Their context-derived claims are not counted as independent review evidence.

## Remaining alignment

This closes the omitted Activity → real child-Agent entrance, not all Activity parity. Tasks/Goal/Workflow aggregation, global parent-running aggregation and independent tool-use-correlated Agent transcripts remain to be aligned. Storage must not parse the plugin's private Agent events to fake these facts. `/agent` still uses hbar's explicit child-creation semantics rather than CC's parent-prompt semantics; the prior user choice remains pending. The overall desktop-experience goal stays active.
