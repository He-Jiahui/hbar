/**
 * Shared echarts React wrapper for hbar visualisation surfaces.
 *
 * Reads lumen CSS token values at mount/resize so charts always match the
 * active theme without a JS theme registry. Respects prefers-reduced-motion
 * by disabling echarts animations when the user has requested it.
 *
 * Usage:
 *   <EchartsChart option={echartsOption} height="12rem" label="Token usage" />
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  CanvasRenderer,
])

export type { EChartsOption }

/** Read a single CSS custom property value from the document root. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Build a minimal echarts theme from the current lumen CSS tokens. */
function buildTheme() {
  return {
    textStyle: { color: token('--lumen-ink') || '#eeeeee', fontFamily: 'inherit', fontSize: 12 },
    axisLabel: { color: token('--lumen-muted') || '#aaaaaa' },
    axisLine: { lineStyle: { color: token('--lumen-edge') || 'rgba(255,255,255,0.17)' } },
    splitLine: { lineStyle: { color: token('--lumen-edge') || 'rgba(255,255,255,0.17)' } },
    itemStyle: { color: token('--lumen-accent') || '#7c6af7' },
    backgroundColor: 'transparent',
  }
}

export interface EchartsChartProps {
  readonly option: EChartsOption
  /** CSS height value, e.g. "12rem" or "200px". Defaults to "10rem". */
  readonly height?: string
  /** Accessible label for the chart container. */
  readonly label: string
  readonly className?: string
}

const REDUCED_MOTION = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false

export function EchartsChart({ option, height = '10rem', label, className }: EchartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  // Init chart once on mount.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const theme = buildTheme()
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    instanceRef.current = chart
    chart.setOption({
      animation: !REDUCED_MOTION,
      animationDuration: 220,
      animationEasing: 'cubicOut',
      textStyle: theme.textStyle,
      grid: { left: 48, right: 12, top: 12, bottom: 32, containLabel: false },
      ...option,
      xAxis: Array.isArray(option.xAxis)
        ? (option.xAxis as object[]).map((a) => ({ axisLine: { lineStyle: { color: theme.axisLine.lineStyle.color } }, axisLabel: { color: theme.axisLabel.color }, splitLine: { lineStyle: { color: theme.splitLine.lineStyle.color } }, ...a as object }))
        : option.xAxis
          ? { axisLine: { lineStyle: { color: theme.axisLine.lineStyle.color } }, axisLabel: { color: theme.axisLabel.color }, splitLine: { lineStyle: { color: theme.splitLine.lineStyle.color } }, ...option.xAxis as object }
          : undefined,
      yAxis: Array.isArray(option.yAxis)
        ? (option.yAxis as object[]).map((a) => ({ axisLine: { lineStyle: { color: theme.axisLine.lineStyle.color } }, axisLabel: { color: theme.axisLabel.color }, splitLine: { lineStyle: { color: theme.splitLine.lineStyle.color } }, ...a as object }))
        : option.yAxis
          ? { axisLine: { lineStyle: { color: theme.axisLine.lineStyle.color } }, axisLabel: { color: theme.axisLabel.color }, splitLine: { lineStyle: { color: theme.splitLine.lineStyle.color } }, ...option.yAxis as object }
          : undefined,
    })
    return () => {
      chart.dispose()
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update option on every render except the first (init handles that).
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    instanceRef.current?.setOption(option, { notMerge: false, lazyUpdate: true })
  }, [option])

  // Resize chart when container dimensions change.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => instanceRef.current?.resize())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      className={className}
      style={{ width: '100%', height, minWidth: 0 }}
    />
  )
}
