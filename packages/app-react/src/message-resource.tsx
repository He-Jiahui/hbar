import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  Archive,
  Code,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Globe,
  Type,
} from 'lucide-react'
import {
  LumenButton,
  LumenDialog,
  LumenFrame,
  LumenIcon,
  LumenImageGallery,
  LumenText,
  type LumenImageGalleryLabels,
} from '@lumen/app-ui'
import type { MessageResources, ResourceOpenMode } from '@hbar/app-runtime'
import { resourceImagePath, type ResourceReference } from '@hbar/contracts/resources'
import type { MessageFileReferenceContext } from './message-file-reference'
import { FloatingSurface } from './floating-surface'
import { registerSessionNavigationChrome } from './session-navigation-chrome'
import './message-resource.css'

export interface MessageResourceLabels {
  readonly open: (reference: ResourceReference) => string
  readonly opening: string
  readonly choose: string
  readonly close: string
  readonly truncated: string
  readonly menu: string
  readonly internal: string
  readonly system: string
  readonly error: (code: string) => string
  readonly gallery: LumenImageGalleryLabels
}
interface ResourceContextValue {
  readonly model: MessageResources
  readonly labels: MessageResourceLabels
}
const ResourceContext = createContext<ResourceContextValue | null>(null)
export const useMessageResources = () => useContext(ResourceContext)
const ResourceSourceContext = createContext<MessageFileReferenceContext | null>(null)
export const useMessageResourceSource = () => useContext(ResourceSourceContext)
export function MessageResourceSourceProvider({
  context,
  children,
}: {
  readonly context: MessageFileReferenceContext | undefined
  readonly children: ReactNode
}) {
  return <ResourceSourceContext.Provider value={context ?? null}>{children}</ResourceSourceContext.Provider>
}

export function ResourceIcon({ reference }: { readonly reference: ResourceReference }) {
  const path = reference.kind === 'file' ? reference.path : reference.url
  const image = reference.kind === 'web' ? reference.image : resourceImagePath(path)
  const ext = path.split(/[?#]/)[0]?.split('.').at(-1)?.toLowerCase() ?? ''
  const glyph = image
    ? FileImage
    : reference.kind === 'web'
      ? Globe
      : /^(?:zip|gz|tar|7z|rar)$/.test(ext)
        ? Archive
        : /^(?:mp3|wav|ogg|flac)$/.test(ext)
          ? FileAudio
          : /^(?:mp4|mov|webm)$/.test(ext)
            ? FileVideo
            : /^(?:csv|xlsx?)$/.test(ext)
              ? FileSpreadsheet
              : /^(?:woff2?|ttf|otf)$/.test(ext)
                ? Type
                : /^(?:md|mdx|txt|pdf|docx?)$/.test(ext)
                  ? FileText
                  : /^(?:[cm]?[jt]sx?|py|rs|go|java|c|cpp|h|cs|swift|kt|rb|php|sh|ps1|json|ya?ml|toml|css|html?)$/.test(
                        ext,
                      )
                    ? Code
                    : File
  return reference.kind === 'web' && !image ? (
    <ResourceFavicon url={reference.url} />
  ) : (
    <LumenIcon icon={glyph} tier="sm" aria-hidden="true" />
  )
}
const failedFavicons = new Set<string>()
function ResourceFavicon({ url }: { readonly url: string }) {
  const origin = new URL(url).origin
  const root = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(failedFavicons.has(origin))
  useEffect(() => {
    setVisible(false)
    setFailed(failedFavicons.has(origin))
    if (!root.current) return
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [origin])
  return (
    <LumenFrame as="span" ref={root} className="hbar-resource-icon" aria-hidden="true">
      {visible && !failed ? (
        <img
          src={`${origin}/favicon.ico`}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => {
            if (failedFavicons.size >= 128) failedFavicons.delete(failedFavicons.values().next().value ?? '')
            failedFavicons.add(origin)
            setFailed(true)
          }}
        />
      ) : (
        <LumenIcon icon={Globe} tier="sm" />
      )}
    </LumenFrame>
  )
}

export function MessageResourceLink({
  reference,
  context,
  children,
}: {
  readonly reference: ResourceReference
  readonly context: MessageFileReferenceContext
  readonly children: ReactNode
}) {
  const resources = useMessageResources()
  const anchor = useRef<HTMLAnchorElement>(null)
  const feedback = useRef<HTMLSpanElement>(null)
  const root = useRef<HTMLSpanElement>(null)
  const [menu, setMenu] = useState(false)
  const [status, setStatus] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const lifetime = useRef({ active: true })
  useEffect(() => {
    const scope = { active: true }
    lifetime.current = scope
    setStatus({ busy: false, error: null })
    return () => {
      scope.active = false
    }
  }, [context.owner, context.targetKey])
  useLayoutEffect(
    () =>
      root.current
        ? feedback.current
          ? registerSessionNavigationChrome(root.current, feedback.current)
          : undefined
        : undefined,
    [context.owner, context.targetKey],
  )
  const open = (mode?: ResourceOpenMode) => {
    if (!resources || !context.source || status.busy) return
    const generation = lifetime.current
    setMenu(false)
    setStatus({ busy: true, error: null })
    void resources.model.open(context.source, reference, context.onOpen, mode).then(
      () => {
        if (generation === lifetime.current && generation.active) setStatus({ busy: false, error: null })
      },
      (error: unknown) => {
        if (generation !== lifetime.current || !generation.active) return
        const code =
          error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'READ_FAILED'
        setStatus({ busy: false, error: code })
      },
    )
  }
  if (!resources || !context.source) return children
  const { labels } = resources
  return (
    <LumenFrame as="span" ref={root} className="hbar-message-file-reference hbar-message-resource">
      <LumenFrame
        as="a"
        ref={anchor}
        href={reference.kind === 'web' ? reference.url : undefined}
        role="link"
        tabIndex={0}
        title={labels.open(reference)}
        aria-label={labels.open(reference)}
        aria-busy={status.busy || undefined}
        className="hbar-message-file-link hbar-message-resource-link"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          open()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            open()
          } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            setMenu(true)
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setMenu(true)
        }}
      >
        <ResourceIcon reference={reference} />
        {children}
      </LumenFrame>
      <LumenFrame as="span" ref={feedback} data-session-find-exclude="resource-navigation">
        {status.busy && (
          <LumenText as="small" role="status">
            {labels.opening}
          </LumenText>
        )}
        {status.error && (
          <LumenText as="small" role="alert">
            {labels.error(status.error)}
          </LumenText>
        )}
      </LumenFrame>
      <FloatingSurface
        open={menu}
        onClose={() => setMenu(false)}
        anchorRef={anchor}
        label={labels.menu}
        role="menu"
        className="hbar-resource-menu"
      >
        <LumenButton role="menuitem" variant="text" onClick={() => open('internal')}>
          {labels.internal}
        </LumenButton>
        <LumenButton role="menuitem" variant="text" onClick={() => open('system')}>
          {labels.system}
        </LumenButton>
      </FloatingSurface>
    </LumenFrame>
  )
}

