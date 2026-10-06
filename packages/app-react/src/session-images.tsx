import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { FileText, X } from 'lucide-react'
import {
  LumenIcon,
  LumenButton,
  LumenFrame,
  LumenIconButton,
  LumenImageGallery,
  LumenImageTile,
  LumenImage,
  LumenText,
  type LumenImageGalleryLabels,
} from '@lumen/app-ui'
import {
  projectSessionDraftImages,
  projectPreSessionDraftImages,
  projectSessionMessageImages,
  projectSessionToolResultImages,
  findSessionToolResultMessage,
  type ImageResourceErrorCode,
  type ImageResourcePort,
  type ImageThumbnailState,
  type ImageViewerItem,
  type SessionDraftState,
  type SessionImageProjection,
  type PreSessionDraftState,
} from '@hbar/app-runtime'
import { useHbarRuntime, type HbarRuntimeView } from './runtime'
import type { ContentBlock } from '@hbar/contracts'
import {
  HbarSessionImagesModelProvider,
  useSessionImageGallery,
  useSessionImageThumbnails,
} from './session-images-model'
import './session-images.css'
import { MessageImagePreviewProvider } from './message-image-preview-context'
import { legacyToolImageSource } from './legacy-tool-image'

export interface HbarSessionImageLabels {
  readonly gallery: LumenImageGalleryLabels
  readonly conversation: string
  readonly open: (name: string) => string
  readonly loading: string
  readonly retry: string
  readonly error: (code: ImageResourceErrorCode) => string
  readonly capacity: (count: number, limit: number) => string
}

export interface HbarSessionImagesOptions {
  readonly resources: ImageResourcePort
  readonly hostIdentity: string | null
  readonly labels: HbarSessionImageLabels
}

interface ImageContextValue {
  readonly labels: HbarSessionImageLabels
  readonly hostIdentity: string | null
  readonly runtime: HbarRuntimeView
}
const ImageContext = createContext<ImageContextValue | null>(null)

const retryable = (code: ImageResourceErrorCode | null): boolean =>
  code !== null &&
  !['INVALID_INPUT', 'INVALID_IMAGE', 'UNSUPPORTED_IMAGE', 'TOO_LARGE', 'CONTENT_MISMATCH'].includes(code)

/** Only observes actual image-entry nodes, not the height of an entire long message. */
function useImageCollectionVisibility(identity: string) {
  const container = useRef<HTMLDivElement>(null)
  const [observed, setObserved] = useState({ identity, visible: false })
  useEffect(() => {
    const root = container.current
    if (!root) return
    if (typeof IntersectionObserver !== 'function') {
      // Without viewport observation, keep a named Open entry; do not read an entire history eagerly.
      setObserved({ identity, visible: false })
      return
    }
    const seen = new Set<Element>()
    const observedNodes = new Set<Element>()
    let active = true
    const observer = new IntersectionObserver((entries) => {
      if (!active) return
      for (const entry of entries) {
        if (!observedNodes.has(entry.target)) continue
        if (entry.isIntersecting) seen.add(entry.target)
        else seen.delete(entry.target)
      }
      setObserved({ identity, visible: seen.size > 0 })
    })
    const syncNodes = () => {
      const current = new Set(root.querySelectorAll('[data-image-occurrence]'))
      for (const node of observedNodes) {
        if (current.has(node)) continue
        observer.unobserve(node)
        observedNodes.delete(node)
        seen.delete(node)
      }
      for (const node of current)
        if (!observedNodes.has(node)) {
          observedNodes.add(node)
          observer.observe(node)
        }
      setObserved({ identity, visible: seen.size > 0 })
    }
    syncNodes()
    // History projection may regroup the same image occurrences after a tool result is paired.
    // Track the actual entry nodes as well as identity; do not keep observing detached old rows.
    const mutations = new MutationObserver(syncNodes)
    mutations.observe(root, { childList: true, subtree: true })
    return () => {
      active = false
      mutations.disconnect()
      observer.disconnect()
    }
  }, [identity])
  return { container, visible: observed.identity === identity && observed.visible }
}

function ImageGallery({ fallback }: { readonly fallback: RefObject<HTMLDivElement | null> }) {
  const context = useContext(ImageContext)
  const gallery = useSessionImageGallery()
  const thumbs = useSessionImageThumbnails(gallery.projection, {
    visible: gallery.state.status !== 'closed',
    gallery: true,
  })
  if (!context) return null
  const { state } = gallery
  const request = state.request
  const entries = new Map(thumbs.state.items.map((item) => [item.key, item]))
  return (
    <LumenImageGallery
      open={state.status !== 'closed'}
      activeKey={request?.activeKey ?? ''}
      items={(request?.items ?? []).map((item) => ({
        key: item.key,
        name: item.artifact.name,
        thumbnailUrl: entries.get(item.key)?.resource?.url,
      }))}
      image={
        state.status === 'ready'
          ? { status: 'ready', url: state.resource.url }
          : state.status === 'failed'
            ? { status: 'failed', errorText: context.labels.error(state.error), retryable: retryable(state.error) }
            : { status: 'loading' }
      }
      labels={context.labels.gallery}
      onSelect={gallery.select}
      onClose={gallery.close}
      onRetry={gallery.retry}
      onImageError={gallery.onImageError}
      fallbackFocusRef={fallback}
    />
  )
}

