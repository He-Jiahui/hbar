import {
  LumenFloatingSurface,
  useFloatingTrigger as useSharedFloatingTrigger,
  type FloatingSurfaceMaterial,
  type FloatingPlacement,
  type FloatingResponsivePresentation,
} from '@lumen/app-ui'
import { DEFAULT_THEME_PROFILE, type ThemeProfile } from '@hbar/contracts'
import type { HTMLAttributes, RefObject } from 'react'
import './floating-surface.css'

type AppFloatingSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  readonly open: boolean
  readonly onClose: () => void
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly initialFocusRef?: RefObject<HTMLElement | null>
  readonly focusBehavior?: 'surface' | 'preserve'
  readonly placement?: FloatingPlacement
  readonly responsivePresentation?: FloatingResponsivePresentation
  readonly label: string
  readonly material?: ThemeProfile['surface']
}

function mapMaterial(material: ThemeProfile['surface']): FloatingSurfaceMaterial {
  const kind = material.mode === 'solid' ? 'solid' : material.mode === 'liquid-glass' ? 'glass' : 'frost'
  return { kind, blurAmount: material.blurAmount }
}

/**
 * hbar's theme-aware compatibility wrapper around the shared Lumen surface.
 * ThemeProfile stays an app concern; portal, geometry, dismissal and focus
 * coordination live in @lumen/app-ui so both app-react and Lumen controls
 * participate in one active-surface coordinator.
 */
export function FloatingSurface({
  open,
  onClose,
  anchorRef,
  initialFocusRef,
  focusBehavior,
  placement,
  responsivePresentation,
  label,
  children,
  className,
  material = DEFAULT_THEME_PROFILE.surface,
  ...attributes
}: AppFloatingSurfaceProps) {
  return (
    <LumenFloatingSurface
      {...attributes}
      open={open}
      onClose={onClose}
      mode="anchored"
      anchorRef={anchorRef}
      initialFocusRef={initialFocusRef}
      focusBehavior={focusBehavior}
      placement={placement}
      responsivePresentation={responsivePresentation}
      label={label}
      role={attributes.role ?? 'dialog'}
      material={mapMaterial(material)}
      className={`hbar-floating-surface ${className ?? ''}`}
    >
      {children}
    </LumenFloatingSurface>
  )
}

export const useFloatingTrigger = useSharedFloatingTrigger
