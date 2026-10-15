import { expect, test } from 'bun:test'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'

const source = (index: number): ExecutionOwnership => ({
  leaseId: `lease-${index}`,
  sessionId: `session-${index}`,
  runId: `run-${index}`,
  fence: index,
  acquiredAt: index,
  owner: { unitId: 'kernel', generation: 1, incarnation: 'kernel-current' },
  versions: {
    kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
    driver: { unitId: 'driver.pi', generation: 1, artifactId: 'b'.repeat(64) },
    plugins: [],
    hooks: [],
  },
})

test('concurrent command scopes preserve their source callbacks across awaits and detach the exact executor identity', async () => {
  const scopes = new HostCommandExecutionScopes()
  const observed: string[] = []
  await Promise.all(
    [1, 2].map((index) =>
      scopes.run(
        {
          source: source(index),
          beforeStart: async (owner, signal) => {
            expect(Object.isFrozen(owner)).toBe(true)
            if (owner.kind !== 'runtime') throw new Error('Expected a managed executor')
            expect(Object.isFrozen(owner.owner)).toBe(true)
            await Bun.sleep(1)
            observed.push(`${index}:${owner.owner.incarnation}:${owner.jobId}:${signal.aborted}`)
          },
        },
        async () => {
          await Bun.sleep(1)
          const actual = {
            kind: 'runtime' as const,
            owner: {
              unitId: 'controller',
              generation: index,
              incarnation: `controller-${index}`,
            },
            jobId: `job-${index}`,
          }
          const start = scopes.beforeStart(actual)
          actual.jobId = 'caller-mutated'
          actual.owner.incarnation = 'caller-mutated'
          await start?.(new AbortController().signal)
        },
      ),
    ),
  )
  expect(observed.sort()).toEqual(['1:controller-1:job-1:false', '2:controller-2:job-2:false'])
  expect(scopes.beforeStart({ kind: 'host', instanceId: 'host-current', jobId: 'outside' })).toBeUndefined()
})
