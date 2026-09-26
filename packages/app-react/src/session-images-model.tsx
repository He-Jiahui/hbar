import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import {
  createImageViewer,
  createImageThumbnails,
  isSessionImageRequestCurrent,
  projectSessionDraftImages,
  projectSessionMessageImages,
  type ImageResourcePort,
  type ImageViewerState,
  type ImageViewerRequest,
  type ImageThumbnailState,
  type ImageThumbnailsState,
  type SessionImageProjection,
  type StateReader,
} from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState, type HbarRuntimeView } from './runtime'

const closed: ImageViewerState = Object.freeze({ status: 'closed', request: null, resource: null, error: null })
const inactive: ImageThumbnailsState = Object.freeze({ active: false, sourceId: null, items: Object.freeze([]) })
function constantReader<Value>(value: Value): StateReader<Value> {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}

/** No subscriptions or side effects until retain. A StrictMode cleanup/setup pair shares the live scope. */
function lifetime(start: () => () => void, finish: () => void) {
  let references = 0
  let generation = 0
  let disposed = false
  let stop: (() => void) | null = null
  return {
    live: () => !disposed && references > 0,
    retain() {
      if (disposed) return () => {}
      generation++
      references++
      if (references === 1) stop = start()
      let released = false
      return () => {
        if (released) return
        released = true
        references--
        if (references !== 0) return
        stop?.()
        stop = null
        const expected = ++generation
        queueMicrotask(() => {
          if (references !== 0 || generation !== expected || disposed) return
          disposed = true
          finish()
        })
      }
    },
  }
}

interface ThumbnailModel {
  readonly reader: StateReader<ImageThumbnailsState>
  retain(): () => void
  update(projection: SessionImageProjection | null, visible: boolean, gallery: boolean): void
  reconcile(): void
  retry(key: string): boolean
  report(sourceId: string, expected: ImageThumbnailState): void
}

/** Pure construction seam for lifecycle tests; React owns retain/release, never the render phase. */
export function createSessionImagesModelScope(
  runtime: HbarRuntimeView,
  resources: ImageResourcePort | undefined,
  hostIdentity: string | null,
) {
  const available = resources !== undefined && hostIdentity !== null && hostIdentity.length > 0
  const thumbnails = new Set<ThumbnailModel>()
  let projection: SessionImageProjection | null = null
  const membership = () => {
    const sessionId = runtime.state.navigation.getSnapshot().sessionId
    return {
      activeSessionId: sessionId,
      draft: sessionId ? runtime.state.drafts.getSnapshot()[sessionId] : null,
      timeline: runtime.state.timeline.getSnapshot(),
    }
  }
  const current = (request: ImageViewerRequest) =>
    scopeLife.live() && isSessionImageRequestCurrent(request, membership())
  const gallery = available && resources ? createImageViewer({ resources, isCurrent: current }) : null
  const reader = gallery?.reader ?? constantReader(closed)
  const canonical = (target: SessionImageProjection): SessionImageProjection | null => {
    if (!available || !hostIdentity || !scopeLife.live()) return null
    const facts = membership()
    const source = target.request.source
    if (facts.activeSessionId !== source.sessionId) return null
    try {
      let next: SessionImageProjection | null
      if (source.kind === 'draft') {
        if (!facts.draft || source.draftRevision > facts.draft.revision) return null
        next = projectSessionDraftImages({ hostIdentity, draft: facts.draft })
      } else {
        const matches = facts.timeline.messages.filter(
          (message) =>
            message.id === source.messageId &&
            message.seq === source.messageSeq &&
            message.sessionId === source.sessionId,
        )
        const message = matches[0]
        if (facts.timeline.sessionId !== source.sessionId || matches.length !== 1 || !message) return null
        next = projectSessionMessageImages({ hostIdentity, message })
      }
      return next?.sourceId === target.sourceId ? next : null
    } catch {
      return null
    }
  }
  const sync = () => {
    gallery?.revalidate()
    for (const thumbnail of thumbnails) thumbnail.reconcile()
  }
  const scopeLife = lifetime(
    () => {
      if (!available) return () => {}
      const off = [
        runtime.state.navigation.subscribe(sync),
        runtime.state.drafts.subscribe(sync),
        runtime.state.timeline.subscribe(sync),
      ]
      off.push(
        reader.subscribe(() => {
          if (reader.getSnapshot().status === 'closed') projection = null
          // The gallery publishes loading before its full acquire; release background leases synchronously.
          for (const thumbnail of thumbnails) thumbnail.reconcile()
        }),
      )
      return () => {
        for (const unsubscribe of off) unsubscribe()
      }
    },
    () => {
      gallery?.dispose()
      projection = null
    },
  )
  function createThumbnails(): ThumbnailModel {
    let requested: SessionImageProjection | null = null
    let captured: SessionImageProjection | null = null
    let visible = false
    let inGallery = false
    const owner =
      available && resources
        ? createImageThumbnails({
            resources,
            isCurrent: (request) =>
              thumbLife.live() &&
              scopeLife.live() &&
              captured?.sourceId === request.sourceId &&
              current(captured.request),
          })
        : null
    const thumbnailReader = owner?.reader ?? constantReader(inactive)
    const shouldActivate = () => {
      if (!thumbLife.live() || !scopeLife.live() || !visible || !requested) return false
      const open = reader.getSnapshot().status !== 'closed'
      return inGallery ? open && projection?.sourceId === requested.sourceId : !open
    }
    const model: ThumbnailModel = {
      reader: thumbnailReader,
      retain: () => thumbLife.retain(),
      update(next, nextVisible, galleryMode) {
        requested = next
        visible = nextVisible
        inGallery = galleryMode
        model.reconcile()
      },
      reconcile() {
        if (!owner) return
        const next = shouldActivate() && requested ? canonical(requested) : null
        captured = next
        if (!next || next.capacity.exceeded) {
          owner.deactivate()
          return
        }
        owner.activate({ sourceId: next.sourceId, items: next.request.items })
      },
      retry(key) {
        if (
          !owner ||
          !shouldActivate() ||
          thumbnailReader.getSnapshot().items.find((item) => item.key === key)?.status !== 'failed'
        )
          return false
        owner.retry(key)
        return true
      },
      report(sourceId, expected) {
        if (thumbLife.live() && scopeLife.live()) owner?.reportDecodeFailure(sourceId, expected)
      },
    }
    const thumbLife = lifetime(
      () => {
        thumbnails.add(model)
        return () => {
          thumbnails.delete(model)
        }
      },
      () => {
        owner?.dispose()
        captured = null
        requested = null
      },
    )
    return model
  }
  return {
    available,
    reader,
    retain: () => scopeLife.retain(),
    createThumbnails,
    getProjection: () => projection,
    open(target: SessionImageProjection, key: string): boolean {
      if (!gallery || !scopeLife.live() || target.capacity.exceeded) return false
      const verified = canonical(target)
      if (!verified || verified.capacity.exceeded) return false
      const request = { ...target.request, activeKey: key }
      if (!current(request) || !request.items.some((item) => item.key === key)) return false
      projection = target
      gallery.open(request)
      return reader.getSnapshot().status !== 'closed'
    },
    select(key: string) {
      const state = reader.getSnapshot()
      if (
        !gallery ||
        !scopeLife.live() ||
        state.status === 'closed' ||
        !state.request.items.some((item) => item.key === key)
      )
        return false
      gallery.select(key)
      return true
    },
    retry() {
      if (!gallery || !scopeLife.live() || reader.getSnapshot().status !== 'failed') return false
      gallery.retry()
      return true
    },
    close() {
      if (scopeLife.live()) gallery?.close()
    },
    report(expected: ImageViewerState) {
      if (scopeLife.live()) gallery?.reportDecodeFailure(expected)
    },
  }
}

