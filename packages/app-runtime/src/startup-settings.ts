import { CommandError } from '@hbar/commands'
import { z } from 'zod'
import type { PresentationState, RuntimeOptions, SurfaceState } from './types'

const startupSettingsSchema = z.strictObject({
  instanceId: z.string().min(1).max(160),
  section: z.string().min(1).max(128).optional(),
  sidebarOpen: z.boolean(),
})

/** Initializes only a global client navigation surface, never another Host's entities or actions. */
export function startupSettingsState(options: RuntimeOptions): {
  readonly surfaces: SurfaceState
  readonly presentation: PresentationState
} {
  const surfaces: SurfaceState = { panels: {}, windows: {}, focusedPanelId: null, focusedWindowId: null }
  const presentation: PresentationState = {
    page: { kind: 'session' },
    toolInstanceId: null,
    modalInstanceId: null,
    returnContext: null,
    sidebarOpen: true,
  }
  if (options.initialGlobalSettings === undefined) return { surfaces, presentation }
  const parsed = startupSettingsSchema.safeParse(options.initialGlobalSettings)
  if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Invalid initial global Settings surface')
  const { instanceId, section, sidebarOpen } = parsed.data
  if (!options.surfaces?.canRender('settings'))
    throw new CommandError('CAPABILITY_UNAVAILABLE', 'This runtime cannot render Settings')
  if (section && !options.settingsLanding?.isKnownGlobalGroup?.(section))
    throw new CommandError('INVALID_INPUT', 'Initial Settings category is not known to this host')
  return {
    surfaces: {
      ...surfaces,
      focusedPanelId: instanceId,
      panels: {
        [instanceId]: {
          instanceId,
          panelId: 'settings',
          workspaceId: null,
          sessionId: null,
          binding: 'followActive',
          params: { scope: 'global', ...(section ? { section } : {}) },
        },
      },
    },
    presentation: { ...presentation, page: { kind: 'settings', instanceId }, sidebarOpen },
  }
}
