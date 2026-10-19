import { afterEach, expect, spyOn, test } from 'bun:test'
import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RuntimeArtifactStore, buildRuntimeArtifact } from '@hbar/runtime'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-builder-'))
  roots.push(root)
  const source = join(root, 'unit.ts')
  await writeFile(source, 'export const revision = 1\n')
  const descriptor: RuntimeUnitDescriptor = {
    id: 'fixture',
    kind: 'plugin',
    isolation: 'process',
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: 24,
    dependencies: [],
  }
  return {
    root,
    source,
    store: new RuntimeArtifactStore(join(root, 'bundles'), process.cwd()),
    unit: { descriptor, entrypoint: source },
  }
}
test('isolated local builds register verified immutable bytes and leave the stable loop responsive', async () => {
  const f = await fixture(),
    signal = new AbortController().signal
  let turns = 0
  const timer = setInterval(() => turns++, 1)
  try {
    const artifact = await buildRuntimeArtifact(f.store, f.unit, signal)
    expect(artifact.inputs).toContain(f.source.slice(process.cwd().length + 1).replaceAll('\\', '/'))
    expect(await readFile(await f.store.modulePath(artifact.id), 'utf8')).toContain('revision')
    expect(f.store.registerSet([artifact]).artifacts).toHaveLength(1)
    expect(turns).toBeGreaterThan(0)
  } finally {
    clearInterval(timer)
  }
})
test('a failed build leaves the registered generation available and cancellation has no orphaned builder', async () => {
  const f = await fixture(),
    controller = new AbortController()
  const artifact = await buildRuntimeArtifact(f.store, f.unit, controller.signal)
  await writeFile(f.source, 'export const broken = ;')
  await expect(buildRuntimeArtifact(f.store, f.unit, controller.signal)).rejects.toMatchObject({
    code: 'RUNTIME_BUILD_FAILED',
  })
  expect(await f.store.get(artifact.id)).toEqual(artifact)
  controller.abort()
  await expect(buildRuntimeArtifact(f.store, f.unit, controller.signal)).rejects.toBeDefined()
})

test('the real compiler worker exits before parent verification begins', async () => {
  const f = await fixture()
  const terminate = Worker.prototype.terminate
  const acceptBuild = f.store.acceptBuild.bind(f.store)
  let joined = false
  const termination = spyOn(Worker.prototype, 'terminate').mockImplementation(async function (this: Worker) {
    const code = await terminate.call(this)
    joined = true
    return code
  })
  const acceptance = spyOn(f.store, 'acceptBuild').mockImplementation(async (raw: unknown) => {
    expect(joined).toBe(true)
    return await acceptBuild(raw)
  })
  try {
    const artifact = await buildRuntimeArtifact(f.store, f.unit, new AbortController().signal)
    expect(acceptance).toHaveBeenCalledTimes(1)
    expect(await f.store.get(artifact.id)).toEqual(artifact)
  } finally {
    acceptance.mockRestore()
    termination.mockRestore()
  }
})

test('parent verification still rejects tampered bytes after the compiler exits', async () => {
  const f = await fixture()
  const acceptBuild = f.store.acceptBuild.bind(f.store)
  const acceptance = spyOn(f.store, 'acceptBuild').mockImplementation(async (raw: unknown) => {
    // Validate the cloned descriptor before locating its immutable output.
    const artifact = z
      .object({ id: z.string().regex(/^[a-f0-9]{64}$/), entry: z.string().regex(/^[A-Za-z0-9_.-]+$/) })
      .parse(raw)
    await writeFile(join(f.store.root, artifact.id, artifact.entry), 'export const tampered = true\n')
    return await acceptBuild(raw)
  })
  try {
    await expect(buildRuntimeArtifact(f.store, f.unit, new AbortController().signal)).rejects.toMatchObject({
      code: 'RUNTIME_ARTIFACT_CHANGED',
    })
    expect(acceptance).toHaveBeenCalledTimes(1)
  } finally {
    acceptance.mockRestore()
  }
})

test('an unconfirmed compiler exit prevents parent acceptance and preserves its error', async () => {
  const f = await fixture()
  const terminate = Worker.prototype.terminate
  const failure = new Error('Compiler exit confirmation failed')
  const termination = spyOn(Worker.prototype, 'terminate').mockImplementation(async function (this: Worker) {
    await terminate.call(this)
    throw failure
  })
  const acceptance = spyOn(f.store, 'acceptBuild')
  try {
    await expect(buildRuntimeArtifact(f.store, f.unit, new AbortController().signal)).rejects.toBe(failure)
    expect(acceptance).not.toHaveBeenCalled()
  } finally {
    acceptance.mockRestore()
    termination.mockRestore()
  }
})

test('cancellation after worker creation waits for its exit and never accepts an artifact', async () => {
  const f = await fixture()
  const controller = new AbortController()
  const terminate = Worker.prototype.terminate
  let joined = false
  const termination = spyOn(Worker.prototype, 'terminate').mockImplementation(async function (this: Worker) {
    const code = await terminate.call(this)
    joined = true
    return code
  })
  const acceptance = spyOn(f.store, 'acceptBuild')
  try {
    const pending = buildRuntimeArtifact(f.store, f.unit, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'RUNTIME_CANCELLED' })
    expect(joined).toBe(true)
    expect(acceptance).not.toHaveBeenCalled()
  } finally {
    acceptance.mockRestore()
    termination.mockRestore()
  }
})
