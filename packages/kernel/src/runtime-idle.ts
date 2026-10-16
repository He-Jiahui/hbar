import { z } from 'zod'
import { runtimeOwnerSchema } from '@hbar/contracts/runtime'
export interface KernelIdleCheckpoint {
  readonly schemaVersion: 1
  readonly instanceId: string
  /** Local Kernel-domain eligibility only; managed service must merge all external proofs. */
  readonly coverage: 'kernel-domain'
  readonly eligible: boolean
  readonly queuedRuns: boolean | null
  readonly counts: Readonly<Record<string, number>>
  readonly scheduledWakeups: number
  readonly requiresAlarmTransfer: boolean
}
export type KernelActivationPurpose = 'startup' | 'recovery' | 'idle-wake'
/** Internal parent-only proof. Host must enumerate every currently selected plugin owner,
 * probe real runtime.idle and revalidate the exact owner before returning complete coverage.
 * Absence, timeout, unknown, unsupported plugin or changed generation is never complete.
 */
export const kernelPluginQuiescenceSchema = z.strictObject({
  coverage: z.enum(['complete', 'unsupported']),
  queuedRuns: z.boolean().nullable(),
  owners: z
    .array(
      z.strictObject({
        owner: runtimeOwnerSchema,
        eligible: z.boolean(),
        requests: z.number().int().nonnegative(),
        runs: z.number().int().nonnegative(),
        resources: z.number().int().nonnegative(),
      }),
    )
    .max(128),
})
