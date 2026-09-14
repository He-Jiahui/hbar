# hbar-app-ui

The hbar application UI catalog is a React component package for dense workspaces, agent runs, conversations, data, settings and operational workflows.

## Public API

```tsx
import { HbarAppUiAgentActivity01, HbarAppUiSpotlight } from 'hbar-app-ui'
import 'hbar-app-ui/theme.css'

<HbarAppUiAgentActivity01 onAction={(event) => console.log(event)} />
<HbarAppUiSpotlight>Workspace content</HbarAppUiSpotlight>
```

Every catalog entry has a `HbarAppUi...` named export, an `hbar-app-ui-*` entry ID, and a registry record containing behavior, observation and visual-validation metadata. The registry exposes the exact 38 categories and 300 variants through `HBAR_APP_UI_VARIANT_SPECS`, `HBAR_APP_UI_VARIANT_EXPORTS` and `listHbarAppUiVariants()`.

Category surfaces are also available as independent entry points (for example `hbar-app-ui/agent-activity`, `hbar-app-ui/analytics` and `hbar-app-ui/chat`). Each category module owns its variant switch and concrete interaction markup. The package renders only the UI block; catalog labels, profile facts and validation controls belong to the standalone preview application.

The package ships light and dark variables under `--hbar-app-ui-*`. Consumers opt into the light palette with `data-hbar-app-ui-theme="light"`; the default palette is dark.

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
