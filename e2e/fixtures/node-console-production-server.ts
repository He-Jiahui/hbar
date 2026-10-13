import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createNodeIdentity, nodeIdFromPublicKey, nodeProtectedPaths, WorkspaceNodeService } from '@hbar/node-core'
import { LocalExecution } from '@hbar/local-tools'
import {
  nodeFloorSchema,
  nodeObservationMethods,
  nodeObservedSnapshotSchema,
  type NodeObservationMethod,
} from '@hbar/contracts/node'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { NodeLocalConfirmationStorage } from '@hbar/storage/node-local-confirmations'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
} from '@hbar/contracts/node-worktree-provisioning'
import { createNodeConsoleClient, pairNodeConsoleDeviceWithSigner } from '@hbar/client/node-console'
import { NodeConsoleService, type NodeConsoleObservationPort } from '../../apps/node/src/console-service'
import { startNodeControlServer } from '../../apps/node/src/control-server'
import { z } from 'zod'

const port = Number(process.env.HBAR_NODE_CONSOLE_E2E_PORT ?? 4339)
const helperPort = port + 1
const root = await mkdtemp(join(tmpdir(), 'hbar-node-console-production-e2e-'))
const dataRoot = join(root, 'data')
const workspaceRoot = join(root, 'workspace')
const docsPath = join(workspaceRoot, 'docs')
const sourcePath = join(workspaceRoot, 'source')
const staticRoot = resolve('dist/web')
await Promise.all([
  mkdir(dataRoot, { recursive: true }),
  mkdir(docsPath, { recursive: true }),
  mkdir(sourcePath, { recursive: true }),
])

const build = Bun.spawn(['bun', 'run', 'build'], { cwd: process.cwd(), stdout: 'inherit', stderr: 'inherit' })
if ((await build.exited) !== 0) throw new Error('Production web build failed')

const state = new NodeStateStorage(join(dataRoot, 'node.sqlite'))
await state.call('ready', {})
await state.call(
  'floor.set',
  nodeFloorSchema.parse({
    roots: [
      {
        rootId: 'docs',
        name: `Documentation ${'very-long-visible-root-label '.repeat(4)}`,
        path: docsPath,
        access: 'read',
      },
      { rootId: 'source', name: 'Source', path: sourcePath, access: 'write' },
    ],
    localConfirm: 'always',
  }),
)

const identity = createNodeIdentity()
let node: WorkspaceNodeService | undefined
const execution = new LocalExecution([dataRoot], undefined, undefined, {
  get: () => (node ? nodeProtectedPaths(node.policy, dataRoot) : [dataRoot]),
})
node = await WorkspaceNodeService.open(nodeIdFromPublicKey(identity.publicKey), dataRoot, state, execution, {
  name: 'none',
  filesystem: false,
  network: false,
  processTree: true,
  exec: async () => {
    throw new Error('fixture does not execute processes')
  },
})
node.installLocalConfirmations(new NodeLocalConfirmationStorage(state))
node.installWorktrees(
  await node.createWorktreeAllocator({
    worktree: async () => {
      throw new Error('fixture never performs Git worktree mutations')
    },
  }),
)
await node.listLocalConfirmations(true)
const queueFloor = await state.call('floor.snapshot', {})
for (let index = 0; index < 62; index++) {
  try {
    await node.confirmManualLocalOperation({
      operationId: `fixture-confirmation-${index}`,
      sessionId: null,
      ownerDeviceId: 'fixture-owner',
      rootId: 'docs',
      rootPath: docsPath,
      tool: 'write_file',
      effect: 'write',
      snapshotDigest: 'a'.repeat(64),
      argumentsDigest: `${index.toString(16).padStart(64, '0')}`,
      summary:
        index === 0
          ? `请确认此本机文件写入请求：${'长描述'.repeat(80)}`
          : index === 1
            ? '请拒绝这一项队列请求。'
            : `容量测试项目 ${index}`,
    })
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'NODE_LOCAL_CONFIRMATION_PENDING') throw error
  }
}
const folderSnapshot = {
  schemaVersion: 1 as const,
  workspaceId: 'launch-workspace',
  revision: 12,
  folders: [{ id: 'workspace-source', alias: 'source', path: sourcePath }],
}
const nodeId = nodeIdFromPublicKey(identity.publicKey)
const selection = {
  mode: 'isolated-worktree' as const,
  branch: { kind: 'new' as const, name: 'feature/accepted-target', startPoint: 'main' },
}
for (let index = 0; index < 2; index++) {
  const provisioningBase = {
    workspaceId: folderSnapshot.workspaceId,
    sessionId: 'launch-session',
    targetRevision: 37,
    selection,
    workspaceFolderRevision: folderSnapshot.revision,
    workspaceFolderDigest: acceptedWorkspaceFolderDigest(folderSnapshot),
  }
  const provisioning = {
    kind: 'launch-target' as const,
    ...provisioningBase,
    runId: `launch-run-${index}`,
    nodeId,
    acceptedTargetDigest: acceptedNodeWorktreeTargetDigest(provisioningBase),
  }
  try {
    await node.confirmLaunchTargetOperation({
      operationId: `${provisioning.runId}:worktree-create`,
      provisioning,
      rootId: 'source',
      rootPath: sourcePath,
      tool: 'worktree.create',
      argumentsDigest: `${(index + 10).toString(16).padStart(64, '0')}`,
      summary:
        index === 0
          ? `请审核已接受的启动目标与新分支 feature/accepted-target：${'目标约束'.repeat(120)}`
          : '请拒绝这一条已接受目标对应的工作树创建请求。',
    })
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'NODE_LOCAL_CONFIRMATION_PENDING') throw error
  }
}

