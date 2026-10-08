import { createRoot, type Root } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { z } from 'zod'
import * as echarts from 'echarts/core'
import { DEFAULT_LUMEN_APPEARANCE, LumenContentText, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { usageQueryResultSchema } from '@hbar/contracts/commands/usage'
import { EchartsChart, type EChartsOption } from '../../packages/app-react/src/echarts-chart'
import { monitoringReport } from './session-monitoring-content-data'
import { echartsReadingLabel } from './echarts-reading-data'
import '@lumen/app-ui/styles.css'

export interface EchartsReadingInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly textSize: 's' | 'l'
  readonly motion: boolean
  readonly count: number
  readonly seriesCount: number
}
const createFixture = (input: EchartsReadingInput) => createStore(() => ({ input }))
type FixtureStore = ReturnType<typeof createFixture>
const optionSchema = z.object({
  textStyle: z.object({ color: z.string(), fontFamily: z.string(), fontSize: z.number() }),
  animation: z.boolean(),
  series: z.array(z.object({ id: z.string(), data: z.array(z.number()) }).nullable()).optional(),
  xAxis: z.array(z.object({ axisLabel: z.object({ color: z.string(), fontSize: z.number() }) })).optional(),
})
let root: Root | undefined
let store: FixtureStore | undefined
let retained: echarts.ECharts | undefined
function Fixture({ owner }: { readonly owner: FixtureStore }) {
  const { input } = useStore(owner)
  const report = usageQueryResultSchema.parse(monitoringReport('original-session', 1, input.count))
  const label = echartsReadingLabel(input.locale)
  const option: EChartsOption = {
    xAxis: { type: 'category', data: report.series.map((bucket) => bucket.start), axisLabel: { show: false } },
    yAxis: { type: 'value' },
    series: Array.from({ length: input.seriesCount }, (_, index) => ({
      id: `original-series-${index}`,
      type: 'line',
      showSymbol: false,
      data: report.series.map((bucket) => bucket.input + index),
    })),
  }
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode === 'light' ? 'dark' : 'light' }}>
      <LumenProvider
        withCssBaseline={false}
        appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: input.textSize, motion: input.motion }}
      >
        <LumenFrame
          as="main"
          aria-label={label}
          style={{
            minInlineSize: 0,
            maxInlineSize: '100%',
            padding: '1rem',
            zoom: 1.25,
            backgroundColor: 'var(--lumen-canvas)',
          }}
        >
          <LumenContentText context="section.title">{label}</LumenContentText>
          <EchartsChart option={option} height="12rem" label={label} className="owned-echarts-reading" />
        </LumenFrame>
      </LumenProvider>
    </LumenProvider>
  )
}
declare global {
  interface Window {
    mountEchartsReading(input: EchartsReadingInput): void
    updateEchartsReading(input: EchartsReadingInput): void
    echartsReadingSnapshot(): {
      readonly option: z.infer<typeof optionSchema>
      readonly id: string
      readonly width: number
      readonly height: number
      readonly ownColor: string
      readonly outerColor: string
      readonly ownFontSize: number
      readonly ownMuted: string
    } | null
    releaseEchartsReading(): boolean
    canRenderEchartsBuckets(count: number): boolean
  }
}
window.mountEchartsReading = (input) => {
  root?.unmount()
  retained = undefined
  store = createFixture(input)
  root = createRoot(document.getElementById('root') ?? document.body)
  root.render(<Fixture owner={store} />)
}
window.updateEchartsReading = (input) => store?.setState({ input })
window.echartsReadingSnapshot = () => {
  const element = document.querySelector<HTMLElement>('.owned-echarts-reading')
  if (!element) return null
  const instance = echarts.getInstanceByDom(element)
  if (!instance) return null
  retained = instance
  const style = getComputedStyle(element)
  const outer = document.querySelector<HTMLElement>('[data-lumen-mode]')
  return {
    option: optionSchema.parse(instance.getOption()),
    id: instance.id,
    width: instance.getWidth(),
    height: instance.getHeight(),
    ownColor: style.getPropertyValue('--lumen-ink').trim(),
    outerColor: outer ? getComputedStyle(outer).getPropertyValue('--lumen-ink').trim() : '',
    ownFontSize: Number.parseFloat(style.fontSize),
    ownMuted: style.getPropertyValue('--lumen-muted').trim(),
  }
}
window.releaseEchartsReading = () => {
  root?.unmount()
  root = undefined
  return retained?.isDisposed() ?? false
}
window.canRenderEchartsBuckets = (count) =>
  usageQueryResultSchema.safeParse(monitoringReport('original-session', 1, count)).success
