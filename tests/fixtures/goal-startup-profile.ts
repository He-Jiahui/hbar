import { emptyUsage } from '@hbar/contracts'
import type { KernelProfile } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'

/** A local-only driver: user work waits for shutdown; recovered Goal work completes. */
const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Goal startup fixture',
    description: 'Deterministic Host restart without provider requests',
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
        if (input.run.input.source !== 'goal') {
          await new Promise<void>((_resolve, reject) => {
            const onAbort = () => reject(new Error('Fixture interrupted'))
            if (input.signal.aborted) onAbort()
            else input.signal.addEventListener('abort', onAbort, { once: true })
          })
          return
        }
        const args = { status: 'complete' }
        const callId = crypto.randomUUID()
        await input.commit('assistant', [{ type: 'tool_call', callId, name: 'update_goal', args }])
        const result = await input.execute('update_goal', args, callId)
        if (result.isError) throw new Error(result.text)
        await input.stepEnded(stepId)
      },
      summarize: async () => ({ text: '', usage: emptyUsage() }),
    })
  },
})

export default { replacements: { 'driver.pi': driver } } satisfies KernelProfile
