import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { startServer } from '../apps/host/src/server'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { HbarClient, createSystemCommandClient } from '@hbar/client'

test('formal source preparation registers a version without changing any owner until explicitly applied', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-formal-'))
  const source = join(root, 'kernel.ts')
  const original = (await readFile('apps/host/src/runtime-kernel-process.ts', 'utf8')).replaceAll("'./", "'../../apps/host/src/")
  await writeFile(source, original)
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
    sourceRoot: process.cwd(), demo: true, secrets: new MemorySecrets(), autoApplySource: false,
    buildUnits: hostRuntimeBuildUnits().map(unit => unit.descriptor.id === 'kernel' ? { ...unit, entrypoint: source } : unit),
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    await client.pair(host.pairing.code, 'Formal preparation fixture')
    const system = createSystemCommandClient(client), before = runtime.snapshot()
    await writeFile(source, original + '\nexport const explicitlyAppliedRevision = 2\n')
    await runtime.applySourceChanges([source])
    const prepared = await system.execute('system.runtime.get', {})
    expect(prepared.sourceReload?.phase).toBe('prepared')
    expect(prepared.sourceReload?.operationId).toBeNull()
    for (const unit of before.units)
      expect(prepared.units.find(value => value.descriptor.id === unit.descriptor.id)?.generations.map(generation => ({ generation: generation.generation, incarnation: generation.incarnation, pid: generation.pid, artifactId: generation.artifactId }))).toEqual(unit.generations.map(generation => ({ generation: generation.generation, incarnation: generation.incarnation, pid: generation.pid, artifactId: generation.artifactId })))
    const artifactSetId = prepared.sourceReload?.artifactSetId
    if (!artifactSetId) throw new Error('Expected a prepared registered set')
    expect(prepared.preparedArtifactSets).toContain(artifactSetId)
    const operation = await system.execute('system.runtime.reload', { artifactSetId, unitIds: ['kernel'] })
    await runtime.manager.reconcile(); await runtime.settled()
    expect(runtime.manager.currentVersion('kernel').generation).toBe(2)
    expect(runtime.getReload(operation.operationId).phase).toBe('completed')
    for (const unit of before.units.filter(unit => unit.descriptor.id !== 'kernel'))
      expect(runtime.snapshot().units.find(value => value.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(unit.generations[0]?.pid)
    expect(client.connectionStatus()).toBe('connected')
  } finally {
    client.disconnect(); await host.close(); await runtime.close()
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}, 120_000)