export function HbarMessageResourceLayer({
  model,
  labels,
  children,
}: {
  readonly model: MessageResources
  readonly labels: MessageResourceLabels
  readonly children: ReactNode
}) {
  const state = useStore(model.store)
  const fallback = useRef<HTMLDivElement>(null)
  return (
    <ResourceContext.Provider value={{ model, labels }}>
      {children}
      <LumenFrame ref={fallback} tabIndex={-1} className="hbar-resource-focus" />
      <LumenDialog
        open={state.chooser !== null}
        size="medium"
        title={labels.choose}
        closeLabel={labels.close}
        onClose={model.close}
      >
        <LumenFrame className="hbar-resource-candidates">
          {state.chooser?.truncated && <LumenText role="status">{labels.truncated}</LumenText>}
          {state.chooser?.error && <LumenText role="alert">{labels.error(state.chooser.error)}</LumenText>}
          {state.chooser?.candidates.map((candidate) => (
            <LumenButton
              key={candidate.id}
              variant="text"
              disabled={state.chooser?.busy}
              className="hbar-resource-candidate"
              onClick={() => {
                void model.select(candidate.id)
              }}
            >
              <ResourceIcon
                reference={
                  candidate.kind === 'web'
                    ? { kind: 'web', url: candidate.location, image: false }
                    : { kind: 'file', path: candidate.location }
                }
              />
              <LumenFrame as="span">
                <LumenText as="strong">{candidate.name}</LumenText>
                <LumenText as="span" tone="muted">
                  {candidate.location}
                </LumenText>
              </LumenFrame>
            </LumenButton>
          ))}
        </LumenFrame>
      </LumenDialog>
      <LumenImageGallery
        open={state.image !== null}
        activeKey={state.image?.candidate.id ?? ''}
        items={state.image ? [{ key: state.image.candidate.id, name: state.image.candidate.name }] : []}
        image={
          state.image?.status === 'ready' && state.image.url
            ? { status: 'ready', url: state.image.url }
            : state.image?.status === 'failed'
              ? { status: 'failed', errorText: labels.error(state.image.error ?? 'READ_FAILED'), retryable: true }
              : { status: 'loading' }
        }
        labels={labels.gallery}
        onSelect={() => {}}
        onClose={model.close}
        onRetry={model.retryImage}
        onImageError={model.imageFailed}
        fallbackFocusRef={fallback}
      />
      <LumenDialog
        open={state.text !== null}
        size="large"
        title={state.text?.candidate.name ?? labels.opening}
        closeLabel={labels.close}
        onClose={model.close}
      >
        {state.text && (
          <>
            <LumenText as="p" tone="muted">
              {state.text.candidate.location}
            </LumenText>
            <LumenText as="pre" className="hbar-resource-text" tabIndex={0}>
              {state.text.text}
            </LumenText>
          </>
        )}
      </LumenDialog>
    </ResourceContext.Provider>
  )
}
