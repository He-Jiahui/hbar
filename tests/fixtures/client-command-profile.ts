import { z } from 'zod'
import { emptyUsage } from '@hbar/contracts'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import type { KernelProfile } from '@hbar/kernel'

const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Client command driver fixture',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    permissions: [],
    provides: { driver: '1.0.0' },
    description: 'Discover and execute bounded client commands through normal Run admission',
  },
  apply(context) {
    provide<HarnessDriver>(context, 'driver', {
      async run(input) {
        const calls = z.array(z.record(z.string(), z.json())).max(16).parse(JSON.parse(input.run.input.text))
        const stepId = crypto.randomUUID()
        await input.beforeRequest(input.request, stepId)
        const directory = await input.execute('hbar_command_clients', { limit: 16 }, crypto.randomUUID())
        const results = []
        for (const call of calls) results.push(await input.execute('hbar_command_execute', call, crypto.randomUUID()))
        await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, stepId)
        await input.commit('assistant', [{ type: 'text', text: JSON.stringify({ directory, results }) }])
        await input.stepEnded(stepId)
      },
      summarize: async () => ({ text: '', usage: emptyUsage() }),
    })
  },
})

export default { replacements: { 'driver.pi': driver } } satisfies KernelProfile
