import { Computer, HardDrive } from 'lucide-react'
import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'
import { LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import './approval-execution-target.css'

export interface ApprovalExecutionTargetLabels {
  readonly title: string
  readonly nodeName: (name: string) => string
  readonly rootPath: (path: string, access: 'read' | 'write') => string
  readonly rootAccess: (access: 'read' | 'write') => string
  readonly local: string
  readonly node: string
  readonly root: string
  readonly availableBackends: string
  readonly availableBackendsSummary: (backends: string) => string
  readonly noAvailableBackend: string
  readonly selectedBackend: (backend: string) => string
  readonly selectedBackendUnknown: string
  readonly backend: (backend: string) => string
  readonly filesystem: (state: 'enforced' | 'none') => string
  readonly network: (state: 'enforced' | 'env-only' | 'none') => string
  readonly floor: string
  readonly floorSummaryText: (summary: string) => string
  readonly floorSummary: (process: boolean, terminal: boolean, network: boolean, confinement: string) => string
  readonly observedAt: (date: string) => string
}

export function HbarApprovalExecutionTarget({
  target,
  labels,
}: {
  readonly target: NodeExecutionTarget
  readonly labels: ApprovalExecutionTargetLabels
}) {
  if (target.kind === 'local') {
    return (
      <LumenFrame className="hbar-approval-execution-target" role="group" aria-label={labels.title}>
        <LumenIcon icon={HardDrive} tier="sm" />
        <LumenContentText context="record.description">{labels.local}</LumenContentText>
      </LumenFrame>
    )
  }
  const summary = target.capabilitySummary
  const floor = summary.floor
  const backends = summary.backends.map(labels.backend).join(' · ')
  return (
    <LumenFrame className="hbar-approval-execution-target" role="group" aria-label={labels.title}>
      <LumenIcon icon={Computer} tier="sm" />
      <LumenFrame className="hbar-approval-execution-target-details">
        <LumenContentText context="record.title">{labels.nodeName(target.nodeName)}</LumenContentText>
        <LumenContentText context="record.description">
          {labels.rootPath(target.nodePath, target.rootAccess)}
        </LumenContentText>
        <LumenFrame className="hbar-approval-execution-target-facts">
          <LumenContentText context="form.help">
            {labels.availableBackendsSummary(backends || labels.noAvailableBackend)}
          </LumenContentText>
          <LumenContentText context="form.help">
            {summary.selectedBackend
              ? labels.selectedBackend(labels.backend(summary.selectedBackend))
              : labels.selectedBackendUnknown}
          </LumenContentText>
          <LumenContentText context="form.help">{labels.filesystem(summary.filesystem)}</LumenContentText>
          <LumenContentText context="form.help">{labels.network(summary.network)}</LumenContentText>
          <LumenContentText context="form.help">
            {labels.floorSummaryText(
              labels.floorSummary(floor.process, floor.terminal, floor.network, floor.osConfinement),
            )}
          </LumenContentText>
          <LumenContentText context="form.help">
            {labels.observedAt(new Date(summary.observedAt).toLocaleString())}
          </LumenContentText>
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
