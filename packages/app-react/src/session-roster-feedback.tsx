import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import type { SessionRosterRefreshEntry } from '@hbar/app-runtime'

export interface SessionRosterRefreshLabels {
  readonly refreshExpanded: string
  readonly refreshWorkspace: (name: string) => string
  readonly refreshing: string
  readonly refreshed: string
  readonly remaining: (count: number) => string
  readonly limited: string
  readonly capacity: (count: number) => string
  readonly failure: (code: string) => string
  readonly retry: string
}

export function SessionRosterFeedback({
  entry,
  labels,
  connected,
  onRefresh,
}: {
  readonly entry: SessionRosterRefreshEntry | undefined
  readonly labels: SessionRosterRefreshLabels
  readonly connected: boolean
  readonly onRefresh: () => void
}) {
  if (
    !entry ||
    entry.status === 'idle' ||
    (entry.status === 'ready' &&
      entry.mode === 'automatic' &&
      entry.remaining === 0 &&
      !entry.truncated &&
      entry.skipped === 0)
  )
    return null
  return (
    <LumenFrame className="hbar-app-react-roster-feedback" data-roster-workspace-id={entry.workspaceId}>
      <LumenContentText
        context="feedback.message"
        role={entry.status === 'error' ? 'alert' : 'status'}
        tone={entry.status === 'error' ? 'danger' : 'muted'}
      >
        {entry.status === 'loading'
          ? labels.refreshing
          : entry.status === 'error'
            ? labels.failure(entry.error ?? 'EXECUTION_FAILED')
            : entry.skipped > 0
              ? labels.capacity(entry.skipped)
              : entry.truncated
                ? labels.limited
                : entry.remaining > 0
                  ? labels.remaining(entry.remaining)
                  : labels.refreshed}
      </LumenContentText>
      {entry.status === 'error' && (
        <LumenButton size="s" variant="text" disabled={!connected} onClick={onRefresh}>
          {labels.retry}
        </LumenButton>
      )}
    </LumenFrame>
  )
}
