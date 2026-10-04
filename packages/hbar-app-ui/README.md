# hbar-app-ui

The hbar application UI catalog is a component package for dense workspaces, agent runs, conversations, data, settings and operational workflows.

## Public API

The structural production entry `hbar-app-ui/workbench` exports
`HbarAppUiAppShell`, `HbarAppUiAppSidebar` and `HbarAppUiWorkbenchNotice`.
They accept host-owned copy and content slots, and do not import catalog data,
application stores or transport. The sidebar keeps its header/footer outside its
scrollable collection slot; collection adapters own paging or virtualization.
The main slot scrolls independently and the same flow stacks on narrow screens.
`apps/web` currently uses this entry as a disconnected shell while its command
runtime is rebuilt. The existing catalog preview remains a separate application.

```tsx
import { HbarAppUiAgentActivity01, HbarAppUiSpotlight } from 'hbar-app-ui'
import 'hbar-app-ui/theme.css'

<HbarAppUiAgentActivity01 onAction={(event) => console.log(event)} />
<HbarAppUiSpotlight>Workspace content</HbarAppUiSpotlight>
```

Every catalog entry has a `HbarAppUi...` named export, an `hbar-app-ui-*` entry ID, and a registry record containing behavior, observation and visual-validation metadata. The registry exposes the exact 38 categories and 300 variants through `HBAR_APP_UI_VARIANT_SPECS`, `HBAR_APP_UI_VARIANT_EXPORTS` and `listHbarAppUiVariants()`.

Category surfaces are also available as independent entry points (for example `hbar-app-ui/agent-activity`, `hbar-app-ui/analytics` and `hbar-app-ui/chat`). Each category module owns its variant switch and concrete interaction markup. The package renders only the UI block; catalog labels, profile facts and validation controls belong to the standalone preview application.

The package ships light and dark variables under `--hbar-app-ui-*`. Consumers opt into the light palette with `data-hbar-app-ui-theme="light"`; the default palette is dark.

## Data-driven Components

`HbarAppUiRunActivity` is a standalone execution-history component at `hbar-app-ui/run-activity`. A host maps its own records into `HbarAppUiRunActivityItem` and supplies the exact row callback; the component does not import host state, transport, or product-specific types.

```tsx
<HbarAppUiRunActivity runs={runs} cancellingRunIds={cancellingRunIds} onCancelRun={(runId) => cancelRun(runId)} />
```

The props support local status labels, run-count text, empty state copy, row selection, cancellation progress, and failure feedback so application-specific wording remains outside the package. For hosts that already have an i18n system, the `labels` bundle keeps all generated copy in that system without adding a runtime translation dependency:

```tsx
<HbarAppUiRunActivity
  runs={runs}
  labels={{
    title: t('runHistory'),
    countLabel: (count) => pluralize('run', count),
    statusLabel: (status) => t(runStatusKeys[status]),
    cancelLabel: t('stopRun'),
    cancellingLabel: t('stopping'),
  }}
  onCancelRun={cancelRun}
/>
```

`HbarAppUiApprovalRequest` and `HbarAppUiQuestionnaire` expose the same pattern through their typed `labels` contracts. Existing individual label props remain supported, with an individual prop taking precedence over its bundle entry. The package owns interaction state only; the host owns locale selection, plural rules, date/number formatting, and translation errors.

## Preview

Run the independent catalog preview from the repository root:

```sh
bun run app-ui:preview
```

The preview supports category search, direct `?variant=hbar-app-ui-...` navigation, action-event observation, light/dark themes, desktop/tablet/mobile frames, reset and fullscreen controls.

Generate a fresh local acceptance report for every entry with:

```sh
bun run app-ui:verify
```

The verifier writes ignored artifacts under `artifacts/hbar-app-ui/`, including one local screenshot and a reference-path/hash record for every entry. It fails if an entry does not mount, expose its variant contract, or return its profile control event.
