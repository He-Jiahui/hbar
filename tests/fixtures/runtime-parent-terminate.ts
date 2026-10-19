import { ManagedProcess, processIsAlive } from '@hbar/runtime'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const mode = z.enum(['deadline', 'normal']).parse(process.argv[2])
const runtime = new ManagedProcess({
  descriptor: {
    id: 'fixture',
    kind: 'plugin',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: 23,
  },
  artifactId: 'c'.repeat(64),
  modulePath: fileURLToPath(new URL('./runtime-service.ts', import.meta.url)),
  generation: 3,
  parent: { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() },
  configuration: { hangDispose: mode === 'deadline', privateCanary: 'TERMINATE_CONFIGURATION_CANARY' },
  heartbeatMs: 200,
  startupMs: 3_000,
  shutdownMs: 500,
})
// A stalled fixture fails itself; exact owned-family cleanup belongs to the surrounding managed gate.
// No PID-only termination is authorized here, and watchdog exit must never count as a passing case.
const watchdog = setTimeout(() => process.exit(1), 6_000)
let primaryFailed = false
let primary: unknown
let cleanupFailed = false
let cleanup: unknown
try {
  await runtime.prepare()
  await runtime.activate()
  const before = runtime.snapshot()
  const startedAt = performance.now()
  await runtime.dispose()
  const after = runtime.snapshot()
  console.log(
    JSON.stringify({
      unitId: before.unitId,
      generation: before.generation,
      incarnation: before.incarnation,
      childPid: before.pid,
      parentPid: process.pid,
      phase: after.phase,
      pid: after.pid,
      elapsedMs: performance.now() - startedAt,
      childAlive: before.pid !== null && processIsAlive(before.pid),
    }),
  )
} catch (error) {
  primaryFailed = true
  primary = error
}
try {
  await runtime.dispose()
} catch (error) {
  cleanupFailed = true
  cleanup = error
}
clearTimeout(watchdog)
if (primaryFailed) throw primary
if (cleanupFailed) throw cleanup
