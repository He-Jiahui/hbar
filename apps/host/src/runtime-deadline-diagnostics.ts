import { createHash } from 'node:crypto'
import { diagnosticEvent, type DiagnosticEvent } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import type { SessionWakeAck } from '@hbar/contracts/session-wake'
import type { ScheduleIdleManifest, ScheduleTransferAck } from './runtime-schedule-idle-contract'
import type { MaintenanceInspectionAck, MaintenanceInspectionManifest } from './runtime-maintenance-inspection-contract'

type Phase = 'checkpointed' | 'restored' | 'serving'
type Checkpoint =
  | { readonly domain: 'goal'; readonly ack: SessionWakeAck }
  | {
      readonly domain: 'schedule'
      readonly ack: ScheduleTransferAck
      readonly manifest: ScheduleIdleManifest
      readonly restorationKind?: 'settled' | 'changed'
    }
  | {
      readonly domain: 'maintenance'
      readonly ack: MaintenanceInspectionAck
      readonly checkpoint: MaintenanceInspectionManifest['checkpoint']
    }

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Bounded, lazy observations of original ACKs. Never acquires, restores, releases or retries work. */
export class RuntimeDeadlineDiagnostics {
  constructor(
    private readonly options: {
      readonly enabled: () => boolean
      readonly emit: (event: DiagnosticEvent) => void
    },
  ) {}

  observe(owner: RuntimeOwner, phase: Phase, read: () => Checkpoint | null): void {
    try {
      if (!this.options.enabled()) return
      const value = read()
      if (!value) return
      const tokenSha256 = digest(value.ack.token)
      const emit = (runtimeDeadline: NonNullable<DiagnosticEvent['runtimeDeadline']>, sessionId?: string): void => {
        this.options.emit(
          diagnosticEvent({
            component: 'host',
            level: 'debug',
            event: 'host.runtime_deadline_checkpoint',
            phase,
            contextId: owner.unitId,
            requestId: owner.incarnation,
            ...(sessionId ? { sessionId } : {}),
            runtimeDeadline,
          }),
        )
      }
      if (value.domain === 'goal') {
        const manifest = value.ack.manifest
        const checkpointSha256 = digest(JSON.stringify(manifest))
        // The public session-wake contract permits at most128 entries. No local queue or retained manifest.
        for (const entry of manifest.entries.slice(0, 128))
          emit(
            {
              domain: 'goal',
              tokenSha256,
              checkpointSha256,
              revision: manifest.revision,
              dueAt: entry.dueAt,
              entries: manifest.entries.length,
            },
            entry.sessionId,
          )
      } else if (value.domain === 'schedule') {
        const manifest = value.manifest
        const common = {
          tokenSha256,
          checkpointSha256: digest(JSON.stringify(manifest)),
          revision: value.ack.version,
          ...(value.restorationKind ? { restorationKind: value.restorationKind } : {}),
        }
        emit({
          ...common,
          domain: 'schedule',
          dueAt: manifest.nextDueAt,
          entries: manifest.snapshot.definitions.length,
        })
        emit({ ...common, domain: 'search', dueAt: manifest.nextSearchCheckAt, entries: 1 })
      } else {
        emit({
          domain: 'maintenance',
          tokenSha256,
          checkpointSha256: digest(JSON.stringify(value.checkpoint)),
          revision: value.ack.version,
          dueAt: value.checkpoint.nextCheckAt,
          entries: 1,
        })
      }
    } catch {
      // Disabled, invalid, stale or failed observations never change the original transfer or its outcome.
    }
  }
}
