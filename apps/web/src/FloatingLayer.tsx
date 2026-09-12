import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import './FloatingLayer.css'

export type FloatingPlacement = 'above' | 'below' | 'left' | 'right'
export type FloatingSurfaceMode = 'anchored' | 'point' | 'modal'

interface FloatingLayerBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'> {
  open: boolean
  onClose(): void
  className?: string
  backdropClassName?: string
  children: ReactNode
}

export type AnchoredFloatingLayerProps = FloatingLayerBaseProps &
  {
    mode?: 'anchored'
    anchorRef: RefObject<HTMLElement | null>
    anchorPoint?: never
    placement?: FloatingPlacement
    matchAnchorWidth?: boolean
  }

export type PointFloatingLayerProps = FloatingLayerBaseProps & {
  mode: 'point'
  anchorRef?: never
  anchorPoint: { x: number; y: number }
  placement?: FloatingPlacement
  matchAnchorWidth?: never
}

export type ModalFloatingLayerProps = FloatingLayerBaseProps & {
  mode: 'modal'
  anchorRef?: never
  anchorPoint?: never
  placement?: never
  matchAnchorWidth?: never
}

export type FloatingLayerProps = AnchoredFloatingLayerProps | PointFloatingLayerProps | ModalFloatingLayerProps

const VIEWPORT_GAP = 8
// Keep every transient option surface above workbench panels and modal chrome.
// The CSS contract mirrors this value so inline positioning cannot accidentally
// lower a menu into an ancestor stacking context.
const LAYER_Z_INDEX = 2100
const FOCUSABLE_SELECTOR = [
  '[autofocus]',
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type ActiveLayer = { id: string; close(): void }
let activeLayer: ActiveLayer | null = null

function claimLayer(layer: ActiveLayer): () => void {
  if (activeLayer && activeLayer.id !== layer.id) activeLayer.close()
  activeLayer = layer
  return () => {
    if (activeLayer?.id === layer.id) activeLayer = null
  }
}

export interface FloatingTriggerProps {
  open: boolean
  onOpen(): void
  onClose(): void
}

/**
 * Use on an option-surface trigger. When the surface is open, prevent the
 * browser click that follows pointerdown so the outside-click close cannot be
 * immediately undone by a toggle handler.
 */
export function useFloatingTrigger({ open, onOpen, onClose }: FloatingTriggerProps) {
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!open) return
      event.preventDefault()
      onClose()
    },
    [onClose, open],
  )
  const handleClick = useCallback(() => {
    if (open) onClose()
    else onOpen()
  }, [onClose, onOpen, open])
  return { onPointerDown: handlePointerDown, onClick: handleClick }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Renders transient surfaces outside the workbench layout. A fixed-position
 * portal is immune to ancestor transforms, clipping and stacking contexts.
 * Anchored surfaces use an anchor only for geometry; the anchor itself is
 * intentionally outside the surface for outside-click purposes.
 */
export function FloatingLayer(props: FloatingLayerProps) {
  const {
    open,
    onClose,
    className = '',
    backdropClassName = '',
    children,
    mode = 'anchored',
    anchorRef: anchorProp,
    anchorPoint,
    placement: placementProp,
    matchAnchorWidth: matchAnchorWidthProp,
    ...attributes
  } = props
  const anchorRef = mode === 'anchored' ? anchorProp : undefined
  const placement = mode !== 'modal' ? placementProp ?? 'above' : undefined
  const matchAnchorWidth = mode === 'anchored' ? matchAnchorWidthProp ?? false : false
  const layerId = useId()
  const layerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
    zIndex: LAYER_Z_INDEX,
  })

  const updatePosition = useCallback(() => {
    const layer = layerRef.current
    if (!layer || mode === 'modal') return
    const anchorBounds = anchorPoint
      ? { left: anchorPoint.x, right: anchorPoint.x, top: anchorPoint.y, bottom: anchorPoint.y, width: 0, height: 0 }
      : anchorRef?.current?.getBoundingClientRect()
    if (!anchorBounds) return
    const layerBounds = layer.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxWidth = Math.max(0, viewportWidth - VIEWPORT_GAP * 2)
    const width = Math.min(matchAnchorWidth ? anchorBounds.width : layerBounds.width, maxWidth)
    const isHorizontal = placement === 'left' || placement === 'right'
    const desiredLeft =
      placement === 'left'
        ? anchorBounds.left - layerBounds.width - VIEWPORT_GAP
        : placement === 'right'
          ? anchorBounds.right + VIEWPORT_GAP
          : anchorBounds.left
    const left = clamp(desiredLeft, VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP)
    const desiredTop =
      placement === 'above'
        ? anchorBounds.top - layerBounds.height - VIEWPORT_GAP
        : placement === 'below'
          ? anchorBounds.bottom + VIEWPORT_GAP
          : anchorBounds.top + (anchorBounds.height - layerBounds.height) / 2
    const top = clamp(desiredTop, VIEWPORT_GAP, viewportHeight - layerBounds.height - VIEWPORT_GAP)

    setStyle({
      position: 'fixed',
      top,
      left,
      right: 'auto',
      bottom: 'auto',
      zIndex: LAYER_Z_INDEX,
      maxWidth: `calc(100vw - ${VIEWPORT_GAP * 2}px)`,
      ...(matchAnchorWidth && !isHorizontal ? { width } : {}),
      visibility: 'visible',
    })
  }, [anchorPoint, anchorRef, matchAnchorWidth, mode, placement])

  useLayoutEffect(() => {
    if (!open) return
    if (mode === 'modal') {
      setStyle({
        position: 'fixed',
        inset: '50% auto auto 50%',
        transform: 'translate(-50%, -50%)',
        zIndex: LAYER_Z_INDEX,
        maxWidth: `calc(100vw - ${VIEWPORT_GAP * 2}px)`,
        maxHeight: `calc(100dvh - ${VIEWPORT_GAP * 2}px)`,
        visibility: 'visible',
      })
      return
    }
    const frame = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(frame)
  }, [mode, open, updatePosition])

  useLayoutEffect(() => {
    if (!open || mode !== 'modal') return

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const layer = layerRef.current
      if (!layer) return
      const target = layer.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? layer
      target.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (!previous?.isConnected) return
      requestAnimationFrame(() => {
        if (activeLayer === null) previous.focus({ preventScroll: true })
      })
    }
  }, [mode, open])

  useEffect(() => {
    if (!open) return

    const release = claimLayer({ id: layerId, close: () => onCloseRef.current() })

    const handlePointerDown = (event: PointerEvent) => {
      const path = event.composedPath()
      if (layerRef.current && path.includes(layerRef.current)) return
      onCloseRef.current()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    const handleViewportChange = () => updatePosition()

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)
      release()
    }
  }, [anchorRef, layerId, open, updatePosition])

  if (!open) return null

  return createPortal(
    mode === 'modal' ? (
      <div
        className={`floating-layer-backdrop ${backdropClassName}`.trim()}
        data-floating-layer-backdrop="true"
      >
        <div
          {...attributes}
          ref={layerRef}
          className={`floating-layer floating-layer-modal ${className}`.trim()}
          data-floating-layer="true"
          tabIndex={attributes.tabIndex ?? -1}
          style={style}
        >
          {children}
        </div>
      </div>
    ) : (
      <div
        {...attributes}
        ref={layerRef}
        className={`floating-layer ${className}`.trim()}
        data-floating-layer="true"
        style={style}
      >
        {children}
      </div>
    ),
    document.body,
  )
}

export const FloatingSurface = FloatingLayer

export default FloatingLayer
