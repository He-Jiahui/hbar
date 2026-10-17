import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { defineCommand, describeCommand, type CommandDefinition } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { commandResultCommands } from '@hbar/contracts/commands/command-results'
import type { DeviceAccess, DeviceRole } from '@hbar/contracts/device'
import {
  COMMAND_RECEIPT_INLINE_BYTES,
  commandExecutionIntentSchema,
  type CommandExecutionReceipt,
  type CommandExecutionUpdate,
} from '@hbar/contracts/command-execution'
import {
  commandReceiptReadInputSchema,
  commandReceiptViewSchema,
  commandResultReadInputSchema,
  commandResultReadOutputSchema,
} from '@hbar/contracts/command-receipt-read'
import { COMMAND_RECEIPT_READ_CHAIN_LIMIT, CommandReceiptReader } from '../apps/host/src/command-receipt-reader'
import { createCommandResultCommands } from '../apps/host/src/command-result-commands'
import { CommandResultPayloads } from '../apps/host/src/command-result-payloads'
import { DeviceAuthorization } from '../apps/host/src/device-authorization'
import { createInProcessStorage } from './in-process-storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const definition = (write = false) =>
  defineCommand(
    {
      id: write ? 'fixture.write' : 'fixture.read',
      version: 1,
      owner: 'fixture',
      kind: write ? 'command' : 'query',
      execution: 'host',
      stateEffect: write ? 'persistent' : 'none',
      scope: 'workspace',
      category: 'fixture',
      titleKey: 'fixture',
      descriptionKey: 'fixture',
      surfaces: ['api'],
    },
    z.strictObject({ workspaceId: z.string(), secret: z.string().optional() }),
    z.json(),
  )
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected receipt read rejection')
}
async function fixture() {
  const prefix = 'hbar-receipt-reader-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = createInProcessStorage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Source')
  const otherWorkspace = await storage.call('createWorkspace', join(root, 'other'), 'Other')
  const device = {
    id: 'receipt-owner',
    name: 'Receipt owner',
    role: 'operator' as const,
    workspaceIds: null,
    createdAt: 1,
    lastSeenAt: 1,
  }
  await storage.call('putDevice', device, 'owner-hash')
  await storage.call('putDevice', { ...device, id: 'other-actor', name: 'Other actor' }, 'other-hash')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: device.id,
    idempotencyKey: 'create-source',
  })
  const run = await storage.call('enqueue', session.id, 'source-run', { text: 'Original task', images: [] }, 'fixture')
  await storage.call('claim', session.id)
  const artifacts = new Map<string, Uint8Array>()
  let reads = 0
  let corruptReads = false
  let readGate: Promise<void> | undefined
  const payloads = new CommandResultPayloads({
    write: async (_source, index, bytes) => {
      const id = createHash('sha256').update(bytes).digest('hex')
      const artifact = { id, name: `result-${index}`, mime: 'application/octet-stream', size: bytes.byteLength }
      await storage.call('putArtifact', artifact)
      artifacts.set(id, bytes.slice())
      return artifact
    },
    read: async (artifact) => {
      reads++
      await readGate
      const bytes = artifacts.get(artifact.id)
      if (!bytes) throw new Error('Unknown fixture artifact')
      if (corruptReads) return new Uint8Array(bytes.byteLength)
      return bytes.slice()
    },
  })
  const reader = new CommandReceiptReader(storage, payloads)
  const commands = createCommandResultCommands(reader)
  let next = 0
  const identity = (receipt: CommandExecutionReceipt) => ({
    sessionId: receipt.sessionId,
    actorId: receipt.actorId,
    operationKey: receipt.operationKey,
  })
  async function update(receipt: CommandExecutionReceipt, change: CommandExecutionUpdate['change']) {
    return storage.call('commandExecutionUpdate', { ...identity(receipt), expectedRevision: receipt.revision, change })
  }
  async function seed(command: CommandDefinition, rawInput: unknown, value?: unknown) {
    const operationKey = `original-${++next}`
    const input: unknown = command.input.parse(rawInput)
    const intent = commandExecutionIntentSchema.parse({
      sessionId: session.id,
      actorId: device.id,
      operationKey,
      runId: run.id,
      callId: `original-call-${next}`,
      invocation: {
        protocol: 1,
        requestId: `request-${next}`,
        commandId: command.metadata.id,
        commandVersion: command.metadata.version,
        idempotencyKey: operationKey,
        input,
      },
      expectation: { descriptor: describeCommand(command), input },
    })
    let receipt = (await storage.call('commandExecutionAccept', intent)).receipt
    receipt = await update(receipt, {
      kind: 'bind',
      owner: { kind: 'host', instanceId: 'receipt-fixture', jobId: `original-job-${next}` },
    })
    if (value !== undefined)
      receipt = await update(receipt, {
        kind: 'logical',
        payload: await payloads.save({ ok: true, result: value }, identity(receipt)),
      })
    return receipt
  }
  return {
    storage,
    workspace,
    otherWorkspace,
    device,
    session,
    payloads,
    reader,
    commands,
    seed,
    update,
    identity,
    reads: () => reads,
    corrupt() {
      corruptReads = true
    },
    gate(value: Promise<void> | undefined) {
      readGate = value
    },
    async access(role: DeviceRole, workspaceIds: DeviceAccess['workspaceIds']) {
      await storage.call('revokeDevice', device.id)
      await storage.call('putDevice', { ...device, role, workspaceIds }, 'changed-owner-hash')
    },
    async close() {
      commands.dispose()
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('receipt metadata and result pages bind to the authenticated actor and preserve the original unknown operation', async () => {
  const f = await fixture()
  try {
    let receipt = await f.seed(
      definition(true),
      { workspaceId: f.workspace.id, secret: 'private-input' },
      { text: 'x'.repeat(70_000) },
    )
    receipt = await f.update(receipt, {
      kind: 'uncertain',
      error: { code: 'RESULT_UNKNOWN', message: 'x' + '🙂'.repeat(4000) },
    })
    const input = { sessionId: f.session.id, operationKey: receipt.operationKey }
    expect(await f.reader.get('other-actor', input)).toBeNull()
    const view = await f.reader.get(f.device.id, input)
    expect(view).toMatchObject({
      actorId: f.device.id,
      revision: receipt.revision,
      logical: { kind: 'artifacts' },
      physical: null,
      uncertainty: { code: 'RESULT_UNKNOWN', truncated: true },
      acknowledgedAt: null,
    })
    expect(JSON.stringify(view)).not.toContain('private-input')
    expect(JSON.stringify(view)).not.toContain('chunks')
    expect(view?.uncertainty?.message.length).toBeLessThanOrEqual(512)
    expect(view?.uncertainty?.message.endsWith('\ud83d')).toBe(false)
    const page = await f.reader.page(f.device.id, { ...input, limit: 100 })
    expect(page).toMatchObject({
      revision: receipt.revision,
      physicalStatus: null,
      acknowledged: false,
      uncertainty: { code: 'RESULT_UNKNOWN' },
    })
    expect(page.page.content.length).toBeGreaterThan(0)
    expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
    const spoofed = { ...input, actorId: f.device.id }
    expect(commandReceiptReadInputSchema.safeParse(spoofed).success).toBe(false)
    expect(await failure(f.reader.get('other-actor', spoofed))).toMatchObject({ name: 'ZodError' })
  } finally {
    await f.close()
  }
})

test('the public registry binds the authenticated actor and returns bounded state without changing the original operation', async () => {
  const f = await fixture()
  try {
    const receipt = await f.seed(definition(true), { workspaceId: f.workspace.id }, { saved: true })
    const invocation = {
      protocol: 1,
      requestId: 'read-original',
      commandId: 'command.receipt.get',
      commandVersion: 1,
      input: { sessionId: f.session.id, operationKey: receipt.operationKey },
    }
    const result = commandReceiptViewSchema.parse(await f.commands.dispatch(invocation, f.device.id))
    expect(result).toMatchObject({
      actorId: f.device.id,
      operationKey: receipt.operationKey,
      commandId: 'fixture.write',
    })
    expect(await f.commands.dispatch(invocation, 'other-actor')).toBeNull()
    expect(await failure(f.commands.dispatch(invocation, ''))).toMatchObject({ code: 'COMMAND_PRINCIPAL_REQUIRED' })
    const page = commandResultReadOutputSchema.parse(
      await f.commands.dispatch(
        {
          ...invocation,
          commandId: 'command.result.read',
        },
        f.device.id,
      ),
    )
    const decoded: unknown = JSON.parse(page.page.content)
    expect(decoded).toEqual({ ok: true, result: { saved: true } })
    expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
  } finally {
    await f.close()
  }
})

for (const commandId of ['command.receipt.get', 'command.result.read'] as const)
  test(`a cached ${commandId} cannot retain access to the referenced command target`, async () => {
    const f = await fixture()
    try {
      const original = await f.seed(definition(), { workspaceId: f.otherWorkspace.id }, { private: 'other-workspace' })
      const input = { sessionId: f.session.id, operationKey: original.operationKey }
      const result =
        commandId === 'command.receipt.get'
          ? await f.reader.get(f.device.id, input)
          : await f.reader.page(f.device.id, input)
      const cached = await f.seed(commandResultCommands[commandId], input, result)
      const key = { sessionId: f.session.id, operationKey: cached.operationKey }
      expect(await f.reader.get(f.device.id, key)).not.toBeNull()
      await f.access('operator', [f.workspace.id])
      expect(await failure(f.reader.get(f.device.id, key))).toMatchObject({ code: 'FORBIDDEN' })
      expect(await failure(f.reader.page(f.device.id, key))).toMatchObject({ code: 'FORBIDDEN' })
      expect(await failure(f.reader.readReceipt(f.device.id, key))).toMatchObject({ code: 'FORBIDDEN' })
      expect(await f.storage.call('commandExecutionRead', f.identity(original))).toEqual(original)
      expect(await f.storage.call('commandExecutionRead', f.identity(cached))).toEqual(cached)
    } finally {
      await f.close()
    }
  })

test('cached result pages apply current directory restrictions to the original referenced payload', async () => {
  const f = await fixture()
  try {
    const original = await f.seed(
      directoryCommands['workspace.list'],
      {},
      {
        items: [f.workspace, f.otherWorkspace],
        nextCursor: null,
      },
    )
    const input = { sessionId: f.session.id, operationKey: original.operationKey }
    const cached = await f.seed(
      commandResultCommands['command.result.read'],
      input,
      await f.reader.page(f.device.id, input),
    )
    await f.access('operator', [f.workspace.id])
    expect(await failure(f.reader.page(f.device.id, { ...input, operationKey: cached.operationKey }))).toMatchObject({
      code: 'COMMAND_RECEIPT_ACCESS_CHANGED',
    })
    expect(await f.storage.call('commandExecutionRead', f.identity(cached))).toEqual(cached)
  } finally {
    await f.close()
  }
})

test('receipt reference traversal accepts its documented bound and rejects the next level', async () => {
  const f = await fixture()
  try {
    let previous = await f.seed(definition(), { workspaceId: f.workspace.id }, { saved: true })
    for (let index = 1; index <= COMMAND_RECEIPT_READ_CHAIN_LIMIT; index++) {
      const input = { sessionId: f.session.id, operationKey: previous.operationKey }
      const value = await f.reader.get(f.device.id, input)
      previous = await f.seed(commandResultCommands['command.receipt.get'], input, value)
      const read = f.reader.get(f.device.id, { ...input, operationKey: previous.operationKey })
      if (index < COMMAND_RECEIPT_READ_CHAIN_LIMIT) expect(await read).not.toBeNull()
      else expect(await failure(read)).toMatchObject({ code: 'COMMAND_RESULT_CHAIN_LIMIT' })
    }
  } finally {
    await f.close()
  }
})

test('a self-referencing stored receipt fails without entering an unbounded read loop', async () => {
  const f = await fixture()
  try {
    const input = { sessionId: f.session.id, operationKey: 'original-1' }
    const receipt = await f.seed(commandResultCommands['command.receipt.get'], input)
    expect(receipt.operationKey).toBe(input.operationKey)
    expect(await failure(f.reader.get(f.device.id, input))).toMatchObject({ code: 'COMMAND_RESULT_CHAIN_CYCLE' })
    expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
  } finally {
    await f.close()
  }
})

test('an observer may read its old operation without receiving permission to execute that write', async () => {
  const f = await fixture()
  try {
    const command = definition(true)
    const receipt = await f.seed(command, { workspaceId: f.workspace.id }, { saved: true })
    await f.access('observer', [f.workspace.id])
    const current = await f.storage.call('deviceById', f.device.id)
    if (!current) throw new Error('Missing observer')
    const authorization = new DeviceAuthorization(f.storage, () => describeCommand(command))
    expect(await failure(authorization.authorize(current, 'command.execute', receipt.invocation))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(
      await f.reader.get(f.device.id, { sessionId: f.session.id, operationKey: receipt.operationKey }),
    ).toMatchObject({
      commandId: 'fixture.write',
    })
    expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
  } finally {
    await f.close()
  }
})

test('the original command target must remain accessible in addition to the source Session', async () => {
  const f = await fixture()
  try {
    const receipt = await f.seed(definition(), { workspaceId: f.otherWorkspace.id }, { private: true })
    await f.access('operator', [f.workspace.id])
    const input = { sessionId: f.session.id, operationKey: receipt.operationKey }
    expect(await failure(f.reader.get(f.device.id, input))).toMatchObject({ code: 'FORBIDDEN' })
    expect(await failure(f.reader.page(f.device.id, input))).toMatchObject({ code: 'FORBIDDEN' })
    expect(f.reads()).toBe(0)
  } finally {
    await f.close()
  }
})

test('scope narrowing makes an old directory payload unavailable without exposing its manifest or changing its receipt', async () => {
  const f = await fixture()
  try {
    const receipt = await f.seed(
      directoryCommands['workspace.list'],
      {},
      { items: [f.workspace, f.otherWorkspace], nextCursor: null },
    )
    await f.access('operator', [f.workspace.id])
    const input = { sessionId: f.session.id, operationKey: receipt.operationKey }
    const view = await f.reader.get(f.device.id, input)
    expect(view?.logical).toMatchObject({ kind: 'unavailable', error: { code: 'COMMAND_RECEIPT_ACCESS_CHANGED' } })
    expect(JSON.stringify(view)).not.toContain(f.otherWorkspace.path)
    expect(await failure(f.reader.page(f.device.id, input))).toMatchObject({ code: 'COMMAND_RECEIPT_ACCESS_CHANGED' })
    expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
    const permitted = await f.seed(directoryCommands['workspace.list'], {}, { items: [f.workspace], nextCursor: null })
    expect(
      await f.reader.get(f.device.id, { sessionId: f.session.id, operationKey: permitted.operationKey }),
    ).toMatchObject({
      logical: { kind: 'inline' },
    })
  } finally {
    await f.close()
  }
})

for (const change of ['revoke', 'scope', 'revoke-corrupt'] as const)
  test(`artifact I/O rechecks current ${change} before delivering a page`, async () => {
    const f = await fixture()
    const gate = Promise.withResolvers<void>()
    let operation: Promise<unknown> | undefined
    try {
      const receipt = await f.seed(definition(), { workspaceId: f.workspace.id }, { text: 'x'.repeat(70_000) })
      if (change === 'revoke-corrupt') f.corrupt()
      f.gate(gate.promise)
      operation = f.reader.page(f.device.id, { sessionId: f.session.id, operationKey: receipt.operationKey })
      for (let index = 0; index < 100 && f.reads() === 0; index++)
        await new Promise<void>((resolve) => setTimeout(resolve, 1))
      expect(f.reads()).toBe(1)
      if (change !== 'scope') await f.storage.call('revokeDevice', f.device.id)
      else await f.access('operator', [f.workspace.id])
      gate.resolve()
      expect(await failure(operation)).toMatchObject({
        code: change === 'scope' ? 'COMMAND_RESULT_VIEW_CHANGED' : 'COMMAND_PRINCIPAL_REVOKED',
      })
      expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
    } finally {
      gate.resolve()
      if (operation) await Promise.allSettled([operation])
      await f.close()
    }
  })

test('pending result channels stay pending and a worst-case page envelope still remains inline', async () => {
  const f = await fixture()
  try {
    const receipt = await f.seed(definition(), { workspaceId: f.workspace.id })
    const input = { sessionId: f.session.id, operationKey: receipt.operationKey }
    expect(await f.reader.get(f.device.id, input)).toMatchObject({ logical: null, physical: null })
    expect(await failure(f.reader.page(f.device.id, input))).toMatchObject({ code: 'COMMAND_RESULT_PENDING' })
    const page = commandResultReadOutputSchema.parse({
      actorId: '\u0000'.repeat(160),
      sessionId: '\u0000'.repeat(160),
      operationKey: '\u0000'.repeat(160),
      commandId: 'fixture.' + 'a'.repeat(120),
      commandVersion: Number.MAX_SAFE_INTEGER,
      revision: Number.MAX_SAFE_INTEGER,
      channel: 'logical',
      physicalStatus: null,
      acknowledged: false,
      uncertainty: { code: '\u0000'.repeat(128), message: '\u0000'.repeat(512), truncated: false },
      page: {
        encoding: 'utf8',
        integrity: 'selected_chunks',
        offset: 0,
        nextOffset: null,
        totalBytes: 8192,
        sha256: 'a'.repeat(64),
        content: '\u0000'.repeat(8192),
      },
    })
    const saved = await f.payloads.save({ ok: true, result: page }, f.identity(receipt))
    expect(saved.kind).toBe('inline')
    if (saved.kind !== 'inline') throw new Error('Page became another reference')
    expect(new TextEncoder().encode(saved.json).byteLength).toBeLessThanOrEqual(COMMAND_RECEIPT_INLINE_BYTES)
  } finally {
    await f.close()
  }
})

test('physical result pages and acknowledgements remain original facts, and continuation hashes are mandatory', async () => {
  const f = await fixture()
  try {
    let receipt = await f.seed(definition(true), { workspaceId: f.workspace.id }, { saved: true })
    const settlement = { status: 'succeeded', executionStarted: true, result: { saved: true } }
    receipt = await f.update(receipt, {
      kind: 'settled',
      physical: {
        status: 'succeeded',
        executionStarted: true,
        payload: await f.payloads.save(settlement, f.identity(receipt)),
      },
    })
    receipt = await f.update(receipt, { kind: 'acknowledged' })
    const input = { sessionId: f.session.id, operationKey: receipt.operationKey, channel: 'physical' as const }
    const first = await f.reader.page(f.device.id, { ...input, limit: 8 })
    expect(first).toMatchObject({ physicalStatus: 'succeeded', acknowledged: true, uncertainty: null })
    expect(commandResultReadInputSchema.safeParse({ ...input, offset: 8 }).success).toBe(false)
    expect(
      await failure(f.reader.page(f.device.id, { ...input, offset: 8, expectedSha256: 'f'.repeat(64) })),
    ).toMatchObject({ code: 'COMMAND_RESULT_VIEW_CHANGED' })
    const rest = await f.reader.page(f.device.id, {
      ...input,
      offset: first.page.nextOffset ?? 0,
      expectedSha256: first.page.sha256,
    })
    const decoded: unknown = JSON.parse(first.page.content + rest.page.content)
    expect(decoded).toEqual(settlement)
    expect(
      await f.reader.get(f.device.id, { sessionId: input.sessionId, operationKey: input.operationKey }),
    ).toMatchObject({
      physical: { status: 'succeeded', executionStarted: true, payload: { kind: 'inline' } },
      acknowledgedAt: receipt.acknowledgedAt,
    })
    expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
  } finally {
    await f.close()
  }
})

test('an unconfirmed physical failure remains unacknowledged and its original error is read from the physical channel', async () => {
  const f = await fixture()
  try {
    let receipt = await f.seed(definition(true), { workspaceId: f.workspace.id }, { accepted: true })
    const settlement = {
      status: 'failed',
      executionStarted: true,
      error: { code: 'RESULT_UNKNOWN', message: 'The nested write has no confirmed outcome' },
    }
    receipt = await f.update(receipt, {
      kind: 'settled',
      physical: {
        status: 'failed',
        executionStarted: true,
        payload: await f.payloads.save(settlement, f.identity(receipt)),
      },
    })
    const input = { sessionId: f.session.id, operationKey: receipt.operationKey }
    expect(await f.reader.get(f.device.id, input)).toMatchObject({
      logical: { kind: 'inline' },
      physical: { status: 'failed', executionStarted: true },
      acknowledgedAt: null,
      uncertainty: null,
    })
    const page = await f.reader.page(f.device.id, { ...input, channel: 'physical' })
    expect(page).toMatchObject({ physicalStatus: 'failed', acknowledged: false, uncertainty: null })
    const decoded: unknown = JSON.parse(page.page.content)
    expect(decoded).toEqual(settlement)
    expect(await f.storage.call('commandExecutionRead', f.identity(receipt))).toEqual(receipt)
  } finally {
    await f.close()
  }
})
