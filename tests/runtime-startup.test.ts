import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout, ensurePathLayout } from '@hbar/storage'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { openCatalogClient } from '../apps/cli/src/runtime'

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 45_000
  while (!(await check())) {
    if (Date.now() >= end) throw new Error('Stable startup did not reach the observed state')
    await Bun.sleep(20)
  }
}
async function remove(root: string): Promise<void> {
  const path = relative(resolve(process.cwd(), 'artifacts'), resolve(root))
  if (path.startsWith('..') || !path.startsWith('runtime-startup-')) throw new Error('Refuse unowned fixture removal')
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
async function blockedKernel(activatedFailure = false) {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-startup-'))
  const gate = join(root, 'allow-kernel'),
    source = join(root, 'kernel.ts')
  const code = (await readFile('apps/host/src/runtime-kernel-process.ts', 'utf8')).replaceAll(
    "'./",
    "'../../apps/host/src/",
  )
  const anchor = activatedFailure ? 'async activate(selected) {' : 'async prepare() {'
  expect(code.split(anchor)).toHaveLength(2)
  await writeFile(
    source,
    `import { existsSync as startupGateExists } from 'node:fs'\n${code.replace(
      anchor,
      `${anchor} if (!startupGateExists(${JSON.stringify(gate)})) throw new HbarError('STARTUP_GATE_CLOSED', 'Startup gate is closed');`,
    )}`,
  )
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const buildUnits = hostRuntimeBuildUnits().map((unit) =>
    unit.descriptor.id === 'kernel' ? { ...unit, entrypoint: source } : unit,
  )
  const runtime = await ProcessHostRuntime.open({
    layout,
    sourceRoot: process.cwd(),
    secrets: new MemorySecrets(),
    demo: true,
    workspace: root,
    buildUnits,
    watchSource: activatedFailure,
  })
  return { root, gate, source, code, runtime }
}

test('a corrected source candidate can replace a continuously failing activated default during cold startup', async () => {
  const f = await blockedKernel(true)
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    host = await startServer(f.runtime.kernel, { port: 0, runtime: f.runtime, controller: f.runtime.controller })
    await until(
      () =>
        f.runtime
          .snapshot()
          .units.find((unit) => unit.descriptor.id === 'kernel')
          ?.generations.some((generation) => generation.role === 'default' && generation.phase === 'recovering') ===
        true,
    )
    const before = f.runtime.snapshot()
    expect(before.ready).toBe(false)
    expect(before.sourceReload?.phase).toBe('idle')
    const pids = before.units
      .filter((unit) => unit.descriptor.id !== 'kernel')
      .flatMap((unit) =>
        unit.generations
          .filter((generation) => generation.role === 'default')
          .map((generation) => [unit.descriptor.id, generation.pid] as const),
      )
    const device = await host.auth.createDevice('failed activated startup fixture')
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`, device.token)
    await client.connect()
    await writeFile(f.source, `${f.code}\nexport const correctedStartupRevision = 2`)
    await f.runtime.applySourceChanges([f.source])
    await f.runtime.ready()
    const after = f.runtime.snapshot()
    expect(after.ready).toBe(true)
    expect(after.instanceId).toBe(before.instanceId)
    expect(f.runtime.manager.currentVersion('kernel').generation).toBe(2)
    for (const [id, pid] of pids)
      expect(
        after.units
          .find((unit) => unit.descriptor.id === id)
          ?.generations.find((generation) => generation.role === 'default')?.pid,
      ).toBe(pid)
    expect(client.connectionStatus()).toBe('connected')
    expect((await fetch(`http://127.0.0.1:${host.server.port}/healthz`)).status).toBe(200)
  } finally {
    client?.disconnect()
    await host?.close()
    await f.runtime.close()
    await remove(f.root)
  }
}, 120_000)

