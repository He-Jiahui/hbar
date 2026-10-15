import { z } from 'zod'

export const DESKTOP_STARTUP_MODE_SETTING = 'desktop.startupMode'
export const desktopStartupModeSchema = z.enum(['client', 'background'])
export type DesktopStartupMode = z.infer<typeof desktopStartupModeSchema>

export const desktopTrayCopySchema = z.strictObject({
  openClient: z.string().min(1).max(120),
  openWeb: z.string().min(1).max(120),
  exitClient: z.string().min(1).max(120),
  stopBackend: z.string().min(1).max(120),
})
export type DesktopTrayCopy = z.infer<typeof desktopTrayCopySchema>

/** Authenticated, read-only boot projection. The layered setting remains the source of truth. */
export const desktopStartupSchema = z.strictObject({
  startupMode: desktopStartupModeSchema,
  labels: desktopTrayCopySchema,
})
export type DesktopStartup = z.infer<typeof desktopStartupSchema>
