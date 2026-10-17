import { join } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import type { KernelProfile } from '@hbar/kernel'

const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Backend startup fixture',
    description: 'Hold restored tasks until startup settings can be inspected',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    permissions: [],
    provides: { driver: '1.0.0' },
  },
  apply(ctx) {
    provide<HarnessDriver>(ctx, 'driver', {
      async run(input) {
        const stepId = crypto.randomUUID()
        await input.beforeRequest(input.request, stepId)
        const release = join(input.workspace.path, 'release.startup')
        while (!(await Bun.file(release).exists())) {
          input.signal.throwIfAborted()
          await Bun.sleep(10)
        }
        input.signal.throwIfAborted()
        await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, stepId)
        await input.commit('assistant', [{ type: 'text', text: 'The restored ordinary task is complete.' }])
        await input.stepEnded(stepId)
      },
      summarize: async () => ({ text: '', usage: emptyUsage() }),
    })
  },
})

export default { replacements: { 'driver.pi': driver } } satisfies KernelProfile
