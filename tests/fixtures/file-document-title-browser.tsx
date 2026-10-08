import { createRoot, type Root } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenContentText, LumenFileDocument, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { workspaceFileEntrySchema } from '@hbar/contracts/commands/files'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface FileDocumentTitleInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly name: string
  readonly path: string
  readonly body: string
  readonly scene: 'ready' | 'loading' | 'error' | 'unavailable'
}
const createFixture = (input: FileDocumentTitleInput) => createStore(() => ({ input }))
type FixtureStore = ReturnType<typeof createFixture>
let root: Root | undefined
let store: FixtureStore | undefined
const actions: { readonly kind: 'refresh'; readonly path: string }[] = []
function Fixture({ owner }: { readonly owner: FixtureStore }) {
  const { input } = useStore(owner)
  const labels = getShellCopy(input.locale).files
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        style={{
          display: 'flex',
          minInlineSize: 0,
          maxInlineSize: '100%',
          blockSize: 'calc(100dvh / 1.25)',
          overflow: 'hidden',
          zoom: 1.25,
        }}
      >
        <LumenFileDocument
          name={input.name}
          path={input.path}
          labels={labels}
          loading={input.scene === 'loading'}
          retainContentWhileLoading
          contentAvailable={input.scene !== 'unavailable'}
          error={input.scene === 'error' || input.scene === 'unavailable' ? labels.error('FILE_NOT_FOUND') : undefined}
          onRetry={() => {
            actions.push({ kind: 'refresh', path: input.path })
            owner.setState({ input: { ...input, scene: 'ready' } })
          }}
        >
          <LumenContentText context="reading.paragraph">{input.body}</LumenContentText>
        </LumenFileDocument>
      </LumenFrame>
    </LumenProvider>
  )
}
declare global {
  interface Window {
    mountFileDocumentTitle(input: FileDocumentTitleInput): void
    updateFileDocumentTitle(input: FileDocumentTitleInput): void
    fileDocumentTitleActions(): readonly { readonly kind: 'refresh'; readonly path: string }[]
    canRenderFileDocumentName(name: string): boolean
  }
}
window.mountFileDocumentTitle = (input) => {
  workspaceFileEntrySchema.parse({ name: input.name, path: input.path, directory: false })
  root?.unmount()
  actions.length = 0
  store = createFixture(input)
  root = createRoot(document.getElementById('root') ?? document.body)
  root.render(<Fixture owner={store} />)
}
window.updateFileDocumentTitle = (input) => {
  workspaceFileEntrySchema.parse({ name: input.name, path: input.path, directory: false })
  store?.setState({ input })
}
window.fileDocumentTitleActions = () => actions
window.canRenderFileDocumentName = (name) => workspaceFileEntrySchema.shape.name.safeParse(name).success
