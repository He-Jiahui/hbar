import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { HbarSessionExecutionNotice } from '../../packages/app-react/src/session-execution-notice'
import { HbarSessionLiveStatus } from '../../packages/app-react/src/session-live-status'
import { HbarAgentToolOpen } from '../../packages/app-react/src/agent-tool-open'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'
import '../../packages/app-react/src/lumen-session-workspace.css'

export interface SessionFeedbackContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly connected: boolean
  readonly status: 'ready' | 'archived' | 'unverified'
  readonly active: boolean
  readonly owned?: boolean
}
declare global {
  interface Window {
    mountSessionFeedbackContent(input: SessionFeedbackContentInput): void
    updateSessionFeedbackContent(input: SessionFeedbackContentInput): void
    sessionFeedbackArchiveTargets(): readonly string[]
  }
}
const targets: string[] = []
let root: Root | undefined
let owned: ReturnType<typeof createAppRuntime> | undefined
function Fixture({
  input,
  runtime,
}: {
  readonly input: SessionFeedbackContentInput
  readonly runtime: ReturnType<typeof createAppRuntime>['view']
}) {
  const copy = getShellCopy(input.locale).session
  const execution = {
    ...copy.executionAccess,
    archived: copy.executionAccess.archived.repeat(8),
    unverified: copy.executionAccess.unverified.repeat(8),
    opening: copy.executionAccess.opening.repeat(8),
    error: (code: string) => copy.executionAccess.error(code).repeat(8),
  }
  const live = {
    ...copy.liveStatus,
    label: copy.liveStatus.label.repeat(8),
    offline: copy.liveStatus.offline.repeat(8),
    statusLabel: (status: Parameters<typeof copy.liveStatus.statusLabel>[0]) =>
      copy.liveStatus.statusLabel(status).repeat(8),
  }
  const agent = {
    ...copy.agentToolOpen,
    open: copy.agentToolOpen.open.repeat(12),
    opening: copy.agentToolOpen.opening.repeat(12),
    error: (code: string) => copy.agentToolOpen.error(code).repeat(8),
  }
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <HbarRuntimeProvider view={runtime}>
        <LumenFrame
          as="main"
          aria-label={live.label}
          tabIndex={0}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            padding: '.5rem',
            minInlineSize: 0,
            blockSize: 'calc(100dvh / 1.25)',
            boxSizing: 'border-box',
            overflow: 'auto',
          }}
        >
          <HbarSessionExecutionNotice
            status={input.status}
            workspaceName={copy.executionAccess.archived.repeat(200).slice(0, 4000)}
            connected={input.connected}
            labels={execution}
            onOpenArchived={() => {
              targets.push('original-workspace')
              return Promise.reject(new CommandError('CONNECTION_CLOSED', execution.unverified))
            }}
          />
          <HbarSessionLiveStatus
            sessionId="original-session"
            timelineSessionId="original-session"
            owned={input.owned !== false}
            connected={input.connected}
            run={{ id: 'original-run', status: input.active ? 'waiting_approval' : 'completed' }}
            labels={live}
          />
          <HbarAgentToolOpen
            parentSessionId="original-session"
            childSessionId="original-child"
            messageId="original-message"
            callId="original-call"
            sourceTabInstanceKey="original-tab"
            objective={execution.unverified}
            connected={input.connected}
            labels={agent}
          />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>
  )
}
window.mountSessionFeedbackContent = (input) => {
  root?.unmount()
  owned?.dispose()
  targets.splice(0)
  owned = createAppRuntime({
    instanceId: 'owned-feedback',
    hostId: 'owned-feedback-host',
    directory: {
      execute: () =>
        Promise.reject(
          new CommandError('NOT_FOUND', getShellCopy(input.locale).session.agentToolOpen.error('NOT_FOUND')),
        ),
    },
  })
  const element = document.getElementById('session-feedback-content-fixture')
  if (!element) throw new Error('Missing owned feedback fixture')
  root = createRoot(element)
  root.render(<Fixture input={input} runtime={owned.view} />)
}
window.updateSessionFeedbackContent = (input) => {
  if (owned) root?.render(<Fixture input={input} runtime={owned.view} />)
}
window.sessionFeedbackArchiveTargets = () => targets