test('first-start Kernel failure keeps liveness, authenticated status and the socket, then activates only the missing units', async () => {
  const f = await blockedKernel()
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const start = Date.now()
    host = await startServer(f.runtime.kernel, { port: 0, runtime: f.runtime, controller: f.runtime.controller })
    expect(Date.now() - start).toBeLessThan(5_000)
    const url = `http://127.0.0.1:${host.server.port}`
    expect((await fetch(`${url}/livez`)).status).toBe(200)
    expect((await fetch(`${url}/healthz`)).status).toBe(503)
    await until(() => (f.runtime.snapshot().admission?.startup?.attempts ?? 0) >= 1)
    const before = f.runtime.snapshot()
    expect(before.admission).toMatchObject({ phase: 'initializing', reasonCode: 'STARTUP_GATE_CLOSED' })
    expect(before.admission?.startup?.nextAttemptAt).toBeGreaterThan(0)
    const pids = before.units.flatMap((unit) =>
      unit.generations.filter((g) => g.role === 'default').map((g) => [unit.descriptor.id, g.pid] as const),
    )
    expect(pids).toHaveLength(12)
    const device = await host.auth.createDevice('degraded startup status')
    client = new HbarClient(url, device.token)
    await client.connect()
    const commands = createSystemCommandClient(client)
    expect((await commands.execute('system.runtime.get', {})).ready).toBe(false)
    const layout = f.runtime.kernel.options.layout
    await writeFile(layout.connectionFile, JSON.stringify({ url, token: device.token, instanceId: before.instanceId }))
    // If the CLI mistakenly insists on business readiness, this known launcher prevents a duplicate spawn.
    await writeFile(`${layout.hostLock}.supervisor`, JSON.stringify({ pid: process.pid }))
    const attached = await openCatalogClient({
      dataRoot: layout.dataRoot,
      cacheRoot: layout.cacheRoot,
      requireReady: false,
    })
    try {
      expect((await createSystemCommandClient(attached.client).execute('system.runtime.get', {})).ready).toBe(false)
    } finally {
      attached.client.disconnect()
    }
    const failure = await client.call('workspace.list', { limit: 10 }).catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'RUNTIME_RECOVERING' })
    await writeFile(f.gate, 'allow')
    await f.runtime.ready()
    const after = await commands.execute('system.runtime.get', {})
    expect(after.ready).toBe(true)
    expect(after.instanceId).toBe(before.instanceId)
    expect((await host.auth.authenticate(device.token)).id).toBe(device.device.id)
    expect(client.connectionStatus()).toBe('connected')
    for (const [id, pid] of pids)
      expect(
        after.units.find((unit) => unit.descriptor.id === id)?.generations.find((g) => g.role === 'default')?.pid,
      ).toBe(pid)
    expect((await fetch(`${url}/healthz`)).status).toBe(200)
    const catalog = await client.call('command.catalog', { category: 'run.approval', limit: 20 })
    expect(catalog.items.some((item) => item.metadata.id === 'permission.get')).toBe(true)
    expect((await client.call('command.describe', { commandId: 'permission.get' })).metadata.id).toBe('permission.get')
    expect((await client.call('workspace.list', { limit: 10 })).items).toHaveLength(1)
  } finally {
    client?.disconnect()
    await host?.close()
    await f.runtime.close()
    await remove(f.root)
  }
}, 120_000)

test('explicit shutdown during failed startup aborts the retry and cannot launch any new owner', async () => {
  const f = await blockedKernel()
  try {
    await until(() => (f.runtime.snapshot().admission?.startup?.attempts ?? 0) >= 1)
    const ready = f.runtime.ready().catch((error: unknown) => error)
    await f.runtime.close()
    expect(await ready).toBeInstanceOf(Error)
    expect(f.runtime.snapshot().admission?.phase).toBe('stopped')
    expect(
      f.runtime
        .snapshot()
        .units.flatMap((unit) => unit.generations)
        .every((g) => g.pid === null),
    ).toBe(true)
    await writeFile(f.gate, 'allow')
    await Bun.sleep(400)
    expect(
      f.runtime
        .snapshot()
        .units.flatMap((unit) => unit.generations)
        .every((g) => g.pid === null),
    ).toBe(true)
  } finally {
    await f.runtime.close()
    await remove(f.root)
  }
}, 120_000)

test('a corrupt database keeps the stable listener alive and never enters migration or writable storage', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-startup-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const bytes = Buffer.from('intentionally damaged database header')
  await writeFile(layout.database, bytes)
  const runtime = await ProcessHostRuntime.open({ layout, sourceRoot: process.cwd(), secrets: new MemorySecrets() })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  try {
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    await until(() => (runtime.snapshot().admission?.startup?.attempts ?? 0) >= 1)
    expect((await fetch(`http://127.0.0.1:${host.server.port}/livez`)).status).toBe(200)
    expect((await fetch(`http://127.0.0.1:${host.server.port}/healthz`)).status).toBe(503)
    expect(runtime.storage.snapshot()).toMatchObject({ phase: 'waiting', owner: null, inFlight: 0 })
    expect(await readFile(layout.database)).toEqual(bytes)
    expect(await Bun.file(`${layout.database}-wal`).exists()).toBe(false)
    expect(runtime.snapshot().units.flatMap((unit) => unit.generations)).toHaveLength(0)
  } finally {
    await host?.close()
    await runtime.close()
    await remove(root)
  }
}, 120_000)
