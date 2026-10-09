import { createStore } from 'zustand/vanilla'
import { CommandError } from '@hbar/commands'
import type { ResourceReference, ResourceCandidate } from '@hbar/contracts/resources'
import type { ResourceResolveInput, ResourceReadInput } from '@hbar/contracts/commands/resources'

export interface ResourceReferenceSource {
  readonly workspaceId: string
  readonly sessionId: string
  readonly messageId: string
  readonly sourceTabInstanceKey: string | null
}
export type ResourceOpenMode = 'internal' | 'system'
export interface MessageResourcePort {
  target(source: ResourceReferenceSource, signal: AbortSignal): Promise<ResourceResolveInput['sessionTarget']>
  resolve(
    input: ResourceResolveInput,
    signal: AbortSignal,
  ): Promise<{ candidates: ResourceCandidate[]; truncated: boolean }>
  text(input: ResourceReadInput, signal: AbortSignal): Promise<{ candidate: ResourceCandidate; text: string }>
  media(input: ResourceReadInput, signal: AbortSignal): Promise<{ url: string; release(): void }>
  defaultMode(kind: 'web' | 'file', signal: AbortSignal): Promise<ResourceOpenMode>
  openSystem(candidate: ResourceCandidate, signal: AbortSignal): Promise<void>
  openBrowser(candidate: ResourceCandidate, source: ResourceReferenceSource, signal: AbortSignal): Promise<void>
  owns(source: ResourceReferenceSource): boolean
}
export interface MessageResourceState {
  readonly chooser: {
    candidates: readonly ResourceCandidate[]
    truncated: boolean
    busy: boolean
    error: string | null
  } | null
  readonly image: {
    candidate: ResourceCandidate
    status: 'loading' | 'ready' | 'failed'
    url: string | null
    error: string | null
  } | null
  readonly text: { candidate: ResourceCandidate; text: string } | null
}
interface Intent {
  readonly input: ResourceResolveInput
  readonly source: ResourceReferenceSource
  readonly mode: ResourceOpenMode | undefined
  readonly openFile: (reference: { path: string; line?: number; column?: number }) => Promise<void>
  readonly controller: AbortController
}
const errorCode = (error: unknown): string =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'READ_FAILED'

/** One source-owned transient workflow; resource bytes and closures are never persisted. */
export function createMessageResources(port: MessageResourcePort) {
  const store = createStore<MessageResourceState>(() => ({ chooser: null, image: null, text: null }))
  let current: Intent | null = null
  let preparing: AbortController | null = null
  let lease: { release(): void } | null = null
  const fence = (intent: Intent) => {
    intent.controller.signal.throwIfAborted()
    if (current !== intent || !port.owns(intent.source))
      throw new CommandError('TARGET_CHANGED', 'Resource source changed')
  }
  const close = () => {
    preparing?.abort()
    preparing = null
    current?.controller.abort()
    current = null
    lease?.release()
    lease = null
    store.setState({ chooser: null, image: null, text: null })
  }
  const openCandidate = async (intent: Intent, candidate: ResourceCandidate): Promise<void> => {
    fence(intent)
    const signal = intent.controller.signal
    const fresh = await port.resolve(intent.input, signal)
    fence(intent)
    const confirmed = fresh.candidates.find((item) => item.id === candidate.id)
    if (!confirmed) throw new CommandError('STALE_TARGET', 'Resource disappeared')
    const input: ResourceReadInput = { ...intent.input, candidateId: confirmed.id }
    const kind = intent.input.reference.kind === 'web' ? 'web' : 'file'
    const mode = intent.mode ?? (confirmed.kind === 'image' ? 'internal' : await port.defaultMode(kind, signal))
    fence(intent)
    if (mode === 'system') {
      await port.openSystem(confirmed, signal)
      fence(intent)
      store.setState({ chooser: null })
      return
    }
    if (confirmed.kind === 'web') {
      await port.openBrowser(confirmed, intent.source, signal)
      store.setState({ chooser: null })
      return
    }
    if (confirmed.kind === 'image') {
      lease?.release()
      lease = null
      store.setState({
        chooser: null,
        image: { candidate: confirmed, status: 'loading', url: null, error: null },
        text: null,
      })
      try {
        const media = await port.media(input, signal)
        if (current !== intent || !port.owns(intent.source) || signal.aborted) {
          media.release()
          return
        }
        lease = media
        store.setState({ image: { candidate: confirmed, status: 'ready', url: media.url, error: null } })
      } catch (error) {
        if (current !== intent || signal.aborted) return
        store.setState({ image: { candidate: confirmed, status: 'failed', url: null, error: errorCode(error) } })
      }
      return
    }
    if (confirmed.workspacePath && intent.input.reference.kind === 'file') {
      const ref = intent.input.reference
      await intent.openFile({
        path: confirmed.workspacePath,
        ...(ref.line === undefined ? {} : { line: ref.line }),
        ...(ref.column === undefined ? {} : { column: ref.column }),
      })
      fence(intent)
      store.setState({ chooser: null })
    } else {
      const result = await port.text(input, signal)
      fence(intent)
      store.setState({ chooser: null, text: result, image: null })
    }
  }
  const select = async (id: string) => {
    const intent = current
    const chooser = store.getState().chooser
    const candidate = chooser?.candidates.find((item) => item.id === id)
    if (!intent || !chooser || chooser.busy || !candidate) return
    store.setState({ chooser: { ...chooser, busy: true, error: null } })
    try {
      await openCandidate(intent, candidate)
    } catch (error) {
      if (current === intent && !intent.controller.signal.aborted)
        store.setState({ chooser: { ...chooser, busy: false, error: errorCode(error) } })
    }
  }
  return {
    store,
    close,
    async open(
      source: ResourceReferenceSource,
      reference: ResourceReference,
      openFile: Intent['openFile'],
      mode?: ResourceOpenMode,
    ) {
      close()
      if (!port.owns(source)) throw new CommandError('TARGET_CHANGED', 'Resource source changed')
      const controller = new AbortController()
      preparing = controller
      const target = await port.target(source, controller.signal)
      controller.signal.throwIfAborted()
      if (!port.owns(source)) throw new CommandError('TARGET_CHANGED', 'Resource source changed')
      const intent: Intent = {
        source,
        input: { workspaceId: source.workspaceId, sessionTarget: target, reference },
        controller,
        openFile,
        mode,
      }
      current = intent
      preparing = null
      const result = await port.resolve(intent.input, controller.signal)
      fence(intent)
      if (!result.candidates.length) throw new CommandError('NOT_FOUND', 'No resource matched this reference')
      if (result.candidates.length > 1 || result.truncated)
        store.setState({ chooser: { ...result, busy: false, error: null } })
      else await openCandidate(intent, result.candidates[0]!)
    },
    select,
    retryImage() {
      const intent = current
      const image = store.getState().image
      if (!intent || !image) return
      void openCandidate(intent, image.candidate).catch((error: unknown) => {
        if (current === intent) store.setState({ image: { ...image, status: 'failed', error: errorCode(error) } })
      })
    },
    imageFailed() {
      const image = store.getState().image
      if (image) {
        lease?.release()
        lease = null
        store.setState({ image: { ...image, status: 'failed', url: null, error: 'DECODE_FAILED' } })
      }
    },
    invalidate() {
      if (current && !port.owns(current.source)) close()
    },
  }
}
export type MessageResources = ReturnType<typeof createMessageResources>
