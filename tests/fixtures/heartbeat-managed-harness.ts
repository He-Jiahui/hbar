import { ManagedProcess } from '@hbar/runtime'
import { RUNTIME_LIMITS } from '@hbar/contracts/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const mode = process.argv[2]
if (!['child', 'parent', 'ack', 'normal'].includes(mode ?? '')) throw new Error('FIXTURE_MODE')
let faults = 0
let reason: string | undefined
const runtime = new ManagedProcess({
  descriptor: {
    id: 'fixture',
    kind: 'plugin',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: STORAGE_SCHEMA_VERSION,
  },
  artifactId: 'b'.repeat(64),
  generation: 1,
  modulePath: fileURLToPath(new URL('./heartbeat-managed-service.ts', import.meta.url)),
  parent: { unitId: 'base', generation: 1, incarnation: 'heartbeat-harness-parent' },
  configuration: { mode },
  startupMs: 10000,
  shutdownMs: 1000,
  retryDelaysMs: [30000, 30000, 30000],
  retrySlowMs: 30000,
  jitter: 0,
  onFault: async (_owner, code) => {
    faults++
    reason = code
  },
})
try {
  await runtime.prepare()
  await runtime.activate()
  if (mode === 'child' || mode === 'parent') {
    await runtime.call('fixture.blockChild', { canary: 'PRIVATE_HEARTBEAT_CANARY' }, z.undefined())
    // Co-stall deliberately: parent lateness is observable without relying on OS
    // ordering of queued heartbeats versus overdue watchdog timers.
    if (mode === 'parent') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 7500)
    const deadline = Date.now() + 12000
    while (!faults) {
      if (Date.now() > deadline) throw new Error('EXPECTED_HEARTBEAT_FAULT')
      await Bun.sleep(10)
    }
  } else if (mode === 'normal')
    await runtime.call('fixture.wait', { canary: 'PRIVATE_HEARTBEAT_CANARY' }, z.undefined())
  else await Bun.sleep(11000)
  console.log(
    JSON.stringify({
      fixture: mode,
      faults,
      reason: reason ?? null,
      cadence: RUNTIME_LIMITS.heartbeatMs,
      threshold: RUNTIME_LIMITS.heartbeatMs * RUNTIME_LIMITS.missedHeartbeats,
    }),
  )
} finally {
  await runtime.dispose()
}
