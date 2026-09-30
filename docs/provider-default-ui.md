# Provider global-default list UI

The Provider settings list keeps global selection, provider configuration, and
the configured primary model distinct. The host supplies every visible and
accessible label through `ProviderListViewLabels`; `HbarProviderSettings`
combines that contract with its existing delete-confirmation labels.

Each inactive provider with a visible configured primary has one primary
row-content button. It presents the provider summary and a visible “Set
default” caption, and its accessible name identifies the provider and primary
model. Edit and Delete remain separate actions. The primary button targets the
provider ID captured by that row; it does not open or mutate the provider
editor draft. Runtime validates the canonical configured primary against the
selectable catalog before applying the global `provider.model` field. Missing
credentials do not by themselves make a configured target ineligible.

The active-provider row is a static summary with a badge derived from the
actual global model projection. Its displayed model can differ from the
provider's configured primary; activating that provider again is intentionally
not offered, so a selected non-primary model is preserved. If a global-default
write has an unknown result, the target row displays the Runtime error and a
Reconcile action. Other edits, refreshes, deletion, and another default switch
stay locked until the captured write is reconciled. Runtime-owned errors are
not duplicated in the page-level alert.

The original CC-haha exported `ProviderSettings` component was captured at
commit `e28d0a653481ef41b7a329411eeb2f0fd5656731`. The 1440px action-visible
capture shows the inactive row's Set default, Test, Edit, and Delete entries;
the before/after reports record that Set default calls the original activation
flow and writes that provider's configured main model globally. Hbar preserves
the global-default behavior and edit/delete entrances, but omits Test because
the row flow has no corresponding supported Host capability. See
[`en-1440-provider-default-actions-visible.png`](../artifacts/provider-default-reference/en-1440-provider-default-actions-visible.png),
[`en-1440-provider-default-report.json`](../artifacts/provider-default-reference/en-1440-provider-default-report.json),
and the fixture's [provenance and limitations](../artifacts/provider-default-reference/README.md).

The 320px Simplified Chinese captures show that the original list still exposes
row actions, while its header and long labels are severely cramped; the report
records no entrance screenshot for that viewport. The fixture also lacked the
Material Symbols font, so some icon ligatures rendered as fallback text. These
are evidence limitations, not acceptance criteria. Hbar uses semantic flex
flow with wrapping metadata and action groups. The `provider.list` contract
bounds the collection to 256 entries, and the existing Settings pane owns
scrolling for its content rather than reproducing the original narrow clipping.
Compare [`zh-320-provider-default-before.png`](../artifacts/provider-default-reference/zh-320-provider-default-before.png),
[`zh-320-provider-default-after.png`](../artifacts/provider-default-reference/zh-320-provider-default-after.png),
and [`zh-320-provider-default-report.json`](../artifacts/provider-default-reference/zh-320-provider-default-report.json).

The pure row-presentation tests cover a selected non-primary model, an
unavailable current global selection, an inactive target with no credential,
unknown-action locking and reconciliation ownership, and retry of a failed
action. The Web/Host integration flow is verified separately by the app-level
provider-global-default E2E; this UI component does not claim Host or desktop
runtime coverage on its own.

## Delivered verification

Root built the production Web preview at `artifacts/provider-global-default/web`
with `index-jwY1grdj.js` and `index-KYs-KpGv.css`. The final temporary-real-Host
run passed 6/6 paths in 30.1s: two new English/Chinese default-selection paths,
two existing provider-editing paths, and two settings-landing paths. The new
paths verify one global field write, the configured second model rather than the
first, preserved explicit Session choices, inherited global selection, actual
default persistence, separate Edit/Cancel, retained credential information in
both rows, no Run submission and no page errors.
They also read the new project-activity query through the real Host dispatcher;
this does not establish sidebar sorting integration.

Final inspected screenshots are under
`test-results/provider-global-default-v4/provider-global-default-Pr-7d8db-retargeting-a-session-en-US/`
and
`test-results/provider-global-default-v4/provider-global-default-Pr-e3080-retargeting-a-session-zh-CN/`.
The `provider-default-after-*-1440.png` / `*-320.png` captures show the final
desktop and narrow layouts. Narrow rows stack summary, state and the default
caption in normal flow; earlier captures with broken caption/credential wrapping
are not the accepted visual result. The existing Settings pane owns scrolling.

The first browser run exposed a test expectation error: the model combobox
displays the Host's readable `providerName · modelName` label, while the actual
qualified ID was already verified in settings and Session reads. The older
landing test also omitted the Skills category added by `39f9177a`, then assumed
the sidebar was open after a narrow-screen return/reload. Its expectations now
include Skills and it opens the observed collapsed sidebar through its real
control. These were fixture corrections, not removed product assertions.

The pure view-model suite passed 3 tests / 16 assertions; the affected UI,
Runtime, host-copy and E2E graphs passed scoped strict TypeScript, scoped lint,
formatting and content/icon/flow guards. The full repository and native launcher
were not validated. The existing MUI-source `prop-types` dependency prevents
the SSR suite from loading; no dependency was installed to hide that limitation.
Browser contexts, temporary fixture Hosts and the preview server were closed.
