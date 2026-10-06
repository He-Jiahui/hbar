import type { HbarSettingsGroupPresentation } from '@hbar/app-react'
import { settingsWorkspacePresentationSchema } from '@hbar/contracts/commands/settings'
import description from './settings-presentation.json'

/** Group visuals and ownership are supplied by the Web/Desktop host, not inferred from localized labels. */
const presentation = settingsWorkspacePresentationSchema.parse(description)
export const WEB_SETTINGS_GROUP_PRESENTATION: readonly HbarSettingsGroupPresentation[] = presentation.groups
export const WEB_SETTINGS_LAYOUT = presentation.layout
