import { describe, expect, test } from 'bun:test'
import { CommandRegistry, createCommandClient, invocationSchema } from '@hbar/commands'
import { createWorkspaceSessionCommandClient, type ClientTransport } from '@hbar/client'
import { HbarError, type RpcMethod, type RpcParams, type RpcResults } from '@hbar/contracts'
import {
  WORKSPACE_ORGANIZATION_MAX_BYTES,
  WORKSPACE_ORGANIZATION_MAX_HIDDEN,
  workspaceOrganizationCommands,
  workspaceOrganizationReceiptSchema,
  workspaceOrganizationSnapshotSchema,
  type WorkspaceOrganizationApplyInput,
  type WorkspaceOrganizationReceipt,
} from '@hbar/contracts/commands/workspace-organization'
import type { StorageMethods, StoragePort } from '@hbar/storage'
import { registerWorkspaceOrganizationCommands } from '../packages/kernel/src/workspace-organization-commands'

const request = {
  expectedRevision: 0,
  change: { kind: 'setHidden', workspaceId: 'workspace-A', expectedHidden: false, hidden: true },
} satisfies WorkspaceOrganizationApplyInput
const receipt = {
  commitId: 'commit-A',
  revision: 1,
  request,
  changed: true,
} satisfies WorkspaceOrganizationReceipt
const actor = { actorId: 'paired-device-A', idempotencyKey: 'captured-key-A' }
const lookup = { idempotencyKey: actor.idempotencyKey, request }

function hostFixture(result: (method: keyof StorageMethods) => unknown) {
  const calls: { method: keyof StorageMethods; args: readonly unknown[] }[] = []
  let notifications = 0
  const storage: StoragePort = {
    async call<Method extends keyof StorageMethods>(
      method: Method,
      ...args: Parameters<StorageMethods[Method]>
    ): Promise<ReturnType<StorageMethods[Method]>> {
      calls.push({ method, args })
      // Fault-injection boundary: a Worker can return malformed wire data despite
      // StoragePort's declared result. Production must validate that result.
      return result(method) as ReturnType<StorageMethods[Method]>
    },
    close: () => Promise.resolve(),
  }
  const registry = new CommandRegistry({ execution: 'host' })
  registerWorkspaceOrganizationCommands(registry, storage, () => notifications++)
  return {
    commands: createCommandClient(workspaceOrganizationCommands, registry),
    calls,
    notifications: () => notifications,
    close: () => registry.dispose(),
  }
}

function clientFixture(result: (commandId: string) => unknown) {
  const calls: ReturnType<typeof invocationSchema.parse>[] = []
  const transport: ClientTransport = {
    async call<Method extends RpcMethod>(method: Method, params: RpcParams<Method>): Promise<RpcResults[Method]> {
      if (method !== 'command.execute') throw new Error('Unexpected RPC in organization boundary fixture')
      const invocation = invocationSchema.parse(params)
      calls.push(invocation)
      // The public command.execute wire result is unknown; deliberately inject
      // invalid replies here without weakening the production command types.
      return result(invocation.commandId) as RpcResults[Method]
    },
  }
  return { commands: createWorkspaceSessionCommandClient(transport), calls }
}

const invalidReplies: { name: string; value: unknown }[] = [
  {
    name: 'another workspace',
    value: { ...receipt, request: { ...request, change: { ...request.change, workspaceId: 'workspace-B' } } },
  },
  {
    name: 'another captured revision',
    value: { ...receipt, revision: 2, request: { ...request, expectedRevision: 1 } },
  },
  {
    name: 'another mutation kind',
    value: { ...receipt, request: { expectedRevision: 0, change: { kind: 'restoreHidden' } } },
  },
  {
    name: 'opposite captured item state',
    value: { ...receipt, request: { ...request, change: { ...request.change, expectedHidden: true, hidden: false } } },
  },
  { name: 'malformed boolean', value: { ...receipt, changed: 'yes' } },
  { name: 'malformed commit', value: { ...receipt, commitId: '' } },
  { name: 'missing receipt', value: null },
  { name: 'unrelated commit revision', value: { ...receipt, revision: 99 } },
]

