import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { diagnosticEventSchema } from '@hbar/contracts'
import {
  createHostRuntimeDiagnostics,
  hostLifecycleEvent,
  supervisorLifecycleEvent,
} from '../apps/host/src/runtime-diagnostics.ts'

const roots: string[] = []

afterEach(async () => {
  const temporary = await realpath(tmpdir())
  while (roots.length) {
    const root = roots.pop()
    if (!root) break
    const owned = await realpath(root)
    if (
      dirname(owned).toLowerCase() !== temporary.toLowerCase() ||
      !basename(owned).startsWith('hbar-host-runtime-diagnostics-')
    )
      throw new Error('Refusing an unowned Host diagnostics fixture cleanup')
    await rm(owned, { recursive: true, force: true })
  }
})

test('writes bounded Host lifecycle events with ambient correlation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-runtime-diagnostics-'))
  roots.push(root)
  const runtime = createHostRuntimeDiagnostics({ root, enabled: true, fullCoverage: true, instanceId: 'instance-test' })
  runtime.run({ requestId: 'request-test', rpcId: 'rpc-test' }, () => {
    hostLifecycleEvent(runtime, 'host.ready', { level: 'info', outcome: 'success', workerState: 'ready' })
  })
  supervisorLifecycleEvent(runtime, { event: 'supervisor.child_exit', outcome: 'success', durationMs: 12 })
  await runtime.close()
  const lines = (await readFile(runtime.filePath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => diagnosticEventSchema.parse(JSON.parse(line)))
  expect(lines).toHaveLength(2)
  expect(lines[0]).toMatchObject({
    component: 'host',
    event: 'host.ready',
    instanceId: 'instance-test',
    requestId: 'request-test',
    rpcId: 'rpc-test',
  })
  expect(lines[1]).toMatchObject({ event: 'supervisor.child_exit', durationMs: 12 })
})

test('contains invalid lifecycle input and remains usable after close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-runtime-diagnostics-invalid-'))
  roots.push(root)
  const runtime = createHostRuntimeDiagnostics({ root, enabled: true })
  expect(() => runtime.emit({ event: 'invalid event', level: 'info' })).not.toThrow()
  const first = await runtime.close()
  expect(() => runtime.emit({ event: 'host.closed', level: 'info', outcome: 'success' })).not.toThrow()
  const second = runtime.snapshot()
  expect(first.invalid).toBe(0)
  expect(second.dropped).toBeGreaterThanOrEqual(first.dropped)
})
