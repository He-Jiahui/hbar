# Direct Plugins and Skills navigation

## Reference and baseline

The local cc-haha desktop at `e28d0a65` places Skills and Plugins in separate
Settings categories, with Skills before Plugins. Its `Settings.tsx` mounts
`SkillSettings` and `PluginSettings` independently and preserves their separate
store selections. Main-agent visual review used the original-component captures
under `artifacts/desktop-entry-matrix/extensions/`: Skills and Plugins at English
1440, and the Chinese 320 Skills panel. These use original theme/components and
typed local read fixtures, not a live authenticated installation. The narrow
reference is the panel alone, not proof of the reference's entire mobile rail.

hbar baseline `814c81b` already fixes independent read/failure ownership, but
still combines both lists under one Extensions and skills category. Its frozen
V3 bundle `index-Cl0RRCAK.js` fails two fresh real-Host tests specifically because
the Skills rail button (English 1440) and Skills select option (Chinese 320) are
absent. The Host has 15 actual plugins and 21 isolated discovered skills. No
collection query was issued before the missing-entry assertion failed.
Evidence and exact successful cleanup are retained under
`artifacts/extension-navigation/baseline/` and `baseline-results/`.

## Navigation contract

- Settings exposes direct Skills and Plugins categories. The stable old
  `extensions` section ID now opens Plugins; the new Skills ID is `skills`.
  Existing extension deep entries remain compatible. Host `settings.describe`
  is unchanged; the desktop host supplies the additional category and its scope.
- Both categories render through one extension runtime owner and the same
  Settings instance. The current Settings section determines the View collection;
  no second selected-collection store is introduced.
- Queries are canonical `queries.plugins` and `queries.skills`, not mirrored
  from a shared scalar. Each query changes only its own page. The optional
  collection in `setQuery` preserves the existing command's legacy combined
  behavior when omitted. Query/page state is runtime-only, not a new persistent
  format; global Settings category persistence reuses its existing known-ID path.
- Only the current collection is rendered/refreshed. Skills does not display
  retained plugin detail, action errors, enable/disable buttons or diagnostic
  commands. Returning to Plugins restores its own detail/filter/page. Back finds
  the exact current row by the retained plugin ID or safely falls back without
  changing the user's filter.
- Retry focus ownership expires across collection switches. P1 cancellation,
  physical in-flight bounds, stale snapshots, local recovery and unresolved
  plugin-write locks remain intact.
- A single collection has one focusable title and its count, localized search,
  current actions and content. Skills must expose its first record or confirmed
  empty state in the initial viewport, without test-driven scrolling to reach it.
  Long identities/paths use the normal flow and bounded 20-row pages from P1.

Skills remain actual Host discovery records. This unit does not invent skill
content editing, execution, install/uninstall or inferred plugin ownership.

## Verification record

Runtime prerequisite checks passed 64 tests / 387 assertions. The main-agent
combined runtime, View, settings-scope and design-boundary run passed 115 tests /
867 assertions. After the final copy cleanup, the View collection/navigation
subset passed 34 tests / 256 assertions. Strict owned-file checks passed.
The initial root typecheck encountered an unrelated, concurrently edited
`hbar-ui/.../wizard/InformationReference.tsx:3` unused React import. Its owner
subsequently corrected that file; the final root typecheck exited 0. This unit
did not alter the shared file or suppress its diagnostic.

The first candidate is `index-IbwwaY0q.js` / `index-fVZYfMAm.css`. Two initial
browser tests proved direct entry and initial first-row geometry, then failed a
wrong test assumption: reopening **Session settings** intentionally opens the
session Model category, rather than the remembered global Settings category.
Existing source/copy/tests confirm this distinction. The test now drives the
actual global sidebar Settings entry for persistence, and separately asserts
that the session-scoped entry is not hijacked. Both candidate cases then passed,
including a reload and saved Skills category. No product behavior was changed
to make that incorrect assumption pass.

The maintained P1 22-case suite follows the new production navigation rather
than forcing the legacy combined View into the application. Its independence
checks now cross real category transitions, deliver captured old responses late,
and check retained snapshots/query/page state and targeted retries. Legacy
combined and simultaneous two-read publication remain unit-tested. The new
12-case navigation suite covers direct zero/21 Skills entry, global category
restoration, independent category context, original plugin-row focus, and drafts.

## Final frozen browser verification

The first corrected candidate passed all 34 browser cases. Visual review then
removed the repeated Host-wide note in single-collection mode and shortened the
Skills introduction. The resulting final V2 asset is `index-Cefg9AVr.js`, with
`index-fVZYfMAm.css`; its JavaScript SHA-256 is
`394A9BE0D3F8FCA07212B46D18923E364F4794139E25FCEEBF4C0BB9DA0A3BFE`.
The frozen build, `dist/web`, and desktop-resource copy have that same hash.
The Host/Web resource build succeeded using the Visual Studio environment;
the existing native launcher was not rebuilt.

