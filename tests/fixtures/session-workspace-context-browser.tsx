import { createRoot, type Root } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenContentText, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { workspaceSchema } from '@hbar/contracts/directory'
import { gitInfoSchema } from '@hbar/contracts'
import {
  HbarSessionWorkspaceContext,
  type HbarSessionWorkspaceContextContent,
} from '../../packages/app-react/src/session-workspace-context'
import { sessionContextCopy } from '../../apps/web/src/session-context-copy'
import '@lumen/app-ui/styles.css'
import '../../packages/app-react/src/session-project-context.css'

export interface SessionWorkspaceContextInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly name: string
  readonly branch: string
  readonly sessionId: string
  readonly workspaceId: string
  readonly scene: 'ready' | 'loading' | 'error' | 'offline' | 'stale' | 'empty' | 'launch'
}
const createFixture = (input: SessionWorkspaceContextInput) => createStore(() => ({ input }))
type FixtureStore = ReturnType<typeof createFixture>
let root: Root | undefined
let store: FixtureStore | undefined
const targets: { readonly sessionId: string; readonly workspaceId: string }[] = []
declare global {
  interface Window {
    mountSessionWorkspaceContext(input: SessionWorkspaceContextInput): void
    updateSessionWorkspaceContext(input: SessionWorkspaceContextInput): void
    canRenderSessionWorkspaceName(name: string): boolean
    sessionWorkspaceContextTargets(): readonly { readonly sessionId: string; readonly workspaceId: string }[]
  }
}
function Fixture({ owner }: { readonly owner: FixtureStore }) {
  const { input } = useStore(owner)
  const base = sessionContextCopy(input.locale)
  const labels = {
    ...base,
    retry: base.retry.repeat(30),
    loading: base.loading.repeat(30),
    disconnected: base.disconnected.repeat(30),
    unavailable: (code: string) => base.unavailable(code).repeat(30),
  }
  const content: HbarSessionWorkspaceContextContent =
    input.scene === 'empty'
      ? { kind: 'empty' }
      : input.scene === 'launch'
        ? { kind: 'launch', slot: <LumenContentText context="workspace.context">{input.name}</LumenContentText> }
        : {
            kind: 'project',
            props: {
              workspaceName: input.name,
              workspacePath: 'D:/owned/project',
              sessionId: input.sessionId,
              workspaceId: input.workspaceId,
              connected: input.scene !== 'offline',
              context: {
                sessionId: input.scene === 'stale' ? 'another-session' : input.sessionId,
                workspaceId: input.workspaceId,
                status: input.scene === 'loading' ? 'loading' : input.scene === 'error' ? 'error' : 'ready',
                branch: input.branch,
                error: input.scene === 'error' ? 'GIT_TIMEOUT' : null,
              },
              labels,
              onRetry: () => {
                targets.push({ sessionId: input.sessionId, workspaceId: input.workspaceId })
                owner.setState({ input: { ...input, scene: 'ready' } })
              },
            },
          }
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        aria-label={base.project(input.name)}
        style={{
          minInlineSize: 0,
          maxInlineSize: '100%',
          blockSize: 'calc(100dvh / 1.25)',
          overflowY: 'auto',
          boxSizing: 'border-box',
          padding: '1rem',
          containerType: 'inline-size',
          containerName: 'session-project-context',
          zoom: 1.25,
        }}
      >
        <HbarSessionWorkspaceContext placement="toolbar" content={content} />
        <HbarSessionWorkspaceContext placement="below" content={content} />
      </LumenFrame>
    </LumenProvider>
  )
}
function validate(input: SessionWorkspaceContextInput) {
  workspaceSchema.shape.name.parse(input.name)
  gitInfoSchema.parse({ sha: null, originUrl: null, branch: input.branch })
}
window.mountSessionWorkspaceContext = (input) => {
  validate(input)
  root?.unmount()
  targets.length = 0
  store = createFixture(input)
  root = createRoot(document.getElementById('root') ?? document.body)
  root.render(<Fixture owner={store} />)
}
window.updateSessionWorkspaceContext = (input) => {
  validate(input)
  store?.setState({ input })
}
window.canRenderSessionWorkspaceName = (name) => workspaceSchema.shape.name.safeParse(name).success
window.sessionWorkspaceContextTargets = () => targets
