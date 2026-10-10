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
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { LumenFrame } from '@lumen/app-ui'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, TitleComponent, LegendComponent, CanvasRenderer])

export type { EChartsOption }

/** Resolve a CSS token to a Canvas-safe color; ECharts does not evaluate var()/color-mix(). */
function colorToken(name: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color.trim()
  probe.remove()
  return resolved || getComputedStyle(document.documentElement).color.trim() || 'transparent'
}

/** Build a minimal echarts theme from the current lumen CSS tokens. */
function buildTheme() {
  const root = getComputedStyle(document.documentElement)
  const fontSize = Number.parseFloat(root.fontSize)
  return {
    textStyle: {
      color: colorToken('--lumen-ink'),
      ...(root.fontFamily ? { fontFamily: root.fontFamily } : {}),
      ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
    },
    axisLabel: { color: colorToken('--lumen-muted') },
    axisLine: { lineStyle: { color: colorToken('--lumen-edge') } },
    splitLine: { lineStyle: { color: colorToken('--lumen-edge') } },
    itemStyle: { color: colorToken('--lumen-accent') },
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

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function EchartsChart({ option, height = '10rem', label, className }: EchartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const optionRef = useRef(option)
  optionRef.current = option

  const applyOption = useCallback((chart: echarts.ECharts) => {
    const theme = buildTheme()
    const current = optionRef.current
    const axisTheme = {
      axisLine: { lineStyle: { color: theme.axisLine.lineStyle.color } },
      axisLabel: { color: theme.axisLabel.color },
      splitLine: { lineStyle: { color: theme.splitLine.lineStyle.color } },
    }
    const themed: EChartsOption = {
      animation: !reducedMotion(),
      textStyle: theme.textStyle,
      color: [theme.itemStyle.color],
      grid: { left: 48, right: 12, top: 12, bottom: 32, containLabel: false },
      ...current,
      ...(current.xAxis
        ? {
            xAxis: Array.isArray(current.xAxis)
              ? current.xAxis.map((axis) => ({ ...axisTheme, ...axis }))
              : { ...axisTheme, ...current.xAxis },
          }
        : {}),
      ...(current.yAxis
        ? {
            yAxis: Array.isArray(current.yAxis)
              ? current.yAxis.map((axis) => ({ ...axisTheme, ...axis }))
              : { ...axisTheme, ...current.yAxis },
          }
        : {}),
    }
    chart.setOption(themed, { notMerge: false, lazyUpdate: true })
  }, [])

  // Init chart once on mount.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    instanceRef.current = chart
    applyOption(chart)
    const observer = new MutationObserver(() => applyOption(chart))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motionChanged = () => applyOption(chart)
    if (media.addEventListener) media.addEventListener('change', motionChanged)
    else media.addListener?.(motionChanged)
    return () => {
      observer.disconnect()
      if (media.removeEventListener) media.removeEventListener('change', motionChanged)
      else media.removeListener?.(motionChanged)
      chart.dispose()
      instanceRef.current = null
    }
  }, [applyOption])

  // Update option on every render except the first (init handles that).
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    if (instanceRef.current) applyOption(instanceRef.current)
  }, [option, applyOption])

  // Resize chart when container dimensions change.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => instanceRef.current?.resize())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <LumenFrame
      ref={containerRef}
      role="img"
      aria-label={label}
      className={className}
      style={{ width: '100%', height, minWidth: 0 }}
    />
  )
}