Final V2 passed **34/34** maintained recovery and new navigation browser cases,
English/Chinese at 1440/320, plus **4/4** existing plugin-detail/action regressions.
Main-agent review of final screenshots included English 1440 and Chinese 320
direct Skills, Chinese 320 restored plugin-row focus, and retained Skills page 2
after a failed refresh. The first real record is fully in the initial pane
without a preliminary scroll; long identities/status labels fit the actual
Settings pane. The screenshots still show hbar's current shared control skin;
this navigation unit is not a claim of visual or typographic parity with cc-haha.

The 34 read-only cases use real isolated Hosts, explicit local fixture discovery,
and public SDK reads. Their UI activity does not create Runs or mutate backend
data. Separate existing plugin-action regressions intentionally change local
fixture plugins and use a fixture approval-blocked Run; they are **not** included
in that zero-write claim. Browser evidence and cleanup records are under
`artifacts/extension-navigation/browser-v2/`, `recovery-v2/` and
`browser-v2-results/`. Earlier red and corrected V1 runs remain available.

## Repository gates

After the final product freeze, `bun test tests --timeout 20000` completed with
**2717 passed, 1 failed, 28067 assertions, 393 files**. The sole failure is the
existing `tests/lumen-canonical-boundary.test.ts` authentication-family native
control boundary; its exact violations are retained in
`artifacts/extension-navigation/full-tests.log`. Concurrent unrelated wizard
work was not frozen or included in this unit. This is not an all-green repository
claim. Final owned-file strict lint, Prettier, content-contract, semantic-icon and
flow-layout guards passed.

Full `bun run lint` reports the same existing missing
`react/no-unused-prop-types` rule at
`packages/lumen-app-ui/src/authentication/primitives.tsx:44` (one error,
zero warnings). The complete output is `full-lint.log` in this unit's artifact
root. No unrelated authentication implementation was changed.

## Actual native verification and cleanup

One bounded invocation of `artifacts/extension-navigation/native-runner.ts`
passed **8/8** cases with the existing launcher and the final V2 resources.
Fresh profiles ending `tSVFsp` and `FZvZ1o` contained respectively 0 and 21 skills;
each exercised English/Chinese at native 900×600 and 1440×960. No native 320 or
native injected-failure result is claimed; those boundaries belong to browser
verification.

All eight direct entries show the real empty state or complete first row before
any fixture scroll. The Settings pane client/scroll widths were 677/677 at 900
and 1217/1217 at 1440; every direct capture had scrollTop 0. The populated profile
also passed 20→1→20 pagination, independent category filters, plugin detail Back
to the original row, and return to the exact original session draft. Main-agent
visual review included the native English 900 empty state, Chinese 900 first
Skills page and English 1440 second page.

Each profile recorded UI reads `skill.list: 12`, `plugin.list: 8` and
`plugin.inspect: 4`. Initialization created four isolated sessions per profile;
the UI created no Runs, changed no plugin/model/Goal/provider data and made no
provider-verification or paid request. Both native error/console arrays were
empty. Forty-four PNGs and command/geometry/identity records remain under
`artifacts/extension-navigation/native/`; see `native-results.md` for exact
captured desktop/supervisor/Host identities.

The two new profiles and their two new workspaces (suffixes `FeWvAj` and
`NVLBIa`) were removed only after successful guarded shutdown; four subsequent
exact-path checks confirmed absence. Browser cleanup likewise records 34/34
owned children exiting 0 and their exact roots removed. Only generated isolated
test data was removed; screenshots and verification records remain available.
Protected PIDs and previously retained profiles were not queried or touched.

## Reproduction and delivery boundary

```powershell
bun run typecheck
bun test tests --timeout 20000
bunx playwright test --config artifacts/extension-navigation/browser.config.ts --output artifacts/extension-navigation/browser-v2-results
bunx playwright test --config artifacts/extension-navigation/regression.config.ts
```

The browser matrix used `HBAR_EXTENSION_COLLECTIONS_WEB_DIST` pointing to frozen
`artifacts/extension-navigation/web-v2` and
`HBAR_EXTENSION_COLLECTIONS_EXPECTED_ASSET=index-Cefg9AVr.js`. The existing four
regressions used their own isolated Host/preview ports and that same frozen V2.
The native runner requires the explicit `HBAR_EXTENSION_NAVIGATION_NATIVE_RUN=1`
gate and matching `HBAR_NATIVE_EXPECTED_ASSET`; it is not part of ordinary browser
setup and must not be blindly restarted after an observation timeout.

The query-state DTO and its consumers are one complete navigation feature and
are committed together, after verification, without unrelated staged/worktree
changes. This closes direct Skills discovery and category context preservation,
not the overall desktop migration or unsupported Skills content/actions.

Before staging, a zero-byte `.git/index.lock` was unchanged for over 30 minutes,
two exact Git-process checks found no running Git process, and an exclusive file
open succeeded. Its unchanged timestamp/size and process absence were checked
again before moving it recoverably to
`artifacts/extension-navigation/stale-index-20260927-032003.lock`. No process was
terminated, index discarded, or user file restored as part of that recovery.
