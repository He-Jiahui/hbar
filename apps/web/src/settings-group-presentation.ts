import type { HbarSettingsGroupPresentation } from '@hbar/app-react'

/** Group visuals and ownership are supplied by the Web/Desktop host, not inferred from localized labels. */
export const WEB_SETTINGS_GROUP_PRESENTATION = [
  { id: 'providers', icon: 'providers', scope: 'host', order: 0 },
  { id: 'appearance', icon: 'appearance', scope: 'client', order: 10 },
  { id: 'model', icon: 'model', scope: 'layered', order: 20 },
  { id: 'session', icon: 'session', scope: 'layered', order: 30 },
  { id: 'extensions', icon: 'extensions', scope: 'host', order: 40 },
  { id: 'diagnostics', icon: 'diagnostics', scope: 'host', order: 50 },
] as const satisfies readonly HbarSettingsGroupPresentation[]
