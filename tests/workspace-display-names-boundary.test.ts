import { describe, expect, test } from 'bun:test'
import { CommandRegistry, createCommandClient, invocationSchema } from '@hbar/commands'
import { createWorkspaceSessionCommandClient, type ClientTransport } from '@hbar/client'
import { HbarError, type RpcMethod, type RpcParams, type RpcResults } from '@hbar/contracts'
import {
  WORKSPACE_DISPLAY_NAMES_MAX_BYTES,
  WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES,
  workspaceDisplayNameSchema,
  workspaceDisplayNamesCommands,
  workspaceDisplayNamesReceiptSchema,
  workspaceDisplayNamesSnapshotSchema,
  type WorkspaceDisplayNamesApplyInput,
  type WorkspaceDisplayNamesReceipt,
} from '@hbar/contracts/commands/workspace-display-names'
import type { StorageMethods, StoragePort } from '@hbar/storage'
import { registerWorkspaceDisplayNamesCommands } from '../packages/kernel/src/workspace-display-names-commands'

const request = {
  expectedRevision: 0,
  workspaceId: 'workspace-A',
  expectedDisplayName: null,
  displayName: 'Alpha 工作区',
} satisfies WorkspaceDisplayNamesApplyInput
const receipt = {
  commitId: 'commit-A',
  revision: 1,
  request,
  changed: true,
} satisfies WorkspaceDisplayNamesReceipt
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
  registerWorkspaceDisplayNamesCommands(registry, storage, () => notifications++)
  return {
    commands: createCommandClient(workspaceDisplayNamesCommands, registry),
    calls,
    notifications: () => notifications,
    close: () => registry.dispose(),
  }
}

