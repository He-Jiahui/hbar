import { createRoot, type Root } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenContentText, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { MessageFileReferenceLink } from '../../packages/app-react/src/message-file-reference'
import type { MessageFileReference } from '../../packages/app-react/src/message-file-reference-model'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface MessageFileFeedbackInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly targetKey: string
  readonly reference: MessageFileReference
}
const createFixture = (input: MessageFileFeedbackInput) => createStore(() => ({ input }))
type FixtureStore = ReturnType<typeof createFixture>
interface PendingOpen {
  readonly targetKey: string
  readonly reference: MessageFileReference
  readonly resolve: () => void
  readonly reject: (reason: unknown) => void
}
let root: Root | undefined
let store: FixtureStore | undefined
const pending: PendingOpen[] = []

declare global {
  interface Window {
    mountMessageFileFeedback(input: MessageFileFeedbackInput): void
    updateMessageFileFeedback(input: MessageFileFeedbackInput): void
    settleMessageFileFeedback(index: number, error?: string): void
    messageFileFeedbackTargets(): readonly { readonly targetKey: string; readonly reference: MessageFileReference }[]
  }
}
function Fixture({ owner }: { readonly owner: FixtureStore }) {
  const { input } = useStore(owner)
  const labels = getShellCopy(input.locale).session.fileReferences
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        aria-label={labels.open(input.reference)}
        style={{ minInlineSize: 0, maxInlineSize: '100%', padding: '1rem', boxSizing: 'border-box', zoom: 1.25 }}
      >
        <LumenContentText context="reading.paragraph">
          <MessageFileReferenceLink
            reference={input.reference}
            context={{
              owner,
              targetKey: input.targetKey,
              labels: { ...labels, opening: labels.opening.repeat(30), error: (code) => labels.error(code).repeat(30) },
              onOpen: (reference) =>
                new Promise<void>((resolve, reject) => {
                  if (pending.length >= 10) return reject(new Error('Owned fixture pending limit'))
                  pending.push({ targetKey: input.targetKey, reference, resolve, reject })
                }),
            }}
          >
            {input.reference.path}
          </MessageFileReferenceLink>
        </LumenContentText>
      </LumenFrame>
    </LumenProvider>
  )
}
window.mountMessageFileFeedback = (input) => {
  root?.unmount()
  for (const request of pending) request.resolve()
  pending.length = 0
  store = createFixture(input)
  root = createRoot(document.getElementById('root') ?? document.body)
  root.render(<Fixture owner={store} />)
}
window.updateMessageFileFeedback = (input) => store?.setState({ input })
window.settleMessageFileFeedback = (index, error) => {
  const request = pending[index]
  if (!request) throw new Error('Missing original owned file request')
  if (error) request.reject({ code: error })
  else request.resolve()
}
window.messageFileFeedbackTargets = () => pending.map(({ targetKey, reference }) => ({ targetKey, reference }))
