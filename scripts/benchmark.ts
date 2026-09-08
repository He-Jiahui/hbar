import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, totalmem } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'

const root = await mkdtemp(join(tmpdir(), 'hbar-benchmark-'))
const kernel = await Kernel.create({ home: root, demo: true, workspace: process.cwd(), secrets: new MemorySecrets() })
const host = await startServer(kernel, { port: 0 })
const credential = await host.auth.createDevice('Benchmark client')
const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, credential.token)
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? 0
try {
  await client.connect()
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const history = await kernel.createSession(workspace.id, '10k-message history')
  const seed = performance.now()
  for (let i = 0; i < 10_000; i++)
    await kernel.storage.call('commit', history.id, 'history-fixture', i % 2 ? 'assistant' : 'user', [
      { type: 'text', text: `Historical message ${i}. ` + 'Persistent event data. '.repeat(8) },
    ])
  const seedMs = performance.now() - seed
  const snapshotMs: number[] = []
  let payloadBytes = 0
  for (let i = 0; i < 30; i++) {
    const start = performance.now()
    const snapshot = await client.call('session.snapshot', { sessionId: history.id })
    snapshotMs.push(performance.now() - start)
    if (snapshot.messages.length !== 60 || !snapshot.hasOlder) throw new Error('History snapshot was not paginated')
    payloadBytes = Buffer.byteLength(JSON.stringify(snapshot))
  }
  const sessions = await Promise.all(Array.from({ length: 8 }, () => kernel.createSession(workspace.id)))
  const cancelMs: number[] = []
  let concurrent = 0
  for (let round = 0; round < 5; round++) {
    const runs = await Promise.all(
      sessions.map((session) =>
        client.call('run.start', {
          sessionId: session.id,
          requestId: `benchmark-${round}`,
          modelId: 'local-fixture',
          input: { text: '/slow' },
        }),
      ),
    )
    const deadline = Date.now() + 10_000
    while (kernel.streams.size < 8) {
      if (Date.now() > deadline) throw new Error('Eight sessions did not start concurrently')
      await Bun.sleep(5)
    }
    concurrent = Math.max(concurrent, kernel.active.size)
    await Promise.all(
      runs.map(async (run) => {
        const start = performance.now()
        await client.call('run.cancel', { runId: run.id })
        cancelMs.push(performance.now() - start)
      }),
    )
    await kernel.waitForIdle()
    for (const run of runs)
      if ((await kernel.storage.call('run', run.id)).status !== 'cancelled')
        throw new Error('Cancellation did not settle')
  }
  const report = {
    time: new Date().toISOString(),
    runtime: `Bun ${Bun.version}`,
    platform: process.platform,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramGiB: Math.round(totalmem() / 2 ** 30),
    model: 'local Pi fixture; no model network time',
    concurrentSessions: concurrent,
    historyMessages: 10_000,
    seedMs,
    snapshot: {
      samples: snapshotMs.length,
      p50Ms: percentile(snapshotMs, 0.5),
      p95Ms: percentile(snapshotMs, 0.95),
      pageMessages: 60,
      payloadBytes,
    },
    cancellation: {
      samples: cancelMs.length,
      p50Ms: percentile(cancelMs, 0.5),
      p95Ms: percentile(cancelMs, 0.95),
      maxMs: Math.max(...cancelMs),
      targetP95Ms: 100,
    },
    hostRssMiB: Math.round(process.memoryUsage().rss / 2 ** 20),
  }
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/benchmark.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (report.cancellation.p95Ms >= 100) throw new Error('Cancellation target not met')
} finally {
  client.disconnect()
  await host.close()
  await kernel.close()
  await rm(root, { recursive: true, force: true })
}
