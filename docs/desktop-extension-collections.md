# Independent extension collections

## Reference and defect

The local cc-haha desktop reference at `e28d0a65` presents Plugins and Skills as
separate Settings categories. The original `Settings.tsx` mounts separate
feature components, and the plugin/skill stores own independent list requests.
Original-component screenshots are retained in
`artifacts/desktop-entry-matrix/extensions/reference-plugins-list-en-US-1440.png`
and `reference-skills-list-en-US-1440.png`. They use original components, stores
and themes with typed local read fixtures, not a live authenticated installation.

The hbar baseline for this unit is `6949dee`. The earlier real-Host audit in
`artifacts/settings-extension-recheck/production-final/` showed 15 registered
plugins disappearing from the UI when only `skill.list` failed. The screen then
claimed that the Host had no plugins or skills. Current source inspection
confirmed the same all-or-nothing `Promise.all` and unconditional empty states.
`git show 12e2758` establishes the original joined read; `a373f93` later added
plugin action ownership and acknowledgement fencing, which must be preserved.

This unit transfers the reference's independent collection ownership. The
reference does not have the same local error-retry widget; hbar's localized,
targeted recovery is an explicit reliability requirement, not a pixel-identical
copy. Collection navigation is a separate follow-up, after this unit is verified
and committed.

## Acceptance boundary

- Plugins and Skills publish success independently. A sibling failure or held
  request cannot suppress confirmed data or disable unrelated plugin details.
- Each collection distinguishes no confirmed snapshot, loading, confirmed empty,
  ready data and failed refresh with retained old data. A failed first read is
  never labeled "0 items" or "none exist".
- Recovery is local to the failed collection, uses only its public read query,
  and exposes shared busy state. Errors contain safe localized copy, not raw
  private payloads.
- Query, pagination, detail identity, Back focus and pending/unknown plugin
  action locks remain owned by their existing runtime. A successful plugin
  mutation confirms that plugin, not an unrelated collection or the entire list.
- Reads have bounded actual concurrency, cancellation/lifetime fences and a
  logical deadline. Logical cancellation must not pretend that an adapter which
  ignores AbortSignal has physically stopped.
- Lists retain their 20-item rendered pages and public Host bounds: 4096 plugins
  and 10000 skills. Skills remain "discovered" records; paths do not imply a
  public skill-content reader or execution capability.

## Verification plan and record

The maintained real-Host fixture uses fresh port-zero Hosts and exact temporary
roots, seeds only its own global skill directory, and validates the resulting
public `plugin.list` / `skill.list` responses. Response faults replace or delay
only genuine successful reads. It does not fabricate successful collections,
install plugins, modify user settings or issue Runs. Initial fixture setup is
recorded separately from UI requests.

The runtime prerequisite is independently committed as `09886b7`. The final
owner distinguishes logical completion from physical settlement, keeps at most
eight actual collection reads, and has a 30-second read deadline inside the
35-second local refresh command budget. Group/surface/presentation changes
cancel old logical reads; a newer read is never overwritten by a late reply.

Focused runtime, view, public command and design-system regressions passed:
96 tests, 727 assertions across nine files. Root `tsc --noEmit` and strict scoped
ESLint passed. The actual old V5 bundle reproduced the disappearing-plugin
defect in both English 1440 and Chinese 320 with genuine Host responses; see
`artifacts/extension-collections/baseline-red/`.

The V2 bundle (`index-DoDJ2T9-.js`) passed all 22 browser interaction cases after
two test-harness corrections: comparing rendered row text using `innerText`
consistently, and using the General group's actual Host-owned label rather than
an unsupported translation key. No product assertion was relaxed. Original
failed traces remain under `browser-results/`; the successful interaction run
is under `browser-final/` and `browser-final-results/`.

Manual V2 screenshot review then found a real narrow-layout defect not detected
by document-level overflow checks: long skill names pushed the Discovered badge
outside the Settings pane (client width 305, content width 328). A new maintained
assertion checks the actual pane and every badge. It failed against unchanged V2
in `overflow-red-results/`. The View unit must fix and rerun that stronger
acceptance before completion; interaction success alone is not visual success.

## Final candidate and visual verification

The V3 candidate contains `index-Cl0RRCAK.js` and `index-BhT15lKI.css`. JavaScript
SHA-256 is `1DF1472D2519EA933C8B35F316A42126308E26D41205AFF1E610E5CAA86D533C`.
The frozen candidate, `dist/web`, and `dist/desktop-resources/web` were individually
hashed and match. Host/Web resource generation passed using the Windows Visual
Studio environment. The existing desktop launcher was not rebuilt.

The overflow fix uses explicit skill-content/status layout roles and normal flex
wrapping. It changes no shared primitive or unrelated theme. This corrects the
old nonwrapping row from `a463b51`, with the V2 visual failure retained as evidence.

- V3 real-Host browser matrix: **22 passed**, including independent initial
  failures and latency in both directions, targeted busy/retry/focus, confirmed
  empty data, stale snapshot/filter/page preservation, deliberate focus changes,
  Settings group leave/return with late responses, and 0/1/20/21 skills.
- Every capture now checks the actual Settings scrolling pane, not only the
  document. All laid-out skill status labels must stay inside the pane.
