import { useId, useState, type ReactNode } from 'react'
import { LumenContentText, LumenFrame, LumenTabs } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import type { PanelSurface } from '@hbar/app-runtime'
import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'
import './session-panel.css'

const sections = ['activity', 'monitoring', 'agents', 'goals'] as const
type Section = (typeof sections)[number]
export function isSessionPanelSection(value: string): value is Section {
  return sections.some((section) => section === value)
}

/** One dock with existing runtime-owned leaf instances and captured session identity. */
export function SessionPanel({
  panel,
  labels,
  children,
}: {
  readonly panel: PanelSurface
  readonly labels: HbarSessionWorkspaceLabels['tools']
  readonly children: ReactNode
}) {
  const runtime = useHbarRuntime()
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const namespace = useId()
  const [error, setError] = useState<string | null>(null)
  const sourceTab = tabs.items.find(
    (tab) => tab.kind === 'session' && tab.workspaceId === panel.workspaceId && tab.sessionId === panel.sessionId,
  )
  return (
    <LumenFrame className="hbar-session-panel">
      <LumenTabs
        label={labels.panel}
        selectedId={panel.panelId}
        items={sections.map((id) => ({
          id,
          label: labels[id],
          tabId: `${namespace}-${id}`,
          panelId: `${namespace}-content`,
        }))}
        onChange={(section) => {
          if (!isSessionPanelSection(section) || !panel.sessionId || !panel.workspaceId) return
          setError(null)
          const target = {
            panelId: section,
            sessionId: panel.sessionId,
            workspaceId: panel.workspaceId,
            sourceTabInstanceKey: sourceTab?.instanceKey ?? null,
          }
          void runtime.commands.execute('sessionTools.open', target).catch((reason: unknown) => {
            const selected = runtime.state.navigation.getSnapshot()
            if (selected.sessionId !== target.sessionId || selected.workspaceId !== target.workspaceId) return
            setError(
              reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                ? reason.code
                : 'EXECUTION_FAILED',
            )
          })
        }}
      />
      {error && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(error)}
        </LumenContentText>
      )}
      <LumenFrame
        role="tabpanel"
        id={`${namespace}-content`}
        aria-labelledby={`${namespace}-${panel.panelId}`}
        className="hbar-session-panel-content"
      >
        {children}
      </LumenFrame>
    </LumenFrame>
  )
}
