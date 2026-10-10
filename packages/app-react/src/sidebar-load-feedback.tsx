import type { ReactNode } from 'react'
import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import type {
  DirectoryState,
  SessionAgentTreeState,
  SessionRosterRefreshState,
  WorkspaceActivityState,
} from '@hbar/app-runtime'
import { SessionRosterFeedback, type SessionRosterRefreshLabels } from './session-roster-feedback'
import type { SessionAgentTreeLabels } from './session-agent-branch'

interface Props {
  readonly workspaceIds: readonly string[]
  readonly workspaceName: (workspaceId: string) => string
  readonly activity: WorkspaceActivityState
  readonly roster: SessionRosterRefreshState
  readonly agents: SessionAgentTreeState
  readonly directory: DirectoryState
  readonly timeView: boolean
  readonly connected: boolean
  readonly labels: {
    readonly error: (code: string) => string
    readonly refresh: string
    readonly roster: SessionRosterRefreshLabels
    readonly agents: SessionAgentTreeLabels
  }
  readonly onRefreshRoster: (workspaceId: string) => void
  readonly onRefreshSessions: (workspaceId: string) => void
  readonly onRefreshAgents: (parentSessionId: string) => void
  readonly children?: ReactNode
}

/** Read failures share the sidebar's scroll owner and never become tree descendants. */
export function SidebarLoadFeedback(props: Props) {
  const visibleWorkspaces = new Set(props.workspaceIds)
  const failedBranches = Object.entries(props.agents.branches).flatMap(([parentSessionId, branch]) => {
    const session = props.directory.sessions[parentSessionId]
    return branch.error && session && !session.archived && visibleWorkspaces.has(session.workspaceId)
      ? [{ session, branch }]
      : []
  })
  return (
    <LumenFrame className="hbar-app-react-sidebar-load-feedback" data-sidebar-load-feedback="true">
      {props.children}
      {!props.timeView &&
        props.workspaceIds.map((workspaceId) => {
          const roster = props.roster.entries[workspaceId]
          const page = props.activity.sessions[workspaceId]
          if (roster?.status !== 'error' && !page?.error) return null
          return (
            <LumenFrame
              key={workspaceId}
              className="hbar-app-react-sidebar-load-feedback-group"
              data-sidebar-feedback-workspace-id={workspaceId}
            >
              <LumenContentText context="record.title" size="s">
                {props.workspaceName(workspaceId)}
              </LumenContentText>
              {roster?.status === 'error' && (
                <SessionRosterFeedback
                  entry={roster}
                  labels={props.labels.roster}
                  connected={props.connected}
                  onRefresh={() => props.onRefreshRoster(workspaceId)}
                />
              )}
              {page?.error && (
                <LumenFrame className="hbar-app-react-organization-feedback" role="alert">
                  <LumenContentText context="section.description">{props.labels.error(page.error)}</LumenContentText>
                  <LumenButton
                    size="s"
                    variant="outlined"
                    disabled={!props.connected || page.status === 'loading'}
                    onClick={() => props.onRefreshSessions(workspaceId)}
                  >
                    {props.labels.refresh}
                  </LumenButton>
                </LumenFrame>
              )}
            </LumenFrame>
          )
        })}
      {failedBranches.map(({ session, branch }) => (
        <LumenFrame
          key={session.id}
          className="hbar-app-react-sidebar-load-feedback-group"
          data-agent-feedback-session-id={session.id}
        >
          <LumenContentText context="record.title" size="s">
            {props.labels.agents.children(session.title)}
          </LumenContentText>
          <LumenFrame className="hbar-app-react-organization-feedback" role="alert">
            <LumenContentText context="section.description">
              {props.labels.agents.error(branch.error ?? 'QUERY_FAILED')}
            </LumenContentText>
            <LumenButton
              size="s"
              variant="outlined"
              disabled={!props.connected || branch.status === 'loading'}
              onClick={() => props.onRefreshAgents(session.id)}
            >
              {props.labels.agents.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      ))}
    </LumenFrame>
  )
}
