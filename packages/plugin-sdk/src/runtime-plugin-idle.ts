import { z } from 'zod'
import type { Disposer } from './index'
import type { RuntimeIdleAuthority } from '@hbar/contracts/runtime'
export type RuntimePluginIdleAuthority = RuntimeIdleAuthority
/** Authority is supplied only by the authenticated runtime entry; this function never clears a latch. */
export function nativeDescendantsConfirmed(
  authority: RuntimePluginIdleAuthority | undefined,
  physicalShellPromises: number,
  nativeChildren: number,
): boolean {
  return authority?.nativeActive === 1 && physicalShellPromises === 0 && nativeChildren === 0
}

/** Owner-local, pure checkpoint. Missing registration or unsupported proof denies idle. */
export const runtimePluginIdleCheckpointSchema = z.strictObject({
  supported: z.boolean(),
  requests: z.number().int().nonnegative(),
  resources: z.number().int().nonnegative(),
  background: z.number().int().nonnegative(),
  unconfirmed: z.number().int().nonnegative(),
})
export type RuntimePluginIdleCheckpoint = z.infer<typeof runtimePluginIdleCheckpointSchema>
export interface RuntimePluginIdleRegistry {
  /** Register once during this plugin's apply. The owner supplies identity, never the plugin. */
  register(read: (authority?: RuntimePluginIdleAuthority) => RuntimePluginIdleCheckpoint): Disposer
}
