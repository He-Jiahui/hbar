import { setTimeout as delay } from 'node:timers/promises'
import { PiDriver } from '@hbar/pi-driver'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'

/** Test-only delay makes the real Host's compaction lifecycle observable in browser acceptance tests. */
export function delayedCompactionDriver(durationMs: number) {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 5000)
    throw new Error('Invalid compaction fixture delay')
  const pi = new PiDriver()
  return definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Compaction browser fixture',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      description: 'Local Pi with a bounded, cancellable summary delay',
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        supportsCanonicalSteering: true,
        supportsSteeringAdmissionClosure: true,
        run: (input) => pi.run(input),
        async summarize(request, key, signal, observer) {
          if (request.model.protocol !== 'mock') throw new Error('Compaction browser fixture requires a local model')
          await delay(durationMs, undefined, { signal })
          return pi.summarize(request, key, signal, observer)
        },
      })
    },
  })
}
