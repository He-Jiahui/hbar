import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout, ensurePathLayout, Storage, type StorageMethods } from '@hbar/storage'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { HbarError, type WireNotification } from '@hbar/contracts'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { buildRuntimePackage } from '../scripts/build-runtime-package'
import { hostRuntimeBaseBuildUnit } from '../apps/host/src/runtime-build'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!await check()) { if (Date.now() >= deadline) throw new Error('Process Host transition did not settle'); await Bun.sleep(10) }
}
async function fixture(browserConfig?: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-process-host-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  if (browserConfig) {
    await ensurePathLayout(layout)
    const storage = new Storage(layout.database, layout)
    try { await storage.call('ready'); await storage.call('setPlugin', 'browser-use.codex', true, browserConfig) }
    finally { await storage.close() }
  }
  const runtime = await ProcessHostRuntime.create({ layout, sourceRoot: process.cwd(), demo: true, workspace: root, secrets: new MemorySecrets() })
  resources.push(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }) })
  const workspace = (await runtime.storage.call('workspaces'))[0]!
  const session = await runtime.storage.call('createSession', workspace.id)
  return { root, runtime, session }
}
async function changedKernel(runtime: ProcessHostRuntime, suffix: string, transform: (source: string) => string = source => source) {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'process-host-update-'))
  resources.push(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'kernel.ts')
  const implementation = (await readFile('apps/host/src/runtime-kernel-process.ts', 'utf8')).replaceAll("'./", "'../../apps/host/src/")
  await writeFile(source, `${transform(implementation)}\n${suffix}\n`)
  const unit = runtime.buildUnits.find(value => value.descriptor.id === 'kernel')!
  return runtime.artifacts.registerSet([await runtime.artifacts.build({ ...unit, entrypoint: source })])
}
async function changedPlugin(runtime: ProcessHostRuntime, id: string, transform: (source: string) => string = source => source) {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'process-plugin-update-'))
  resources.push(() => rm(root, { recursive: true, force: true }))
  const unit = runtime.buildUnits.find(value => value.descriptor.id === id)
  if (!unit) throw new Error('Expected a declared plugin build unit')
  const source = join(root, 'plugin.ts')
  const implementation = (await readFile(unit.entrypoint, 'utf8')).replaceAll("'./", "'../../apps/host/src/")
  await writeFile(source, transform(implementation) + '\nexport const compatiblePluginRevision = 2\n')
  const artifact = await runtime.artifacts.build({ ...unit, entrypoint: source })
  return runtime.artifacts.registerSet([artifact])
}
async function changedController(runtime: ProcessHostRuntime) {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'process-controller-update-'))
  resources.push(() => rm(root, { recursive: true, force: true }))
  const unit = runtime.buildUnits.find(value => value.descriptor.id === 'controller')!
  const source = join(root, 'controller.ts')
  const implementation = (await readFile(unit.entrypoint, 'utf8')).replaceAll("'./", "'../../apps/host/src/")
  await writeFile(source, implementation.replace("  values.register('service',", "  if (application) application.commandDispatchers.set('permission.get', async () => { throw new HbarError('CONTROLLER_OWNED_MARKER', String(process.pid)) })\n  values.register('service',"))
  return runtime.artifacts.registerSet([await runtime.artifacts.build({ ...unit, entrypoint: source })])
}
async function clientFor(runtime: ProcessHostRuntime) {
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resources.unshift(async () => { client.disconnect(); await host.close() })
  await client.pair(host.pairing.code, 'process Host verification')
  await client.connect()
  return { client, host, system: createSystemCommandClient(client) }
}

