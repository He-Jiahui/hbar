# Settings: in-place Host usage

## Reference and truthful scope

Native supplement: `HBAR_NATIVE_VERIFY_USAGE=1 bun scripts/verify-desktop-file-navigator.ts`
passed in an independent disposable desktop profile against this turn's newly
built Host/Web resources. At 900×600 it opens Token usage inside Settings, reads
the real empty Host-global ledger, changes to the 30-day window and confirms no
horizontal overflow. Screenshot: `artifacts/settings-usage/native-empty-900.png`.
This checks the existing debug launcher; it does not claim a new desktop exe was
compiled or that the native empty ledger proves nonzero statistics.

- Published visual evidence: `D:/Git/cc-haha/docs/images/app/zh-CN/settings-usage.webp`
  (and the `en` counterpart). The selected Token usage category stays inside
  Settings; summary values precede activity and model detail.
- Source evidence: `desktop/src/pages/Settings.tsx` mounts `ActivitySettings` in
  the settings content region; `ActivitySettings.tsx` reads activity statistics
  and renders summary metrics before the activity chart.
- hbar retains this navigation and reading order, not the cc-specific avatar,
  project branding, streaks, longest task, or peak-date statistics. Those are not
  supplied by hbar's usage contract.
- The category is explicitly Host-global, including all projects and sessions.
  The original settings panel still retains its pinned/session return context.
  It does not create or navigate to a Status panel, change a settings form's
  layered scope, write a preference, save a form, or consume a composer draft.

## Public data and reader lifecycle

`packages/app-runtime/src/settings-usage.ts` reads the existing validated
`usage.query` contract. No new Host RPC is introduced. Public client commands:

- `settingsUsage.refresh({ instanceId })`
- `settingsUsage.setWindow({ instanceId, window })`

The four typed host-provided choices are:

| Window | Duration | Bucket    | Expected chart points |
| ------ | -------- | --------- | --------------------- |
| `1h`   | 1 hour   | 5 minutes | 12                    |
| `24h`  | 24 hours | 1 hour    | 24                    |
| `7d`   | 7 days   | 6 hours   | 28                    |
| `30d`  | 30 days  | 1 day     | 30                    |

Every read specifies global scope, `maxBuckets: 120`, `maxSamples: 5000`, and
empty filters. A response with another scope/window/bucket, duplicate model
selection IDs, duplicate bucket starts, or more than 120 points is rejected.
The Host contract also bounds models to 1024. Model detail renders eight rows
per page; activity is a short, bounded collection rather than an unbounded
scroll region. The surrounding settings content owns vertical scrolling.

The runtime stores at most four panel entries. A request captures the exact
panel object and query generation; publication also requires the current
presentation page to remain that settings instance with section `usage`.
Leaving the category or page aborts and invalidates the pending read. Returning
starts a fresh read and keeps the selected time window. Even an executor that
ignores cancellation cannot publish an old result into the reopened page.
Reads have a 12-second deadline and disposal removes subscriptions/timers.
Repeated refresh or the same pending window is rejected as busy; another window
supersedes the old read. There is no background polling or automatic write.

## Values, failure and visuals

The summary displays input + output tokens, input tokens, output tokens and the
Host cost metric. It never substitutes missing pricing with `$0.00`:

- available costs display their actual value;
- estimated costs are explicitly labeled estimated;
- empty and unavailable pricing have separate localized text;
- `gap` remains a visible incompleteness warning, not a full-history claim.

An empty ledger has a dedicated empty state. A failed refresh keeps the last
confirmed snapshot with a stale-result explanation and a local Refresh action.
Disconnect disables reads, keeps the confirmed values labeled as old, and does
not imply that zero is the latest result. Reconnect or an explicit refresh reads
again. Error injection in the E2E relay is a test fixture, not a Host-produced
business failure; real disconnection is also covered.

The page uses Lumen primitives, a semantic `md` navigation icon and `sm` refresh
icon. Summary cards use wrapping flex flow (two columns on desktop, one on
narrow screens), not screenshot coordinates or fixed content heights. The
chart alone has a definite 7rem plot axis so percentage-valued data bars resolve
to visible heights. Scoped zero bar padding prevents the native button minimum
width from overflowing a narrow plot. This does not modify Lumen or other
charts. Keyboard selection exposes the actual bucket range and tokens nearby.

## Verification evidence

- `tests/settings-usage.test.tsx`: bounded four-window global reads;
  failure/retry; missing capability; wrong scope; duplicate IDs; excessive
  buckets; switching windows/categories with delayed results; hidden-page and
  duplicate-submit guards; both locales/long labels; model counts 0, 1, 8, 9,
  and 1024; unavailable cost does not become a fabricated zero.
  Final review adds same-instance pinned project A→B cancellation, a malformed
  7-day bucket followed by switching back/retry, and a real 12-second timeout
  followed by explicit recovery with no automatic repeat. The updated focused
  suite passes **8 tests, 131 assertions, 0 failures** (37.16 seconds including
  the real deadline and test-run startup).
- `e2e/settings-usage.spec.ts`: temporary real Host with a local fixture Run;
  summary values and available cost are compared with a separate public
  `usage.query`. Includes the initial empty state, four windows via keyboard,
  non-zero plot geometry and selected bucket text, category switch/delayed
  response, injected read failure + explicit retry, true disconnect, no Status
  navigation, original composer draft after Back, and page/region overflow.
- `e2e/settings-provider-landing.spec.ts`: only the two exact category-order
  expectations were extended to include usage. Its Providers landing and
  remembered category/session-scope behavior remain verified.
- Production build and E2E use only
  `artifacts/settings-usage/web-dist`, preview port 44875, Host port 44873,
  and `artifacts/settings-usage/results`. The default build directory/ports
  are unchanged. The build's existing large-chunk warning is not hidden.
- Final real-Host combined E2E: **4 passed** (usage en/zh plus Provider landing
  en/zh), 16.3 seconds. Console errors: none; the proxy's expected ECONNRESET
  messages occur when the temporary Host is deliberately stopped.
- Content, icon-scale, flow-layout and production design-system boundary guards
  passed. Focused strict ESLint and Prettier checks passed in the implementation
  run. Surrounding runtime/React regression before the three additional review
  tests (`settings-usage`,
  `settings-workspace`, `system-diagnostics`, `status-usage-react`) passed:
  **21 tests, 335 assertions, 0 failures**, 18.81 seconds.
  Root typecheck and integrated/native validation are coordinated by the main
  agent, not claimed here as independently executed.

Manually inspected real Host screenshots:

- `D:/Git/hbar/artifacts/settings-usage/en-US-1440.png`
- `D:/Git/hbar/artifacts/settings-usage/en-US-320.png`
- `D:/Git/hbar/artifacts/settings-usage/zh-CN-1440.png`
- `D:/Git/hbar/artifacts/settings-usage/zh-CN-320-details.png`

Both locales also have `*-320-details.png`. The separate
`*-320-long-fixture.png` files deliberately replace only the description with
long text to stress layout; they are not screenshots of Host data. The real
fixture's zero cost is an actual available free local-provider metric returned
by the Host, not an unavailable-price fallback or a claim about paid providers.
