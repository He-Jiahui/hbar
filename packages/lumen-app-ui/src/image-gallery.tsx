'use client'

import * as React from 'react'
import { LumenDialog } from './dialog'
import { LumenButton, LumenIconButton, LumenText } from './primitives'
import { LumenIcon } from './workbench'
import './image-gallery.css'

export interface LumenImageGalleryItem {
  /** An occurrence identity supplied by the host, not a file name or content hash. */
  key: string
  name: string
  thumbnailUrl?: string | undefined
}

export type LumenImageGalleryImage =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'failed'; errorText: string; retryable?: boolean | undefined }

export interface LumenImageGalleryLabels {
  title: string
  close: string
  previous: string
  next: string
  position: (index: number, total: number) => string
  loading: string
  retry: string
  unavailable: string
  select: (name: string) => string
}

export interface LumenImageGalleryProps {
  open: boolean
  items: readonly LumenImageGalleryItem[]
  activeKey: string
  image: LumenImageGalleryImage
  labels: LumenImageGalleryLabels
  onSelect: (key: string) => void
  onClose: () => void
  onRetry: () => void
  onImageError: (key: string, url: string) => void
  /** Used only if native dialog restoration leaves no visible focused control. */
  fallbackFocusRef?: React.RefObject<HTMLElement | null> | undefined
}

