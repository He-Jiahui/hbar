# Sidebar organization E2E

Run the focused scenario after the production Web assets are available:

```powershell
bun run build
bun run test:e2e -- e2e/sidebar-organization.spec.ts
```

The fixture starts a real Host over a temporary data root and serves the built Web app. It creates six temporary
projects with typed display-name aliases, hides an empty project through the Host organization store, and pins one
project through the browser preference action. Sixty-nine temporary Sessions cover the six time groups and a 60-row
Host page plus a 9-row continuation. Project sorting, recent activity, hidden-project omission, time-group metadata,
pagination, persisted mode selection, and the Bell return to the last grouped mode are observed in the UI or read back
from Host commands. After loading all 69 rows, the separate observer cancels the temporary active fixture Run through
the public `operation.cancel` command while its row is offscreen; the E2E checks for the live `Stopping` metadata,
the same already-loaded 69 Session IDs, and the unchanged selected Session. `operation.get` and the global activity
view report `cancelRequested`; the raw snapshot Run remains `running` because this fixture has no dispatcher to settle
it. That cancellation is a fixture state transition, not a browser-issued user action.

For deterministic calendar-day fixtures, the helper closes the Storage Worker, updates `createdAt` and `updatedAt` on
only the temporary profile's Session rows, and reopens the Kernel before starting the Host. The selected Session was
created 60 days ago but updated today, so the UI check follows `updatedAt`. The helper queries the temporary Host's
model catalog, then sets its selected model and one supported non-off thinking level to provide meaningful persistence
assertions. One additional old-created Session has a stored `running` Run row seeded with the temporary StoragePort
after Kernel startup. That row is never dispatched to the demo MockProvider; the provider exists only to supply local
composer model controls. No paid provider or model request is used. Hidden-project filtering is checked on the grouped
project views with an empty hidden project; this browser scenario does not claim to cover hiding Sessions in the global
time feed.

The narrow viewport scenario opens the localized organization submenu at 320px, checks its selected radio and viewport
bounds, then checks Escape focus restoration and the time-view Bell. Neither scenario issues a user `session.create`
or `run.submit` command. Selection, the unsent composer draft, visible model and thinking controls, and the Host model
configuration are compared across mode changes. Reload checks the saved mode and selected Session; the E2E does not
claim unsent drafts survive a page reload, and instead enters a fresh draft before verifying the Bell return.

After a successful run, real screenshots and a capture manifest are written under the ignored path
`artifacts/sidebar-organization/hbar-e2e/`. If `dist/web/index.html` is missing, the test stops at its build-asset gate
before it spawns the temporary Host.

## Verified delivery

Root's final production-asset run used `artifacts/sidebar-organization/web` and
`index-Drhcp_lG.js`. The two scenarios and the existing workspace-sort regression
passed together: 3/3 in 19.6 seconds, output `test-results/sidebar-organization-v6`.
The original component reference manifest is
`artifacts/project-sort-reference-v5/manifest.json`; the current screenshots and
their exact asset identifier are recorded in the E2E capture manifest. Root
reviewed both English time-list captures and the Chinese submenu/time view.

The full-repository typecheck is not a gate certified by this run: it reports
unrelated preview/declaration errors. The affected App/UI/Runtime/Host-test
dependency graph passes strict TypeScript, and the new E2E files pass scoped
ESLint and formatting. Native desktop and a paid provider are not used.
