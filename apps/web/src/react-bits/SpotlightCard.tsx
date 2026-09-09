import { useCallback, useRef, type CSSProperties, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react'
import './SpotlightCard.css'

export interface SpotlightCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style' | 'onPointerMove' | 'onPointerLeave'> {
  children?: ReactNode
  className?: string
  spotlightColor?: string
  style?: CSSProperties
}

/**
 * React Bits SpotlightCard adapted for hbar's dense workbench surfaces.
 * The pointer coordinates stay on the element so nested controls keep their
 * normal event flow and keyboard focus gets the same visual treatment.
 */
export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'color-mix(in srgb, var(--rb-accent) 28%, transparent)',
  style,
  ...rest
}: SpotlightCardProps) {
  const card = useRef<HTMLDivElement>(null)

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const element = card.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    element.style.setProperty('--rb-spotlight-x', `${event.clientX - rect.left}px`)
    element.style.setProperty('--rb-spotlight-y', `${event.clientY - rect.top}px`)
  }, [])

  const handlePointerLeave = useCallback(() => {
    const element = card.current
    if (!element) return
    element.style.removeProperty('--rb-spotlight-x')
    element.style.removeProperty('--rb-spotlight-y')
  }, [])

  const cardStyle = { ...style, '--rb-spotlight-color': spotlightColor } as CSSProperties

  return (
    <div
      ref={card}
      {...rest}
      className={`rb-spotlight-card${className ? ` ${className}` : ''}`}
      style={cardStyle}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </div>
  )
}