/** The host injects capability and copy; this layer only binds controlled image Views to their model. */
export function HbarSessionImageLayer({
  options,
  preSessionDraftId,
  children,
}: {
  readonly options?: HbarSessionImagesOptions | undefined
  readonly preSessionDraftId?: string | undefined
  readonly children: ReactNode
}) {
  const runtime = useHbarRuntime()
  const fallback = useRef<HTMLDivElement>(null)
  const context = useMemo<ImageContextValue | null>(
    () =>
      options
        ? {
            runtime,
            labels: options.labels,
            hostIdentity: options.hostIdentity,
          }
        : null,
    [runtime, options],
  )
  const imagePreviewLabels = useMemo(() => {
    const labels = options?.labels
    return labels
      ? { loading: labels.loading, failed: labels.error('READ_FAILED'), retry: labels.retry, open: labels.open }
      : null
  }, [options?.labels])
  if (!options || !imagePreviewLabels) return <>{children}</>
  return (
    <HbarSessionImagesModelProvider
      resources={options.resources}
      hostIdentity={options.hostIdentity}
      preSessionDraftId={preSessionDraftId}
    >
      <ImageContext.Provider value={context}>
        <MessageImagePreviewProvider labels={imagePreviewLabels}>
          <LumenFrame
            className="hbar-session-images-layer"
            ref={fallback}
            tabIndex={-1}
            aria-label={options.labels.conversation}
          >
            {children}
            <ImageGallery fallback={fallback} />
          </LumenFrame>
        </MessageImagePreviewProvider>
      </ImageContext.Provider>
    </HbarSessionImagesModelProvider>
  )
}

function ImageEntry({
  item,
  thumbnail,
  projection,
  variant,
  onRemove,
  removeLabel,
  removeDisabled,
  onRetry,
  onImageError,
}: {
  readonly item: ImageViewerItem
  readonly thumbnail: ImageThumbnailState | undefined
  readonly projection: SessionImageProjection | null
  readonly variant: 'composer' | 'message'
  readonly onRemove?: (() => void) | undefined
  readonly removeLabel?: string | undefined
  readonly removeDisabled?: boolean | undefined
  readonly onRetry: (key: string) => void
  readonly onImageError: (key: string, url: string) => void
}) {
  const context = useContext(ImageContext)
  const gallery = useSessionImageGallery()
  if (!context) return null
  const current =
    thumbnail &&
    thumbnail.key === item.key &&
    thumbnail.artifact.id === item.artifact.id &&
    thumbnail.artifact.mime === item.artifact.mime &&
    thumbnail.artifact.size === item.artifact.size &&
    thumbnail.artifact.name === item.artifact.name
      ? thumbnail
      : undefined
  const error = current?.error ?? null
  const canOpen = gallery.available && projection && !projection.capacity.exceeded && (!error || retryable(error))
  return (
    <LumenFrame className="hbar-image-entry" data-image-occurrence={item.key}>
      <LumenImageTile
        name={item.artifact.name}
        variant={variant}
        single={variant === 'message' && projection?.capacity.count === 1}
        url={current?.resource?.url}
        status={current?.status === 'ready' ? 'ready' : current?.status === 'failed' ? 'failed' : 'loading'}
        loadingLabel={gallery.available ? context.labels.loading : context.labels.error('DISCONNECTED')}
        errorText={error ? context.labels.error(error) : undefined}
        openLabel={context.labels.open(item.artifact.name)}
        onOpen={
          canOpen
            ? () => {
                gallery.open(projection, item.key)
              }
            : undefined
        }
        removeLabel={removeLabel}
        onRemove={onRemove}
        removeDisabled={removeDisabled}
        retryLabel={context.labels.retry}
        onRetry={error && retryable(error) ? () => onRetry(item.key) : undefined}
        onImageError={(url) => onImageError(item.key, url)}
      />
    </LumenFrame>
  )
}

export interface HbarMessageImageOccurrence {
  readonly key: string
  readonly ordinal: number
  readonly artifact: ImageViewerItem['artifact']
}
export type HbarMessageImageRenderer = (items: readonly HbarMessageImageOccurrence[]) => ReactNode

