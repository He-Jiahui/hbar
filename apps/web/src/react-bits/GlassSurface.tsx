import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import './GlassSurface.css'
import { DEFAULT_THEME_PROFILE, type ThemeProfile } from '@hbar/contracts'

type Channel = 'R' | 'G' | 'B'
type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus-darker'
  | 'plus-lighter'

export interface GlassSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style'> {
  /** The reference host supplies its resolved profile; Desktop uses the Lumen provider. */
  themeProfile?: ThemeProfile
  children?: ReactNode
  width?: number | string
  height?: number | string
  borderRadius?: number
  borderWidth?: number
  brightness?: number
  opacity?: number
  blur?: number
  displace?: number
  backgroundOpacity?: number
  saturation?: number
  distortionScale?: number
  redOffset?: number
  greenOffset?: number
  blueOffset?: number
  xChannel?: Channel
  yChannel?: Channel
  mixBlendMode?: BlendMode
  style?: CSSProperties
}

type SurfaceStyle = CSSProperties & {
  '--glass-frost': number
  '--glass-saturation': number
  '--glass-blur': string
  '--glass-elasticity': number
  '--glass-aberration': number
  '--glass-transition-duration': string
  '--filter-id': string
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return reduced
}

function supportsSvgFilters(filterId: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)
  if (isSafari || isFirefox) return false
  const probe = document.createElement('div')
  probe.style.backdropFilter = `url(#${filterId})`
  return probe.style.backdropFilter !== ''
}

/**
 * React Bits GlassSurface with an hbar-sized fallback. The SVG displacement
 * filter is retained for Chromium while Safari/Firefox use the documented
 * backdrop-filter path from the source component.
 */
export default function GlassSurface({
  children,
  themeProfile = DEFAULT_THEME_PROFILE,
  width = '100%',
  height = 'auto',
  borderRadius,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur,
  displace,
  backgroundOpacity,
  saturation,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = 'R',
  yChannel = 'G',
  mixBlendMode = 'difference',
  className = '',
  style,
  ...rest
}: GlassSurfaceProps) {
  const effectiveTheme = themeProfile
  const prefersReducedMotion = usePrefersReducedMotion()
  const motionDisabled =
    effectiveTheme.motion.intensity === 'off' || (effectiveTheme.motion.respectReducedMotion && prefersReducedMotion)
  const resolvedBorderRadius = borderRadius ?? effectiveTheme.surface.cornerRadius
  const resolvedBlur = blur ?? effectiveTheme.surface.blurAmount
  const resolvedDisplace = motionDisabled ? 0 : (displace ?? effectiveTheme.surface.displacementScale)
  const resolvedBackgroundOpacity = backgroundOpacity ?? effectiveTheme.surface.backgroundOpacity
  const resolvedSaturation = saturation ?? effectiveTheme.surface.saturation / 100
  const resolvedAberration = motionDisabled ? 0 : effectiveTheme.surface.aberrationIntensity
  const resolvedElasticity = motionDisabled ? 0 : effectiveTheme.surface.elasticity
  const uniqueId = useId().replace(/:/g, '-')
  const filterId = `glass-filter-${uniqueId}`
  const redGradId = `red-grad-${uniqueId}`
  const blueGradId = `blue-grad-${uniqueId}`
  const [svgSupported, setSvgSupported] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<SVGFEImageElement>(null)
  const redChannelRef = useRef<SVGFEDisplacementMapElement>(null)
  const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null)
  const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null)
  const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null)

  const generateDisplacementMap = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    const actualWidth = rect?.width || 400
    const actualHeight = rect?.height || 200
    const edgeSize = Math.min(actualWidth, actualHeight) * (borderWidth * 0.5)
    const svgContent = `<svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient><linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient></defs><rect width="${actualWidth}" height="${actualHeight}" fill="black"/><rect width="${actualWidth}" height="${actualHeight}" rx="${resolvedBorderRadius}" fill="url(#${redGradId})"/><rect width="${actualWidth}" height="${actualHeight}" rx="${resolvedBorderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode:${mixBlendMode}"/><rect x="${edgeSize}" y="${edgeSize}" width="${Math.max(0, actualWidth - edgeSize * 2)}" height="${Math.max(0, actualHeight - edgeSize * 2)}" rx="${resolvedBorderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${resolvedBlur}px)"/></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svgContent)}`
  }, [blueGradId, borderWidth, brightness, mixBlendMode, opacity, redGradId, resolvedBlur, resolvedBorderRadius])

  const updateDisplacementMap = useCallback(() => {
    imageRef.current?.setAttribute('href', generateDisplacementMap())
  }, [generateDisplacementMap])

  useEffect(() => {
    setSvgSupported(supportsSvgFilters(filterId))
  }, [filterId])

  useEffect(() => {
    updateDisplacementMap()
    const channels = [
      { ref: redChannelRef, offset: redOffset },
      { ref: greenChannelRef, offset: greenOffset },
      { ref: blueChannelRef, offset: blueOffset },
    ]
    for (const [index, channel] of channels.entries()) {
      const chromaticOffset = (index - 1) * resolvedAberration * 8
      channel.ref.current?.setAttribute('scale', String(distortionScale + channel.offset + chromaticOffset))
      channel.ref.current?.setAttribute('xChannelSelector', xChannel)
      channel.ref.current?.setAttribute('yChannelSelector', yChannel)
    }
    gaussianBlurRef.current?.setAttribute('stdDeviation', String(resolvedDisplace))
  }, [
    distortionScale,
    greenOffset,
    redOffset,
    blueOffset,
    resolvedAberration,
    updateDisplacementMap,
    xChannel,
    yChannel,
    resolvedDisplace,
  ])

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateDisplacementMap())
    observer.observe(element)
    return () => observer.disconnect()
  }, [updateDisplacementMap])

  const containerStyle: SurfaceStyle = {
    ...style,
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: `${resolvedBorderRadius}px`,
    '--glass-frost': resolvedBackgroundOpacity,
    '--glass-saturation': resolvedSaturation,
    '--glass-blur': `${resolvedBlur}px`,
    '--glass-elasticity': resolvedElasticity,
    '--glass-aberration': resolvedAberration,
    '--glass-transition-duration': motionDisabled ? '0ms' : `${160 + Math.round(resolvedElasticity * 140)}ms`,
    '--filter-id': `url(#${filterId})`,
  }

  return (
    <div
      ref={containerRef}
      {...rest}
      className={`glass-surface ${svgSupported ? 'glass-surface--svg' : 'glass-surface--fallback'}${className ? ` ${className}` : ''}`}
      style={containerStyle}
    >
      <svg className="glass-surface__filter" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={imageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            <feDisplacementMap ref={redChannelRef} in="SourceGraphic" in2="map" result="dispRed" />
            <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red" />
            <feDisplacementMap ref={greenChannelRef} in="SourceGraphic" in2="map" result="dispGreen" />
            <feColorMatrix
              in="dispGreen"
              type="matrix"
              values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
              result="green"
            />
            <feDisplacementMap ref={blueChannelRef} in="SourceGraphic" in2="map" result="dispBlue" />
            <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue" />
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0" />
          </filter>
        </defs>
      </svg>
      <div className="glass-surface__content">{children}</div>
    </div>
  )
}
