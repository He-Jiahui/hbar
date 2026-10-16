import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ManagedProcess, RuntimeArtifactStore, RuntimeValuePort } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import type { RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import {
  PLUGIN_RUNTIME_FINGERPRINT,
  RUNTIME_PLUGIN_CONTROL_METHODS,
  runtimePluginResultSchema,
} from '../apps/host/src/runtime-plugin-contract'

test('actual owned read capability preserves safe missing-file code and conceals unknown native errors', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'owned-validation-'))
  const source = join(root, 'plugin.ts')

  await writeFile(
    source,
    `
    import { definePlugin, provide } from '@hbar/plugin-sdk'
    import { LocalExecution } from '../../plugins/local-tools/src'
    import { localReadBoundary } from '../../plugins/local-tools/src/read-errors'
    import { createRuntimePlugin } from '../../apps/host/src/runtime-plugin-process'
    const plugin=definePlugin({manifest:{id:'validation.fixture',name:'Read fixture',description:'Read boundary',version:'1.0.0',apiVersion:'^1.0.0',scope:'host',provides:{execution:'1.0.0'},permissions:['fs']},
    apply(ctx){ const execution=new LocalExecution(); ctx.effect(()=>()=>execution.dispose());
      provide(ctx,'execution',{readBytes:(workspace,path)=>path==='unknown'?localReadBoundary(async()=>{throw Object.assign(new Error('PRIVATE_UNKNOWN_CANARY'),{code:'EUNKNOWN'})}):execution.readBytes(workspace,path)}) }})
    export const create=context=>createRuntimePlugin(context,{plugins:[plugin]})
  `,
  )
  const descriptor = {
    id: 'plugin.validation-fixture',
    kind: 'plugin' as const,
    isolation: 'process' as const,
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const artifacts = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  let application: RuntimeValuePort | undefined
  let readState: (() => Promise<RuntimePluginState>) | undefined
  let owner: ManagedProcess | undefined
  try {
    const artifact = await artifacts.build({ descriptor, entrypoint: source })
    owner = new ManagedProcess({
      descriptor,
      artifactId: artifact.id,
      generation: 1,
      modulePath: await artifacts.modulePath(artifact.id),
      configuration: { dataRoot: root, cacheRoot: join(root, 'cache') },
      parent: { unitId: 'base', generation: 1, incarnation: 'validation-fixture-base' },
      controlMethods: RUNTIME_PLUGIN_CONTROL_METHODS,
      onPeer: (peer) => {
        readState = () => peer.call('plugin.state', undefined, runtimePluginStateSchema)
        application = new RuntimeValuePort(peer, { prefix: 'plugin.application' })
      },
    })
    await owner.prepare()
    await owner.activate()
    const port = application
    if (!port || !readState) throw new Error('Owned validation fixture port missing')
    const state = await readState()
    expect(owner.snapshot().pid).not.toBe(process.pid)
    const read = async (path: string) =>
      runtimePluginResultSchema.parse(
        await port.call('invoke', [
          { operation: 'capability', name: 'execution', method: 'readBytes', catalog: state.tools },
          [root, path],
          async () => {
            throw new Error('Unexpected Host invocation')
          },
        ]),
      )
    const missing = await read('missing-private-file')
    expect(missing).toMatchObject({ kind: 'error', code: 'NOT_FOUND' })
    expect(JSON.stringify(missing)).not.toContain(root)
    expect(JSON.stringify(missing)).not.toContain('missing-private-file')
    const unknown = await read('unknown')
    expect(unknown).toMatchObject({
      kind: 'error',
      code: 'RUNTIME_PLUGIN_FAILED',
      message: 'The owned plugin invocation failed',
    })
    expect(JSON.stringify(unknown)).not.toContain('PRIVATE_UNKNOWN_CANARY')
    expect(port.snapshot().callbacks).toBe(0)
  } finally {
    try {
      await owner?.dispose()
    } finally {
      application?.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }
}, 60_000)
