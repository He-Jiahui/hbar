'use client'

import * as React from 'react'
import createLensMap from './lensMap'
import { type LumenShape } from './appearance'
import { type LumenState, type LumenTone } from './LumenIndicator'
import styles from './materials.module.css'
import type { LumenStylePart } from './style-contract'

export type LumenSurfaceElement = 'article' | 'aside' | 'div' | 'form' | 'main' | 'nav' | 'section'
export type LumenSurfaceRole = 'canvas' | 'navigation' | 'reading' | 'raised' | 'overlay'

/** Internal provider default; explicit component roles always take precedence. */
export const LumenSurfaceRoleContext = React.createContext<LumenSurfaceRole | undefined>(undefined)

interface LumenSurfaceOwnProps {
  /** Information hierarchy is independent of the chosen material. Omission preserves legacy surfaces. */
  surfaceRole?: LumenSurfaceRole | undefined
  /** @deprecated The boundary is continuous; direction no longer selects a lamp edge. */
  boundary?: 'none' | 'horizontal' | 'vertical' | undefined
  contentClassName?: string | undefined
  /** Public styling point for the content wrapper, independent of its internal class. */
  contentPart?: LumenStylePart | undefined
  material?: 'glass' | 'frost' | 'solid' | undefined
  elevation?: 'base' | 'overlay' | undefined
  glassStrength?: number | undefined
  interactive?: boolean | undefined
  shape?: LumenShape | undefined
  state?: LumenState | undefined
  tone?: LumenTone | undefined
}

export type LumenSurfaceProps<Element extends LumenSurfaceElement = 'div'> = LumenSurfaceOwnProps &
  Omit<React.ComponentPropsWithoutRef<Element>, keyof LumenSurfaceOwnProps | 'as'> & {
    as?: Element | undefined
  }

export default function LumenSurface<Element extends LumenSurfaceElement = 'div'>({
  as: suppliedElement,
  surfaceRole: suppliedSurfaceRole,
  boundary = 'none',
  contentClassName,
  contentPart,
  material = 'glass',
  elevation = 'base',
  glassStrength = 65,
  interactive = false,
  shape = 'rounded',
  state = 'idle',
  tone = 'neutral',
  className = '',
  children,
  style,
  ...props
}: LumenSurfaceProps<Element>) {
  const inheritedSurfaceRole = React.useContext(LumenSurfaceRoleContext)
  const surfaceRole = suppliedSurfaceRole ?? (elevation === 'overlay' ? 'overlay' : inheritedSurfaceRole)
  const element = suppliedElement ?? 'div'
  const Component = element as unknown as React.ComponentType<
    React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>
  >
  const root = React.useRef<HTMLElement>(null)
  const id = `lumen-lens-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [map, setMap] = React.useState('')
  React.useEffect(() => {
    const element = root.current
    // URL backdrop filters are currently rendered reliably by Chromium. Other
    // engines retain the deliberately styled CSS frost surface.
    if (
      !element ||
      material !== 'glass' ||
      (surfaceRole !== undefined && surfaceRole !== 'overlay') ||
      !/Chrome|Chromium|Edg\//.test(navigator.userAgent) ||
      !CSS.supports('backdrop-filter', `url(#${id})`)
    ) {
      return undefined
    }
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bounds = element.getBoundingClientRect()
        if (bounds.width && bounds.height) {
          setMap(createLensMap(bounds.width, bounds.height, parseFloat(getComputedStyle(element).borderRadius) || 16))
        }
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [id, material, surfaceRole])
  const hasLens =
    material === 'glass' &&
    (surfaceRole === undefined || surfaceRole === 'overlay') &&
    Boolean(map) &&
    glassStrength > 0
  let lens = 'frost'
  if (material === 'solid') {
    lens = 'none'
  } else if (hasLens) {
    lens = 'refractive'
  }
  const lensStyle = hasLens ? { backdropFilter: `url(#${id}) blur(${0.12 + glassStrength * 0.002}rem)` } : undefined
  return (
    <Component
      {...(props as unknown as React.HTMLAttributes<HTMLElement>)}
      ref={(node: HTMLElement | null) => {
        root.current = node
      }}
      className={['lumen-effect lumen-surface', styles.surface, className].filter(Boolean).join(' ')}
      style={{ ...lensStyle, ...style }}
      data-lumen-state={state}
      data-lumen-tone={state === 'failed' ? 'danger' : tone}
      data-boundary={boundary}
      data-material={material}
      data-surface-role={surfaceRole}
      data-elevation={elevation}
      data-interactive={interactive}
      data-shape={shape}
      data-lens={lens}
    >
      {hasLens && (
        <svg className={styles.filter} aria-hidden="true" focusable="false">
          <defs>
            <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feImage href={map} width="100%" height="100%" preserveAspectRatio="none" result="lens" />
              <feDisplacementMap
                in="SourceGraphic"
                in2="lens"
                scale={glassStrength * 0.65}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}
      <div
        data-lumen-part={contentPart}
        className={[styles.surfaceContent, contentClassName].filter(Boolean).join(' ')}
      >
        {children}
      </div>
    </Component>
  )
}