function clientFixture(result: (commandId: string) => unknown) {
  const calls: ReturnType<typeof invocationSchema.parse>[] = []
  const transport: ClientTransport = {
    async call<Method extends RpcMethod>(method: Method, params: RpcParams<Method>): Promise<RpcResults[Method]> {
      if (method !== 'command.execute') throw new Error('Unexpected RPC in display name boundary fixture')
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
  { name: 'another workspace', value: { ...receipt, request: { ...request, workspaceId: 'workspace-B' } } },
  { name: 'another revision', value: { ...receipt, revision: 2, request: { ...request, expectedRevision: 1 } } },
  { name: 'another captured alias', value: { ...receipt, request: { ...request, expectedDisplayName: 'Old alias' } } },
  { name: 'another requested alias', value: { ...receipt, request: { ...request, displayName: 'Beta' } } },
  {
    name: 'reset instead of rename',
    value: { ...receipt, request: { ...request, expectedDisplayName: 'Alpha', displayName: null } },
  },
  { name: 'malformed changed flag', value: { ...receipt, changed: 'yes' } },
  { name: 'missing commit ID', value: { ...receipt, commitId: '' } },
  { name: 'missing acknowledgement', value: null },
  { name: 'unrelated commit revision', value: { ...receipt, revision: 99 } },
  { name: 'unexpected private payload', value: { ...receipt, privateData: 'not-public' } },
]

describe('workspace display names result boundaries', () => {
  for (const candidate of invalidReplies) {
    test(`Host rejects ${candidate.name} after dispatch as unknown without a notification`, async () => {
      const host = hostFixture(() => candidate.value)
      try {
        await expect(host.commands.execute('workspaceDisplayNames.apply', request, actor)).rejects.toMatchObject({
          code: 'RESULT_UNKNOWN',
        })
        expect(host.calls).toEqual([{ method: 'applyWorkspaceDisplayNames', args: [{ ...actor, request }] }])
        expect(host.notifications()).toBe(0)
      } finally {
        host.close()
      }
    })

    test(`Client rejects ${candidate.name} after dispatch as unknown without retry`, async () => {
      const client = clientFixture(() => candidate.value)
      await expect(
        client.commands.execute('workspaceDisplayNames.apply', request, { idempotencyKey: actor.idempotencyKey }),
      ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      expect(client.calls).toHaveLength(1)
      expect(client.calls[0]).toMatchObject({
        commandId: 'workspaceDisplayNames.apply',
        idempotencyKey: actor.idempotencyKey,
        input: request,
      })
    })
  }

  test('validated changed ACK notifies once and an unchanged ACK does not notify', async () => {
    const unchangedRequest = { ...request, displayName: null }
    const unchangedReceipt = { ...receipt, request: unchangedRequest, revision: 0, changed: false }
    const host = hostFixture(() => receipt)
    const noop = hostFixture(() => unchangedReceipt)
    try {
      expect(await host.commands.execute('workspaceDisplayNames.apply', request, actor)).toEqual(receipt)
      expect(host.notifications()).toBe(1)
      expect(await noop.commands.execute('workspaceDisplayNames.apply', unchangedRequest, actor)).toEqual(
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
      if (method === 'applyWorkspaceDisplayNames') throw new Error('Worker reply lost after simulated commit')
      if (method === 'workspaceDisplayNamesReceipt') return recovered ? receipt : null
      throw new Error('Unexpected storage method')
    })
    try {
      await expect(host.commands.execute('workspaceDisplayNames.apply', request, actor)).rejects.toMatchObject({
        code: 'RESULT_UNKNOWN',
      })
      expect(await host.commands.execute('workspaceDisplayNames.receipt', lookup, actor)).toBeNull()
      recovered = true
      expect(await host.commands.execute('workspaceDisplayNames.receipt', lookup, actor)).toEqual(receipt)
      expect(host.calls.map((call) => call.method)).toEqual([
        'applyWorkspaceDisplayNames',
        'workspaceDisplayNamesReceipt',
        'workspaceDisplayNamesReceipt',
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
        await expect(host.commands.execute('workspaceDisplayNames.receipt', lookup, actor)).rejects.toMatchObject({
          code: 'INVALID_OUTPUT',
        })
        await expect(client.commands.execute('workspaceDisplayNames.receipt', lookup)).rejects.toMatchObject({
          code: 'INVALID_OUTPUT',
        })
        expect(host.calls.map((call) => call.method)).toEqual(['workspaceDisplayNamesReceipt'])
        expect(client.calls.map((call) => call.commandId)).toEqual(['workspaceDisplayNames.receipt'])
        expect(host.notifications()).toBe(0)
      } finally {
        host.close()
      }
    })
  }

  test('Client preserves read errors and null receipts without retrying the unknown mutation', async () => {
    let phase: 'lost-write' | 'lost-read' | 'missing' | 'recovered' = 'lost-write'
    const client = clientFixture((commandId) => {
      if (commandId === 'workspaceDisplayNames.apply') throw new HbarError('DISCONNECTED', 'Fixture disconnected')
      if (commandId !== 'workspaceDisplayNames.receipt') throw new Error('Unexpected query')
      if (phase === 'lost-read') throw new HbarError('TIMEOUT', 'Fixture receipt read timed out')
      return phase === 'recovered' ? receipt : null
    })
    await expect(
      client.commands.execute('workspaceDisplayNames.apply', request, { idempotencyKey: actor.idempotencyKey }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    phase = 'lost-read'
    await expect(client.commands.execute('workspaceDisplayNames.receipt', lookup)).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    phase = 'missing'
    expect(await client.commands.execute('workspaceDisplayNames.receipt', lookup)).toBeNull()
    phase = 'recovered'
    expect(await client.commands.execute('workspaceDisplayNames.receipt', lookup)).toEqual(receipt)
    expect(client.calls.map((call) => call.commandId)).toEqual([
      'workspaceDisplayNames.apply',
      'workspaceDisplayNames.receipt',
      'workspaceDisplayNames.receipt',
      'workspaceDisplayNames.receipt',
    ])
    for (const call of client.calls.slice(1)) expect(call.input).toEqual(lookup)
  })

  test('missing authenticated actor or idempotency key fails before the storage/RPC boundary', async () => {
    const host = hostFixture(() => receipt)
    const client = clientFixture(() => receipt)
    try {
      await expect(host.commands.execute('workspaceDisplayNames.apply', request)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      await expect(
        host.commands.execute('workspaceDisplayNames.apply', request, { idempotencyKey: actor.idempotencyKey }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(
        host.commands.execute('workspaceDisplayNames.apply', request, { actorId: actor.actorId }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(host.commands.execute('workspaceDisplayNames.get', {})).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      await expect(host.commands.execute('workspaceDisplayNames.receipt', lookup)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      await expect(client.commands.execute('workspaceDisplayNames.apply', request)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      expect(host.calls).toHaveLength(0)
      expect(client.calls).toHaveLength(0)
    } finally {
      host.close()
    }
  })

  test('pre-aborted display name operations do not cross the Client transport boundary', async () => {
    const client = clientFixture(() => receipt)
    const controller = new AbortController()
    controller.abort()
    const options = { signal: controller.signal, idempotencyKey: actor.idempotencyKey }
    await expect(client.commands.execute('workspaceDisplayNames.apply', request, options)).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    await expect(client.commands.execute('workspaceDisplayNames.receipt', lookup, options)).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    await expect(client.commands.execute('workspaceDisplayNames.get', {}, options)).rejects.toMatchObject({
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
      await client.commands.execute('workspaceDisplayNames.apply', request, {
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
        await expect(host.commands.execute('workspaceDisplayNames.apply', request, actor)).rejects.toMatchObject({
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
        await expect(host.commands.execute('workspaceDisplayNames.apply', request, actor)).rejects.toMatchObject({
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
      client.commands.execute('workspaceDisplayNames.apply', request, { idempotencyKey: actor.idempotencyKey }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await expect(client.commands.execute('workspaceDisplayNames.receipt', lookup)).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    })
    expect(client.calls.map((call) => call.commandId)).toEqual([
      'workspaceDisplayNames.apply',
      'workspaceDisplayNames.receipt',
    ])
  })
})

test('label contract enforces UTF-16 units and single-line trimmed input without normalizing an exact request', () => {
  for (const value of ['A', '界'.repeat(80), '😀'.repeat(40), 'two  spaces', '👩‍💻']) {
    expect(workspaceDisplayNameSchema.parse(value)).toBe(value)
  }
  for (const value of [
    '',
    ' ',
    ' a',
    'a ',
    '\u00a0',
    'a'.repeat(81),
    '😀'.repeat(41),
    'a\tb',
    'a\nb',
    'a\r\nb',
    'a\u0085b',
    'a\u2028b',
    'a\u2029b',
    'a\u0000b',
    '\u200b',
    '\u0301',
    'a\u202eb',
    '\ud800',
  ]) {
    expect(workspaceDisplayNameSchema.safeParse(value).success).toBe(false)
  }
})

test('receipt requires exact change, version transition and safe integer versions including nullable reset', () => {
  expect(workspaceDisplayNamesReceiptSchema.safeParse(receipt).success).toBe(true)
  const reset = { ...request, expectedDisplayName: 'Alpha 工作区', displayName: null }
  expect(workspaceDisplayNamesReceiptSchema.safeParse({ ...receipt, request: reset }).success).toBe(true)
  expect(
    workspaceDisplayNamesReceiptSchema.safeParse({
      ...receipt,
      revision: 0,
      changed: false,
      request: { ...request, displayName: null },
    }).success,
  ).toBe(true)
  for (const value of [
    { ...receipt, revision: 0 },
    { ...receipt, revision: 2 },
    { ...receipt, revision: -1 },
    { ...receipt, revision: 0.5 },
    { ...receipt, changed: false, revision: 0 },
    { ...receipt, request: { ...request, expectedDisplayName: request.displayName } },
    {
      ...receipt,
      revision: Number.MAX_SAFE_INTEGER + 1,
      request: { ...request, expectedRevision: Number.MAX_SAFE_INTEGER },
    },
  ])
    expect(workspaceDisplayNamesReceiptSchema.safeParse(value).success).toBe(false)
})

test('snapshot rejects duplicate identities and independently bounds entries and exact UTF-8 bytes', () => {
  const base = (count: number) => ({
    schemaVersion: 1,
    revision: 0,
    entries: Array.from({ length: count }, (_, index) => ({
      workspaceId: `w${String(index).padStart(4, '0')}`,
      displayName: 'a'.repeat(80),
    })),
  })
  for (const count of [0, 1, WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES])
    expect(workspaceDisplayNamesSnapshotSchema.safeParse(base(count)).success).toBe(true)
  expect(workspaceDisplayNamesSnapshotSchema.safeParse(base(WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES + 1)).success).toBe(
    false,
  )
  const one = base(1)
  expect(
    workspaceDisplayNamesSnapshotSchema.safeParse({ ...one, entries: [...one.entries, ...one.entries] }).success,
  ).toBe(false)
  expect(workspaceDisplayNamesSnapshotSchema.safeParse({ ...one, schemaVersion: 2 }).success).toBe(false)
  expect(workspaceDisplayNamesSnapshotSchema.safeParse({ ...one, hiddenWorkspaceIds: [] }).success).toBe(false)
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
  const exact = base(WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES)
  let remaining = WORKSPACE_DISPLAY_NAMES_MAX_BYTES - bytes(exact)
  for (const entry of exact.entries) {
    if (!remaining) break
    const count = Math.min(80, Math.floor(remaining / 2))
    entry.displayName = '界'.repeat(count) + 'a'.repeat(80 - count)
    remaining -= count * 2
    if (remaining === 1 && count < 80) {
      entry.displayName = entry.displayName.slice(0, count) + 'é' + entry.displayName.slice(count + 1)
      remaining--
    }
  }
  expect(remaining).toBe(0)
  expect(bytes(exact)).toBe(WORKSPACE_DISPLAY_NAMES_MAX_BYTES)
  expect(workspaceDisplayNamesSnapshotSchema.safeParse(exact).success).toBe(true)
  const last = exact.entries.at(-1)
  if (!last) throw new Error('Boundary fixture missing final entry')
  last.displayName = 'é' + last.displayName.slice(1)
  expect(bytes(exact)).toBe(WORKSPACE_DISPLAY_NAMES_MAX_BYTES + 1)
  expect(workspaceDisplayNamesSnapshotSchema.safeParse(exact).success).toBe(false)
})
