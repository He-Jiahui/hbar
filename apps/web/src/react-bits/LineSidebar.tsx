import { useCallback, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import './LineSidebar.css'

type Falloff = 'linear' | 'smooth' | 'sharp'

export interface LineSidebarProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'style'> {
  children?: ReactNode
  activeIndex?: number | null
  activeId?: string | null
  accentColor?: string
  markerColor?: string
  markerLength?: number
  markerGap?: number
  tickScale?: number
  itemGap?: number
  maxShift?: number
  proximityRadius?: number
  falloff?: Falloff
  smoothing?: number
  itemSelector?: string
  className?: string
  style?: CSSProperties
}

const FALLOFF_CURVES: Record<Falloff, (value: number) => number> = {
  linear: (value) => value,
  smooth: (value) => value * value * (3 - 2 * value),
  sharp: (value) => value * value * value,
}

/**
 * React Bits Line Sidebar adapted for arbitrary workbench rows. The marker
 * rail stays fixed while the row nearest the pointer eases toward the
 * accent, making a dense list easier to scan without changing its layout.
 */
export default function LineSidebar({
  children,
  activeIndex = null,
  activeId = null,
  accentColor = 'var(--rb-accent)',
  markerColor = 'var(--hbar-bd)',
  markerLength = 14,
  markerGap = 5,
  tickScale = 0.45,
  itemGap = 3,
  maxShift = 5,
  proximityRadius = 72,
  falloff = 'smooth',
  smoothing = 100,
  itemSelector = '[data-line-item]',
  className = '',
  style,
  ...rest
}: LineSidebarProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<HTMLElement[]>([])
  const targetsRef = useRef<number[]>([])
  const currentRef = useRef<number[]>([])
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const activeRef = useRef(activeIndex)
  const smoothingRef = useRef(smoothing)
  activeRef.current = activeIndex
  smoothingRef.current = smoothing

  const getItems = useCallback(() => {
    const list = listRef.current
    if (!list) return []
    const items = Array.from(list.querySelectorAll<HTMLElement>(itemSelector))
    itemRefs.current = items
    return items
  }, [itemSelector])

  const runFrame = useCallback(
    (now: number) => {
      const dt = Math.min((now - lastRef.current) / 1000, 0.05)
      lastRef.current = now
      const tau = Math.max(smoothingRef.current, 1) / 1000
      const factor = 1 - Math.exp(-dt / tau)
      let moving = false

      getItems().forEach((element, index) => {
        if (!element) return
        const target = Math.max(
          targetsRef.current[index] ?? 0,
          activeRef.current === index || (activeId !== null && element.dataset.lineId === activeId) ? 1 : 0,
        )
        const current = currentRef.current[index] ?? 0
        const next = current + (target - current) * factor
        const settled = Math.abs(target - next) < 0.0015
        const value = settled ? target : next
        currentRef.current[index] = value
        element.style.setProperty('--line-effect', value.toFixed(4))
        if (!settled) moving = true
      })

      rafRef.current = moving ? requestAnimationFrame(runFrame) : null
    },
    [activeId, getItems],
  )

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(runFrame)
  }, [runFrame])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'touch') return
      const list = listRef.current
      if (!list) return
      const listRect = list.getBoundingClientRect()
      const pointerY = event.clientY - listRect.top
      const ease = FALLOFF_CURVES[falloff]
      getItems().forEach((element, index) => {
        if (!element) return
        const rect = element.getBoundingClientRect()
        const center = rect.top - listRect.top + rect.height / 2
        const distance = Math.abs(pointerY - center)
        targetsRef.current[index] = ease(Math.max(0, 1 - distance / proximityRadius))
      })
      startLoop()
    },
    [falloff, getItems, proximityRadius, startLoop],
  )

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0)
    startLoop()
  }, [startLoop])

  useEffect(() => {
    startLoop()
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [activeId, activeIndex, startLoop])

  return (
    <nav
      {...rest}
      className={`line-sidebar${className ? ` ${className}` : ''}`}
      style={
        {
          ...style,
          '--line-accent': accentColor,
          '--line-marker': markerColor,
          '--line-marker-length': `${markerLength}px`,
          '--line-marker-gap': `${markerGap}px`,
          '--line-tick-scale': tickScale,
          '--line-item-gap': `${itemGap}px`,
          '--line-max-shift': `${maxShift}px`,
        } as CSSProperties
      }
    >
      <div
        ref={listRef}
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {children}
      </div>
    </nav>
  )
}
