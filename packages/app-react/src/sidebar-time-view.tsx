import { useId, type ReactNode } from 'react'
import { LumenFrame, LumenText } from '@lumen/app-ui'
import type { SidebarTimeGroup, SidebarTimeGroupId } from './sidebar-time-groups'
import './sidebar-time-view.css'

export interface SidebarTimeViewProps {
  readonly groups: readonly SidebarTimeGroup[]
  readonly labels: Readonly<Record<SidebarTimeGroupId, string>>
  readonly renderSession: (sessionId: string) => ReactNode
  readonly ariaLabel?: string | undefined
}

/**
 * Renders Host-bounded time groups in normal flow. Its caller's sidebar pane
 * remains the only scroll owner; this view does not add a nested scroll region.
 */
export function SidebarTimeView({ groups, labels, renderSession, ariaLabel }: SidebarTimeViewProps) {
  const headingPrefix = useId()
  return (
    <LumenFrame className="hbar-app-react-sidebar-time-view" role={ariaLabel ? 'region' : undefined} aria-label={ariaLabel}>
      {groups.map((group) => {
        const headingId = `${headingPrefix}-${group.id}`
        return (
          <LumenFrame as="section" className="hbar-app-react-sidebar-time-group" key={group.id} aria-labelledby={headingId}>
            <LumenText as="h2" className="hbar-app-react-sidebar-time-heading" id={headingId}>
              {labels[group.id]}
            </LumenText>
            <LumenFrame className="hbar-app-react-sidebar-time-rows">
              {group.sessionIds.map((sessionId) => (
                <LumenFrame className="hbar-app-react-sidebar-time-row" key={sessionId}>
                  {renderSession(sessionId)}
                </LumenFrame>
              ))}
            </LumenFrame>
          </LumenFrame>
        )
      })}
    </LumenFrame>
  )
}