function MessageImageContent({
  context,
  sessionId,
  messageId,
  children,
  toolResult,
}: {
  readonly context: ImageContextValue
  readonly sessionId: string
  readonly messageId: string
  readonly children: (renderImages: HbarMessageImageRenderer | undefined) => ReactNode
  readonly toolResult?: Extract<ContentBlock, { type: 'tool_result' }> | undefined
}) {
  const timeline = context.runtime.state.timeline
  const getMessage = () => {
    const facts = timeline.getSnapshot()
    if (facts.sessionId !== sessionId) return undefined
    return toolResult
      ? findSessionToolResultMessage(facts, messageId, toolResult.callId, toolResult.name)
      : facts.messages.find((message) => message.id === messageId && message.sessionId === sessionId)
  }
  const message = useSyncExternalStore(timeline.subscribe, getMessage, getMessage)
  const resultIndex = toolResult
    ? (message?.content.findIndex(
        (block) => block.type === 'tool_result' && block.callId === toolResult.callId && block.name === toolResult.name,
      ) ?? -1)
    : -1
  const projection = useMemo(
    () =>
      message && context.hostIdentity
        ? toolResult && resultIndex >= 0
          ? projectSessionToolResultImages({ hostIdentity: context.hostIdentity, message, resultIndex })
          : projectSessionMessageImages({
              hostIdentity: context.hostIdentity,
              message,
            })
        : null,
    [context.hostIdentity, message, toolResult, resultIndex],
  )
  const identity = JSON.stringify([projection?.sourceId, projection?.request.items])
  const { container, visible } = useImageCollectionVisibility(identity)
  const thumbnails = useSessionImageThumbnails(projection, { visible })
  const entries = new Map(thumbnails.state.items.map((item) => [item.key, item]))
  const renderImages: HbarMessageImageRenderer = (items) => (
    <LumenFrame
      className="hbar-image-entries"
      data-variant="message"
      data-count={projection?.capacity.count ?? items.length}
    >
      {items.map((row) => {
        const item = projection?.request.items[row.ordinal] ?? { key: row.key, artifact: row.artifact }
        return (
          <ImageEntry
            key={row.key}
            item={item}
            thumbnail={entries.get(item.key)}
            projection={projection}
            variant="message"
            onRetry={thumbnails.retry}
            onImageError={thumbnails.onImageError}
          />
        )
      })}
    </LumenFrame>
  )
  return (
    <LumenFrame ref={container} className="hbar-message-image-content">
      {children(renderImages)}
      {projection?.capacity.exceeded && (
        <LumenText as="p" role="status">
          {context.labels.capacity(projection.capacity.count, projection.capacity.limit)}
        </LumenText>
      )}
    </LumenFrame>
  )
}

export function HbarMessageImageContent({
  sessionId,
  messageId,
  children,
}: {
  readonly sessionId: string
  readonly messageId: string
  readonly children: (renderImages: HbarMessageImageRenderer | undefined) => ReactNode
}) {
  const context = useContext(ImageContext)
  return context ? (
    <MessageImageContent context={context} sessionId={sessionId} messageId={messageId}>
      {children}
    </MessageImageContent>
  ) : (
    children(undefined)
  )
}

/** Read already-stored legacy bytes locally; never rerun a screenshot or fabricate a new artifact owner. */
function LegacyToolImage({ source, name }: { readonly source: string; readonly name: string }) {
  const context = useContext(ImageContext)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const image = (
    <LumenImage className="hbar-message-linked-image" src={source} alt={name} onError={() => setFailed(true)} />
  )
  return (
    <LumenFrame className="hbar-message-image-content">
      {context ? (
        <LumenButton
          type="button"
          className="hbar-legacy-tool-image-open"
          variant="text"
          indicator="none"
          aria-label={context.labels.open(name)}
          onClick={() => setOpen(true)}
        >
          {image}
        </LumenButton>
      ) : (
        image
      )}
      {failed && context && (
        <LumenText as="span" role="alert">
          {context.labels.error('DECODE_FAILED')}
        </LumenText>
      )}
      {context && (
        <LumenImageGallery
          open={open}
          activeKey="legacy-image"
          items={[{ key: 'legacy-image', name, thumbnailUrl: source }]}
          image={
            failed
              ? { status: 'failed', errorText: context.labels.error('DECODE_FAILED'), retryable: false }
              : { status: 'ready', url: source }
          }
          labels={context.labels.gallery}
          onSelect={() => {}}
          onClose={() => setOpen(false)}
          onRetry={() => setFailed(false)}
          onImageError={() => setFailed(true)}
        />
      )}
    </LumenFrame>
  )
}