function GalleryGlyph({
  direction,
  ...props
}: React.SVGAttributes<SVGSVGElement> & { direction: 'previous' | 'next' | 'close' | 'image' }) {
  const paths = {
    previous: 'm10 4-4 4 4 4',
    next: 'm6 4 4 4-4 4',
    close: 'm4 4 8 8m0-8-8 8',
    image: 'M2.5 2.5h11v11h-11Zm0 8 3-3 3 3 2-2 3 3M6 5.5h.01',
  }
  return (
    <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={paths[direction]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function PreviousGlyph(props: React.SVGAttributes<SVGSVGElement>) {
  return <GalleryGlyph {...props} direction="previous" />
}
function NextGlyph(props: React.SVGAttributes<SVGSVGElement>) {
  return <GalleryGlyph {...props} direction="next" />
}
function CloseGlyph(props: React.SVGAttributes<SVGSVGElement>) {
  return <GalleryGlyph {...props} direction="close" />
}
function ImageGlyph(props: React.SVGAttributes<SVGSVGElement>) {
  return <GalleryGlyph {...props} direction="image" />
}

function visibleFocusTarget(node: HTMLElement | null): node is HTMLElement {
  return Boolean(
    node?.isConnected &&
    !node.closest('[inert], [hidden], dialog:not([open])') &&
    !node.matches(':disabled') &&
    node.getClientRects().length > 0 &&
    getComputedStyle(node).visibility !== 'hidden',
  )
}

/** Controlled media presentation. URLs and resource lifetimes belong exclusively to the host. */
export function LumenImageGallery({
  open,
  items,
  activeKey,
  image,
  labels,
  onSelect,
  onClose,
  onRetry,
  onImageError,
  fallbackFocusRef,
}: LumenImageGalleryProps) {
  const strip = React.useRef<HTMLDivElement>(null)
  const closeButton = React.useRef<HTMLButtonElement>(null)
  const activeThumbnail = React.useRef<HTMLButtonElement>(null)
  const wasOpen = React.useRef(false)
  const activeIndex = items.findIndex((item) => item.key === activeKey)
  const valid =
    items.length > 0 &&
    items.length <= 12 &&
    items.every((item) => item.key.length > 0) &&
    new Set(items.map((item) => item.key)).size === items.length &&
    activeIndex >= 0
  const active = open && valid ? items[activeIndex] : undefined
  const multiple = open && valid && items.length > 1
  const itemOrder = valid ? JSON.stringify(items.map((item) => item.key)) : ''

  React.useLayoutEffect(() => {
    if (!open || !multiple) {
      return undefined
    }
    const reveal = () => {
      const container = strip.current
      const thumbnail = activeThumbnail.current
      if (!container || !thumbnail) {
        return
      }
      // Do not use scrollIntoView: it can scroll the modal or its background document.
      const viewport = container.getBoundingClientRect()
      const item = thumbnail.getBoundingClientRect()
      if (item.left < viewport.left) {
        container.scrollLeft += item.left - viewport.left
      } else if (item.right > viewport.right) {
        container.scrollLeft += item.right - viewport.right
      }
    }
    let frame = requestAnimationFrame(reveal)
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(reveal)
          })
    if (strip.current) {
      observer?.observe(strip.current)
    }
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [open, multiple, activeKey, itemOrder])

  React.useLayoutEffect(() => {
    const closing = wasOpen.current && !open
    wasOpen.current = open
    if (!closing || !fallbackFocusRef) {
      return undefined
    }
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement
      if (
        document.querySelector('dialog:modal') ||
        (focused instanceof HTMLElement && focused !== document.body && visibleFocusTarget(focused))
      ) {
        return
      }
      if (visibleFocusTarget(fallbackFocusRef.current)) {
        fallbackFocusRef.current.focus()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [open, fallbackFocusRef])

  const move = (offset: number) => {
    const next = items[(activeIndex + offset + items.length) % items.length]
    if (open && multiple && next) {
      onSelect(next.key)
    }
  }

  let media: React.ReactNode = null
  if (active && image.status === 'ready') {
    media = (
      <img
        key={`${active.key}:${image.url}`}
        src={image.url}
        alt={active.name}
        onError={() => onImageError(active.key, image.url)}
      />
    )
  } else if (active && image.status === 'loading') {
    media = (
      <LumenText as="p" role="status">
        {labels.loading}
      </LumenText>
    )
  } else if (active && image.status === 'failed') {
    media = (
      <div className="lumen-image-gallery-failure">
        <LumenText as="p" role="alert">
          {image.errorText}
        </LumenText>
        {image.retryable ? <LumenButton onClick={onRetry}>{labels.retry}</LumenButton> : null}
      </div>
    )
  }

  return (
    <LumenDialog
      open={open}
      size="large"
      title={labels.title}
      closeLabel={labels.close}
      onClose={onClose}
      initialFocus={closeButton}
      chromeless
      className="lumen-image-gallery-dialog"
    >
      <div
        className="lumen-image-gallery"
        role="presentation"
        onKeyDown={(event) => {
          if (
            !multiple ||
            event.defaultPrevented ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229
          ) {
            return
          }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            event.stopPropagation()
            move(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
      >
        <header className="lumen-image-gallery-header">
          <LumenText as="span" tone="muted" className="lumen-image-gallery-position">
            {active ? labels.position(activeIndex + 1, items.length) : labels.unavailable}
          </LumenText>
          {active ? (
            <span className="lumen-image-gallery-name" title={active.name}>
              {active.name}
            </span>
          ) : null}
          <LumenIconButton ref={closeButton} label={labels.close} onClick={onClose}>
            <LumenIcon icon={CloseGlyph} tier="md" />
          </LumenIconButton>
        </header>
        <div className="lumen-image-gallery-stage">
          {multiple ? (
            <LumenIconButton label={labels.previous} onClick={() => move(-1)}>
              <LumenIcon icon={PreviousGlyph} tier="lg" />
            </LumenIconButton>
          ) : null}
          <div className="lumen-image-gallery-media" aria-busy={(active && image.status === 'loading') || undefined}>
            {media}
          </div>
          {multiple ? (
            <LumenIconButton label={labels.next} onClick={() => move(1)}>
              <LumenIcon icon={NextGlyph} tier="lg" />
            </LumenIconButton>
          ) : null}
        </div>
        {multiple ? (
          <div className="lumen-image-gallery-strip" ref={strip}>
            {items.map((item) => (
              <LumenButton
                key={item.key}
                ref={item.key === activeKey ? activeThumbnail : undefined}
                className="lumen-image-gallery-thumbnail"
                indicator="none"
                variant="outlined"
                aria-label={labels.select(item.name)}
                aria-pressed={item.key === activeKey}
                title={item.name}
                onClick={() => onSelect(item.key)}
              >
                {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <LumenIcon icon={ImageGlyph} tier="lg" />}
              </LumenButton>
            ))}
          </div>
        ) : null}
      </div>
    </LumenDialog>
  )
}

export interface LumenImageTileProps {
  name: string
  url?: string | undefined
  status: 'loading' | 'ready' | 'failed'
  variant: 'composer' | 'message'
  /** Message-only: use the larger contained preview for a single image occurrence. */
  single?: boolean | undefined
  loadingLabel: string
  errorText?: string | undefined
  openLabel: string
  onOpen?: (() => void) | undefined
  removeLabel?: string | undefined
  onRemove?: (() => void) | undefined
  removeDisabled?: boolean | undefined
  retryLabel?: string | undefined
  onRetry?: (() => void) | undefined
  onImageError?: ((url: string) => void) | undefined
}

/** Independent open/remove/retry intents; no nested buttons and no resource acquisition. */
export function LumenImageTile(props: LumenImageTileProps) {
  const ready = props.status === 'ready' && Boolean(props.url)
  const media =
    props.url && props.status === 'ready' ? (
      <img
        key={props.url}
        src={props.url}
        alt=""
        onError={() => {
          if (props.url) {
            props.onImageError?.(props.url)
          }
        }}
      />
    ) : (
      <LumenIcon icon={ImageGlyph} tier="lg" />
    )
  return (
    <div
      className="lumen-image-tile"
      data-variant={props.variant}
      data-status={props.status}
      data-single={(props.variant === 'message' && props.single) || undefined}
      data-ready={ready || undefined}
      data-removable={Boolean(props.removeLabel && props.onRemove) || undefined}
    >
      {props.onOpen ? (
        <LumenButton
          className="lumen-image-tile-open"
          aria-label={props.openLabel}
          title={props.name}
          indicator="none"
          variant="outlined"
          onClick={(event) => {
            event.stopPropagation()
            props.onOpen?.()
          }}
        >
          {media}
          {!ready ? <span>{props.name}</span> : null}
        </LumenButton>
      ) : (
        <div className="lumen-image-tile-open" role="img" aria-label={props.name} title={props.name}>
          {media}
          {!ready ? <span>{props.name}</span> : null}
        </div>
      )}
      {props.status === 'loading' ? (
        <LumenText as="span" role="status">
          {props.loadingLabel}
        </LumenText>
      ) : null}
      {props.status === 'failed' && props.errorText ? (
        <LumenText as="span" role="alert">
          {props.errorText}
        </LumenText>
      ) : null}
      {props.status === 'failed' && props.retryLabel && props.onRetry ? (
        <div className="lumen-image-tile-actions">
          {props.status === 'failed' && props.retryLabel && props.onRetry ? (
            <LumenButton
              size="s"
              onClick={(event) => {
                event.stopPropagation()
                props.onRetry?.()
              }}
            >
              {props.retryLabel}
            </LumenButton>
          ) : null}
        </div>
      ) : null}
      {props.removeLabel && props.onRemove ? (
        <LumenButton
          className="lumen-image-tile-remove-overlay"
          size="s"
          indicator="none"
          aria-label={props.removeLabel}
          title={props.removeLabel}
          disabled={props.removeDisabled}
          onClick={(event) => {
            event.stopPropagation()
            props.onRemove?.()
          }}
        >
          <LumenIcon icon={CloseGlyph} tier="sm" />
        </LumenButton>
      ) : null}
    </div>
  )
}
