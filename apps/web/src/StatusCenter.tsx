import { lazy, Suspense, type ReactNode } from 'react'
import { LumenContentText, LumenWorkbenchNotice } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import { HbarStatusWorkspace, type HbarStatusWorkspaceLabels } from '@hbar/app-react/status'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { globalFeatureCopy } from './global-feature-copy'

const RunBoard = lazy(() => import('./run-board-page').then((module) => ({ default: module.RunBoardPage })))
const Diagnostics = lazy(() =>
  import('@hbar/app-react/diagnostics').then((module) => ({ default: module.HbarSystemDiagnostics })),
)

export interface StatusCenterProps {
  readonly labels: HbarStatusWorkspaceLabels
  readonly instanceId: string
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly usageDetails?: ReactNode
}

/** The status page owns one target and bounded sections backed by existing runtime readers. */
export function StatusCenter(props: StatusCenterProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const panel = surfaces.panels[props.instanceId]
  const workspaceId = panel?.binding === 'pinned' ? panel.workspaceId : navigation.workspaceId
  const copy = getShellCopy(props.locale)
  return (
    <HbarStatusWorkspace
      labels={props.labels}
      instanceId={props.instanceId}
      usageDetails={props.usageDetails}
      renderSection={(section, instanceId) => (
        <Suspense
          fallback={
            <LumenContentText context="feedback.message" role="status">
              {props.labels.loading}
            </LumenContentText>
          }
        >
          {section === 'diagnostics' ? (
            <Diagnostics instanceId={instanceId} connected={props.connected} labels={copy.diagnostics} />
          ) : workspaceId ? (
            <RunBoard runtime={runtime} locale={props.locale} instanceId={instanceId} />
          ) : (
            <LumenWorkbenchNotice
              title={props.labels.sections.runs}
              description={globalFeatureCopy(props.locale).workspaceRequired}
            />
          )}
        </Suspense>
      )}
    />
  )
}
