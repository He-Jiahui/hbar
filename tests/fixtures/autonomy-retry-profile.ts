import { emptyUsage, HbarError } from '@hbar/contracts'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import type { KernelProfile } from '@hbar/kernel'

const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Managed ordinary retry fixture',
    description: 'A temporary provider failure followed by an ordinary continuation',
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
        await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, stepId)
        if (input.run.input.source !== 'system')
          throw new HbarError('PROVIDER_CONNECTION_FAILED', 'A deterministic temporary provider failure')
        await input.commit('assistant', [
          { type: 'text', text: 'The original ordinary task is complete after backend recovery.' },
        ])
        await input.stepEnded(stepId)
      },
      summarize: async () => ({ text: '', usage: emptyUsage() }),
    })
  },
})
export default { replacements: { 'driver.pi': driver } } satisfies KernelProfile
