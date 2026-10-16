import { createRoot } from 'react-dom/client'
import { DEFAULT_LUMEN_APPEARANCE, LumenProvider } from '@lumen/app-ui'
import { HbarInputCacheMetrics } from '../../packages/app-react/src/input-cache-metrics'
import { inputCacheCopy } from '../../apps/web/src/input-cache-copy'
import { inputCacheReport } from './input-cache-report'
import '@lumen/app-ui/styles.css'

interface CacheFixtureOptions {
  readonly locale: 'zh-CN' | 'en-US'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly lastRate?: number
  readonly longLabels?: boolean
}
declare global {
  interface Window {
    hbarInputCacheFixture: { render(options: CacheFixtureOptions): void }
  }
}
const mount = document.getElementById('fixture-root')
if (!mount) throw new Error('Missing cache fixture mount')
const root = createRoot(mount)
window.hbarInputCacheFixture = {
  render(options) {
    const base = inputCacheCopy(options.locale)
    const labels = options.longLabels
      ? { ...base, title: base.title.repeat(12), description: base.description.repeat(6) }
      : base
    document.documentElement.dataset.lumenMode = options.mode
    root.render(
      <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: options.mode }}>
        <HbarInputCacheMetrics report={inputCacheReport(options.count, options.lastRate)} labels={labels} />
      </LumenProvider>,
    )
  },
}
window.hbarInputCacheFixture.render({ locale: 'zh-CN', mode: 'light', count: 12 })