const session = {
  id: 'docs-session',
  workspaceId: 'docs-workspace',
  title: `Read-only fixture conversation ${'long-title-'.repeat(10)}`,
  archived: false,
  parentId: null,
  createdAt: Date.now() - 1_000,
  updatedAt: Date.now(),
  seq: 1,
}
const message = {
  id: 'fixture-message',
  sessionId: session.id,
  runId: 'fixture-run',
  role: 'assistant' as const,
  content: [{ type: 'text' as const, text: 'This is a read-only message supplied by the B fixture.' }],
  truncated: false,
  seq: 1,
  createdAt: Date.now(),
}
function observe(
  method: 'observe.sessions.list',
  input: z.input<(typeof nodeObservationMethods)['observe.sessions.list']['input']>,
  signal?: AbortSignal,
): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.list']['output']>>
// eslint-disable-next-line no-redeclare
function observe(
  method: 'observe.sessions.snapshot',
  input: z.input<(typeof nodeObservationMethods)['observe.sessions.snapshot']['input']>,
  signal?: AbortSignal,
): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.snapshot']['output']>>
// eslint-disable-next-line no-redeclare
function observe(
  method: 'observe.sessions.follow',
  input: z.input<(typeof nodeObservationMethods)['observe.sessions.follow']['input']>,
  signal?: AbortSignal,
): Promise<z.output<(typeof nodeObservationMethods)['observe.sessions.follow']['output']>>
// eslint-disable-next-line no-redeclare
async function observe(
  method: NodeObservationMethod,
  input: unknown,
): Promise<
  | z.output<(typeof nodeObservationMethods)['observe.sessions.list']['output']>
  | z.output<(typeof nodeObservationMethods)['observe.sessions.snapshot']['output']>
  | z.output<(typeof nodeObservationMethods)['observe.sessions.follow']['output']>
> {
  switch (method) {
    case 'observe.sessions.list':
      nodeObservationMethods[method].input.parse(input)
      return nodeObservationMethods[method].output.parse({
        items: [{ ...session, rootId: 'docs' }],
        nextCursor: null,
      })
    case 'observe.sessions.snapshot': {
      const request = nodeObservationMethods[method].input.parse(input)
      if (request.sessionId !== session.id) throw new Error('Unknown fixture session')
      return nodeObservedSnapshotSchema.parse({
        session: { ...session, rootId: 'docs' },
        messages: [message],
        runs: [],
        approvals: [],
        activityTruncated: false,
        userInputs: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        cursor: Date.now(),
        hasOlder: false,
        streams: [],
      })
    }
    case 'observe.sessions.follow':
      nodeObservationMethods[method].input.parse(input)
      return nodeObservationMethods[method].output.parse({ events: [], cursor: Date.now(), reset: false })
  }
}
const observation: NodeConsoleObservationPort = { observe }

