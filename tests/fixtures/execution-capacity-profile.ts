import { join } from 'node:path'
import { emptyUsage } from '@hbar/contracts'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import type { KernelProfile } from '@hbar/kernel'

const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Execution capacity fixture',
    description: 'A physically gated model Run',
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
        await Bun.write(join(input.workspace.path, `started.${input.session.id}`), input.run.id)
        const release = join(input.workspace.path, `release.${input.session.id}`)
        while (!(await Bun.file(release).exists())) {
          input.signal.throwIfAborted()
          await Bun.sleep(10)
        }
        input.signal.throwIfAborted()
        await input.commit('assistant', [{ type: 'text', text: 'The gated task is complete.' }])
        await input.stepEnded(stepId)
      },
      summarize: async () => ({ text: '', usage: emptyUsage() }),
    })
  },
})
export default { replacements: { 'driver.pi': driver } } satisfies KernelProfile
