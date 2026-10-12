import * as React from 'react'
import type { LumenToolPaneGeometry } from './tool-pane-layout'

/** ResizeObserver owns measurements; an unmeasured/unsupported environment stays safely single-page. */
export function useToolPaneGeometry(enabled: boolean) {
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const remProbeRef = React.useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = React.useState<LumenToolPaneGeometry | null>(null)
  const [viewportNarrow, setViewportNarrow] = React.useState(true)

  React.useEffect(() => {
    const body = bodyRef.current
    const probe = remProbeRef.current
    if (!enabled || !body || !probe || typeof ResizeObserver !== 'function') {
      setGeometry(null)
      return undefined
    }
    let active = true
    let frame: number | null = null
    const measure = () => {
      if (!active) {
        return
      }
      // Used CSS width preserves subpixel boundaries without screen transforms
      // or clientWidth's integer rounding. Callers choose the flow container:
      // tools measure after sidebar allocation; sidebar sizing measures the whole workspace.
      const style = getComputedStyle(body)
      const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const border = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
      const availableInlineSizePx =
        Number.parseFloat(style.width) - (style.boxSizing === 'border-box' ? padding + border : 0)
      const rootFontSizePx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      const next = { availableInlineSizePx, rootFontSizePx }
      setViewportNarrow(window.matchMedia('(max-width: 47.9375rem)').matches)
      setGeometry((previous) =>
        previous?.availableInlineSizePx === next.availableInlineSizePx &&
        previous.rootFontSizePx === next.rootFontSizePx
          ? previous
          : next,
      )
    }
    const schedule = () => {
      if (active && frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null
          measure()
        })
      }
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(body)
    // A zero-height, 1rem flow probe detects root font changes even if the
    // viewport and body pixel widths do not change. It is not user content.
    observer.observe(probe)
    const rootObserver = new MutationObserver(schedule)
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    window.addEventListener('resize', schedule)
    measure()
    return () => {
      active = false
      observer.disconnect()
      rootObserver.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
    }
  }, [enabled])

  return { bodyRef, remProbeRef, geometry, viewportNarrow }
}
