import { HbarError } from '@hbar/contracts'
import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'

export interface NodeProcessAdmissionRequest {
  readonly target: NodeExecutionTarget
  readonly snapshotNetworkEnabled: boolean
  readonly requiresProcess?: boolean | undefined
  readonly toolEffect: 'read' | 'write' | 'process' | 'other'
}

export interface NodeProcessAdmission {
  readonly networkEnabled: boolean
}

/** Applies B's observed local floor before A creates an approval or durable tool intent. */
export function admitNodeProcess(request: NodeProcessAdmissionRequest): NodeProcessAdmission {
  const { target } = request
  if (target.kind !== 'node') return { networkEnabled: false }

  const { capabilitySummary } = target
  if (request.toolEffect === 'write' && target.rootAccess === 'read')
    throw new HbarError('NODE_FLOOR_READ_ONLY', 'The workspace node root is read-only for workspace writes')
  const requiresProcess = request.toolEffect === 'process' || request.requiresProcess === true
  if (!requiresProcess) return { networkEnabled: false }
  if (!capabilitySummary.floor.process)
    throw new HbarError('NODE_FLOOR_PROCESS_DENIED', 'The workspace node local floor disables process execution')
  if (!capabilitySummary.selectedBackend)
    throw new HbarError('NODE_CAPABILITIES_UNAVAILABLE', 'The workspace node has no observed active execution backend')
  if (
    capabilitySummary.floor.backend &&
    capabilitySummary.floor.backend !== 'auto' &&
    capabilitySummary.selectedBackend !== capabilitySummary.floor.backend
  )
    throw new HbarError('NODE_BACKEND_CHANGED', 'The active backend differs from the workspace node floor')
  // Node Core always includes its private data and protected paths in OS confinement roots.
  if (capabilitySummary.filesystem !== 'enforced')
    throw new HbarError(
      'NODE_SANDBOX_BACKEND_UNAVAILABLE',
      'The workspace node cannot enforce the required filesystem confinement',
    )
  const networkEnabled = !request.requiresProcess && request.snapshotNetworkEnabled && capabilitySummary.floor.network
  if (!networkEnabled && capabilitySummary.network !== 'enforced')
    throw new HbarError('NODE_SANDBOX_BACKEND_UNAVAILABLE', 'The workspace node cannot enforce disabled network access')

  return { networkEnabled }
}
