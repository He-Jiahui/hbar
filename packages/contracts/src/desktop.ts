import { z } from 'zod'
import { PAIRING_CODE_LENGTH } from './index'

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

/** Explicit native background entry enables the existing Host without changing startup preferences. */
export const desktopBackgroundRequestSchema = z.strictObject({ unattended: z.literal(true) })
export const desktopBackgroundResponseSchema = z.strictObject({ unattended: z.literal(true) })

/** Separately negotiated so older native startup projections remain compatible. */
export const desktopTrayActionsSchema = z.strictObject({
  copyAddress: z.string().trim().min(1).max(120),
  pairOperator: z.string().trim().min(1).max(120),
  pairObserver: z.string().trim().min(1).max(120),
  dialogTitle: z.string().trim().min(1).max(120),
  acknowledge: z.string().trim().min(1).max(120),
  addressCopied: z.string().trim().min(1).max(500),
  copyFailed: z.string().trim().min(1).max(500),
  pairingFailed: z.string().trim().min(1).max(500),
})
export type DesktopTrayActions = z.infer<typeof desktopTrayActionsSchema>

export const desktopPairingRequestSchema = z.strictObject({ role: z.enum(['operator', 'observer']) })
export type DesktopPairingRequest = z.infer<typeof desktopPairingRequestSchema>

export const desktopPairingResponseSchema = z.strictObject({
  code: z.string().length(PAIRING_CODE_LENGTH).regex(/^\d+$/),
  expiresAt: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(6000),
  acknowledge: z.string().trim().min(1).max(120),
})
export type DesktopPairingResponse = z.infer<typeof desktopPairingResponseSchema>
