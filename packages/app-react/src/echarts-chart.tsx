/**
 * Shared echarts React wrapper for hbar visualisation surfaces.
 *
 * The Lumen reading surface owns accessible copy and theme values. ECharts
 * owns only its generated canvas DOM. Appearance, resize and motion updates
 * share one bounded animation-frame queue and are released on unmount.
 */
import { useLayoutEffect, useRef } from 'react'
import { LumenFrame } from '@lumen/app-ui'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { readingEchartsOption, type EchartsReadingTheme } from './echarts-chart-model'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, TitleComponent, LegendComponent, CanvasRenderer])

export type { EChartsOption }

function readingTheme(element: HTMLElement, reducedMotion: boolean): EchartsReadingTheme {
  const style = getComputedStyle(element)
  const token = (name: string) => style.getPropertyValue(name).trim()
  const duration = token('--lumen-motion-duration')
  const amount = Number.parseFloat(duration)
  return {
    foreground: token('--lumen-ink') || style.color,
    muted: token('--lumen-muted') || style.color,
    edge: token('--lumen-edge') || style.borderColor,
    info: token('--lumen-info') || style.color,
    fontFamily: style.fontFamily,
    fontSize: Number.parseFloat(style.fontSize),
    animation: !reducedMotion && element.closest('[data-lumen-motion]')?.getAttribute('data-lumen-motion') !== 'off',
    duration: Number.isFinite(amount) ? amount * (duration.endsWith('ms') ? 1 : 1000) : 0,
  }
}

export interface EchartsChartProps {
  readonly option: EChartsOption
  /** CSS height value, e.g. "12rem" or "200px". Defaults to "10rem". */
  readonly height?: string | undefined
  /** Accessible label for the chart container. */
  readonly label: string
  readonly className?: string | undefined
}

export function EchartsChart({ option, height = '10rem', label, className }: EchartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const optionRef = useRef(option)
  const applyRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    optionRef.current = option
    applyRef.current?.()
  }, [option])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const chart = echarts.init(element, undefined, { renderer: 'canvas' })
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame: number | null = null
    let disposed = false
    const apply = () => {
      if (disposed) return
      chart.setOption(readingEchartsOption(optionRef.current, readingTheme(element, motion.matches)), {
        notMerge: false,
        replaceMerge: ['series', 'xAxis', 'yAxis'],
        lazyUpdate: true,
      })
    }
    const schedule = () => {
      if (disposed || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        apply()
        chart.resize()
      })
    }
    applyRef.current = apply
    apply()
    const resize = new ResizeObserver(schedule)
    resize.observe(element)
    const appearance = new MutationObserver(schedule)
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      appearance.observe(ancestor, { attributes: true })
    }
    motion.addEventListener('change', schedule)
    return () => {
      disposed = true
      applyRef.current = null
      if (frame !== null) cancelAnimationFrame(frame)
      resize.disconnect()
      appearance.disconnect()
      motion.removeEventListener('change', schedule)
      chart.dispose()
    }
  }, [])

  return (
    <LumenFrame
      ref={containerRef}
      role="img"
      aria-label={label}
      className={className}
      style={{
        inlineSize: '100%',
        maxInlineSize: '100%',
        minInlineSize: 0,
        height,
        fontFamily: 'var(--lumen-font-body)',
        fontSize: 'var(--lumen-font-size-supporting)',
      }}
    />
  )
}
