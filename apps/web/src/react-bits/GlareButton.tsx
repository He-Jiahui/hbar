import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import './GlareButton.css'

export interface GlareButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  glareColor?: string
  glareDuration?: number
}

type GlareStyle = CSSProperties & {
  '--rb-glare-color': string
  '--rb-glare-duration': string
}

/**
 * React Bits GlareHover adapted as a semantic button rather than a generic
 * decorative container. It keeps native disabled and keyboard behavior while
 * making only decisive hbar actions carry the moving highlight.
 */
export default function GlareButton({
  children,
  glareColor = 'color-mix(in srgb, var(--rb-accent) 72%, transparent)',
  glareDuration = 650,
  className = '',
  style,
  ...props
}: GlareButtonProps) {
  const glareStyle: GlareStyle = {
    ...style,
    '--rb-glare-color': glareColor,
    '--rb-glare-duration': `${glareDuration}ms`,
  }
  return (
    <button {...props} className={`rb-glare-button${className ? ` ${className}` : ''}`} style={glareStyle}>
      <span className="rb-glare-button-content">{children}</span>
    </button>
  )
}
