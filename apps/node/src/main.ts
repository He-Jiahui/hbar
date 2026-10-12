import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { isIP } from 'node:net'
import { HbarError } from '@hbar/contracts'
import { nodeFloorSchema } from '@hbar/contracts/node'
import {
  nodeIdFromPublicKey,
  nodeFingerprint,
  nodeProtectedPaths,
  WorkspaceNodeService,
  type NodeExecutionBackend,
} from '@hbar/node-core'
import { LocalExecution } from '@hbar/local-tools'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { acquireProcessLease, type RuntimeArtifactPackage } from '@hbar/runtime'
import { createManagedNodeBackend } from './managed-backend'
import { NodeConsoleService } from './console-service'
import { startNodeControlServer } from './control-server'
import { WorkspaceNodeLink } from './link-service'
import { nodeDataRoot, openNodeIdentity } from './bootstrap'
export { runNodeCommand } from './cli'
export { NodeConsoleService } from './console-service'
export { WorkspaceNodeLink } from './link-service'
function loopbackListen(listen: string): boolean {
  const hostname = new URL('http://' + listen).hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '[::1]' || (isIP(hostname) === 4 && hostname.startsWith('127.'))
}
export async function runNode(
  argv: readonly string[],
  options: {
    command?: readonly [string, ...string[]]
    packaged?: RuntimeArtifactPackage
    registerSignals?: boolean
    staticRoot?: string
  } = {},
) {
  const { values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      role: { type: 'string' },
      home: { type: 'string' },
      'data-root': { type: 'string' },
      listen: { type: 'string' },
      join: { type: 'string' },
      code: { type: 'string' },
      fingerprint: { type: 'string' },
      stdio: { type: 'boolean' },
      cert: { type: 'string' },
      key: { type: 'string' },
      'public-host': { type: 'string' },
      'web-root': { type: 'string' },
    },
  })
  if (values.role && values.role !== 'workspace') throw new HbarError('INVALID_ROLE', 'Node role must be workspace')
  if (values.stdio) throw new HbarError('NODE_TRANSPORT_UNAVAILABLE', 'SSH stdio transport is not installed')
  const joining = [values.join, values.code, values.fingerprint].some((value) => value !== undefined)
  if (joining && (!values.join || !values.code || !values.fingerprint))
    throw new HbarError(
      'INVALID_INPUT',
      'First join requires an address, eight-digit code and conversation fingerprint',
    )
  const dataRoot = nodeDataRoot(values.home ?? values['data-root'])
  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  const release = await acquireProcessLease(join(dataRoot, 'node.lock'))
  const state = new NodeStateStorage(join(dataRoot, 'node.sqlite'))
  let node: WorkspaceNodeService | undefined
  let backend: NodeExecutionBackend | undefined
  let execution: LocalExecution | undefined
  let control: Awaited<ReturnType<typeof startNodeControlServer>> | undefined
  let publicControl: Awaited<ReturnType<typeof startNodeControlServer>> | undefined
  let link: WorkspaceNodeLink | undefined
  let closeTask: Promise<void> | undefined
  const stop = () => {
    void close().catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
  }
  const close = () =>
    (closeTask ??= (async () => {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      try {
        const linkOutcomes = await Promise.allSettled([link?.close()])
        const outcomes = [
          ...linkOutcomes,
          ...(await Promise.allSettled([
            control?.close(),
            publicControl?.close(),
            node
              ? node.dispose()
              : Promise.resolve().then(async () => {
                  await backend?.dispose?.()
                  execution?.dispose()
                }),
          ])),
        ]
        const failed = outcomes.filter((outcome) => outcome.status === 'rejected')
        if (failed.length)
          throw new AggregateError(
            failed.map((outcome) => outcome.reason as unknown),
            'Node shutdown did not release all resources',
          )
      } finally {
        try {
          await state.close()
        } finally {
          await release()
        }
      }
    })())
  try {
    await state.call('ready', {})
    const identity = await openNodeIdentity(state)
    const floor = (await state.call('floor.get', {})) ?? nodeFloorSchema.parse({ roots: [] })
    if (!(await state.call('floor.get', {}))) await state.call('floor.set', floor)
    backend = await createManagedNodeBackend({ dataRoot, ...options, backend: floor.backend })
    execution = new LocalExecution([dataRoot], undefined, undefined, {
      get: () => nodeProtectedPaths(node?.policy ?? floor, dataRoot),
    })
    node = await WorkspaceNodeService.open(nodeIdFromPublicKey(identity.publicKey), dataRoot, state, execution, backend)
    link = new WorkspaceNodeLink(state, identity, node)
    const service = new NodeConsoleService(state, identity, dataRoot, node, link, link)
    const staticRoot = resolve(
      values['web-root'] ??
        options.staticRoot ??
        process.env.HBAR_WEB_ROOT ??
        join(import.meta.dir, '../../../dist/web'),
    )
    if (Boolean(values.cert) !== Boolean(values.key))
      throw new HbarError('INVALID_INPUT', 'Configure both --cert and --key for the public B console')
    if ((values.cert || values.key || values['public-host']) && !values.listen)
      throw new HbarError('INVALID_INPUT', 'Public B console options require --listen')
    if ((values.cert || values.key || values['public-host']) && values.listen && loopbackListen(values.listen))
      throw new HbarError('INVALID_INPUT', 'TLS public console options require a non-loopback --listen address')
    if (values.listen && !loopbackListen(values.listen)) {
      control = await startNodeControlServer(dataRoot, service, undefined, { staticRoot })
      publicControl = await startNodeControlServer(dataRoot, service, values.listen, {
        ...(values.cert && values.key ? { tls: { certPath: values.cert, keyPath: values.key } } : {}),
        ...(values['public-host'] ? { publicHost: values['public-host'] } : {}),
        writeControlFile: false,
        allowBootstrapBearer: false,
        staticRoot,
      })
    } else control = await startNodeControlServer(dataRoot, service, values.listen, { staticRoot })
    await link.start(
      values.join && values.code && values.fingerprint
        ? { url: values.join, code: values.code, fingerprint: values.fingerprint }
        : undefined,
    )
    if (options.registerSignals !== false) {
      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)
    }
    console.log(
      JSON.stringify({
        role: 'workspace',
        nodeId: node.id,
        fingerprint: nodeFingerprint(identity.publicKey),
        control: control.connection.url,
        ...(publicControl ? { publicControl: publicControl.connection.url } : {}),
      }),
    )
    return {
      node,
      state,
      link,
      control: control.connection,
      ...(publicControl ? { publicControl: publicControl.connection } : {}),
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
if (import.meta.main) await runNode(Bun.argv.slice(2))
