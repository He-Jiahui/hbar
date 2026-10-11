import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { z } from 'zod'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'

/** A local mock workload with eight Sessions. It creates no provider traffic or writes outside its owned fixture. */
const project = resolve(import.meta.dir, '..')
const root = await mkdtemp(join(project, 'artifacts', 'runtime-measure-'))
const owned = relative(join(project, 'artifacts'), root)
if (owned.startsWith('..') || !owned.startsWith('runtime-measure-')) throw new Error('Measurement root escaped its owned directory')
const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
const runtime = await ProcessHostRuntime.create({ layout, sourceRoot: project, workspace: root, demo: true, secrets: new MemorySecrets() })
const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
const peak = { processes: 0, rssBytes: 0, sessions: 0, callsPerUnit: 0, queuePerUnit: 0, bufferPerUnit: 0, storageQueue: 0 }
let sampling = true
async function rss(pids: readonly number[]): Promise<number> {
  const command = process.platform === 'win32'
    ? ['powershell.exe', '-NoProfile', '-Command', `(Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum`]
    : ['ps', '-o', 'rss=', '-p', pids.join(',')]
  const child = Bun.spawn(command, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', windowsHide: true })
  const text = await new Response(child.stdout).text()
  if (await child.exited) throw new Error('RSS sampling failed')
  const values = text.trim().split(/\s+/).map(value => z.coerce.number().nonnegative().parse(value))
  return values.reduce((sum, value) => sum + value, 0) * (process.platform === 'win32' ? 1 : 1024)
}
function sampleQueues() {
  const transports = runtime.transportDiagnostics()
  const pids = [process.pid, ...runtime.snapshot().units.flatMap(unit => unit.generations.flatMap(generation => generation.pid ? [generation.pid] : []))]
  peak.processes = Math.max(peak.processes, new Set(pids).size)
  peak.sessions = Math.max(peak.sessions, runtime.coordinator.snapshot().sessions)
  peak.storageQueue = Math.max(peak.storageQueue, runtime.storage.snapshot().queued)
  for (const peer of transports) {
    peak.callsPerUnit = Math.max(peak.callsPerUnit, peer.inFlight + peer.incoming)
    peak.queuePerUnit = Math.max(peak.queuePerUnit, peer.queued + peer.incomingQueued)
    peak.bufferPerUnit = Math.max(peak.bufferPerUnit, peer.bufferedBytes + peer.queuedBytes + peer.incomingBytes)
  }
  return [...new Set(pids)]
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 120_000
  while (!check()) { if (Date.now() >= deadline) throw new Error('Measurement transition timed out'); await Bun.sleep(20) }
}
async function calls(batches: number, interval = 0) {
  const times: number[] = []
  for (let batch = 0; batch < batches; batch++) {
    await Promise.all(Array.from({ length: 8 }, async () => {
      const start = performance.now()
      await client.call('workspace.list', {})
      times.push(performance.now() - start)
    }))
    if (interval) await Bun.sleep(interval)
  }
  times.sort((a, b) => a - b)
  return { calls: times.length, p95Ms: times[Math.ceil(times.length * .95) - 1], maxMs: times.at(-1) }
}
let sampler: Promise<void> | undefined
let timer: ReturnType<typeof setInterval> | undefined
try {
  await client.pair(host.pairing.code, 'Isolated runtime measurement')
  const system = createSystemCommandClient(client)
  // Keep real mock Runs physically active while the Kernel switches, including one queued user turn per Session.
  const driver = runtime.buildUnits.find(unit => unit.descriptor.id === 'driver.pi')!
  const driverSource = join(root, 'driver.ts')
  const driverText = (await readFile(join(project, driver.entrypoint), 'utf8')).replaceAll("'./", "'../../apps/host/src/")
  const anchor = '() => driver.run(run)'
  if (driverText.split(anchor).length !== 2) throw new Error('Driver measurement anchor changed')
  await writeFile(driverSource, driverText.replace(anchor, 'async () => { await driver.run(run); await Bun.sleep(10_000) }'))
  const driverSet = runtime.artifacts.registerSet([await runtime.artifacts.build({ ...driver, entrypoint: driverSource })])
  runtime.reload(driverSet.id, ['driver.pi']); await runtime.manager.reconcile(); await runtime.settled()
  const kernel = runtime.buildUnits.find(unit => unit.descriptor.id === 'kernel')!
  const kernelSource = join(root, 'kernel.ts')
  await writeFile(kernelSource, (await readFile(join(project, kernel.entrypoint), 'utf8')).replaceAll("'./", "'../../apps/host/src/") + '\nexport const measurementRevision = 2\n')
  const candidate = runtime.artifacts.registerSet([await runtime.artifacts.build({ ...kernel, entrypoint: kernelSource })])
  const before = runtime.snapshot()
  timer = setInterval(sampleQueues, 20)
  sampler = (async () => { while (sampling) { peak.rssBytes = Math.max(peak.rssBytes, await rss(sampleQueues())); await Bun.sleep(500) } })()
  await calls(4)
  const baseline = await calls(16)
  const workspace = (await runtime.storage.call('workspaces'))[0]!
  const sessions = await Promise.all(Array.from({ length: 8 }, () => runtime.storage.call('createSession', workspace.id)))
  const first = await Promise.all(sessions.map((session, index) => runtime.kernel.submit(session.id, `old-${index}`, { text: '/tool get_goal {}', images: [] }, 'local-fixture')))
  await until(() => runtime.coordinator.snapshot().sessions === 8)
  const oldBindings = first.map(run => runtime.coordinator.execution(run.id)?.versions.kernel.generation)
  const operation = await system.execute('system.runtime.reload', { artifactSetId: candidate.id, unitIds: ['kernel'] })
  const switching = runtime.manager.reconcile()
  const duringReload = await calls(64, 50)
  await switching; await runtime.settled()
  const after = runtime.snapshot()
  const queued = await Promise.all(sessions.map((session, index) => runtime.kernel.submit(session.id, `new-${index}`, { text: 'Queued after update', images: [] }, 'local-fixture')))
  await runtime.waitForIdle(); await runtime.manager.reconcile()
  const newBindings = await Promise.all(queued.map(async run => (await runtime.storage.call('runtimeExecutionRead', run.id))?.lease.versions.kernel.generation))
  const unrelatedStable = before.units.filter(unit => unit.descriptor.id !== 'kernel').every(unit => after.units.find(value => value.descriptor.id === unit.descriptor.id)?.generations[0]?.pid === unit.generations[0]?.pid)
  const statuses = await Promise.all([...first, ...queued].map(async run => (await runtime.storage.call('run', run.id)).status))
  if (!unrelatedStable || statuses.some(status => status !== 'completed') || newBindings.some(version => version !== 2) || oldBindings.some(version => version !== 1) || client.connectionStatus() !== 'connected')
    throw new Error('Runtime measurement correctness gate failed')
  sampling = false; clearInterval(timer); await sampler
  const result = { measuredAt: new Date().toISOString(), platform: process.platform, bun: Bun.version,
    workload: { sessions: 8, requestsInParallel: 8, mockRuns: 16, driverCompletionDelayMs: 10_000 },
    baseline, duringReload, peak, steadyBunProcesses: 15, supervisorIncluded: false,
    rssMeaning: process.platform === 'win32' ? 'sum of owned process WorkingSet64; shared pages may be counted more than once' : 'sum of owned process RSS',
    oldBindings, newBindings, unrelatedStable, websocketPreserved: true, reloadPhase: runtime.getReload(operation.operationId).phase }
  await mkdir(join(project, 'artifacts', 'runtime-measurement'), { recursive: true })
  await writeFile(join(project, 'artifacts', 'runtime-measurement', 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  sampling = false; clearInterval(timer); await sampler?.catch(() => {})
  client.disconnect(); await host.close(); await runtime.close()
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
}
