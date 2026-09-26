import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'
import { HbarMessageBlocks, HbarRuntimeProvider } from '@hbar/app-react'
import type { ImageResourcePort } from '@hbar/app-runtime'
import { projectSessionMessageImages } from '@hbar/app-runtime'
import type { ContentBlock, Message } from '@hbar/contracts'
import { HbarSessionImageLayer } from '../../../packages/app-react/src/session-images'
import type { HbarRuntimeView } from '../../../packages/app-react/src/runtime'
import { projectSessionMessages } from '../../../packages/app-react/src/session-message-model'
import { sessionImagesFixture } from '../../../tests/fixtures/session-images-model-fixture'
import { imageResourceFixtures } from '../../../tests/fixtures/image-resource-fixtures'
import { sessionImageCopy } from '../../../apps/web/src/session-image-copy'
import { getShellCopy } from '../../../apps/web/src/shell-copy'

type Stage = 'orphan' | 'paired' | 'split' | 'merged'
const locale = new URL(location.href).searchParams.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US'
const fixture = sessionImagesFixture()
const source = imageResourceFixtures.find((item) => item.name === 'png')
if (!source) throw new Error('Missing locally generated PNG fixture')
const png = Uint8Array.from(atob(source.base64), (value) => value.charCodeAt(0))
const image = (id: string): ContentBlock => ({
  type: 'image',
  artifact: { id: id.repeat(64), name: `local-${id}.png`, mime: 'image/png', size: png.length },
})
const orphan: ContentBlock = {
  type: 'tool_result',
  callId: 'old-call',
  name: 'fixture_read',
  text: 'Local fixture tool result',
  isError: false,
}
const first = image('a')
const second = image('b')
const message: Message = {
  id: 'image-message',
  sessionId: 'session-a',
  seq: 20,
  runId: 'read-only-fixture',
  role: 'assistant',
  createdAt: 2,
  content: [orphan, first, second],
}
const olderCall: Message = {
  ...message,
  id: 'older-call',
  seq: 10,
  createdAt: 1,
  content: [{ type: 'tool_call', callId: 'old-call', name: 'fixture_read', args: {} }],
}
fixture.timeline.set({ ...fixture.timeline.get(), status: 'ready', messages: [message], cursor: 20 })
const canonical = projectSessionMessageImages({ hostIdentity: 'host', message })
if (!canonical) throw new Error('Missing canonical message images')
const canonicalIdentity = JSON.stringify([canonical.sourceId, canonical.request.items])
const paired = projectSessionMessages([olderCall, message]).find((item) => item.message.id === message.id)
if (!paired) throw new Error('Missing paired message projection')
const stages: Readonly<Record<Stage, readonly ContentBlock[]>> = {
  orphan: message.content,
  paired: paired.blocks,
  split: [
    first,
    { type: 'text', text: 'Inserted host text splits the same canonical image collection into two rendered groups.' },
    second,
  ],
  merged: [{ type: 'text', text: 'The same canonical occurrences are grouped together again.' }, first, second],
}

let commandCalls = 0
let reads = 0
let revoked = 0
let duplicateReleases = 0
let strictSetups = 0
let strictCleanups = 0
let stage: Stage = 'orphan'
let unmounted = false
const live = new Set<string>()
const events: { readonly kind: 'acquire' | 'release'; readonly id: string; readonly purpose: 'thumbnail' | 'full' }[] =
  []
const resources: ImageResourcePort = {
  acquire(ref, options) {
    if (options.signal.aborted) return Promise.reject(new Error('Fixture acquisition cancelled'))
    reads++
    const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }))
    live.add(url)
    events.push({ kind: 'acquire', id: ref.id, purpose: options.purpose })
    let released = false
    return Promise.resolve({
      url,
      width: 4,
      height: 4,
      release() {
        if (released) {
          duplicateReleases++
          return
        }
        released = true
        live.delete(url)
        revoked++
        events.push({ kind: 'release', id: ref.id, purpose: options.purpose })
        URL.revokeObjectURL(url)
      },
    })
  },
}
const view: HbarRuntimeView = {
  ...fixture.view,
  commands: {
    execute: () => {
      commandCalls++
      return Promise.reject(new Error('Commands are forbidden in this read-only fixture'))
    },
  },
  executeText: () => {
    commandCalls++
    return Promise.reject(new Error('Commands are forbidden in this read-only fixture'))
  },
}
let setStage: ((next: Stage) => void) | null = null
const nodeIds = new WeakMap<Element, number>()
let nextNodeId = 0
function nodeId(node: Element): number {
  const known = nodeIds.get(node)
  if (known !== undefined) return known
  const id = ++nextNodeId
  nodeIds.set(node, id)
  return id
}

function snapshot() {
  const latest = projectSessionMessageImages({
    hostIdentity: 'host',
    message: fixture.timeline.get().messages[0] ?? message,
  })
  return {
    stage,
    reads,
    live: live.size,
    revoked,
    duplicateReleases,
    commandCalls,
    strictSetups,
    strictCleanups,
    subscriptions: fixture.counts().subscriptions,
    canonicalUnchanged: JSON.stringify([latest?.sourceId, latest?.request.items]) === canonicalIdentity,
    entries: [...document.querySelectorAll<HTMLElement>('[data-image-occurrence]')].map((node) => {
      const rect = node.getBoundingClientRect()
      const img = node.querySelector('img')
      return {
        key: node.dataset.imageOccurrence ?? '',
        nodeId: nodeId(node),
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        naturalWidth: img?.naturalWidth ?? 0,
        naturalHeight: img?.naturalHeight ?? 0,
        complete: img?.complete ?? false,
      }
    }),
    events: [...events],
  }
}
export type ImageEntrySnapshot = ReturnType<typeof snapshot>
export interface ImageEntryProbe {
  change(stage: Stage): void
  snapshot(): ImageEntrySnapshot
  finish(): void
}
declare global {
  interface Window {
    imageEntryProbe: ImageEntryProbe
  }
}

function Fixture() {
  const [currentStage, update] = useState<Stage>('orphan')
  setStage = update
  stage = currentStage
  useEffect(() => {
    strictSetups++
    return () => {
      strictCleanups++
    }
  }, [])
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: 'light', motion: false }}>
      <section id="fixture-content">
        <p>Actual image-entry components; local synthetic PNG resources; no Host and no Run.</p>
        <HbarRuntimeProvider view={view}>
          <HbarSessionImageLayer options={{ resources, hostIdentity: 'host', labels: sessionImageCopy(locale) }}>
            <HbarMessageBlocks
              sessionId={message.sessionId}
              messageId={message.id}
              blocks={stages[currentStage]}
              labels={getShellCopy(locale).session.messageBlocks}
            />
          </HbarSessionImageLayer>
        </HbarRuntimeProvider>
      </section>
      <footer id="fixture-footer">Scroll away from the actual image entries to verify resource release.</footer>
    </LumenProvider>
  )
}
const container = document.getElementById('root')
if (!container) throw new Error('Missing fixture root')
const root = createRoot(container)
window.imageEntryProbe = {
  change(next) {
    if (!unmounted) setStage?.(next)
  },
  snapshot,
  finish() {
    if (unmounted) return
    unmounted = true
    root.unmount()
    fixture.runtime.dispose()
  },
}
document.documentElement.lang = locale
root.render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
)