type Scope = ReturnType<typeof createSessionImagesModelScope>
const ImagesContext = createContext<Scope | null>(null)
export interface HbarSessionImagesModelProviderProps {
  readonly resources?: ImageResourcePort | undefined
  readonly hostIdentity: string | null
  readonly children: ReactNode
}
export function HbarSessionImagesModelProvider({
  resources,
  hostIdentity,
  children,
}: HbarSessionImagesModelProviderProps) {
  const runtime = useHbarRuntime()
  const scope = useMemo(
    () => createSessionImagesModelScope(runtime, resources, hostIdentity),
    [runtime, resources, hostIdentity],
  )
  useEffect(() => scope.retain(), [scope])
  return <ImagesContext.Provider value={scope}>{children}</ImagesContext.Provider>
}
function useScope(): Scope {
  const scope = useContext(ImagesContext)
  if (!scope) throw new Error('HbarSessionImagesModelProvider is required')
  useEffect(() => scope.retain(), [scope])
  return scope
}
export function useSessionImageGallery() {
  const scope = useScope()
  const state = useHbarRuntimeState(scope.reader)
  return {
    available: scope.available,
    state,
    projection: scope.getProjection(),
    open: scope.open,
    select: scope.select,
    retry: scope.retry,
    close: scope.close,
    onImageError(key: string, url: string) {
      if (state.status === 'ready' && state.request.activeKey === key && state.resource.url === url) scope.report(state)
    },
  }
}
export function useSessionImageThumbnails(
  projection: SessionImageProjection | null,
  options: { readonly visible: boolean; readonly gallery?: boolean },
) {
  const scope = useScope()
  const model = useMemo(() => scope.createThumbnails(), [scope])
  const state = useHbarRuntimeState(model.reader)
  useEffect(() => model.retain(), [model])
  useEffect(
    () => model.update(projection, options.visible, options.gallery ?? false),
    [model, projection, options.visible, options.gallery],
  )
  return {
    available: scope.available,
    state,
    retry: model.retry,
    onImageError(key: string, url: string) {
      const item = state.items.find((candidate) => candidate.key === key)
      if (state.sourceId && item?.status === 'ready' && item.resource?.url === url) model.report(state.sourceId, item)
    },
  }
}
