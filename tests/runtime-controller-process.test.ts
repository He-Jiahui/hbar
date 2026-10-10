import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ManagedProcess, RuntimeArtifactStore } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { HbarError } from '@hbar/contracts'
import { CommandError } from '@hbar/commands/protocol'
import { CONTROLLER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-controller-contract'
import { RuntimeControllerAdapter } from '../apps/host/src/runtime-controller-adapter'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
const request = (id: string | number, method = 'system.bootstrap', params: unknown = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params })
async function fixture(alterAccepted = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-controller-process-'))
  const descriptor: RuntimeUnitDescriptor = { id: 'controller', kind: 'controller', isolation: 'process', dependencies: [],
    required: true, reloadable: true, contractFingerprint: CONTROLLER_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION }
  const store = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  let entrypoint = 'apps/host/src/runtime-controller-process.ts'
  if (alterAccepted) {
    const sourceRoot = await mkdtemp(join(process.cwd(), 'artifacts', 'controller-request-mismatch-'))
    resources.push(() => rm(sourceRoot, { recursive: true, force: true }))
    entrypoint = join(sourceRoot, 'controller.ts')
    const original = (await readFile('apps/host/src/runtime-controller-process.ts', 'utf8')).replace("'./runtime-controller-contract'", "'../../apps/host/src/runtime-controller-contract'")
    await writeFile(entrypoint, original.replace('invocationId: input.invocationId, request }', "invocationId: input.invocationId, request: { ...request, method: 'system.paths.get' } }"))
  }
  const artifact = await store.build({ descriptor, entrypoint })
  let adapter!: RuntimeControllerAdapter
  const managed = new ManagedProcess({ descriptor, artifactId: artifact.id, modulePath: await store.modulePath(artifact.id), generation: 1,
    parent: { unitId: 'base', generation: 1, incarnation: 'base-controller-test' }, controlMethods: ['controller.control', 'controller.invoke'],
    onPeer: peer => { adapter = new RuntimeControllerAdapter(peer) }, onExit: async () => { adapter.dispose() },
  })
  resources.push(async () => { await managed.dispose(); adapter.dispose(); await rm(root, { recursive: true, force: true }) })
  await managed.prepare()
  await managed.activate()
  return { managed, adapter }
}

test('malformed, unknown and invalid requests terminate in the isolated Controller without invoking production', async () => {
  const f = await fixture()
  let invoked = 0
  const invoke = async () => { invoked++; return { ok: true } }
  expect(JSON.parse(await f.adapter.dispatch('{', invoke))).toMatchObject({ id: null, error: { data: 'INVALID_REQUEST' } })
  expect(JSON.parse(await f.adapter.dispatch(request(1, 'missing'), invoke))).toMatchObject({ id: 1, error: { data: 'METHOD_NOT_FOUND' } })
  expect(JSON.parse(await f.adapter.dispatch(request(2, 'run.cancel', {}), invoke))).toMatchObject({ id: 2, error: { data: 'INVALID_REQUEST' } })
  expect(invoked).toBe(0)
  expect(JSON.parse(await f.adapter.dispatch(request(3), invoke))).toEqual({ jsonrpc: '2.0', id: 3, result: { ok: true } })
  expect(f.managed.snapshot().phase).toBe('serving')
})

test('business errors and response serialization failures settle only their requests while subsequent clients continue', async () => {
  const f = await fixture()
  expect(JSON.parse(await f.adapter.dispatch(request('business'), async () => { throw new HbarError('CONFLICT', 'Known conflict') }))).toMatchObject({ id: 'business', error: { data: 'CONFLICT' } })
  expect(JSON.parse(await f.adapter.dispatch(request('command'), async () => { throw new CommandError('COMMAND_CONFLICT', 'Known command conflict') }))).toMatchObject({ id: 'command', error: { data: 'COMMAND_CONFLICT' } })
  expect(JSON.parse(await f.adapter.dispatch(request('serialization'), async () => ({ callback: () => {} })))).toMatchObject({ id: 'serialization', error: { data: 'IPC_SERIALIZATION' } })
  expect(JSON.parse(await f.adapter.dispatch(request('next'), async () => ({ ok: true })))).toMatchObject({ id: 'next', result: { ok: true } })
  expect(f.managed.snapshot().phase).toBe('serving')
})

test('reserved control calls retain physical capacity when normal requests occupy every normal Controller slot', async () => {
  const f = await fixture()
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const waiting = Array.from({ length: 56 }, (_, id) => f.adapter.dispatch(request(id), async () => { await held; return null }))
  while (f.managed.snapshot().references.requests < 56) await Bun.sleep(5)
  try {
    expect(JSON.parse(await f.adapter.dispatch(request('cancel', 'run.cancel', { runId: 'run' }), async () => ({ accepted: true })))).toMatchObject({ id: 'cancel', result: { accepted: true } })
  } finally { release(); await Promise.all(waiting) }
})

test('a Controller cannot change the method or payload bound to the accepted listener request', async () => {
  const f = await fixture(true)
  let invoked = 0
  const result: unknown = JSON.parse(await f.adapter.dispatch(request('original'), async () => { invoked++; return null }))
  expect(result).toMatchObject({ id: 'original', error: { data: 'CONTROLLER_REQUEST_MISMATCH' } })
  expect(invoked).toBe(0)
})
