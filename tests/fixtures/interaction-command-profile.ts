import { z } from 'zod'
import { emptyUsage } from '@hbar/contracts'
import {
  definePlugin,
  provide,
  type BrowserUseService,
  type ComputerUseService,
  type HarnessDriver,
} from '@hbar/plugin-sdk'
import type { KernelProfile } from '@hbar/kernel'

const page = (sessionId: string) => ({
  contextId: 'test-context',
  pageId: 'test-page',
  url: 'https://fixture.invalid/',
  title: sessionId,
})
const screen = { width: 1, height: 1, mime: 'image/png', data: 'fixture-screen' }
const action = (name: string, sessionId: string) => ({ action: name, accepted: true, message: sessionId })
const browser = definePlugin({
  manifest: {
    id: 'browser-use.codex',
    name: 'Interaction command browser fixture',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    permissions: [],
    provides: { browser: '1.0.0', 'browser-use': '1.0.0' },
    description: 'Record scoped browser commands',
  },
  apply(ctx) {
    const service: BrowserUseService = {
      status: async (id) => ({ available: true, contexts: [page(id)], history: [] }),
      navigate: async (id) => page(id),
      go: async (id) => page(id),
      snapshot: async (id) => ({ page: page(id), text: id, truncated: false }),
      click: async (id) => page(id),
      type: async (id) => page(id),
      press: async (id) => page(id),
      screenshot: async (id) => ({ page: page(id), mime: 'image/png', data: 'fixture-screen', truncated: false }),
      evaluate: async (id) => ({ value: id }),
      close: async () => ({ closed: true }),
      history: async (id) => [id],
    }
    provide(ctx, 'browser', service)
    provide(ctx, 'browser-use', service)
  },
})
const computer = definePlugin({
  manifest: {
    id: 'computer-use.codex',
    name: 'Interaction command computer fixture',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    permissions: [],
    provides: { computer: '1.0.0', 'computer-use': '1.0.0' },
    description: 'Record scoped desktop commands',
  },
  apply(ctx) {
    const service: ComputerUseService = {
      status: async (id) => ({ available: true, platform: 'fixture', appId: id }),
      screenshot: async () => screen,
      click: async (id) => action('click', id),
      doubleClick: async (id) => action('doubleClick', id),
      type: async (id) => action('type', id),
      key: async (id) => action('key', id),
      scroll: async (id) => action('scroll', id),
      move: async (id) => action('move', id),
      wait: async (id) => action('wait', id),
      launch: async (id) => action('launch', id),
    }
    provide(ctx, 'computer', service)
    provide(ctx, 'computer-use', service)
  },
})
const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Interaction command driver fixture',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    permissions: [],
    provides: { driver: '1.0.0' },
    description: 'Execute a bounded command batch through normal tool admission',
  },
  apply(ctx) {
    provide<HarnessDriver>(ctx, 'driver', {
      async run(input) {
        const calls = z.array(z.record(z.string(), z.json())).max(24).parse(JSON.parse(input.run.input.text))
        const stepId = crypto.randomUUID()
        await input.beforeRequest(input.request, stepId)
        const results = []
        for (const call of calls) results.push(await input.execute('hbar_command_execute', call, crypto.randomUUID()))
        await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, stepId)
        await input.commit('assistant', [{ type: 'text', text: JSON.stringify(results) }])
        await input.stepEnded(stepId)
      },
      summarize: async () => ({ text: '', usage: emptyUsage() }),
    })
  },
})
export default {
  replacements: { 'driver.pi': driver, 'browser-use.codex': browser, 'computer-use.codex': computer },
} satisfies KernelProfile
