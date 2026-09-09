import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import './GlassIconButton.css'

export type GlassIconTone = 'accent' | 'status' | 'warning' | 'neutral'

export interface GlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
  tone?: GlassIconTone
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
  className = '',
  ...props
}: GlassIconButtonProps) {
  const style = { '--rb-icon-tone': tone } as CSSProperties
  return (
    <button
      {...props}
      className={`rb-glass-icon-button${className ? ` ${className}` : ''}`}
      style={{ ...props.style, ...style }}
      data-tone={tone}
      aria-label={props['aria-label'] ?? label}
    >
      <span className="rb-glass-icon-back" aria-hidden="true" />
      <span className="rb-glass-icon-front" aria-hidden="true">
        <span className="rb-glass-icon-glyph">{children}</span>
      </span>
      <span className="rb-glass-icon-label" aria-hidden="true">
        {label}
      </span>
    </button>
  )
}