const service = new NodeConsoleService(state, identity, dataRoot, node, undefined, observation)
await state.call('audit.append', {
  operationId: 'fixture-operation',
  sessionId: session.id,
  runId: 'fixture-run',
  callId: 'fixture-call',
  tool: 'read_file',
  argumentsDigest: 'a'.repeat(64),
  decision: 'allow',
  admission: { kind: 'allow' },
  backend: 'none',
  code: 0,
})
await state.call('git-query.audit.append', {
  source: 'manual-query',
  operationId: 'fixture-manual-query',
  deviceId: 'fixture-b-device',
  workspaceId: 'docs-workspace',
  sessionId: session.id,
  rootId: 'docs',
  expectedRoot: docsPath,
  tool: 'git.query.status',
  argumentsDigest: 'b'.repeat(64),
  decision: 'allow',
  backend: 'none',
  code: 0,
})
await state.call('audit.append', {
  source: 'launch-target',
  operationId: 'launch-run-audit:worktree-create',
  sessionId: 'launch-session',
  runId: 'launch-run-audit',
  workspaceId: 'launch-workspace',
  nodeId,
  targetRevision: 37,
  acceptedTargetDigest: 'd'.repeat(64),
  workspaceFolderRevision: 12,
  workspaceFolderDigest: 'e'.repeat(64),
  rootId: 'source',
  rootPath: sourcePath,
  tool: 'worktree.create',
  argumentsDigest: 'f'.repeat(64),
  decision: 'ask',
  backend: 'none',
  code: null,
})
const control = await startNodeControlServer(dataRoot, service, `127.0.0.1:${port}`, { staticRoot })
const helper = Bun.serve({
  hostname: '127.0.0.1',
  port: helperPort,
  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 404 })
    const pathname = new URL(request.url).pathname
    if (pathname === '/policy-read') {
      const current = await state.call('floor.snapshot', {})
      return Response.json(current)
    }
    if (pathname === '/confirmation-capacity') {
      let overflowCode = ''
      try {
        await node?.confirmManualLocalOperation({
          operationId: 'fixture-confirmation-overflow',
          sessionId: null,
          ownerDeviceId: 'fixture-owner',
          rootId: 'docs',
          rootPath: docsPath,
          tool: 'write_file',
          effect: 'write',
          snapshotDigest: 'b'.repeat(64),
          argumentsDigest: 'c'.repeat(64),
          summary: 'overflow',
        })
      } catch (error) {
        overflowCode = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN'
      }
      return Response.json({ overflowCode, floorRevision: queueFloor.revision })
    }
    if (pathname === '/observer-resolve') {
      const page = await node?.listLocalConfirmations(true)
      const invite = (await service.invoke('node.pairing.create', {
        name: 'Observer confirmation test',
        role: 'observer',
        roots: ['docs'],
      })) as { code: string }
      const pair = generateKeyPairSync('ed25519')
      const publicKeyDer = pair.publicKey.export({ format: 'der', type: 'spki' })
      const signer = {
        publicKey: Buffer.from(publicKeyDer).subarray(-32).toString('base64url'),
        async sign(message: Uint8Array) {
          return sign(null, Buffer.from(message), pair.privateKey).toString('base64url')
        },
      }
      const paired = await pairNodeConsoleDeviceWithSigner({
        url: control.connection.url,
        code: invite.code,
        name: 'Observer confirmation test',
        signer,
      })
      const client = createNodeConsoleClient({
        url: control.connection.url,
        credentials: { deviceId: paired.device.deviceId, publicKey: signer.publicKey, signer },
      })
      let code = ''
      try {
        await client.call('node.localConfirmation.resolve', {
          confirmationId: page?.entries[2]?.id ?? '',
          decision: 'approve',
        })
      } catch (error) {
        code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN'
      }
      return Response.json({ code })
    }
    if (pathname === '/policy-race') {
      const invite = (await service.invoke('node.pairing.create', {
        name: 'Concurrent policy writer',
        role: 'operator',
        roots: [],
      })) as { code: string }
      const pair = generateKeyPairSync('ed25519')
      const publicKeyDer = pair.publicKey.export({ format: 'der', type: 'spki' })
      const signer = {
        publicKey: Buffer.from(publicKeyDer).subarray(-32).toString('base64url'),
        async sign(message: Uint8Array) {
          return sign(null, Buffer.from(message), pair.privateKey).toString('base64url')
        },
      }
      const paired = await pairNodeConsoleDeviceWithSigner({
        url: control.connection.url,
        code: invite.code,
        name: 'Concurrent policy writer',
        signer,
      })
      const client = createNodeConsoleClient({
        url: control.connection.url,
        credentials: { deviceId: paired.device.deviceId, publicKey: signer.publicKey, signer },
      })
      const current = await client.call('node.policy.snapshot', {})
      const latest = await client.call('node.policy.update', {
        floor: { ...current.floor, process: false },
        expectedRevision: current.revision,
      })
      return Response.json({ revision: latest.revision, process: latest.floor.process })
    }
    if (pathname !== '/pairing') return new Response(null, { status: 404 })
    const input = (await request.json()) as { role?: unknown }
    if (input.role !== 'operator' && input.role !== 'observer')
      return Response.json({ error: 'invalid role' }, { status: 400 })
    const invite = await service.invoke('node.pairing.create', {
      name: `${input.role} test device`,
      role: input.role,
      roots: input.role === 'observer' ? ['docs'] : [],
    })
    return Response.json(invite)
  },
})

console.log(
  JSON.stringify({ role: 'B-node-console-e2e', port: new URL(control.connection.url).port, helperPort: helper.port }),
)
const stop = async () => {
  await helper.stop(true)
  await control.close()
  await node?.dispose()
  await state.close()
  await rm(root, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', () => {
  void stop()
})
process.on('SIGTERM', () => {
  void stop()
})
