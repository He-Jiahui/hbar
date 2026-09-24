import type { HbarSettingsGroupPresentation } from '@hbar/app-react'

/** Group visuals and ownership are supplied by the Web/Desktop host, not inferred from localized labels. */
export const WEB_SETTINGS_GROUP_PRESENTATION = [
  { id: 'appearance', icon: 'appearance', scope: 'client' },
  { id: 'model', icon: 'model', scope: 'layered' },
  { id: 'session', icon: 'session', scope: 'layered' },
  { id: 'providers', icon: 'providers', scope: 'host' },
  { id: 'extensions', icon: 'extensions', scope: 'host' },
] as const satisfies readonly HbarSettingsGroupPresentation[]
