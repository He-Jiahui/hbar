import { diagnosticEventSchema, type DiagnosticEvent } from '@hbar/contracts'
import { runtimeOwnerSchema, type RuntimeOwner } from '@hbar/contracts/runtime'

/** A Storage request ID is local to its authenticated physical Storage incarnation. */
export function scopeRuntimeDiagnostic(
  raw: DiagnosticEvent,
  sender: RuntimeOwner,
  hostInstanceId: string,
): DiagnosticEvent {
  const event = diagnosticEventSchema.parse(raw)
  const owner = runtimeOwnerSchema.parse(sender)
  const storageRequest =
    owner.unitId === 'storage' &&
    event.component === 'storage' &&
    ['storage.request_dispatched', 'storage.request_completed', 'storage.request_failed'].includes(event.event)
  return diagnosticEventSchema.parse({ ...event, instanceId: storageRequest ? owner.incarnation : hostInstanceId })
}
