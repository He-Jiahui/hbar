import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenProvider, LumenButton } from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'
import { createMessageResources, type MessageResourcePort } from '@hbar/app-runtime'
import { HbarMessageResourceLayer } from '../../packages/app-react/src/message-resource'
import { MessageMarkdown } from '../../packages/app-react/src/message-markdown'
import type { ResourceCandidate } from '@hbar/contracts/resources'
import { resourceCopy } from '../../apps/web/src/resource-copy'
import { acquireResourceImage } from '../../apps/web/src/resource-image'
import { decodeResourceImage } from './resource-image-verifier'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'

const locale = new URL(location.href).searchParams.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US'
const labels = resourceCopy(locale)
const content =
  '`src/main.ts:12` · `same.ts` · `photo.png` · `missing.ts` · `C:\\My Project\\notes.txt` · `https://example.test/page`\n\n`HbarPromptComposer` and `console.log`\n\n```ts\nsrc/main.ts:12\n```'
const source = { workspaceId: 'fixture-w', sessionId: 'fixture-s', messageId: 'fixture-m', sourceTabInstanceKey: null }
declare global {
  interface Window {
    resourceImageFixture: (input: { base64: string; mime: string }) => Promise<{ width: number; height: number }>
  }
}
window.resourceImageFixture = decodeResourceImage
function App() {
  const [opened, setOpened] = useState('')
  const [model] = useState(() => {
    const port: MessageResourcePort = {
      owns: () => true,
      target: () => Promise.resolve({ sessionId: source.sessionId, expectedRevision: 0 }),
      resolve: (input) => {
        const path = input.reference.kind === 'file' ? input.reference.path : input.reference.url
        const count = path === 'missing.ts' ? 0 : path === 'same.ts' ? 100 : 1
        const candidates: ResourceCandidate[] = Array.from({ length: count }, (_, index) => ({
          id: String(index + 1).padStart(64, '0'),
          kind: path === 'photo.png' ? 'image' : path.startsWith('http') ? 'web' : 'file',
          name: path,
          location: `/workspace/${'long-translated-directory/'.repeat(8)}${index}/${path}`,
          directory: '/workspace',
          workspacePath: path.startsWith('C:') ? null : `${index}/${path}`,
          mime: null,
          size: 20,
        }))
        return Promise.resolve({ candidates, truncated: false })
      },
      text: (input) =>
        Promise.resolve({
          candidate: {
            id: input.candidateId,
            name: 'notes.txt',
            kind: 'file',
            location: 'C:/My Project/notes.txt',
            directory: 'C:/My Project',
            workspacePath: null,
            mime: null,
            size: 20,
          },
          text: 'Read-only external file',
        }),
      media: async (_input, signal) =>
        acquireResourceImage(await (await fetch('/media.svg', { signal })).blob(), signal),
      defaultMode: () => Promise.resolve('internal'),
      openSystem: (candidate) => {
        setOpened(`system:${candidate.name}`)
        return Promise.resolve()
      },
      openBrowser: (candidate) => {
        setOpened(`browser:${candidate.name}`)
        return Promise.resolve()
      },
    }
    return createMessageResources(port)
  })
  const fileReferences = {
    owner: model,
    targetKey: 'fixture',
    source,
    labels: { open: (ref: { path: string }) => ref.path, opening: labels.opening, error: labels.error },
    onOpen: (ref: { path: string; line?: number }) => {
      setOpened(`${ref.path}:${ref.line ?? ''}`)
      return Promise.resolve()
    },
  }
  return (
    <LumenProvider appearance={createWebLumenAppearance('dark', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <HbarMessageResourceLayer model={model} labels={labels}>
        <main>
          <MessageMarkdown text={content} fileReferences={fileReferences} />
          <output data-opened>{opened}</output>
          <LumenButton onClick={model.close}>{labels.close}</LumenButton>
        </main>
      </HbarMessageResourceLayer>
    </LumenProvider>
  )
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing fixture root')
createRoot(root).render(<App />)
