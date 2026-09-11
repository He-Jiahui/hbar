import { useId, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, FocusEvent, PointerEvent, ReactNode } from 'react'
import FloatingLayer, { type FloatingPlacement } from '../FloatingLayer'
import './GlassIconButton.css'

export type GlassIconTone = 'accent' | 'status' | 'warning' | 'neutral'

export interface GlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
  tone?: GlassIconTone
  /** Render the label in the shared body portal instead of the button's 3D stacking context. */
  portalTooltip?: boolean
  tooltipPlacement?: FloatingPlacement
}

/**
 * React Bits GlassIcons' layered button adapted for hbar's narrow tool rails.
 * The label remains an accessible name/native tooltip while the two surfaces
 * provide the source component's depth effect without widening the rail.
 */
export default function GlassIconButton({
  children,
  label,
  tone = 'neutral',
  portalTooltip = false,
  tooltipPlacement = 'below',
  className = '',
  ...props
}: GlassIconButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tooltipId = useId()
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const style = { '--rb-icon-tone': tone } as CSSProperties
  const describedBy =
    portalTooltip && tooltipOpen
      ? [props['aria-describedby'], tooltipId].filter(Boolean).join(' ')
      : props['aria-describedby']
  function handlePointerEnter(event: PointerEvent<HTMLButtonElement>) {
    props.onPointerEnter?.(event)
    if (!props.disabled && portalTooltip) setTooltipOpen(true)
  }
  function handlePointerLeave(event: PointerEvent<HTMLButtonElement>) {
    props.onPointerLeave?.(event)
    if (portalTooltip) setTooltipOpen(false)
  }
  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    props.onFocus?.(event)
    if (!props.disabled && portalTooltip) setTooltipOpen(true)
  }
  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    props.onBlur?.(event)
    if (portalTooltip) setTooltipOpen(false)
  }
  return (
    <button
      {...props}
      ref={buttonRef}
      className={`rb-glass-icon-button${className ? ` ${className}` : ''}`}
      style={{ ...props.style, ...style }}
      data-tone={tone}
      aria-label={props['aria-label'] ?? label}
      aria-describedby={describedBy}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <span className="rb-glass-icon-back" aria-hidden="true" />
      <span className="rb-glass-icon-front" aria-hidden="true">
        <span className="rb-glass-icon-glyph">{children}</span>
      </span>
      {!portalTooltip && (
        <span className="rb-glass-icon-label" aria-hidden="true">
          {label}
        </span>
      )}
      {portalTooltip && tooltipOpen && (
        <FloatingLayer
          id={tooltipId}
          role="tooltip"
          anchorRef={buttonRef}
          open
          onClose={() => setTooltipOpen(false)}
          placement={tooltipPlacement}
          className="floating-tooltip"
        >
          {label}
        </FloatingLayer>
      )}
    </button>
  )
}