/** Tool previews stay in their output section and resolve resources from the original durable result. */
export function HbarToolResultImages({
  sessionId,
  messageId,
  result,
}: {
  readonly sessionId: string
  readonly messageId: string
  readonly result: Extract<ContentBlock, { type: 'tool_result' }>
}) {
  const context = useContext(ImageContext)
  if (!result.images?.length) {
    const legacy = legacyToolImageSource(result)
    return legacy ? <LegacyToolImage key={legacy} source={legacy} name={result.text || result.name} /> : null
  }
  if (!context)
    return (
      <LumenFrame className="hbar-image-entries">
        {result.images.map((artifact, index) => (
          <LumenText as="span" key={index}>
            {artifact.name}
          </LumenText>
        ))}
      </LumenFrame>
    )
  return (
    <MessageImageContent context={context} sessionId={sessionId} messageId={messageId} toolResult={result}>
      {(renderImages) =>
        renderImages?.(
          result.images?.map((artifact, ordinal) => ({ key: `tool-image:${ordinal}`, ordinal, artifact })) ?? [],
        )
      }
    </MessageImageContent>
  )
}

interface DraftImageAttachmentActions {
  readonly removeLabel: (attachment: { id: string; kind: 'image' | 'file'; name: string }) => string
  readonly removeDisabled: boolean
  readonly onRemove: (id: string, kind: 'image' | 'file') => void
}

export function HbarDraftImageAttachments({
  draft,
  ...actions
}: DraftImageAttachmentActions & { readonly draft: SessionDraftState }) {
  const context = useContext(ImageContext)
  const projection = useMemo(
    () =>
      context?.hostIdentity
        ? projectSessionDraftImages({
            hostIdentity: context.hostIdentity,
            draft,
          })
        : null,
    [context?.hostIdentity, draft],
  )
  return <DraftImageAttachmentContent draft={draft} projection={projection} {...actions} />
}

/** Confirmed local-draft photos use their real owner, with the existing resource and gallery layer. */
export function HbarPreSessionDraftImageAttachments({
  draft,
  ...actions
}: DraftImageAttachmentActions & { readonly draft: Readonly<PreSessionDraftState> }) {
  const context = useContext(ImageContext)
  const projection = useMemo(
    () => (context?.hostIdentity ? projectPreSessionDraftImages({ hostIdentity: context.hostIdentity, draft }) : null),
    [context?.hostIdentity, draft],
  )
  return <DraftImageAttachmentContent draft={draft} projection={projection} {...actions} />
}

function DraftImageAttachmentContent({
  draft,
  projection,
  removeLabel,
  removeDisabled,
  onRemove,
}: DraftImageAttachmentActions & {
  readonly draft: Pick<SessionDraftState, 'attachments'>
  readonly projection: SessionImageProjection | null
}) {
  const context = useContext(ImageContext)
  const identity = JSON.stringify([projection?.sourceId, projection?.request.items])
  const { container, visible } = useImageCollectionVisibility(identity)
  const thumbnails = useSessionImageThumbnails(projection, { visible })
  const entries = new Map(thumbnails.state.items.map((item) => [item.key, item]))
  let ordinal = 0
  return (
    <LumenFrame ref={container} className="hbar-draft-image-content">
      <LumenFrame className="hbar-image-entries" data-variant="composer">
        {draft.attachments.map((attachment, index) => {
          const label = removeLabel({
            id: attachment.artifact.id,
            kind: attachment.kind,
            name: attachment.artifact.name,
          })
          if (attachment.kind === 'image') {
            const imageOrdinal = ordinal++
            const item = projection?.request.items[imageOrdinal] ?? {
              key: `draft-image:1:${imageOrdinal}`,
              artifact: attachment.artifact,
            }
            return (
              <ImageEntry
                key={`image:${index}`}
                item={item}
                projection={projection}
                thumbnail={entries.get(item.key)}
                variant="composer"
                removeLabel={label}
                onRemove={() => onRemove(attachment.artifact.id, attachment.kind)}
                removeDisabled={removeDisabled}
                onRetry={thumbnails.retry}
                onImageError={thumbnails.onImageError}
              />
            )
          }
          return (
            <LumenFrame key={`file:${index}`} className="hbar-image-file-chip lumen-attachment-chip">
              <LumenIcon icon={FileText} tier="sm" />
              <LumenText as="span" title={attachment.artifact.name}>
                {attachment.artifact.name}
              </LumenText>
              <LumenIconButton
                label={label}
                size="s"
                disabled={removeDisabled}
                onClick={() => onRemove(attachment.artifact.id, attachment.kind)}
              >
                <LumenIcon icon={X} tier="sm" />
              </LumenIconButton>
            </LumenFrame>
          )
        })}
      </LumenFrame>
      {projection?.capacity.exceeded && (
        <LumenText as="p" role="status">
          {context?.labels.capacity(projection.capacity.count, projection.capacity.limit)}
        </LumenText>
      )}
    </LumenFrame>
  )
}