- Existing real-Host plugin detail and activation regressions: **4 passed**.
  These existing tests intentionally install/change isolated fixture plugins;
  they are not included in the new collection suite's zero-mutation claim.
  Vite printed connection-reset diagnostics during their Host teardown.
- After the final layout edit, collection View/design-boundary checks passed
  **22 tests / 142 assertions**. Strict scoped ESLint, formatting and the content,
  icon and flow guards passed.

Main-agent screenshot review covered V3 initial plugin failure at English 320,
stale Skills/page 2 at Chinese 320, and a busy Skills retry at English 1440.
The status label is now below long skill content when needed; no clipping,
absolute positioning or forced test styles are used. Evidence is retained in
`artifacts/extension-collections/browser-v3/` and `browser-v3-results/`.

The original component screenshots establish the reference hierarchy, not a
claim of whole-application or native failure-injection parity. Native results
and repository-wide gate outcomes are appended only after their actual exit.

## Native desktop verification

One bounded invocation of the prepared native runner passed **8/8 cases**, exit
0: two new profiles with 0/21 discovered skills, each English/Chinese at actual
900x600 and 1440x960 window sizes. The normal flows verified real Host counts,
20-to-1-to-20 pagination, plugin detail Back with original filter/row focus, and
Settings Back with the original session draft. Response faults were tested in
the browser suite, not injected into native WebView2.

Every native capture checked the actual Settings pane and laid-out skill status
labels. At width 900 the pane client/scroll width was 677/677; at width 1440 it
was 1217/1217. Main-agent visual review included Chinese 900 skills and confirmed
empty state, plus English 1440 page 2. No native 320 result is claimed.

Evidence: `artifacts/extension-collections/native/` profiles ending `02OuZN`
(0 skills, 12 PNGs) and `CJglgO` (21 skills, 16 PNGs), with verification,
initialization, geometry and cleanup records. Initialization created four
sessions per profile and 21 test skill files in total. UI activity had zero
backend mutations, Runs, plugin reconfiguration or provider verification. Both
native page-error and console arrays were empty.

The captured desktop/supervisor/Host identity chains were checked before
shutdown. Both new profiles and both new workspaces were removed after success;
all four exact paths were rechecked absent. Old retained profiles and protected
PIDs were untouched. Browser V3 likewise records 22/22 owned Hosts exiting 0
with their exact temporary roots removed; its 50 captures all use the final V3
module and have no Settings-pane overflow. Evidence files remain recoverable
in the artifact directories; only isolated generated test data was removed.

## Subsequent navigation unit

At this P1 verification checkpoint the Settings rail still combined Plugins and
Skills, leaving Skills after the plugin list. The subsequent
[direct category navigation unit](desktop-extension-navigation.md) separates
those entries while reusing this read owner and existing Host discovery contract.
Its own report records independent query/page state, compatible `extensions`
entry behavior, plugin detail/retry focus isolation and newer browser/native
evidence. This historical P1 report does not claim install/edit/run capabilities.

## Repository gates and reproduction

After the final View freeze, `bun test tests --timeout 20000` completed with
**2692 passed, 1 failed, 27855 assertions, 391 files**. The sole failure is the
pre-existing `tests/lumen-canonical-boundary.test.ts` authentication-family
native-control boundary, unrelated to this unit. Full `bun run lint` also
remains red at `hbar-ui/packages/lumen-app-ui/src/authentication/primitives.tsx:44`
because `react/no-unused-prop-types` is unavailable. These match the previously
recorded authentication gates; no unrelated shared UI was modified to mask them.
Logs: `full-tests-final.log` and `full-lint.log` under this unit's artifact root.

An earlier full run overlapped the View edit and reported two failures: the same
authentication boundary plus the newly added skill-content class assertion.
That unchanged new assertion passed both its isolated rerun and the final frozen
full run. The earlier mixed-source result is retained in `full-tests.log`, not
relabeled as a pass. Final root `bun run typecheck`, strict scoped lint,
formatting, three skill guards and diff checks exited successfully.

Core commands actually used:

```powershell
bun run typecheck
bun test tests --timeout 20000
bunx playwright test --config artifacts/extension-collections/browser.config.ts --output artifacts/extension-collections/browser-v3-results
bunx playwright test --config artifacts/extension-collections/regression.config.ts
```

The browser run sets `HBAR_EXTENSION_COLLECTIONS_WEB_DIST` to the frozen
`artifacts/extension-collections/web-v3` directory and
`HBAR_EXTENSION_COLLECTIONS_EXPECTED_ASSET=index-Cl0RRCAK.js`. The maintained
fixture also supports ordinary `dist/web` after a normal build. The four existing
regressions used their isolated Host/preview ports and the same frozen V3.
See `native-results.md` for the single gated native invocation and identity
proofs. Native launch is deliberately not part of the general browser helper.

This unit's changes are committed separately from the user's unrelated working
tree. A pre-existing zero-byte Git index lock was unchanged for over twenty
minutes, no Git process existed and an exclusive file-open succeeded; it was
moved recoverably to `artifacts/extension-collections/stale-index-20260927-020113.lock`
before the runtime commit. No Git process was terminated or user changes reset.
