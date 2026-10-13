import { expect, test } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nodeWorkspaceLocator, type NodeCallAuthority } from '@hbar/contracts/node'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import type { WorkspaceExecutionScope } from '@hbar/plugin-sdk'
import { invokeRuntimeNodeExecution } from '../apps/host/src/runtime-node-execution-call'
import { withNodeExecutionLink, type NodeExecutionLinkFixture } from './fixtures/node-execution-link'

function binding(f: NodeExecutionLinkFixture) {
  const authority: NodeCallAuthority = {
    sessionId: 'session',
    runId: 'run',
    callId: 'original.call/1',
    sandbox: null,
    admission: { kind: 'allow' },
  }
  const controller = new AbortController()
  const scope: WorkspaceExecutionScope = {
    workspace: {
      path: nodeWorkspaceLocator(f.node.id, 'engine'),
      location: { kind: 'node', nodeId: f.node.id, rootId: 'engine', nodePath: f.workspace },
    },
    authority,
    signal: controller.signal,
  }
  const version = { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }
  const execution = executionOwnershipSchema.parse({
    leaseId: 'lease',
    sessionId: 'session',
    runId: 'run',
    owner: { unitId: 'kernel', generation: 1, incarnation: 'owned-kernel' },
    fence: 1,
    acquiredAt: 1,
    versions: { kernel: version, driver: { ...version, unitId: 'driver' }, plugins: [], hooks: [] },
  })
  const call = (
    method: string,
    input: unknown,
    signal = new AbortController().signal,
    settlement = false,
    timeoutMs?: number,
  ) =>
    invokeRuntimeNodeExecution({ node: f.port, scope, execution, signal, settlement }, [
      f.node.id,
      method,
      input,
      signal,
      timeoutMs,
    ])
  return { call, authority, controller, scope, execution }
}

test('the stable Host node seam keeps pre-admission metadata separate from file authority', async () => {
  await withNodeExecutionLink(async (f) => {
    const b = binding(f)
    await writeFile(join(f.workspace, 'remote.txt'), 'only B')
    const input = { rootId: 'engine', expectedRoot: f.workspace, path: 'remote.txt', authority: b.authority }
    expect(await b.call('fs.readBytes', input)).toMatchObject({ offset: 0, totalBytes: 6 })
    const scope: WorkspaceExecutionScope = { workspace: b.scope.workspace, signal: b.controller.signal }
    expect(
      await invokeRuntimeNodeExecution({ node: f.port, scope, execution: b.execution, signal: scope.signal }, [
        f.node.id,
        'fs.canonicalize',
        { rootId: 'engine', expectedRoot: f.workspace, paths: ['remote.txt'] },
      ]),
    ).toMatchObject({ paths: [join(f.workspace, 'remote.txt')] })
    const before = f.requests.length
    const denied = await invokeRuntimeNodeExecution(
      { node: f.port, scope, execution: b.execution, signal: scope.signal },
      [f.node.id, 'fs.readBytes', input],
    ).catch((error: unknown) => error)
    expect(denied).toMatchObject({ code: 'RUNTIME_EXECUTION_REQUIRED' })
    expect(f.requests).toHaveLength(before)
  })
})

test('forged roots, node ids, admissions, operation keys and timeout budgets never reach the node link', async () => {
  await withNodeExecutionLink(async (f) => {
    const b = binding(f),
      operationId = `${b.authority.runId}:${b.authority.callId}`
    const read = { rootId: 'engine', expectedRoot: f.workspace, path: '.', authority: b.authority }
    const cases: Array<Promise<unknown>> = [
      b.call('fs.list', { ...read, rootId: 'other' }),
      b.call('fs.list', { ...read, expectedRoot: '/different' }),
      b.call('fs.list', { ...read, authority: { ...b.authority, callId: 'forged' } }),
      b.call('fs.list', {
        ...read,
        authority: { ...b.authority, admission: { kind: 'approved', approvalId: 'forged' } },
      }),
      b.call('exec.cancel', { operationId: 'another:call' }),
      b.call('exec.receipt', { operationId }, undefined, false, 60_000),
      invokeRuntimeNodeExecution(
        { node: f.port, scope: b.scope, execution: b.execution, signal: b.controller.signal },
        ['another-node', 'node.capabilities', {}],
      ),
      invokeRuntimeNodeExecution({ node: f.port, signal: b.controller.signal }, [
        f.node.id,
        'exec.cancel',
        { operationId },
      ]),
    ].map((promise) => promise.catch((error: unknown) => error))
    const before = f.requests.length
    for (const result of await Promise.all(cases)) expect(result).toBeInstanceOf(Error)
    expect(f.requests).toHaveLength(before)
  })
})

test('fresh settlement signals can reconcile the exact captured operation after original cancellation', async () => {
  await withNodeExecutionLink(async (f) => {
    const b = binding(f),
      operationId = `${b.authority.runId}:${b.authority.callId}`
    b.controller.abort(new Error('original call cancelled'))
    expect(await b.call('exec.receipt', { operationId }).catch((error: unknown) => error)).toBeInstanceOf(Error)
    expect(await b.call('exec.receipt', { operationId }, undefined, true)).toEqual({ state: 'absent' })
    expect(await b.call('exec.cancel', { operationId }, undefined, true)).toEqual({ state: 'absent' })
    const confirmationCancel = {
      operationId,
      rootId: 'engine',
      expectedRoot: f.workspace,
      authority: b.authority,
      admissionDigest: 'a'.repeat(64),
      argumentsDigest: 'b'.repeat(64),
    }
    expect(await b.call('node.confirmation.cancel', confirmationCancel, undefined, true)).toEqual({ state: 'absent' })
    const before = f.requests.length
    expect(
      await b
        .call(
          'fs.list',
          { rootId: 'engine', expectedRoot: f.workspace, path: '.', authority: b.authority },
          undefined,
          true,
        )
        .catch((error: unknown) => error),
    ).toMatchObject({ code: 'RUNTIME_METHOD_UNAVAILABLE' })
    const signal = AbortSignal.abort(new Error('settlement cancelled'))
    expect(await b.call('exec.receipt', { operationId }, signal, true).catch((error: unknown) => error)).toBeInstanceOf(
      Error,
    )
    expect(f.requests).toHaveLength(before)
  })
})
