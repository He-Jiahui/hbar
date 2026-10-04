import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createDirectoryQueryAdapter } from '@hbar/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { startServer } from '../apps/host/src/server'

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0
  return { samples: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.at(-1) ?? 0 }
}

export async function benchmarkAppRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-bench-'))
  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let runtime: ReturnType<typeof createAppRuntime> | undefined
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'runtime benchmark')
    const workspace = (await client.call('workspace.list', {})).items[0]
    if (!workspace) throw new Error('Benchmark workspace missing')
    const first = await kernel.createSession(workspace.id, 'first')
    const second = await kernel.createSession(workspace.id, 'second')
    runtime = createAppRuntime({
      instanceId: 'benchmark',
      hostId: kernel.instanceId,
      directory: createDirectoryQueryAdapter(client),
    })
    const selectionMs: number[] = [],
      listMs: number[] = []
    for (let index = 0; index < 220; index++) {
      const selectionStart = performance.now()
      await runtime.view.commands.execute('app.setSession', { sessionId: index % 2 ? first.id : second.id })
      const selectionDuration = performance.now() - selectionStart
      const listStart = performance.now()
      await runtime.view.commands.execute('session.list', { workspaceId: workspace.id, limit: 60 })
      const listDuration = performance.now() - listStart
      if (index >= 20) {
        selectionMs.push(selectionDuration)
        listMs.push(listDuration)
      }
    }
    const report = {
      date: new Date().toISOString(),
      platform: process.platform,
      bun: Bun.version,
      cpu: cpus()[0]?.model,
      logicalProcessors: cpus().length,
      transport: 'authenticated loopback WebSocket + Storage Worker',
      sessions: 2,
      warmup: 20,
      modelRequests: 0,
      p95BudgetMs: 100,
      selection: summarize(selectionMs),
      directoryList: summarize(listMs),
    }
    await mkdir('artifacts', { recursive: true })
    await writeFile('artifacts/app-runtime-benchmark.json', `${JSON.stringify(report, null, 2)}\n`)
    if (report.selection.p95Ms >= report.p95BudgetMs || report.directoryList.p95Ms >= report.p95BudgetMs)
      throw new Error('Runtime benchmark exceeded the documented p95 budget; see artifacts/app-runtime-benchmark.json')
    return report
  } finally {
    runtime?.dispose()
    client?.disconnect()
    await host?.close()
    await kernel?.close()
    await rm(root, { recursive: true, force: true })
  }
}

if (import.meta.main) console.log(JSON.stringify(await benchmarkAppRuntime(), null, 2))
