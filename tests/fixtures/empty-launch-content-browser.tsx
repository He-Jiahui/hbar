import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { preSessionDraftStateSchema, type PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import { HbarSessionEmptyHero } from '../../packages/app-react/src/session-empty-hero'
import { HbarPreSessionLaunchStatus } from '../../packages/app-react/src/pre-session-launch-status'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { preSessionLaunchCopy } from '../../apps/web/src/pre-session-launch-copy'
import '@lumen/app-ui/styles.css'
import '../../packages/app-react/src/lumen-session-workspace.css'

export interface EmptyLaunchContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly phase: PreSessionDraftState['phase']
  readonly connected: boolean
  readonly primary?: boolean
}
declare global {
  interface Window {
    mountEmptyLaunchContent(input: EmptyLaunchContentInput): void
    updateEmptyLaunchContent(input: EmptyLaunchContentInput): void
  }
}
let root: Root | undefined
let runtime: ReturnType<typeof createAppRuntime> | undefined
function Fixture({
  input,
  view,
}: {
  readonly input: EmptyLaunchContentInput
  readonly view: ReturnType<typeof createAppRuntime>['view']
}) {
  const base = getShellCopy(input.locale).session.emptyHero
  const original = preSessionLaunchCopy(input.locale).status
  const labels = {
    ...original,
    preparing: original.preparing.repeat(8),
    unknown: original.unknown.repeat(8),
    actions: original.actions.repeat(8),
    cancelled: original.cancelled.repeat(8),
    check: original.check.repeat(12),
    cancel: original.cancel.repeat(12),
    dismiss: original.dismiss.repeat(12),
    error: (code: string) => original.error(code).repeat(8),
  }
  // Immutable presentation DTOs exercise text states. The original-entry
  // recovery below uses a real Runtime and rejects this absent draft; actual
  // preparation/receipt lifetimes are covered by the Host and Runtime suites.
  const draft = preSessionDraftStateSchema.parse({
    draftId: '12345678-1234-4234-8234-123456789012',
    workspaceId: 'original-workspace',
    text: 'Original unsent draft',
    launchSelection: { mode: 'shared-current' },
    modelId: null,
    thinkingLevel: null,
    approvalChoice: 'inherit',
    planMode: 'default',
    intent: 'default',
    revision: 3,
    phase: input.phase,
    unknownStage: null,
    error: input.phase === 'failed' ? 'CONNECTION_CLOSED' : null,
    sessionId: 'original-session',
    capturedWorkspaceId: 'original-workspace',
    capturedRevision: 3,
    capturedLaunchSelection: { mode: 'shared-current' },
    operationId: null,
    accepted: null,
    launchPreparation: null,
  })
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <HbarRuntimeProvider view={view}>
        <LumenFrame
          as="main"
          aria-label={original.actions}
          tabIndex={0}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minInlineSize: 0,
            padding: '.5rem',
            gap: '1rem',
            boxSizing: 'border-box',
            blockSize: 'calc(100dvh / 1.25)',
            overflow: 'auto',
          }}
        >
          <HbarSessionEmptyHero
            headingAs={input.primary ? 'h1' : 'h2'}
            labels={{ ...base, title: base.title.repeat(8), description: base.description.repeat(40) }}
          />
          <HbarPreSessionLaunchStatus draft={draft} labels={labels} connected={input.connected} />
        </LumenFrame>
      </HbarRuntimeProvider>
    </LumenProvider>
  )
}
window.mountEmptyLaunchContent = (input) => {
  root?.unmount()
  runtime?.dispose()
  runtime = createAppRuntime({
    instanceId: 'owned-empty-launch',
    hostId: 'owned-empty-launch-host',
    directory: {
      execute: () => Promise.reject(new Error('No directory request is expected in the presentation fixture')),
    },
  })
  const node = document.getElementById('empty-launch-content-fixture')
  if (!node) throw new Error('Missing owned empty/launch mount')
  root = createRoot(node)
  root.render(<Fixture input={input} view={runtime.view} />)
}
window.updateEmptyLaunchContent = (input) => {
  if (runtime) root?.render(<Fixture input={input} view={runtime.view} />)
}
