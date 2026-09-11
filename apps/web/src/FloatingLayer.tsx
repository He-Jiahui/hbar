import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import './FloatingLayer.css'

type FloatingPlacement = 'above' | 'below'

export interface FloatingLayerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'> {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose(): void
  placement?: FloatingPlacement
  matchAnchorWidth?: boolean
  className?: string
  children: ReactNode
}

const VIEWPORT_GAP = 8
const LAYER_Z_INDEX = 1200

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Renders transient menus outside the workbench layout. A fixed-position
 * portal is immune to ancestor transforms, clipping and stacking contexts,
 * while the anchor is still used to keep the layer visually attached.
 */
export default function FloatingLayer({
  anchorRef,
  open,
  onClose,
  placement = 'above',
  matchAnchorWidth = false,
  className = '',
  children,
  ...attributes
}: FloatingLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
    zIndex: LAYER_Z_INDEX,
  })

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    const layer = layerRef.current
    if (!anchor || !layer) return

    const anchorBounds = anchor.getBoundingClientRect()
    const layerBounds = layer.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxWidth = Math.max(0, viewportWidth - VIEWPORT_GAP * 2)
    const width = Math.min(matchAnchorWidth ? anchorBounds.width : layerBounds.width, maxWidth)
    const left = clamp(anchorBounds.left, VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP)
    const desiredTop =
      placement === 'above' ? anchorBounds.top - layerBounds.height - VIEWPORT_GAP : anchorBounds.bottom + VIEWPORT_GAP
    const top = clamp(desiredTop, VIEWPORT_GAP, viewportHeight - layerBounds.height - VIEWPORT_GAP)

    setStyle({
      position: 'fixed',
      top,
      left,
      right: 'auto',
      bottom: 'auto',
      zIndex: LAYER_Z_INDEX,
      maxWidth: `calc(100vw - ${VIEWPORT_GAP * 2}px)`,
      ...(matchAnchorWidth ? { width } : {}),
      visibility: 'visible',
    })
  }, [anchorRef, matchAnchorWidth, placement])

  useLayoutEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(frame)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (anchorRef.current?.contains(target) || layerRef.current?.contains(target)) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
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
    }
  }, [anchorRef, onClose, open, updatePosition])

  if (!open) return null

  return createPortal(
    <div
      {...attributes}
      ref={layerRef}
      className={`floating-layer ${className}`.trim()}
      data-floating-layer="true"
      style={style}
    >
      {children}
    </div>,
    document.body,
  )
}