describe('workspace organization result boundaries', () => {
  for (const candidate of invalidReplies) {
    test(`Host rejects ${candidate.name} after dispatch as unknown without a notification`, async () => {
      const host = hostFixture(() => candidate.value)
      try {
        await expect(host.commands.execute('workspaceOrganization.apply', request, actor)).rejects.toMatchObject({
          code: 'RESULT_UNKNOWN',
        })
        expect(host.calls).toEqual([{ method: 'applyWorkspaceOrganization', args: [{ ...actor, request }] }])
        expect(host.notifications()).toBe(0)
      } finally {
        host.close()
      }
    })

    test(`Client rejects ${candidate.name} after dispatch as unknown without retry`, async () => {
      const client = clientFixture(() => candidate.value)
      await expect(
        client.commands.execute('workspaceOrganization.apply', request, { idempotencyKey: actor.idempotencyKey }),
      ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(client.calls).toHaveLength(1)
      expect(client.calls[0]).toMatchObject({
        commandId: 'workspaceOrganization.apply',
        idempotencyKey: actor.idempotencyKey,
        input: request,
      })
    })
  }

  test('validated changed ACK notifies once and an unchanged ACK does not notify', async () => {
    const unchangedRequest = { ...request, change: { ...request.change, hidden: false } }
    const unchangedReceipt = { ...receipt, request: unchangedRequest, revision: 0, changed: false }
    const host = hostFixture(() => receipt)
    const noop = hostFixture(() => unchangedReceipt)
    try {
      expect(await host.commands.execute('workspaceOrganization.apply', request, actor)).toEqual(receipt)
      expect(host.notifications()).toBe(1)
      expect(await noop.commands.execute('workspaceOrganization.apply', unchangedRequest, actor)).toEqual(
        unchangedReceipt,
      )
      expect(noop.notifications()).toBe(0)
    } finally {
      host.close()
      noop.close()
    }
  })

  test('unknown Host write can only be inspected through the captured read without replay', async () => {
    let recovered = false
    const host = hostFixture((method) => {
      if (method === 'applyWorkspaceOrganization') throw new Error('Worker reply lost after simulated commit')
      if (method === 'workspaceOrganizationReceipt') return recovered ? receipt : null
      throw new Error('Unexpected storage method')
    })
    try {
      await expect(host.commands.execute('workspaceOrganization.apply', request, actor)).rejects.toMatchObject({
        code: 'RESULT_UNKNOWN',
      })
      expect(await host.commands.execute('workspaceOrganization.receipt', lookup, actor)).toBeNull()
      recovered = true
      expect(await host.commands.execute('workspaceOrganization.receipt', lookup, actor)).toEqual(receipt)
      expect(host.calls.map((call) => call.method)).toEqual([
        'applyWorkspaceOrganization',
        'workspaceOrganizationReceipt',
        'workspaceOrganizationReceipt',
      ])
      expect(host.calls[1]?.args).toEqual([{ ...actor, request }])
      expect(host.calls[2]?.args).toEqual([{ ...actor, request }])
      expect(host.notifications()).toBe(0)
    } finally {
      host.close()
    }
  })

  for (const value of [invalidReplies[0]?.value, { ...receipt, changed: 'yes' }]) {
    test('Host and Client reject an invalid read-only receipt without issuing a mutation', async () => {
      const host = hostFixture(() => value)
      const client = clientFixture(() => value)
      try {
        await expect(host.commands.execute('workspaceOrganization.receipt', lookup, actor)).rejects.toMatchObject({
          code: 'INVALID_OUTPUT',
        })
        await expect(client.commands.execute('workspaceOrganization.receipt', lookup)).rejects.toMatchObject({
          code: 'INVALID_OUTPUT',
        })
        expect(host.calls.map((call) => call.method)).toEqual(['workspaceOrganizationReceipt'])
        expect(client.calls.map((call) => call.commandId)).toEqual(['workspaceOrganization.receipt'])
        expect(host.notifications()).toBe(0)
      } finally {
        host.close()
      }
    })
  }

  test('Client preserves read errors and null receipts without retrying the unknown mutation', async () => {
    let phase: 'lost-write' | 'lost-read' | 'missing' | 'recovered' = 'lost-write'
    const client = clientFixture((commandId) => {
      if (commandId === 'workspaceOrganization.apply') throw new HbarError('DISCONNECTED', 'Fixture disconnected')
      if (commandId !== 'workspaceOrganization.receipt') throw new Error('Unexpected query')
      if (phase === 'lost-read') throw new HbarError('TIMEOUT', 'Fixture receipt read timed out')
      return phase === 'recovered' ? receipt : null
    })
    await expect(
      client.commands.execute('workspaceOrganization.apply', request, { idempotencyKey: actor.idempotencyKey }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    phase = 'lost-read'
    await expect(client.commands.execute('workspaceOrganization.receipt', lookup)).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    phase = 'missing'
    expect(await client.commands.execute('workspaceOrganization.receipt', lookup)).toBeNull()
    phase = 'recovered'
    expect(await client.commands.execute('workspaceOrganization.receipt', lookup)).toEqual(receipt)
    expect(client.calls.map((call) => call.commandId)).toEqual([
      'workspaceOrganization.apply',
      'workspaceOrganization.receipt',
      'workspaceOrganization.receipt',
      'workspaceOrganization.receipt',
    ])
    for (const call of client.calls.slice(1)) expect(call.input).toEqual(lookup)
  })

  test('missing authenticated actor or idempotency key fails before the storage/RPC boundary', async () => {
    const host = hostFixture(() => receipt)
    const client = clientFixture(() => receipt)
    try {
      await expect(host.commands.execute('workspaceOrganization.apply', request)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      await expect(host.commands.execute('workspaceOrganization.receipt', lookup)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      await expect(client.commands.execute('workspaceOrganization.apply', request)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      expect(host.calls).toHaveLength(0)
      expect(client.calls).toHaveLength(0)
    } finally {
      host.close()
    }
  })

  test('pre-aborted organization operations do not cross the Client transport boundary', async () => {
    const client = clientFixture(() => receipt)
    const controller = new AbortController()
    controller.abort()
    const options = { signal: controller.signal, idempotencyKey: actor.idempotencyKey }
    await expect(client.commands.execute('workspaceOrganization.apply', request, options)).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    await expect(client.commands.execute('workspaceOrganization.receipt', lookup, options)).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    await expect(client.commands.execute('workspaceOrganization.get', {}, options)).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect(client.calls).toHaveLength(0)
  })

  test('cancellation after dispatch does not disguise a confirmed write as unperformed', async () => {
    const controller = new AbortController()
    const client = clientFixture(() => {
      controller.abort()
      return receipt
    })
    expect(
      await client.commands.execute('workspaceOrganization.apply', request, {
        signal: controller.signal,
        idempotencyKey: actor.idempotencyKey,
      }),
    ).toEqual(receipt)
    expect(client.calls).toHaveLength(1)
  })

  for (const code of [
    'COMMAND_CONFLICT',
    'IDEMPOTENCY_CONFLICT',
    'INVALID_INPUT',
    'NOT_FOUND',
    'INPUT_TOO_LARGE',
    'VERSION_MISMATCH',
    'INVALID_STATE',
  ]) {
    test(`Host preserves explicit pre-commit rejection ${code}`, async () => {
      const host = hostFixture(() => {
        throw new HbarError(code, 'Fixture rejected before committing')
      })
      try {
        await expect(host.commands.execute('workspaceOrganization.apply', request, actor)).rejects.toMatchObject({
          code,
        })
        expect(host.calls).toHaveLength(1)
        expect(host.notifications()).toBe(0)
      } finally {
        host.close()
      }
    })
  }

  for (const code of ['STORAGE_ERROR', 'TIMEOUT', 'UNRECOGNIZED_STORAGE_FAILURE', 'INVALID_OUTPUT']) {
    test(`Host keeps ${code} uncertain after the storage call instead of enabling a fresh write`, async () => {
      const host = hostFixture(() => {
        throw new HbarError(code, 'Fixture storage outcome cannot be established')
      })
      try {
        await expect(host.commands.execute('workspaceOrganization.apply', request, actor)).rejects.toMatchObject({
          code: 'RESULT_UNKNOWN',
        })
        expect(host.calls).toHaveLength(1)
        expect(host.notifications()).toBe(0)
      } finally {
        host.close()
      }
    })
  }

  test('wire INVALID_OUTPUT is unknown for apply but remains a read failure for receipt', async () => {
    const client = clientFixture(() => {
      throw new HbarError('INVALID_OUTPUT', 'Fixture Host could not validate the result')
    })
    await expect(
      client.commands.execute('workspaceOrganization.apply', request, { idempotencyKey: actor.idempotencyKey }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await expect(client.commands.execute('workspaceOrganization.receipt', lookup)).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    })
    expect(client.calls.map((call) => call.commandId)).toEqual([
      'workspaceOrganization.apply',
      'workspaceOrganization.receipt',
    ])
  })
})

test('receipt schema requires captured state, exact revision transition and safe integer revisions', () => {
  expect(workspaceOrganizationReceiptSchema.safeParse(receipt).success).toBe(true)
  for (const invalid of [
    { ...receipt, revision: 0 },
    { ...receipt, revision: 2 },
    { ...receipt, revision: -1 },
    { ...receipt, revision: 0.5 },
    { ...receipt, revision: 0, changed: false },
    { ...receipt, request: { ...request, change: { ...request.change, hidden: false } } },
    {
      ...receipt,
      revision: Number.MAX_SAFE_INTEGER + 1,
      request: { ...request, expectedRevision: Number.MAX_SAFE_INTEGER },
    },
  ])
    expect(workspaceOrganizationReceiptSchema.safeParse(invalid).success).toBe(false)
  expect(
    workspaceOrganizationReceiptSchema.safeParse({
      ...receipt,
      revision: 0,
      changed: false,
      request: { expectedRevision: 0, change: { kind: 'restoreHidden' } },
    }).success,
  ).toBe(true)
})

test('snapshot is unique and bounded by both item count and UTF-8 serialized bytes', () => {
  const ids = Array.from({ length: WORKSPACE_ORGANIZATION_MAX_HIDDEN }, (_, index) => `workspace-${index}`)
  const snapshot = { schemaVersion: 1, revision: 0, hiddenWorkspaceIds: ids }
  expect(workspaceOrganizationSnapshotSchema.safeParse(snapshot).success).toBe(true)
  expect(
    workspaceOrganizationSnapshotSchema.safeParse({ ...snapshot, hiddenWorkspaceIds: [...ids, 'one-too-many'] })
      .success,
  ).toBe(false)
  expect(
    workspaceOrganizationSnapshotSchema.safeParse({ ...snapshot, hiddenWorkspaceIds: ['same', 'same'] }).success,
  ).toBe(false)
  const unicodeSnapshot = {
    ...snapshot,
    hiddenWorkspaceIds: Array.from({ length: 500 }, (_, index) => `${index}-${'界'.repeat(100)}`),
  }
  expect(JSON.stringify(unicodeSnapshot).length).toBeLessThan(WORKSPACE_ORGANIZATION_MAX_BYTES)
  expect(new TextEncoder().encode(JSON.stringify(unicodeSnapshot)).byteLength).toBeGreaterThan(
    WORKSPACE_ORGANIZATION_MAX_BYTES,
  )
  expect(workspaceOrganizationSnapshotSchema.safeParse(unicodeSnapshot).success).toBe(false)
})
