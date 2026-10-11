/**
 * Shared echarts React wrapper for hbar visualisation surfaces.
 *
 * Reads lumen CSS token values at mount and theme changes so charts match the
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
  return (
    (typeof document !== 'undefined' && document.documentElement.dataset.lumenMotion === 'off') ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
}

export function EchartsChart({ option, height = '10rem', label, className }: EchartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const optionRef = useRef(option)
  optionRef.current = option

  const applyOption = useCallback((chart: echarts.ECharts) => {
    const theme = buildTheme()
    const current = optionRef.current
    const reduce = reducedMotion()
    const axisTheme = {
      axisLine: { lineStyle: { color: theme.axisLine.lineStyle.color } },
      axisLabel: { color: theme.axisLabel.color },
      splitLine: { lineStyle: { color: theme.splitLine.lineStyle.color } },
    }
    const themed: EChartsOption = {
      textStyle: theme.textStyle,
      color: [theme.itemStyle.color],
      grid: { left: 48, right: 12, top: 12, bottom: 32, containLabel: false },
      ...current,
      animation: reduce ? false : (current.animation ?? true),
      series: (Array.isArray(current.series) ? current.series : current.series ? [current.series] : []).map(
        (series) => ({
          ...series,
          animation: reduce ? false : (series.animation ?? current.animation ?? true),
        }),
      ),
      xAxis: [],
      yAxis: [],
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
    // Reconcile structural collections by ID; normal merge keeps removed series/axes alive.
    // Leave legend state on the existing instance so theme/data updates preserve user selections.
    chart.setOption(themed, { replaceMerge: ['series', 'xAxis', 'yAxis'], lazyUpdate: true })
  }, [])

  // Initialize only after layout gives the container usable dimensions, including hidden panes.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const synchronize = () => {
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return
      const chart = instanceRef.current
      if (chart) chart.resize()
      else {
        const initialized = echarts.init(container, undefined, { renderer: 'canvas' })
        instanceRef.current = initialized
        applyOption(initialized)
      }
    }
    synchronize()
    const resizeObserver = new ResizeObserver(synchronize)
    resizeObserver.observe(container)
    const refresh = () => {
      if (instanceRef.current) applyOption(instanceRef.current)
    }
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-lumen-mode', 'data-lumen-motion'],
    })
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.addEventListener) media.addEventListener('change', refresh)
    else media.addListener?.(refresh)
    return () => {
      resizeObserver.disconnect()
      observer.disconnect()
      if (media.removeEventListener) media.removeEventListener('change', refresh)
      else media.removeListener?.(refresh)
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [applyOption])

  // A delayed initialization reads optionRef, so hidden panes receive the latest option.
  useEffect(() => {
    if (instanceRef.current) applyOption(instanceRef.current)
  }, [option, applyOption])

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
