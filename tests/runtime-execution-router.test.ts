import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { ManagedProcess, RuntimeArtifactStore, RuntimeValuePort } from '@hbar/runtime'
import { runtimePluginStateSchema, type RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import { nodeFloorSummarySchema, nodeWorkspaceMethods } from '@hbar/contracts/node'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import { nodeWorkspaceLocator } from '@hbar/contracts/node'
import {
  PLUGIN_RUNTIME_FINGERPRINT,
  RUNTIME_PLUGIN_CONTROL_METHODS,
  runtimePluginResultSchema,
} from '../apps/host/src/runtime-plugin-contract'

test('the managed workspace tools owner uses its admitted router scope for node file calls', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-execution-router-'))
  const source = join(root, 'plugin.ts')
  const nodeId = 'workspace-node',
    rootId = 'engine',
    nodePath = '/remote/project'
  const workspacePath = nodeWorkspaceLocator(nodeId, rootId)
  await writeFile(
    source,
    `
    import localTools from '@hbar/local-tools'
    import { z } from 'zod'
    import { definePlugin } from '@hbar/plugin-sdk'
    import type { WorkspaceDirectoryService } from '@hbar/plugin-sdk/workspace-directories'
    import { runtimeExecutionRouterPlugin } from '../../apps/host/src/runtime-execution-router'
    import { createRuntimePlugin } from '../../apps/host/src/runtime-plugin-process'
    import { runtimePluginInvocation } from '../../apps/host/src/runtime-plugin-api'
    const host = async (method, args) => {
      const invocation = runtimePluginInvocation()
      if (!invocation) throw new Error('Missing owned invocation')
      return invocation.host(method, args)
    }
    const scopeProbe = definePlugin({ manifest: { id: 'scope.probe', name: 'Scope probe', description: 'Scope probe fixture', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', permissions: [] },
      apply(ctx) { ctx.hbar.api.tools.register({ name: 'scope_probe', description: 'Read the captured scope', effect: 'read', inputSchema: z.object({}),
        execute: async (_args, tool) => ({ text: runtimePluginInvocation()?.workspaceExecutionScope?.workspace.path + ':' + tool.workspace.path }) }) } })
    const directoryProbe = definePlugin({ manifest: { id: 'directory.probe', name: 'Directory probe', description: 'Test owner directory access', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', permissions: [], requires: { 'workspace-directories': '^1.0.0' } },
      apply(ctx) { const directories = ctx.hbar.api.service<WorkspaceDirectoryService>('workspace-directories');
        ctx.hbar.api.tools.register({ name: 'directory_probe', description: 'Resolve the current workspace directory', effect: 'read', inputSchema: z.object({}),
          execute: async (_args, tool) => ({ text: await directories.resolve(tool.workspace.path, '.') }) }) } })
    export const create = context => createRuntimePlugin(context, { plugins: [
      runtimeExecutionRouterPlugin({ dataRoot: ${JSON.stringify(root)}, workspaceDirectory: ${JSON.stringify(join(root, 'worktrees'))},
        verifyWorktree: async () => false, mounts: { get: () => undefined, verify: async () => {} },
        localEnabled: false, invokeHost: host, loadSnapshot: async () => { throw new Error('Unexpected sandbox snapshot read') } }),
      scopeProbe, directoryProbe, localTools,
    ] })
  `,
  )
  const descriptor = {
    id: 'runtime.execution.fixture',
    kind: 'plugin' as const,
    isolation: 'process' as const,
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const artifacts = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const artifact = await artifacts.build({ descriptor, entrypoint: source })
  let application: RuntimeValuePort | undefined
  let readState: (() => Promise<RuntimePluginState>) | undefined
  const calls: string[] = []
  const settlementCalls: Array<{ invocationId: string; input: unknown }> = []
  const confirmationCancellationCalls: Array<{ invocationId: string; input: unknown }> = []
  let expectedInvocationId: string | undefined
  let remoteProcessRunning = false
  let remoteProcessSettled = false
  const invokeNode = async (method: string, args: readonly unknown[]) => {
    if (method !== 'execution.nodeCall' || String(args[0]) !== nodeId) throw new Error('Unexpected Host callback')
    expect(args[3]).toBeInstanceOf(AbortSignal)
    const operation = String(args[1])
    expect(args[4]).toBe(operation === 'exec.start' ? 125_000 : 30_000)
    calls.push(operation)
    const contract = nodeWorkspaceMethods[operation as keyof typeof nodeWorkspaceMethods]
    if (!contract) throw new Error('Unknown node method')
    const input = contract.input.parse(args[2])
    if (operation === 'node.capabilities')
      return {
        protocol: 1,
        nodeId,
        platform: 'linux',
        evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
        roots: [{ rootId, name: 'Engine', access: 'write', nodePath }],
        sandbox: { backends: [], filesystem: 'none', network: 'none' },
        floor: nodeFloorSummarySchema.parse({}),
      }
    if (operation === 'fs.list') {
      expect(input).toMatchObject({
        rootId,
        expectedRoot: nodePath,
        path: '.',
        authority: { callId: 'node-read-call' },
      })
      return [{ name: 'remote.txt', path: 'remote.txt', directory: false }]
    }
    if (operation === 'exec.start') {
      const operationId = z.object({ operationId: z.string() }).parse(input).operationId
      expect(input).toMatchObject({ timeoutMs: 120_000 })
      if (operationId === 'run:long-call') {
        await Bun.sleep(31_000)
        return {
          state: 'settled',
          acceptedAt: 1,
          startedAt: 2,
          settledAt: 3,
          result: {
            text: 'Node start callback completed after the default deadline',
            isError: false,
            details: { code: 0, exitCode: 0, truncated: false, executionStarted: true, backend: 'none' },
          },
        }
      }
      expect(operationId).toBe('run:cancel-call')
      remoteProcessRunning = true
      const signal = args[3]
      if (!(signal instanceof AbortSignal)) throw new Error('Node execution did not receive the owner signal')
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Caller cancelled', 'AbortError')), {
          once: true,
        })
      })
    }
    throw new Error(`Unexpected node method: ${operation}`)
  }
  const processOwner = new ManagedProcess({
    descriptor,
    artifactId: artifact.id,
    generation: 1,
    modulePath: await artifacts.modulePath(artifact.id),
    configuration: { dataRoot: root, cacheRoot: join(root, 'cache') },
    parent: { unitId: 'base', generation: 1, incarnation: 'execution-fixture-base' },
    controlMethods: RUNTIME_PLUGIN_CONTROL_METHODS,
    onPeer: (peer) => {
      readState = () => peer.call('plugin.state', undefined, runtimePluginStateSchema)
      application = new RuntimeValuePort(peer, { prefix: 'plugin.application' })
      application.register('host.read', async ([method, raw]) => {
        if (method !== 'execution.nodeSettlement') throw new Error(`Unexpected stable callback: ${String(method)}`)
        const parameters = z.array(z.unknown()).parse(raw)
        const invocationId = z.string().uuid().parse(parameters[0])
        if (invocationId !== expectedInvocationId)
          throw new Error('Settlement did not retain its original invocation ID')
        if (parameters[1] !== nodeId) throw new Error('Settlement targeted an unexpected node')
        const settlementMethod = z.enum(['exec.cancel', 'node.confirmation.cancel']).parse(parameters[2])
        const signal = parameters[4]
        if (!(signal instanceof AbortSignal) || signal.aborted)
          throw new Error('Settlement did not use a live bounded signal')
        if (settlementMethod === 'exec.cancel') {
          const input = nodeWorkspaceMethods['exec.cancel'].input.parse(parameters[3])
          settlementCalls.push({ invocationId, input })
          if (parameters[5] !== 120_000) throw new Error('Execution cancellation used an unexpected node budget')
          await Bun.sleep(5_100)
          if (!remoteProcessRunning) throw new Error('Remote process was not running during cancellation')
          remoteProcessRunning = false
          remoteProcessSettled = true
          return nodeWorkspaceMethods['exec.cancel'].output.parse({
            state: 'settled',
            acceptedAt: 1,
            startedAt: 2,
            settledAt: 3,
            result: {
              text: 'Remote process stopped after cancellation.',
              isError: true,
              details: { code: 'CANCELLED', exitCode: null, truncated: false, executionStarted: true, backend: 'none' },
            },
          })
        }
        const input = nodeWorkspaceMethods['node.confirmation.cancel'].input.parse(parameters[3])
        confirmationCancellationCalls.push({ invocationId, input })
        return nodeWorkspaceMethods['node.confirmation.cancel'].output.parse({ state: 'absent' })
      })
    },
  })
  try {
    await processOwner.prepare()
    if (!application || !readState) throw new Error('The execution owner did not expose its private ports')
    const state = await readState()
    await processOwner.activate()
    const signal = new AbortController().signal
    const sandbox = null
    const nodeAuthority = {
      sessionId: 'session',
      runId: 'run',
      callId: 'node-read-call',
      sandbox,
      admission: { kind: 'allow' },
    }
    const workspace = {
      id: 'workspace',
      path: workspacePath,
      name: 'Remote project',
      createdAt: 1,
      location: { kind: 'node', nodeId, rootId, nodePath },
    }
    const session = {
      id: 'session',
      workspaceId: 'workspace',
      title: 'Fixture',
      archived: false,
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      seq: 0,
    }
    const run = {
      id: 'run',
      sessionId: 'session',
      requestId: 'request',
      input: { text: '', images: [], approval: 'allow' },
      modelId: 'model',
      status: 'running',
      createdAt: 1,
      startedAt: 1,
      endedAt: null,
      error: null,
    }
    const scope = { workspace: { path: workspacePath, location: workspace.location }, authority: nodeAuthority, signal }
    const scopeProof = runtimePluginResultSchema.parse(
      await application.call('invoke', [
        { operation: 'execute', name: 'scope_probe', catalog: state.tools, workspaceExecutionScope: scope },
        [{}, { session, workspace, run, callId: 'node-read-call', signal, nodeAuthority }],
        async () => null,
      ]),
    )
    expect(scopeProof).toMatchObject({ kind: 'value', value: { text: `${workspacePath}:${workspacePath}` } })
    const result = runtimePluginResultSchema.parse(
      await application.call('invoke', [
        { operation: 'execute', name: 'list_directory', catalog: state.tools, workspaceExecutionScope: scope },
        [{ path: '.' }, { session, workspace, run, callId: 'node-read-call', signal, nodeAuthority }],
        invokeNode,
      ]),
    )
    if (result.kind !== 'value') throw new Error(JSON.stringify({ result, calls }))
    expect(result).toMatchObject({ kind: 'value', value: { text: 'remote.txt\n' } })
    expect(calls).toEqual(['node.capabilities', 'fs.list'])

    const localWorkspacePath = join(root, 'local-workspace')
    await mkdir(localWorkspacePath)
    await writeFile(join(localWorkspacePath, 'local-input.txt'), 'local workspace must stay unavailable')
    const localWorkspace = { id: 'local-workspace', path: localWorkspacePath, name: 'Local workspace', createdAt: 1 }
    const localSession = { ...session, id: 'local-session', workspaceId: localWorkspace.id }
    const localRun = { ...run, id: 'local-run', sessionId: localSession.id }
    const localScope = { workspace: { path: localWorkspacePath }, signal }
    const localApplication = application
    const invokeLocal = async (name: string, args: Record<string, unknown>, callId: string) =>
      runtimePluginResultSchema.parse(
        await localApplication.call('invoke', [
          {
            operation: 'execute',
            name,
            catalog: state.tools,
            workspaceExecutionScope: localScope,
          },
          [
            args,
            {
              session: localSession,
              workspace: localWorkspace,
              run: localRun,
              callId,
              signal,
              ...(name === 'shell' ? { timeoutMs: 120_000 } : {}),
            },
          ],
          invokeNode,
        ]),
      )
    for (const [name, args, callId] of [
      ['directory_probe', {}, 'local-directory-call'],
      ['read_file', { path: 'local-input.txt' }, 'local-read-call'],
      ['write_file', { path: 'local-output.txt', text: 'must not be written' }, 'local-write-call'],
      ['shell', { command: 'echo must-not-run', timeout_ms: 120_000 }, 'local-exec-call'],
    ] as const) {
      expect(await invokeLocal(name, args, callId)).toMatchObject({
        kind: 'error',
        code: 'LOCAL_EXECUTION_DISABLED',
      })
    }
    expect(await Bun.file(join(localWorkspacePath, 'local-output.txt')).exists()).toBe(false)
    expect(calls).toEqual(['node.capabilities', 'fs.list'])

    const longAuthority = { ...nodeAuthority, callId: 'long-call' }
    const longScope = { ...scope, authority: longAuthority }
    const longResult = runtimePluginResultSchema.parse(
      await application.call(
        'invoke',
        [
          {
            operation: 'execute',
            name: 'shell',
            catalog: state.tools,
            workspaceExecutionScope: longScope,
            toolTimeoutMs: 120_000,
          },
          [
            { command: 'echo remote', timeout_ms: 120_000 },
            { session, workspace, run, callId: 'long-call', signal, timeoutMs: 120_000, nodeAuthority: longAuthority },
          ],
          invokeNode,
        ],
        { timeoutMs: 90_000 },
      ),
    )
    expect(longResult).toMatchObject({
      kind: 'value',
      value: { text: 'Node start callback completed after the default deadline', isError: false },
    })

    expectedInvocationId = crypto.randomUUID()
    const cancelController = new AbortController()
    const cancelAuthority = { ...nodeAuthority, callId: 'cancel-call' }
    const cancelScope = { ...scope, authority: cancelAuthority, signal: cancelController.signal }
    const cancelledCall = application
      .call(
        'invoke',
        [
          {
            operation: 'execute',
            name: 'shell',
            catalog: state.tools,
            invocationId: expectedInvocationId,
            workspaceExecutionScope: cancelScope,
            toolTimeoutMs: 120_000,
          },
          [
            { command: 'echo remote', timeout_ms: 120_000 },
            {
              session,
              workspace,
              run,
              callId: 'cancel-call',
              signal: cancelController.signal,
              timeoutMs: 120_000,
              nodeAuthority: cancelAuthority,
            },
          ],
          invokeNode,
        ],
        { signal: cancelController.signal, timeoutMs: 10_000 },
      )
      .catch((error: unknown) => error)
    const waitForSettlement = async () => {
      const deadline = Date.now() + 5_000
      while (!remoteProcessRunning && Date.now() < deadline) await Bun.sleep(5)
      if (!remoteProcessRunning) throw new Error('Remote command did not reach the node')
      cancelController.abort(new DOMException('Caller cancelled', 'AbortError'))
      await cancelledCall
      const settlementDeadline = Date.now() + 8_000
      while (!remoteProcessSettled && Date.now() < settlementDeadline) await Bun.sleep(5)
      if (!remoteProcessSettled)
        throw new Error(
          JSON.stringify({
            message: 'Stable settlement callback did not stop the remote process',
            calls,
            settlementCalls,
          }),
        )
    }
    await waitForSettlement()
    expect(remoteProcessRunning).toBe(false)
    expect(settlementCalls).toHaveLength(1)
    expect(settlementCalls[0]?.invocationId).toBe(expectedInvocationId)
    expect(settlementCalls[0]?.input).toEqual({ operationId: 'run:cancel-call' })
    expect(confirmationCancellationCalls).toHaveLength(1)
    expect(confirmationCancellationCalls[0]?.invocationId).toBe(expectedInvocationId)
    expect(confirmationCancellationCalls[0]?.input).toMatchObject({
      operationId: 'run:cancel-call',
      rootId,
      expectedRoot: nodePath,
      authority: cancelAuthority,
    })
  } finally {
    await processOwner.dispose()
    application?.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
