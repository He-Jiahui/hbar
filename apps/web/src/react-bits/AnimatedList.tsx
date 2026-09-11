import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import './AnimatedList.css'

export interface AnimatedListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onScroll'> {
  children?: ReactNode
  viewportClassName?: string
  showGradients?: boolean
  animateItems?: boolean
}

type EdgeOpacity = {
  top: number
  bottom: number
}

/**
 * React Bits AnimatedList adapted for hbar's existing list markup. The
 * viewport remains the scroll owner so callers keep their current selectors;
 * the adapter adds lightweight entry motion and scroll-edge affordances.
 */
export default function AnimatedList({
  children,
  className = '',
  viewportClassName = '',
  showGradients = true,
  animateItems = true,
  ...rest
}: AnimatedListProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [edgeOpacity, setEdgeOpacity] = useState<EdgeOpacity>({ top: 0, bottom: 0 })
  const items = Children.toArray(children)
  const listClassName = [
    'rb-animated-list',
    !animateItems && 'rb-animated-list--static',
    className,
  ].filter(Boolean).join(' ')

  const syncEdges = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    if (!maxScroll) {
      setEdgeOpacity((current) => (current.top || current.bottom ? { top: 0, bottom: 0 } : current))
      return
    }
    const top = Math.min(viewport.scrollTop / 48, 1)
    const bottom = Math.min((maxScroll - viewport.scrollTop) / 48, 1)
    setEdgeOpacity((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }))
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    syncEdges()
    viewport.addEventListener('scroll', syncEdges, { passive: true })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncEdges)
    resizeObserver?.observe(viewport)
    const mutationObserver =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => requestAnimationFrame(syncEdges))
    mutationObserver?.observe(viewport, { childList: true, subtree: true, characterData: true })
    return () => {
      viewport.removeEventListener('scroll', syncEdges)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [syncEdges])

  return (
    <div className={listClassName} {...rest}>
      <div ref={viewportRef} className={`rb-animated-list__viewport${viewportClassName ? ` ${viewportClassName}` : ''}`}>
        {items.map((item, index) => (
          isValidElement<{ className?: string; style?: CSSProperties }>(item)
            ? cloneElement(item, {
                className: `${item.props.className ?? ''} rb-animated-list__item`.trim(),
                style: { ...item.props.style, '--rb-list-index': index } as CSSProperties,
                key: item.key != null ? String(item.key) : `item-${index}`,
              })
            : (
                <div className="rb-animated-list__item" key={`item-${index}`} style={{ '--rb-list-index': index } as CSSProperties}>
                  {item}
                </div>
              )
        ))}
      </div>
      {showGradients && (
        <>
          <span className="rb-animated-list__gradient rb-animated-list__gradient--top" style={{ opacity: edgeOpacity.top }} />
          <span
            className="rb-animated-list__gradient rb-animated-list__gradient--bottom"
            style={{ opacity: edgeOpacity.bottom }}
          />
        </>
      )}
    </div>
  )
}
