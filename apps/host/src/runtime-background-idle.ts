import { z } from 'zod'

/** Host-internal background alarm identity. */
export interface RuntimeBackgroundAlarm {
  readonly key: string
  readonly id: string
  readonly version: number
  readonly epoch: string
  readonly unitId: string
  readonly dueAt: number
}

export interface RuntimeBackgroundCheckpoint<State> {
  readonly schemaVersion: 1
  readonly unitId: 'controller' | 'maintenance'
  /** A local timer deadline is not an authoritative durable alarm identity. */
  readonly coverage: 'incomplete'
  readonly alarmsTransferRequired: boolean
  readonly requiredDomains: readonly string[]
  readonly nextDueAt: number | null
  readonly state: State
}

/** Count until physical reply/proof of non-dispatch, never until logical cancellation. */
export class RuntimePhysicalActivity {
  private count = 0
  begin(): () => void {
    this.count++
    let settled = false
    return () => {
      if (settled) return
      settled = true
      this.count--
    }
  }
  snapshot(): number {
    return this.count
  }
}

export function earliestRuntimeDue(values: readonly (number | null)[]): number | null {
  let earliest: number | null = null
  for (const value of values) {
    if (value !== null && (earliest === null || value < earliest)) earliest = value
  }
  return earliest
}

const count = z.number().int().nonnegative().safe()
const due = count.nullable()
const checkpoint = {
  schemaVersion: z.literal(1),
  coverage: z.literal('incomplete'),
  alarmsTransferRequired: z.boolean(),
  requiredDomains: z.array(z.string().min(1).max(160)).max(16),
  nextDueAt: due,
}
export const runtimeControllerIdleCheckpointSchema = z.strictObject({
  ...checkpoint,
  unitId: z.literal('controller'),
  state: z.strictObject({
    search: z
      .strictObject({
        disposed: z.boolean(),
        started: z.boolean(),
        timer: z.boolean(),
        nextDueAt: due,
        background: z.boolean(),
        pendingStep: z.boolean(),
        consecutiveFailures: count,
      })
      .nullable(),
    schedule: z
      .strictObject({
        stopped: z.boolean(),
        paused: z.boolean(),
        timer: z.boolean(),
        nextDueAt: due,
        ticking: z.boolean(),
        recoveryCursor: z.strictObject({ dueAt: count, id: z.string().max(160) }).nullable(),
      })
      .nullable(),
  }),
})
export const runtimeMaintenanceIdleCheckpointSchema = z.strictObject({
  ...checkpoint,
  unitId: z.literal('maintenance'),
  state: z.strictObject({
    scheduler: z.strictObject({
      closed: z.boolean(),
      paused: z.boolean(),
      cursor: z.string().max(4_096).nullable(),
      current: z.boolean(),
      timer: z.boolean(),
      nextDueAt: due,
    }),
    operation: z.strictObject({
      closed: z.boolean(),
      recovered: z.boolean(),
      currentOperationId: z.string().max(160).nullable(),
      recoveryPending: z.boolean(),
      queuedHandoffs: count,
    }),
    statistics: z.strictObject({ disposed: z.boolean(), backfill: z.boolean(), scans: count }),
    artifacts: z.strictObject({ closed: z.boolean(), recovering: z.boolean() }),
    database: z.strictObject({ activeOperationId: z.string().max(160).nullable(), closed: z.boolean() }),
  }),
})
