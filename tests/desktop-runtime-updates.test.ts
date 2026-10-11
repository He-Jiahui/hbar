import { expect, test } from 'bun:test'
import { runtimeSnapshotSchema } from '@hbar/contracts/runtime'
import { changedRuntimeGenerations, monitorDesktopRuntime } from '../scripts/desktop-runtime-updates'

function snapshot(generation = 1) {
  return runtimeSnapshotSchema.parse({ revision: generation, instanceId: 'stable-host', ready: true, preparedArtifactSets: [], units: [{
    descriptor: { id: 'kernel', kind: 'kernel', isolation: 'process', dependencies: [], required: true, reloadable: true, contractFingerprint: 'a'.repeat(64), storageSchema: 24 },
    queuedArtifactId: null, generations: [{ unitId: 'kernel', generation, incarnation: String(generation), artifactId: 'b'.repeat(64), role: 'default', phase: 'serving', pid: 100 + generation,
      references: { runs: 0, resources: 0, requests: 0 }, lastHeartbeatAt: 1, failures: 0, nextAttemptAt: null, reasonCode: null }],
  }] })
}
test('desktop confirms generation changes while enforcing stable Host identity', () => {
  expect(changedRuntimeGenerations(snapshot(), snapshot(2))).toEqual(['kernel'])
  expect(changedRuntimeGenerations(snapshot(), snapshot())).toEqual([])
  expect(() => changedRuntimeGenerations(snapshot(), { ...snapshot(2), instanceId: 'other-host' })).toThrow('identity changed')
})
test('desktop observes bounded reads, verifies unchanged credentials, and releases its polling lifecycle', async () => {
  let reads = 0, active = 0, peak = 0, verified = 0
  const changes: string[][] = [], errors: unknown[] = []
  const dispose = monitorDesktopRuntime({ initial: snapshot(), intervalMs: 5,
    async read() { reads++; active++; peak = Math.max(peak, active); await Bun.sleep(15); active--; return snapshot(2) },
    verifyIdentity: () => { verified++; return Promise.resolve() }, onUpdate: units => changes.push([...units]), onSourceStatus: () => {}, onError: error => errors.push(error) })
  await Bun.sleep(65); dispose(); const before = reads; await Bun.sleep(30)
  expect(reads).toBe(before); expect(peak).toBe(1); expect(verified).toBe(1); expect(changes).toEqual([['kernel']]); expect(errors).toEqual([])
})
