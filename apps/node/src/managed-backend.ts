import { resolve } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { NodeExecutionBackend } from '@hbar/node-core'
import { ManagedProcess, RuntimeArtifactStore, type RuntimeArtifactPackage } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { nodeRuntimeBuildUnit } from './runtime-build'
import { nodeProcessOutputSchema } from './execution-contract'

/** Only B-owned allowed values and B's program lookup are inherited. */
export function nodeProcessEnvironment(
  allowlist: readonly string[],
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const allowed = new Set(allowlist.map((name) => name.toLowerCase()))
  const lookup = new Set([
    'path',
    ...(process.platform === 'win32' ? ['pathext', 'systemroot', 'windir', 'comspec'] : []),
  ])
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && (allowed.has(name.toLowerCase()) || lookup.has(name.toLowerCase()))) result[name] = value
  for (const [name, value] of Object.entries(overrides)) {
    if (/^(?:PATH|PATHEXT|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|NODE_OPTIONS)$/i.test(name))
      throw new HbarError('NODE_DENIED', 'Unsafe snapshot environment variable')
    for (const inherited of Object.keys(result))
      if (inherited.toLowerCase() === name.toLowerCase()) delete result[inherited]
    result[name] = value
  }
  return result
}
export async function createManagedNodeBackend(options: {
  dataRoot: string
  sourceRoot?: string
  command?: readonly [string, ...string[]]
  packaged?: RuntimeArtifactPackage
}): Promise<NodeExecutionBackend> {
  const registry = new RuntimeArtifactStore(
    resolve(options.dataRoot, 'execution-artifacts'),
    options.sourceRoot ?? resolve(import.meta.dir, '../../..'),
  )
  const build = nodeRuntimeBuildUnit()
  const artifact = options.packaged
    ? (await registry.installPackage(options.packaged, options.packaged.id)).artifacts.find(
        (unit) => unit.unitId === build.descriptor.id,
      )
    : await registry.build(build)
  if (!artifact) throw new HbarError('NODE_EXECUTION_UNAVAILABLE', 'Packaged node execution owner is missing')
  const modulePath = await registry.modulePath(artifact.id)
  const processTree = createRuntimeProcessTreePort()
  const owners = new Set<ManagedProcess>()
  let closed = false
  return {
    name: 'none',
    filesystem: false,
    network: false,
    processTree: true,
    async exec(workspace, command, signal, input) {
      if (closed) throw new HbarError('NODE_OFFLINE', 'Node execution backend is closed')
      if (input.confinement)
        throw new HbarError('NODE_CONFINEMENT_UNAVAILABLE', 'Raw process owner cannot enforce OS isolation')
      signal.throwIfAborted()
      const owner = new ManagedProcess({
        descriptor: build.descriptor,
        artifactId: artifact.id,
        modulePath,
        generation: 1,
        parent: { unitId: 'node', generation: 1, incarnation: crypto.randomUUID() },
        command: options.command ?? [process.execPath, resolve(import.meta.dir, 'runtime-entry.ts')],
        processTree,
        verifyModule: async () => {
          await registry.get(artifact.id)
        },
        onFault: async () => {
          // The finally block awaits this same disposal and reports a failed physical release.
          void owner.dispose().catch(() => undefined)
        },
      })
      owners.add(owner)
      const abort = () => {
        void owner.dispose().catch(() => undefined)
      }
      signal.addEventListener('abort', abort, { once: true })
      try {
        await owner.prepare()
        signal.throwIfAborted()
        await owner.activate()
        return await owner.call(
          'node.exec',
          {
            workspace,
            command,
            timeoutMs: input.timeoutMs,
            environment: nodeProcessEnvironment(input.environmentAllowlist, input.environment),
          },
          nodeProcessOutputSchema,
          { signal, timeoutMs: input.timeoutMs + 5_000 },
        )
      } catch (error) {
        if (signal.aborted) throw new HbarError('CANCELLED', 'Node execution cancelled')
        throw new HbarError('EFFECT_UNKNOWN', 'Node execution owner response was lost; reconcile its receipt', {
          cause: error,
        })
      } finally {
        signal.removeEventListener('abort', abort)
        await owner.dispose()
        owners.delete(owner)
      }
    },
    async dispose() {
      closed = true
      await Promise.all([...owners].map((owner) => owner.dispose()))
      owners.clear()
    },
  }
}
