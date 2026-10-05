import { useId, type ReactNode } from 'react'
import { LumenFrame, LumenText } from '@lumen/app-ui'
import type { SidebarTimeGroup, SidebarTimeGroupId } from './sidebar-time-groups'
import './sidebar-time-view.css'

export interface SidebarTimeProject {
  readonly id: string
  readonly label: string
}

export interface SidebarTimeViewProps {
  readonly groups: readonly SidebarTimeGroup[]
  readonly labels: Readonly<Record<SidebarTimeGroupId, string>>
  readonly renderSession: (sessionId: string) => ReactNode
  readonly projectForSession: (sessionId: string) => SidebarTimeProject | null
  readonly renderProject: (project: SidebarTimeProject) => ReactNode
  readonly ariaLabel?: string | undefined
}

/**
 * Date headings annotate the tree; projects remain its first navigation level.
 * The Host bounds/paginates the feed and the sidebar pane owns scrolling.
 */
export function SidebarTimeView({
  groups,
  labels,
  renderSession,
  projectForSession,
  renderProject,
  ariaLabel,
}: SidebarTimeViewProps) {
  const headingPrefix = useId()
  return (
    <LumenFrame
      className="hbar-app-react-sidebar-time-view"
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
    >
      {groups.map((group) => {
        const headingId = `${headingPrefix}-${group.id}`
        const projects = new Map<string, { readonly project: SidebarTimeProject; readonly sessionIds: string[] }>()
        for (const sessionId of new Set(group.sessionIds)) {
          const project = projectForSession(sessionId)
          if (!project) continue
          const current = projects.get(project.id)
          if (current) current.sessionIds.push(sessionId)
          else projects.set(project.id, { project, sessionIds: [sessionId] })
        }
        return (
          <LumenFrame
            as="section"
            className="hbar-app-react-sidebar-time-group"
            key={group.id}
            aria-labelledby={headingId}
          >
            <LumenText as="h2" className="hbar-app-react-sidebar-time-heading" id={headingId}>
              {labels[group.id]}
            </LumenText>
            <LumenFrame className="hbar-app-react-sidebar-time-rows">
              {[...projects.values()].map(({ project, sessionIds }) => (
                <LumenFrame
                  as="section"
                  className="hbar-app-react-sidebar-time-project"
                  data-workspace-id={project.id}
                  data-sidebar-level="project"
                  key={project.id}
                >
                  {renderProject(project)}
                  <LumenFrame
                    className="hbar-app-react-sidebar-time-project-sessions"
                    data-sidebar-level="parent-sessions"
                    role="group"
                    aria-label={project.label}
                  >
                    {sessionIds.map((sessionId) => (
                      <LumenFrame className="hbar-app-react-sidebar-time-row" key={sessionId}>
                        {renderSession(sessionId)}
                      </LumenFrame>
                    ))}
                  </LumenFrame>
                </LumenFrame>
              ))}
            </LumenFrame>
          </LumenFrame>
        )
      })}
    </LumenFrame>
  )
}