test('the production composition activates independent Bun owners including nine plugin units and commits through the single owned Storage writer', async () => {
  const f = await fixture()
  const snapshot = f.runtime.snapshot()
  expect(snapshot.ready).toBe(true)
  const pids = snapshot.units.flatMap(unit => unit.generations.map(generation => generation.pid))
  expect(new Set(pids).size).toBe(snapshot.units.length)
  expect(pids.every(pid => pid !== null)).toBe(true)
  expect(snapshot.units.find(unit => unit.descriptor.id === 'node-link')?.generations[0]).toMatchObject({ phase: 'serving' })
  expect(pids.includes(process.pid)).toBe(false)
  const run = await f.runtime.kernel.submit(f.session.id, 'process-request', { text: '/tool get_goal {}', images: [] }, 'local-fixture')
  await f.runtime.waitForIdle()
  expect(await f.runtime.storage.call('run', run.id)).toMatchObject({ status: 'completed' })
  expect(await f.runtime.storage.call('runtimeExecutionRead', run.id)).toMatchObject({ state: 'released', lease: { versions: { kernel: { generation: 1 }, driver: { generation: 1 } } } })
  expect(f.runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
  const kernelVersion = f.runtime.manager.currentVersion('kernel')
  const kernelArtifact = await f.runtime.artifacts.get(kernelVersion.artifactId)
  expect(kernelArtifact.inputs).not.toContain('plugins/goal/src/index.ts')
  expect(kernelArtifact.inputs).not.toContain('plugins/local-tools/src/index.ts')
  const plugins = f.runtime.kernel.plugins.list()
  expect(plugins.find(plugin => plugin.id === 'goal.codex')?.configSchema?.properties).toHaveProperty('autoContinue')
  const { client } = await clientFor(f.runtime)
  expect((await client.call('system.bootstrap', {})).plugins.find(plugin => plugin.id === 'goal.codex')?.configSchema?.properties).toHaveProperty('autoContinue')
})

test('owned plugin configuration validates its candidate and replaces only the configured owner with durable restart settings', async () => {
  const f = await fixture(), { client } = await clientFor(f.runtime)
  const before = f.runtime.snapshot()
  const id = 'browser-use.codex'
  const invalid = await client.call('plugin.set', { id, enabled: true, config: { backend: 'invalid' } }).catch((error: unknown) => error)
  expect(invalid).toBeInstanceOf(Error)
  expect(f.runtime.manager.currentVersion('plugin.browser').generation).toBe(1)
  const configured = await client.call('plugin.set', { id, enabled: true, config: { backend: 'fetch', maxContexts: 2, default_origin_policy: { access: 'allow' } } })
  expect(configured.find(plugin => plugin.id === id)?.config).toMatchObject({ backend: 'fetch', maxContexts: 2 })
  const selected = f.runtime.manager.currentVersion('plugin.browser')
  expect(selected.generation).toBeGreaterThan(1)
  for (const unit of before.units.filter(unit => unit.descriptor.id !== 'plugin.browser'))
    expect(f.runtime.snapshot().units.find(value => value.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(unit.generations[0]?.pid)
  expect((await f.runtime.storage.call('plugins')).find(plugin => plugin.id === id)?.config).toMatchObject({ backend: 'fetch', maxContexts: 2 })
  const current = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.browser')!.generations.find(generation => generation.role === 'default')!
  if (!current.pid || current.pid === process.pid) throw new Error('Expected an owned browser plugin')
  process.kill(current.pid, 'SIGKILL')
  await until(() => f.runtime.snapshot().ready && f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.browser')?.generations.find(generation => generation.role === 'default')?.incarnation !== current.incarnation)
  await f.runtime.settled()
  expect(f.runtime.manager.currentVersion('plugin.browser')).toEqual(selected)
  expect(f.runtime.kernel.plugins.list().find(plugin => plugin.id === id)?.config).toMatchObject({ backend: 'fetch', maxContexts: 2 })
  expect(client.connectionStatus()).toBe('connected')
}, 120_000)

test('actual Kernel construction failures and candidate writes fail before routing changes and leave all serving owners and the socket intact', async () => {
  const f = await fixture(), { client, host } = await clientFor(f.runtime)
  const before = f.runtime.snapshot()
  const run = await f.runtime.kernel.submit(f.session.id, 'preflight-existing-work', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.coordinator.execution(run.id) !== null)
  for (const mode of ['construction', 'write'] as const) {
    const set = await changedKernel(f.runtime, '', source => {
      const anchor = '    return Kernel.create({'
      if (source.split(anchor).length !== 2) throw new Error('Kernel construction preflight anchor changed')
      return source.replace(anchor, mode === 'construction'
        ? `    if (lifecycle === 'candidate') throw new HbarError('KERNEL_CONSTRUCTION_INVALID', 'Injected constructor failure')\n${anchor}`
        : `    if (lifecycle === 'candidate') await storage.call('setSetting', 'preflight.forbidden', true)\n${anchor}`)
    })
    const operation = f.runtime.reload(set.id, ['kernel'])
    await f.runtime.manager.reconcile(); await f.runtime.settled()
    expect(f.runtime.getReload(operation.operationId)).toMatchObject({ phase: 'failed', switchedAt: null, units: [{ unitId: 'kernel', reasonCode: mode === 'construction' ? 'KERNEL_CONSTRUCTION_INVALID' : 'RUNTIME_PREPARING' }] })
    expect(f.runtime.manager.currentVersion('kernel').generation).toBe(1)
    expect(f.runtime.snapshot().ready).toBe(true)
    for (const unit of before.units)
      expect(f.runtime.snapshot().units.find(value => value.descriptor.id === unit.descriptor.id)?.generations.find(value => value.role === 'default')?.pid).toBe(unit.generations[0]?.pid)
  }
  expect(await f.runtime.storage.call('getSetting', 'preflight.forbidden')).toBeNull()
  await f.runtime.waitForIdle()
  const settled = await f.runtime.storage.call('run', run.id)
  expect(settled.status).toBe('completed')
  expect(settled.recovery).toBeUndefined()
  expect((await f.runtime.storage.call('runtimeExecutionRead', run.id))?.lease.owner.generation).toBe(1)
  expect(client.connectionStatus()).toBe('connected')
  expect(host.info().instanceId).toBe(before.instanceId)
}, 120_000)

test('a custom plugin without candidate lifecycle support reports restart before evaluating its code or switching Kernel routing', async () => {
  const f = await fixture()
  const source = join(f.root, 'unsupported-plugin.ts')
  await writeFile(source, "throw new Error('Custom plugin code must not run during preflight')\n")
  await f.runtime.storage.call('setPlugin', 'third-party.custom', true, {}, source)
  const before = f.runtime.manager.currentVersion('kernel')
  const operation = f.runtime.reload((await changedKernel(f.runtime, 'export const customPreflightRevision = 2')).id, ['kernel'])
  await f.runtime.manager.reconcile(); await f.runtime.settled()
  expect(f.runtime.getReload(operation.operationId)).toMatchObject({ phase: 'restart_required', switchedAt: null, units: [{ reasonCode: 'RUNTIME_RESTART_REQUIRED' }] })
  expect(f.runtime.manager.currentVersion('kernel')).toEqual(before)
  expect(f.runtime.snapshot().ready).toBe(true)
}, 120_000)

test('a compatible Goal plugin update preserves the Kernel and socket, pins the active Run and hands queued work to the new plugin generation', async () => {
  const f = await fixture(), { client, host } = await clientFor(f.runtime)
  const before = f.runtime.snapshot(), oldKernel = f.runtime.manager.defaultOwner('kernel')
  const first = await f.runtime.kernel.submit(f.session.id, 'old-plugin', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.coordinator.execution(first.id) !== null)
  const set = await changedPlugin(f.runtime, 'plugin.goal')
  const operation = f.runtime.reload(set.id, ['plugin.goal'])
  await f.runtime.manager.reconcile(); await f.runtime.settled()
  expect(f.runtime.manager.currentVersion('plugin.goal').generation).toBe(2)
  expect(f.runtime.coordinator.execution(first.id)?.versions.plugins.find(version => version.unitId === 'plugin.goal')?.generation).toBe(1)
  expect(f.runtime.manager.defaultOwner('kernel')).toEqual(oldKernel)
  const second = await f.runtime.kernel.submit(f.session.id, 'new-plugin', { text: '/tool get_goal {}', images: [] }, 'local-fixture')
  await f.runtime.waitForIdle()
  expect(await f.runtime.storage.call('run', first.id)).toMatchObject({ status: 'completed' })
  expect(await f.runtime.storage.call('run', second.id)).toMatchObject({ status: 'completed' })
  const execution = await f.runtime.storage.call('runtimeExecutionRead', second.id)
  expect(execution?.lease.versions.plugins.find(version => version.unitId === 'plugin.goal')?.generation).toBe(2)
  expect(f.runtime.getReload(operation.operationId).phase).toBe('completed')
  for (const unit of before.units.filter(unit => unit.descriptor.id !== 'plugin.goal'))
    expect(f.runtime.snapshot().units.find(current => current.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(unit.generations[0]?.pid)
  expect(client.connectionStatus()).toBe('connected'); expect(host.info().instanceId).toBe(before.instanceId)
})

test('owned Controller commands switch locally, retain the accepted request generation and keep the listener and every other owner', async () => {
  const f = await fixture(), { client, host } = await clientFor(f.runtime)
  const before = f.runtime.snapshot()
  const payload = (id: string) => JSON.stringify({ jsonrpc: '2.0', id, method: 'command.execute', params: {
    protocol: 1, requestId: id, commandId: 'permission.get', commandVersion: 1, input: {},
  } })
  let entered = false, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const previous = f.runtime.controller.dispatch(payload('captured-controller'), async () => { throw new Error('Business adapters must execute in the Controller owner') },
    async () => { entered = true; await gate; return { actorId: 'owned-controller-fixture', host: host.info() } }).catch((error: unknown) => error)
  try {
    await until(() => entered)
    const reload = f.runtime.reload((await changedController(f.runtime)).id, ['controller'])
    await f.runtime.manager.reconcile(); await f.runtime.settled()
    expect(f.runtime.manager.currentVersion('controller').generation).toBe(2)
    const current = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'controller')?.generations.find(g => g.role === 'default')
    const result = await client.call('command.execute', { protocol: 1, requestId: 'owned-controller-marker', commandId: 'permission.get', commandVersion: 1, input: {} }).catch((error: unknown) => error)
    expect(result).toMatchObject({ code: 'CONTROLLER_OWNED_MARKER', message: String(current?.pid) })
    release()
    const captured = await previous
    if (typeof captured !== 'string') throw captured
    expect(JSON.parse(captured)).toMatchObject({ id: 'captured-controller', result: { mode: 'ask' } })
    await f.runtime.manager.reconcile()
    await until(() => f.runtime.getReload(reload.operationId).phase === 'completed')
    for (const unit of before.units.filter(unit => unit.descriptor.id !== 'controller'))
      expect(f.runtime.snapshot().units.find(value => value.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(unit.generations[0]?.pid)
    expect(client.connectionStatus()).toBe('connected')
    expect(host.info().instanceId).toBe(before.instanceId)
    const base = await f.runtime.artifacts.build(hostRuntimeBaseBuildUnit())
    const active = await Promise.all(f.runtime.snapshot().units.map(unit => f.runtime.artifacts.get(f.runtime.manager.currentVersion(unit.descriptor.id).artifactId)))
    expect(base.inputs).not.toContain('packages/kernel/src/configuration-commands.ts')
    expect(f.runtime.artifacts.affected(['packages/kernel/src/configuration-commands.ts'], [...active, base])).toEqual(['controller'])
  } finally { release(); await previous }
}, 120_000)

test('owned Controller commands persist mutations and keep control calls responsive under concurrent reads', async () => {
  const f = await fixture(), { client } = await clientFor(f.runtime)
  const changed = await client.call('command.execute', { protocol: 1, requestId: 'owned-permission', commandId: 'permission.set', commandVersion: 1, input: { mode: 'allow' } })
  expect(changed).toEqual({ mode: 'allow' })
  await until(async () => (await client.call('permission.get', {})).mode === 'allow')
  const reads = Promise.all(Array.from({ length: 24 }, () => client.call('permission.get', {}))).catch((error: unknown) => error)
  const run = await client.call('run.start', { sessionId: f.session.id, requestId: 'owned-controller-run', modelId: 'local-fixture', input: { text: '/slow', images: [] } })
  await until(() => f.runtime.coordinator.execution(run.id) !== null)
  await client.call('run.cancel', { runId: run.id })
  expect(await reads).toEqual(Array.from({ length: 24 }, () => ({ mode: 'allow' })))
  await f.runtime.waitForIdle()
  expect(await f.runtime.storage.call('run', run.id)).toMatchObject({ status: 'cancelled' })
  expect(client.connectionStatus()).toBe('connected')
}, 120_000)

test('owned local and Plan tools validate, execute and settle through the admitted Run gateway', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'input.txt'), 'owned workspace read')
  const read = await f.runtime.kernel.submit(f.session.id, 'owned-local-read', { text: '/tool read_file {"path":"input.txt"}', images: [] }, 'local-fixture')
  await f.runtime.waitForIdle()
  expect(await f.runtime.storage.call('run', read.id)).toMatchObject({ status: 'completed' })
  const plan = await f.runtime.kernel.submit(f.session.id, 'owned-plan', { text: '/tool update_plan {"plan":[{"step":"Verify the owned gateway","status":"in_progress"}]}', images: [], approval: 'allow' }, 'local-fixture')
  await f.runtime.waitForIdle()
  expect(await f.runtime.storage.call('run', plan.id)).toMatchObject({ status: 'completed' })
  expect(await f.runtime.kernel.plugins.get('plan').get(f.session.id)).toMatchObject({ plan: [{ step: 'Verify the owned gateway', status: 'in_progress' }] })
  const events = await f.runtime.storage.call('events', f.session.id, 0, 2_000)
  expect(events.filter(event => event.type === 'tool.settled')).toHaveLength(2)
  expect(f.runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
})

for (const backend of ['fetch', 'playwright'] as const) {
const nativeBrowser = process.env.HBAR_TEST_BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const runTest = backend === 'playwright' && !await Bun.file(nativeBrowser).exists() ? test.skip : test
runTest(`a retained ${backend} browser context survives plugin and Kernel updates until explicit close, while fresh Sessions use the new browser owner`, async () => {
  const pageServer = Bun.serve({ port: 0, fetch: () => new Response('<title>Owned context</title><p>Retained page state</p><button id="increment" onclick="this.textContent=\'Counter: 1\'">Counter: 0</button>', { headers: { 'content-type': 'text/html' } }) })
  resources.push(async () => { await pageServer.stop(true) })
  const f = await fixture({ backend, ...(backend === 'playwright' ? { executablePath: nativeBrowser, headless: true } : {}), default_origin_policy: { access: 'allow' }, allow_history_access: true })
  const browser = f.runtime.kernel.plugins.get('browser')
  const page = await browser.navigate(f.session.id, 'http://127.0.0.1:' + pageServer.port)
  if (backend === 'playwright') await browser.click(f.session.id, '#increment', page.contextId, page.pageId)
  expect(f.runtime.kernel.chatDatabaseSessionProtection(f.session.id)).toBe('active')
  const before = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.browser')?.generations[0]
  const operation = f.runtime.reload((await changedPlugin(f.runtime, 'plugin.browser', source => {
    const anchor = 'plugins: [plugin]'
    if (source.split(anchor).length !== 2) throw new Error('Expected the owned browser factory')
    return source.replace(anchor, "plugins: [{ ...plugin, async apply(ctx, config) { await plugin.apply(ctx, config); ctx.hbar.api.hooks.on('context.build', request => request) } }]")
  })).id, ['plugin.browser'])
  await f.runtime.manager.reconcile(); await f.runtime.settled()
  expect(f.runtime.manager.currentVersion('plugin.browser').generation).toBe(2)
  expect((await browser.snapshot(f.session.id, page.contextId, page.pageId)).text).toContain('Retained page state')
  if (backend === 'playwright') expect((await browser.snapshot(f.session.id, page.contextId, page.pageId)).text).toContain('Counter: 1')
  const other = await f.runtime.storage.call('createSession', f.session.workspaceId)
  const freshPage = await browser.navigate(other.id, 'http://127.0.0.1:' + pageServer.port)
  expect(freshPage.contextId).not.toBe(page.contextId)
  const kernelOperation = f.runtime.reload((await changedKernel(f.runtime, 'export const nativeContextRevision = 2')).id, ['kernel'])
  await f.runtime.manager.reconcile(); await f.runtime.settled()
  expect(f.runtime.manager.currentVersion('kernel').generation).toBe(2)
  const run = await f.runtime.kernel.submit(f.session.id, 'retained-context-run', { text: '/tool browser_snapshot {}', images: [], approval: 'allow' }, 'local-fixture')
  await f.runtime.waitForIdle()
  expect(await f.runtime.storage.call('run', run.id)).toMatchObject({ status: 'completed' })
  const ownership = await f.runtime.storage.call('runtimeExecutionRead', run.id)
  expect(ownership?.lease.versions.plugins.find(version => version.unitId === 'plugin.browser')?.generation).toBe(1)
  for (const hook of ownership?.lease.versions.hooks ?? [])
    expect(ownership?.lease.versions.plugins.find(version => version.unitId === hook.unitId)).toEqual(hook)
  expect(ownership?.lease.versions.hooks.find(version => version.unitId === 'plugin.browser')).toBeUndefined()
  const freshRun = await f.runtime.kernel.submit(other.id, 'fresh-hook-binding', { text: 'Verify the fresh Hook owner', images: [] }, 'local-fixture')
  await f.runtime.waitForIdle()
  expect((await f.runtime.storage.call('runtimeExecutionRead', freshRun.id))?.lease.versions.hooks.find(version => version.unitId === 'plugin.browser')?.generation).toBe(2)
  expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.browser')?.generations.find(generation => generation.generation === 1)?.pid).toBe(before?.pid)
  expect(await browser.close(f.session.id)).toEqual({ closed: true })
  await browser.close(other.id)
  await f.runtime.manager.reconcile()
  await until(() => f.runtime.getReload(operation.operationId).phase === 'completed')
  expect(f.runtime.getReload(kernelOperation.operationId).phase).toBe('completed')
  expect(f.runtime.kernel.chatDatabaseSessionProtection(f.session.id)).toBeNull()
  expect(f.runtime.coordinator.snapshot().resources).toBe(0)
}, 120_000)
}

test('a crashed plugin fences its bound Run, restores the activated plugin version and creates one safe successor without restarting the Kernel', async () => {
  const f = await fixture(), kernel = f.runtime.manager.defaultOwner('kernel')
  const run = await f.runtime.kernel.submit(f.session.id, 'plugin-fault', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.coordinator.execution(run.id) !== null)
  const previous = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.goal')?.generations[0]
  if (!previous?.pid || previous.pid === process.pid) throw new Error('Expected the owned Goal PID')
  process.kill(previous.pid, 'SIGKILL')
  await until(() => f.runtime.snapshot().ready && f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.goal')?.generations[0]?.incarnation !== previous.incarnation)
  await f.runtime.waitForIdle()
  expect(f.runtime.manager.defaultOwner('kernel')).toEqual(kernel)
  expect(await f.runtime.storage.call('run', run.id)).toMatchObject({ status: 'interrupted' })
  const snapshot = await f.runtime.storage.call('snapshot', f.session.id)
  const successors = snapshot.runs.filter(next => next.recovery?.predecessorRunId === run.id)
  expect(successors).toHaveLength(1); expect(successors[0]?.status).toBe('completed')
  expect(snapshot.messages.filter(message => message.role === 'user')).toHaveLength(1)
})

test('a plugin exit while a durable claim receipt is pending reconciles the non-delivered authority and creates one successor', async () => {
  const f = await fixture(), { client } = await clientFor(f.runtime)
  const kernel = f.runtime.manager.defaultOwner('kernel')
  const original = f.runtime.storage.call.bind(f.runtime.storage)
  let held = false, writes = 0, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  f.runtime.storage.call = async <K extends keyof StorageMethods>(method: K, ...args: Parameters<StorageMethods[K]>): Promise<ReturnType<StorageMethods[K]>> => {
    const result = await original(method, ...args)
    if (method === 'runtimeExecutionClaim' && ++writes === 1) { held = true; await gate }
    return result
  }
  try {
    const run = await f.runtime.kernel.submit(f.session.id, 'claim-owner-exit', { text: 'safe pending claim', images: [] }, 'local-fixture')
    await until(() => held)
    expect(f.runtime.coordinator.execution(run.id)).toBeNull()
    const previous = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.goal')?.generations[0]
    if (!previous?.pid || previous.pid === process.pid) throw new Error('Expected the owned Goal PID')
    process.kill(previous.pid, 'SIGKILL')
    await until(() => f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'plugin.goal')?.generations[0]?.incarnation !== previous.incarnation)
    release()
    await f.runtime.waitForIdle()
    expect(await original('run', run.id)).toMatchObject({ status: 'interrupted' })
    const snapshot = await original('snapshot', f.session.id)
    expect(snapshot.runs.filter(next => next.recovery?.predecessorRunId === run.id)).toHaveLength(1)
    expect(snapshot.runs.find(next => next.recovery?.predecessorRunId === run.id)?.status).toBe('completed')
    expect(snapshot.messages.filter(message => message.role === 'user')).toHaveLength(1)
    expect(writes).toBe(2)
    expect(f.runtime.manager.defaultOwner('kernel')).toEqual(kernel)
    expect(f.runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
    expect(client.connectionStatus()).toBe('connected')
  } finally { release(); f.runtime.storage.call = original }
}, 120_000)

test('a lost durable claim receipt is read and revoked before one safe continuation without repeating the original write', async () => {
  const f = await fixture()
  const original = f.runtime.storage.call.bind(f.runtime.storage)
  let writes = 0
  f.runtime.storage.call = async <K extends keyof StorageMethods>(method: K, ...args: Parameters<StorageMethods[K]>): Promise<ReturnType<StorageMethods[K]>> => {
    const result = await original(method, ...args)
    if (method === 'runtimeExecutionClaim' && ++writes === 1) throw new HbarError('IPC_RESULT_UNKNOWN', 'Injected lost claim receipt')
    return result
  }
  try {
    const run = await f.runtime.kernel.submit(f.session.id, 'lost-claim-receipt', { text: 'safe claim reconciliation', images: [] }, 'local-fixture')
    await until(() => writes > 0)
    await f.runtime.waitForIdle()
    expect(await original('run', run.id)).toMatchObject({ status: 'interrupted' })
    expect(await original('runtimeExecutionRead', run.id)).toMatchObject({ state: 'revoked' })
    const snapshot = await original('snapshot', f.session.id)
    const successors = snapshot.runs.filter(next => next.recovery?.predecessorRunId === run.id)
    expect(successors).toHaveLength(1)
    expect(successors[0]?.status).toBe('completed')
    expect(snapshot.messages.filter(message => message.role === 'user')).toHaveLength(1)
    expect(writes).toBe(2)
    expect(f.runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally { f.runtime.storage.call = original }
}, 120_000)

test('the same managed composition starts from build-pinned bytes when its source root is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-packaged-process-host-'))
  resources.push(() => rm(root, { recursive: true, force: true }))
  const artifactPackage = await buildRuntimePackage(process.cwd(), join(root, 'build'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({ layout, sourceRoot: join(root, 'absent-source'), artifactPackage,
    demo: true, workspace: root, secrets: new MemorySecrets() })
  resources.unshift(() => runtime.close())
  const workspace = (await runtime.storage.call('workspaces'))[0]!
  const session = await runtime.storage.call('createSession', workspace.id)
  const { client } = await clientFor(runtime)
  const run = await runtime.kernel.submit(session.id, 'packaged-runtime', { text: '/tool get_goal {}', images: [] }, 'local-fixture')
  await runtime.waitForIdle()
  expect((await runtime.storage.call('run', run.id)).status).toBe('completed')
  expect((await client.call('system.bootstrap', {})).models.some(model => model.id === 'local-fixture')).toBe(true)
  expect(runtime.snapshot().ready).toBe(true)
  expect(new Set(runtime.snapshot().units.flatMap(unit => unit.generations.map(generation => generation.pid))).size).toBe(14)
})

test('a legacy profile executes locally in its managed Kernel owner, binds the actual driver owner and explicitly requires restart for code reload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-owned-profile-'))
  const source = await mkdtemp(join(process.cwd(), 'artifacts', 'owned-profile-'))
  resources.push(async () => { await rm(root, { recursive: true, force: true }); await rm(source, { recursive: true, force: true }) })
  const profileModule = join(source, 'profile.ts'), marker = join(root, 'profile-owner.json')
  await writeFile(profileModule, `import { definePlugin, provide } from '@hbar/plugin-sdk';
    import { emptyUsage } from '@hbar/contracts'; import { writeFileSync } from 'node:fs';
    export default { replacements: { 'driver.pi': definePlugin({ manifest: { id: 'driver.pi', name: 'Legacy owned fixture',
      description: 'Functions stay in their original Kernel owner', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', provides: { driver: '1.0.0' }, permissions: [] },
      apply(context) { provide(context, 'driver', { async run(input) { writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid, runId: input.run.id }));
        await input.commit('assistant', [{ type: 'text', text: 'owned legacy driver' }]); },
        async summarize() { return { text: '', usage: emptyUsage() }; } }); } }) } }`)
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({ layout, sourceRoot: process.cwd(), demo: true, workspace: root, profileModule, secrets: new MemorySecrets() })
  resources.unshift(() => runtime.close())
  const workspace = (await runtime.storage.call('workspaces'))[0]!, session = await runtime.storage.call('createSession', workspace.id)
  const run = await runtime.kernel.submit(session.id, 'owned-profile', { text: 'legacy fixture', images: [] }, 'local-fixture')
  await runtime.waitForIdle()
  expect((await runtime.storage.call('run', run.id)).status).toBe('completed')
  const ownership = await runtime.storage.call('runtimeExecutionRead', run.id)
  expect(ownership?.lease.versions.driver).toEqual(ownership?.lease.versions.kernel)
  const actual: unknown = JSON.parse(await readFile(marker, 'utf8'))
  expect(actual).toMatchObject({ pid: runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')!.generations[0]!.pid, runId: run.id })
  const kernel = runtime.buildUnits.find(unit => unit.descriptor.id === 'kernel')!
  const set = runtime.artifacts.registerSet([await runtime.artifacts.build(kernel)])
  const reload = runtime.reload(set.id, ['kernel'])
  expect(runtime.getReload(reload.operationId)).toMatchObject({ phase: 'restart_required', units: [{ reasonCode: 'RUNTIME_RESTART_REQUIRED' }] })
  // Recovery must use the activated code, even if the original profile is edited before a failure.
  await writeFile(profileModule, (await readFile(profileModule, 'utf8')).replace('owned legacy driver', 'unapplied source revision'))
  const previous = runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')!.generations[0]!
  if (!previous.pid || previous.pid === process.pid) throw new Error('Expected the owned legacy Kernel PID')
  process.kill(previous.pid, 'SIGKILL')
  await until(() => runtime.snapshot().ready && runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')?.generations[0]?.incarnation !== previous.incarnation)
  const second = await runtime.kernel.submit(session.id, 'sealed-profile', { text: 'still the activated code', images: [] }, 'local-fixture')
  await runtime.waitForIdle()
  expect((await runtime.storage.call('run', second.id)).status).toBe('completed')
  expect((await runtime.storage.call('snapshot', session.id)).messages.at(-1)?.content).toEqual([{ type: 'text', text: 'owned legacy driver' }])
})

test('a Kernel update pins the old executor, hands queued input to the new generation and keeps the socket, credentials and other process identities', async () => {
  const f = await fixture()
  const { client, host, system } = await clientFor(f.runtime)
  const before = f.runtime.snapshot()
  const set = await changedKernel(f.runtime, 'export const compatibleRevision = 2')
  const first = await f.runtime.kernel.submit(f.session.id, 'old-kernel', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.coordinator.execution(first.id) !== null)
  const operation = await system.execute('system.runtime.reload', { artifactSetId: set.id, unitIds: ['kernel'] })
  await f.runtime.manager.reconcile(); await f.runtime.settled()
  expect(f.runtime.manager.currentVersion('kernel').generation).toBe(2)
  expect(f.runtime.coordinator.execution(first.id)?.versions.kernel.generation).toBe(1)
  // These updates happen in the old executor after the new generation finished its initial projection.
  await f.runtime.kernel.plugins.get('goal').set(f.session.id, { objective: 'Preserve the latest Session state during handoff', status: 'paused' })
  const latestPlan = await f.runtime.kernel.plugins.get('plan').update(f.session.id, [{ step: 'Use the canonical handoff state', status: 'in_progress' }])
  const receipt = await f.runtime.kernel.plugins.get('budget').setCommand({ sessionId: f.session.id, tokens: 100_000, expectedRevision: null },
    { actorId: 'handoff-fixture', requestId: 'budget-handoff', idempotencyKey: 'budget-handoff' })
  const second = await f.runtime.kernel.submit(f.session.id, 'new-kernel', { text: 'new queued input', images: [] }, 'local-fixture')
  expect((await f.runtime.storage.call('run', second.id)).status).toBe('queued')
  expect(f.runtime.coordinator.executionForSession(f.session.id)?.runId).toBe(first.id)
  for (const id of ['storage', 'controller', 'driver.pi'])
    expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === id)?.generations[0]?.pid).toBe(before.units.find(unit => unit.descriptor.id === id)?.generations[0]?.pid)
  expect((await system.execute('system.runtime.get', {})).instanceId).toBe(before.instanceId)
  expect(client.connectionStatus()).toBe('connected')
  expect(host.info().instanceId).toBe(before.instanceId)
  await f.runtime.waitForIdle()
  expect((await f.runtime.storage.call('run', first.id)).status).toBe('completed')
  expect((await f.runtime.storage.call('runtimeExecutionRead', second.id))?.lease.versions.kernel.generation).toBe(2)
  expect((await f.runtime.kernel.plugins.get('goal').get(f.session.id)).goal?.status).toBe('paused')
  expect((await f.runtime.kernel.plugins.get('plan').get(f.session.id))?.revision).toBe(latestPlan.revision)
  expect((await f.runtime.kernel.plugins.get('budget').get(f.session.id))?.usedTokens).toBeGreaterThan(0)
  expect(await f.runtime.kernel.plugins.get('budget').getCommandReceipt(f.session.id, 'handoff-fixture', 'budget-handoff')).toEqual(receipt)
  await f.runtime.manager.reconcile()
  expect(f.runtime.getReload(operation.operationId).phase).toBe('completed')
})

test('a killed Kernel is fenced and resumes its interrupted conversation once while live clients receive the durable recovery events', async () => {
  const f = await fixture()
  const { client, system } = await clientFor(f.runtime)
  const events: WireNotification[] = []
  client.onEvent(event => { events.push(event) })
  await client.follow(f.session.id, 0)
  const original = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')!.generations[0]!
  const run = await f.runtime.kernel.submit(f.session.id, 'kernel-crash', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.facade.streams.size > 0)
  if (!original.pid || original.pid === process.pid) throw new Error('Expected the owned Kernel PID')
  process.kill(original.pid, 'SIGKILL')
  await until(async () => {
    const snapshot = await system.execute('system.runtime.get', {})
    return snapshot.ready && snapshot.units.find(unit => unit.descriptor.id === 'kernel')?.generations[0]?.incarnation !== original.incarnation
  })
  await f.runtime.waitForIdle()
  expect((await f.runtime.storage.call('run', run.id)).status).toBe('interrupted')
  const recovery = await f.runtime.storage.call('runtimeRecoveryRead', run.id)
  expect(recovery?.run?.recovery?.predecessorRunId).toBe(run.id)
  expect((await f.runtime.storage.call('run', recovery!.run!.id)).status).toBe('completed')
  expect((await f.runtime.storage.call('snapshot', f.session.id)).messages.filter(message => message.role === 'user')).toHaveLength(1)
  await until(() => events.some(event => event.method === 'session.event' && event.params.type === 'run.settled' && event.params.runId === run.id))
  expect(client.connectionStatus()).toBe('connected')
  expect(f.runtime.facade.streams.size).toBe(0)
  const current = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')!.generations[0]!
  expect(current.artifactId).toBe(original.artifactId)
  expect(current.generation).toBe(original.generation)
})

test('stable cancellation commits during a Kernel outage and recovery cannot resume the cancelled Run', async () => {
  const f = await fixture()
  const { client } = await clientFor(f.runtime)
  const original = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')!.generations[0]!
  const run = await f.runtime.kernel.submit(f.session.id, 'cancel-during-fault', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.facade.streams.size > 0)
  if (!original.pid || original.pid === process.pid) throw new Error('Expected an owned Kernel PID')
  process.kill(original.pid, 'SIGKILL')
  await until(() => f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')!.generations[0]!.phase === 'recovering')
  await client.call('run.cancel', { runId: run.id })
  expect(await f.runtime.storage.call('cancelRequested', run.id)).toBe(true)
  await until(() => f.runtime.snapshot().ready)
  await f.runtime.waitForIdle()
  const recovery = await f.runtime.storage.call('runtimeRecoveryRead', run.id)
  expect(recovery?.run).toBeNull()
  expect(recovery?.chain.reasonCode).toBe('USER_CANCELLED')
  expect((await f.runtime.storage.call('run', run.id)).status).toBe('interrupted')
  expect(client.connectionStatus()).toBe('connected')
})

test('a Kernel fault after the real Pi completion receipt reconciles the outcome without another model execution', async () => {
  const f = await fixture()
  const set = await changedKernel(f.runtime, 'export const completionReceiptFaultFixture = true', source => {
    const anchor = 'unsubscribe = kernel.subscribe'
    if (source.split(anchor).length !== 2) throw new Error('Expected the activated Kernel subscription')
    return source.replace(anchor, `const completionCall = kernel.storage.call.bind(kernel.storage); kernel.storage.call = async (method, ...args) => { if (method === 'setRun' && args[1] === 'completed' && (await completionCall('run', args[0])).requestId === 'receipt-gap') await new Promise(() => {}); return completionCall(method, ...args) }; ${anchor}`)
  })
  f.runtime.reload(set.id, ['kernel'])
  await f.runtime.manager.reconcile(); await f.runtime.settled()
  await until(() => f.runtime.snapshot().ready && f.runtime.manager.currentVersion('kernel').generation === 2)
  const run = await f.runtime.kernel.submit(f.session.id, 'receipt-gap', { text: 'Return the final result once', images: [] }, 'local-fixture')
  await until(async () => (await f.runtime.storage.call('events', f.session.id, 0, 2000)).some(event => event.runId === run.id && event.type === 'run.driverCompleted'))
  const owner = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'kernel')?.generations.find(generation => generation.role === 'default')
  if (!owner?.pid || owner.pid === process.pid) throw new Error('Expected the retained Kernel process')
  process.kill(owner.pid, 'SIGKILL')
  await f.runtime.waitForIdle()
  const recovery = await f.runtime.storage.call('runtimeRecoveryRead', run.id)
  if (!recovery?.run) throw new Error('Expected the receipt reconciliation identity')
  expect((await f.runtime.storage.call('run', recovery.run.id)).status).toBe('completed')
  expect((await f.runtime.storage.call('run', run.id)).status).toBe('interrupted')
  const snapshot = await f.runtime.storage.call('snapshot', f.session.id)
  expect(snapshot.messages.filter(message => message.runId === recovery.run!.id)).toHaveLength(0)
  expect((await f.runtime.storage.call('events', f.session.id, 0, 2000)).filter(event => event.type === 'run.driverCompleted')).toHaveLength(1)
}, 120_000)

test('runtime diagnostics and liveness remain available while the request Controller is recovering', async () => {
  const f = await fixture(), { client, host, system } = await clientFor(f.runtime)
  const previous = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'controller')?.generations[0]
  if (!previous?.pid || previous.pid === process.pid) throw new Error('Expected the owned Controller PID')
  process.kill(previous.pid, 'SIGKILL')
  await until(() => f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'controller')?.generations[0]?.phase === 'recovering')
  const state = await system.execute('system.runtime.get', {})
  expect(state.instanceId).toBe(f.runtime.instanceId)
  expect((await fetch('http://127.0.0.1:' + host.server.port + '/livez')).status).toBe(200)
  expect(client.connectionStatus()).toBe('connected')
  await until(() => f.runtime.snapshot().ready)
  expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'controller')?.generations[0]?.incarnation).not.toBe(previous.incarnation)
})

test('a paired runtime subscription receives bounded local reload deltas and restores its cursor after reconnect', async () => {
  const f = await fixture(), { client } = await clientFor(f.runtime)
  const revisions: number[] = []
  const dispose = client.runtimeStatus.subscribe(state => { if (state.snapshot) revisions.push(state.snapshot.revision) })
  try {
    await client.runtimeStatus.refresh()
    expect(client.runtimeStatus.state().snapshot).toMatchObject({ ready: true, instanceId: f.runtime.snapshot().instanceId })
    const initial = client.runtimeStatus.state().snapshot!.revision
    const reload = f.runtime.reload((await changedController(f.runtime)).id, ['controller'])
    await f.runtime.manager.reconcile(); await f.runtime.settled()
    await until(() => client.runtimeStatus.state().snapshot?.units.find(unit => unit.descriptor.id === 'controller')?.generations.some(g => g.role === 'default' && g.generation === 2) ?? false)
    expect(client.runtimeStatus.state().operations.some(operation => operation.operationId === reload.operationId)).toBe(true)
    client.disconnect(); await client.connect(); await client.runtimeStatus.refresh()
    expect(client.runtimeStatus.state().snapshot?.revision).toBeGreaterThan(initial)
    expect(revisions.every((revision, index) => index === 0 || revision >= revisions[index - 1]!)).toBe(true)
    expect(client.runtimeStatus.state().errorCode).toBeNull()
  } finally { dispose() }
}, 120_000)

test('a failed Kernel candidate keeps the current version and does not interrupt a healthy conversation', async () => {
  const f = await fixture()
  const original = f.runtime.manager.currentVersion('kernel')
  const set = await changedKernel(f.runtime, '')
  // Inject the failure in readonly preparation, while keeping the registered contract fingerprint unchanged.
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'process-host-failed-'))
  resources.push(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'kernel.ts')
  const originalSource = await readFile('apps/host/src/runtime-kernel-process.ts', 'utf8')
  const anchor = 'async prepare() {'
  expect(originalSource.split(anchor)).toHaveLength(2)
  await writeFile(source, originalSource.replaceAll("'./", "'../../apps/host/src/")
    .replace(anchor, "async prepare() { throw new HbarError('PREPARE_FAILED', 'Injected readonly failure');"))
  const unit = f.runtime.buildUnits.find(value => value.descriptor.id === 'kernel')!
  const failed = f.runtime.artifacts.registerSet([await f.runtime.artifacts.build({ ...unit, entrypoint: source })])
  expect(failed.id).not.toBe(set.id)
  const run = await f.runtime.kernel.submit(f.session.id, 'healthy-kernel', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.facade.streams.size > 0)
  const operation = f.runtime.reload(failed.id, ['kernel'])
  await f.runtime.manager.reconcile(); await f.runtime.settled()
  expect(f.runtime.getReload(operation.operationId).phase).toBe('failed')
  expect(f.runtime.manager.currentVersion('kernel')).toEqual(original)
  await f.runtime.waitForIdle()
  expect((await f.runtime.storage.call('run', run.id)).status).toBe('completed')
  expect(await f.runtime.storage.call('runtimeRecoveryRead', run.id)).toBeNull()
})

test('tampered registered Kernel bytes are rejected before import without changing the current generation', async () => {
  const f = await fixture()
  const original = f.runtime.manager.currentVersion('kernel')
  const set = await changedKernel(f.runtime, 'export const tamperTestRevision = 2')
  const artifact = set.artifacts[0]!
  const marker = join(f.root, 'tampered-module-imported')
  const source = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'imported'); export function create() { throw new Error('untrusted') }`
  await writeFile(join(f.runtime.artifacts.root, artifact.id, artifact.entry), source)
  const operation = f.runtime.reload(set.id, ['kernel'])
  await f.runtime.manager.reconcile()
  expect(f.runtime.getReload(operation.operationId)).toMatchObject({ phase: 'failed', units: [{ reasonCode: 'RUNTIME_ARTIFACT_CHANGED' }] })
  expect(f.runtime.manager.currentVersion('kernel')).toEqual(original)
  expect(await Bun.file(marker).exists()).toBe(false)
  expect(f.runtime.snapshot().ready).toBe(true)
})
