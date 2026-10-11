import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as echarts from 'echarts/core'
import { EchartsChart, type EChartsOption } from '../../packages/app-react/src/echarts-chart'

interface FixtureState {
  hidden: boolean
  mounted: boolean
  variant: 'two' | 'one' | 'empty'
  explicitAnimation: boolean
}
interface FixtureApi {
  render(patch: Partial<FixtureState>): void
  snapshot(): { id: string; width: number; height: number; option: unknown } | null
  selectLegend(name: string): void
  showTooltip(): void
  isRegistered(id: string): boolean
}
declare global {
  interface Window {
    hbarEchartsFixture: FixtureApi
  }
}

const rootElement = document.getElementById('fixture-root')
if (!rootElement) throw new Error('Missing ECharts fixture root')
const root = createRoot(rootElement)
let state: FixtureState = { hidden: true, mounted: true, variant: 'two', explicitAnimation: true }

function option(variant: FixtureState['variant']): EChartsOption {
  const series = [
    {
      id: 'reader',
      name: 'Reader',
      type: 'bar' as const,
      data: [2, 4],
      ...(state.explicitAnimation ? { animation: true } : {}),
    },
    {
      id: 'writer',
      name: 'Writer',
      type: 'line' as const,
      data: [3, 5],
      ...(state.explicitAnimation ? { animation: true } : {}),
    },
  ]
  return {
    animation: true,
    legend: {},
    grid: { bottom: 64 },
    tooltip: { trigger: 'axis' },
    xAxis:
      variant === 'empty'
        ? []
        : [{ id: 'primary-x', type: 'category', data: ['A <img src=x data-audit-marker=tooltip>', 'B'] }],
    yAxis: variant === 'empty' ? [] : [{ id: 'primary-y', type: 'value' }],
    series: variant === 'two' ? series : variant === 'one' ? series.slice(1) : [],
  }
}

window.hbarEchartsFixture = {
  render(patch) {
    state = { ...state, ...patch }
    root.render(
      <StrictMode>
        <main style={{ display: state.hidden ? 'none' : 'block' }}>
          {state.mounted && <EchartsChart option={option(state.variant)} height="16rem" label="Fixture chart" />}
        </main>
      </StrictMode>,
    )
  },
  snapshot() {
    const container = rootElement.querySelector<HTMLDivElement>('[role=img]')
    const chart = container && echarts.getInstanceByDom(container)
    return chart
      ? { id: chart.id, width: chart.getWidth(), height: chart.getHeight(), option: chart.getOption() }
      : null
  },
  selectLegend(name) {
    const container = rootElement.querySelector<HTMLDivElement>('[role=img]')
    const chart = container && echarts.getInstanceByDom(container)
    if (!chart) throw new Error('Fixture chart has not initialized')
    chart.dispatchAction({ type: 'legendToggleSelect', name })
  },
  showTooltip() {
    const container = rootElement.querySelector<HTMLDivElement>('[role=img]')
    const chart = container && echarts.getInstanceByDom(container)
    if (!chart) throw new Error('Fixture chart has not initialized')
    chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 })
  },
  isRegistered: (id) => Boolean(echarts.getInstanceById(id)),
}
window.hbarEchartsFixture.render({})
