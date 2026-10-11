import { createRoot } from 'react-dom/client'
import { DEFAULT_LUMEN_APPEARANCE, LumenProvider } from '@lumen/app-ui'
import { createAppRuntime } from '@hbar/app-runtime'
import { usageQueryInputSchema } from '@hbar/contracts/commands/usage'
import { HbarRuntimeProvider } from '../../packages/app-react/src/runtime'
import { HbarSettingsUsage } from '../../packages/app-react/src/settings-usage'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { settingsUsageReport } from './settings-usage-report'
import '@lumen/app-ui/styles.css'

interface FixtureApi {
  replace(count: number): Promise<void>
  render(locale: 'zh-CN' | 'en-US', longLabels?: boolean, mode?: 'light' | 'dark'): void
  requests(): number
}
declare global {
  interface Window {
    hbarUsagePaginationFixture: FixtureApi
  }
}
const element = document.getElementById('fixture-root')
if (!element) throw new Error('Missing settings usage fixture mount')
const root = createRoot(element)
let modelCount = 17
let requests = 0
const runtime = createAppRuntime({
  instanceId: 'pagination-fixture',
  hostId: 'pagination-host',
  directory: {
    execute: (name) =>
      Promise.resolve(name === 'workspace.get' || name === 'session.get' ? null : { items: [], nextCursor: null }),
  },
  usage: {
    execute: (_name, input) => {
      requests++
      return Promise.resolve(settingsUsageReport(usageQueryInputSchema.parse(input), modelCount))
    },
  },
  surfaces: { canRender: (id) => id === 'settings' },
})
window.hbarUsagePaginationFixture = {
  async replace(count) {
    modelCount = count
    await runtime.view.commands.execute('settingsUsage.refresh', { instanceId: 'settings' })
  },
  render(locale, longLabels = false, mode = 'light') {
    const copy = getShellCopy(locale).settingsUsage
    const labels = longLabels
      ? {
          ...copy,
          previous: copy.previous.repeat(20),
          next: copy.next.repeat(20),
          description: copy.description.repeat(10),
        }
      : copy
    document.documentElement.dataset.lumenMode = mode
    root.render(
      <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode }}>
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSettingsUsage instanceId="settings" connected labels={labels} />
        </HbarRuntimeProvider>
      </LumenProvider>,
    )
  },
  requests: () => requests,
}
async function start() {
  await runtime.ready
  await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'usage', instanceId: 'settings' })
  window.hbarUsagePaginationFixture.render('en-US')
}
void start().catch((reason: unknown) => console.error('Settings usage fixture failed', reason))
window.addEventListener('pagehide', () => runtime.dispose(), { once: true })
