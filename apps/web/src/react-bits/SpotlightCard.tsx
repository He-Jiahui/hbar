import {
  useCallback,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from 'react'
import './SpotlightCard.css'

type SpotlightCardBaseProps = {
  children?: ReactNode
  className?: string
  spotlightColor?: string
  style?: CSSProperties
}

type SpotlightDivProps = SpotlightCardBaseProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style' | 'onPointerMove' | 'onPointerLeave'> & {
    as?: 'div'
  }

type SpotlightButtonProps = SpotlightCardBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'style' | 'onPointerMove' | 'onPointerLeave'> & {
    as: 'button'
  }

export type SpotlightCardProps = SpotlightDivProps | SpotlightButtonProps

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
  as = 'div',
  ...rest
}: SpotlightCardProps) {
  const card = useRef<HTMLDivElement | HTMLButtonElement>(null)
  const setDivCard = useCallback((element: HTMLDivElement | null) => {
    card.current = element
  }, [])
  const setButtonCard = useCallback((element: HTMLButtonElement | null) => {
    card.current = element
  }, [])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
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
  const interactiveProps = {
    className: `rb-spotlight-card${className ? ` ${className}` : ''}`,
    style: cardStyle,
    onPointerMove: handlePointerMove,
    onPointerLeave: handlePointerLeave,
  }

  if (as === 'button')
    return (
      <button
        ref={setButtonCard}
        {...(rest as Omit<SpotlightButtonProps, keyof SpotlightCardBaseProps | 'as'>)}
        {...interactiveProps}
      >
        {children}
      </button>
    )
  return (
    <div
      ref={setDivCard}
      {...(rest as Omit<SpotlightDivProps, keyof SpotlightCardBaseProps | 'as'>)}
      {...interactiveProps}
    >
      {children}
    </div>
  )
}
