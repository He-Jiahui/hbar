import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LumenFrame, LumenProvider } from '@lumen/app-ui'
import { HbarMessageBlocks, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarSessionImageLayer } from '../../packages/app-react/src/session-images'
import { MessageImagePreviewProvider } from '../../packages/app-react/src/message-image-preview-context'
import { SessionToolDetails } from '../../packages/app-react/src/session-tool-details'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { sessionImageCopy } from '../../apps/web/src/session-image-copy'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import '@lumen/app-ui/styles.css'
import './message-image-preview-browser.css'

export interface ImagePreviewFixtureInput {
  readonly text: string
  readonly locale: ShellLocale
  readonly mode?: 'markdown' | 'literal' | 'tool' | 'legacy'
  readonly legacyData?: string
  readonly streaming?: boolean
  readonly longLabels?: boolean
}
declare global {
  interface Window {
    imagePreviewFixture: {
      render(input: ImagePreviewFixtureInput): void
      readonly writes: string[]
      readonly resourceReads: () => number
    }
  }
}
const container = document.getElementById('root')
if (!container) throw new Error('Missing image preview fixture root')
const root = createRoot(container)
const writes: string[] = []
let resourceReads = 0
const runtime = createAppRuntime({
  instanceId: 'legacy-images-fixture',
  hostId: 'fixture-host',
  directory: { execute: async () => ({ items: [], nextCursor: null }) },
})
window.addEventListener('pagehide', () => runtime.dispose())

function LegacyImageFixture({ input }: { readonly input: ImagePreviewFixtureInput }) {
  return (
    <HbarRuntimeProvider view={runtime.view}>
      <HbarSessionImageLayer
        options={{
          hostIdentity: 'fixture-host',
          labels: sessionImageCopy(input.locale),
          resources: {
            acquire: async () => {
              resourceReads++
              throw new Error('Legacy bytes must not read artifacts')
            },
          },
        }}
      >
        <SessionToolDetails
          sessionId="session"
          messageId="message"
          labels={getShellCopy(input.locale).session.messageBlocks}
          row={{
            kind: 'tool',
            id: 'legacy',
            name: 'computer_screenshot',
            result: {
              type: 'tool_result',
              callId: 'legacy',
              name: 'computer_screenshot',
              text: input.text,
              isError: false,
              details: { data: input.legacyData, mime: 'image/png', width: 480, height: 240 },
            },
          }}
        />
      </HbarSessionImageLayer>
    </HbarRuntimeProvider>
  )
}
function Fixture({ input }: { readonly input: ImagePreviewFixtureInput }) {
  const copy = getShellCopy(input.locale)
  const images = sessionImageCopy(input.locale)
  return (
    <LumenProvider appearance={createWebLumenAppearance('light', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <MessageImagePreviewProvider
        labels={{
          loading: images.loading,
          failed: input.longLabels ? images.error('READ_FAILED').repeat(8) : images.error('READ_FAILED'),
          retry: input.longLabels ? images.retry.repeat(8) : images.retry,
          open: images.open,
        }}
      >
        <LumenFrame as="main" className="image-preview-fixture">
          {input.mode === 'legacy' ? (
            <LegacyImageFixture input={input} />
          ) : input.mode === 'tool' ? (
            <SessionToolDetails
              sessionId="session"
              messageId="message"
              row={{
                kind: 'tool',
                id: 'original',
                name: 'image_links',
                result: {
                  type: 'tool_result',
                  callId: 'original',
                  name: 'image_links',
                  text: input.text,
                  isError: false,
                },
              }}
              labels={copy.session.messageBlocks}
              clipboard={{
                writeText: async (text) => {
                  writes.push(text)
                },
              }}
            />
          ) : (
            <HbarMessageBlocks
              sessionId="session"
              messageId="message"
              blocks={[{ type: 'text', text: input.text }]}
              labels={copy.session.messageBlocks}
              textFormat={input.mode === 'literal' ? 'literal' : 'markdown'}
              streaming={input.streaming ?? false}
            />
          )}
        </LumenFrame>
      </MessageImagePreviewProvider>
    </LumenProvider>
  )
}
window.imagePreviewFixture = {
  writes,
  resourceReads: () => resourceReads,
  render(input) {
    document.documentElement.lang = input.locale
    flushSync(() =>
      root.render(
        <StrictMode>
          <Fixture input={input} />
        </StrictMode>,
      ),
    )
  },
}
window.imagePreviewFixture.render({ text: '', locale: 'zh-CN' })
