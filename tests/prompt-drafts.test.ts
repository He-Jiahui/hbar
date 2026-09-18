import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError } from '@hbar/commands'
import { createAppRuntime, type RunCommandPort } from '@hbar/app-runtime'
import { HbarClient, createDirectoryQueryAdapter, createRunCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import type { RunAccepted } from '@hbar/contracts/commands/run'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

function directory() {
  return {
    async execute(name: string, input: unknown) {
      if (name === 'session.get') {
        const sessionId = (input as { sessionId: string }).sessionId
        return {
          id: sessionId,
          workspaceId: 'workspace',
          title: sessionId,
          archived: false,
          parentId: null,
          createdAt: 1,
          updatedAt: 1,
          seq: 0,
        }
      }
      if (name === 'workspace.get') return { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
      if (name === 'session.list') return { items: [], nextCursor: null }
      if (name === 'workspace.list') return { items: [], nextCursor: null }
      throw new Error(`Unsupported directory query: ${name}`)
    },
  }
}

function accepted(sessionId: string, operationId = crypto.randomUUID(), key = 'key'): RunAccepted {
  return {
    status: 'accepted',
    commandId: 'run.submit',
    commandVersion: 1,
    requestId: crypto.randomUUID(),
    idempotencyKey: key,
    operationId,
    sessionId,
    acceptedAt: Date.now(),
  }
}

test('draft submission captures its session and revision while newer edits survive acknowledgement', async () => {
  let release!: () => void
  let hold = new Promise<void>((resolve) => {
    release = resolve
  })
  let mode: 'success' | 'unknown' | 'failed' = 'success'
  const calls: { name: string; input: unknown; key?: string }[] = []
  const receipts = new Map<string, RunAccepted>()
  const run: RunCommandPort = {
    async execute(name, input, options) {
      calls.push({ name, input, ...(options?.idempotencyKey ? { key: options.idempotencyKey } : {}) })
      if (name === 'operation.cancel')
        return { operationId: (input as { operationId: string }).operationId, status: 'cancelRequested' }
      await hold
      if (mode === 'failed') throw new CommandError('EXECUTION_FAILED', 'Rejected')
      const sessionId = (input as { sessionId: string }).sessionId
      const result = accepted(sessionId, crypto.randomUUID(), options?.idempotencyKey)
      receipts.set(`${sessionId}:${options?.idempotencyKey}`, result)
      if (mode === 'unknown') throw new CommandError('RESULT_UNKNOWN', 'Reply lost')
      return result
    },
    async getReceipt(sessionId, idempotencyKey) {
      return receipts.get(`${sessionId}:${idempotencyKey}`) ?? null
    },
  }
  const runtime = createAppRuntime({ instanceId: 'drafts', hostId: 'host', directory: directory(), run })
  try {
    await runtime.view.commands.execute('draft.setText', { sessionId: 'session-one', text: 'first' })
    const firstRevision = runtime.view.state.drafts.getSnapshot()['session-one']!.revision
    const pending = runtime.view.commands.execute('run.submit', {
      sessionId: 'session-one',
      modelId: 'model',
      input: { text: 'first', images: [], files: [] },
    })
    expect(runtime.view.state.drafts.getSnapshot()['session-one']!.status).toBe('submitting')
    await runtime.view.commands.execute('draft.setText', {
      sessionId: 'session-one',
      text: 'typed while waiting',
      expectedRevision: firstRevision,
    })
    release()
    const result = await pending
    expect(result.sessionId).toBe('session-one')
    expect(calls[0]?.key).toBeString()
    expect(runtime.view.state.drafts.getSnapshot()['session-one']).toMatchObject({
      text: 'typed while waiting',
      status: 'idle',
      lastOperationId: result.operationId,
    })

    mode = 'unknown'
    hold = Promise.resolve()
    await runtime.view.commands.execute('draft.setText', { sessionId: 'session-one', text: 'uncertain' })
    await expect(
      runtime.view.commands.execute('run.submit', {
        sessionId: 'session-one',
        modelId: 'model',
        input: { text: 'uncertain', images: [], files: [] },
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(runtime.view.state.drafts.getSnapshot()['session-one']!.status).toBe('unknown')
    await runtime.view.commands.execute('draft.setText', { sessionId: 'session-one', text: 'new after unknown' })
    const receipt = await runtime.view.commands.execute('draft.reconcileSubmission', { sessionId: 'session-one' })
    expect(receipt?.status).toBe('accepted')
    expect(runtime.view.state.drafts.getSnapshot()['session-one']).toMatchObject({
      text: 'new after unknown',
      status: 'idle',
      lastOperationId: receipt!.operationId,
    })

    const cancel = await runtime.view.commands.execute('operation.cancel', { operationId: receipt!.operationId })
    expect(cancel.status).toBe('cancelRequested')
  } finally {
    runtime.dispose()
  }
})

test('draft validation retains failed input and keeps runtime instances private', async () => {
  const failing: RunCommandPort = {
    async execute() {
      throw new CommandError('EXECUTION_FAILED', 'No model')
    },
    async getReceipt() {
      return null
    },
  }
  const first = createAppRuntime({ instanceId: 'first', hostId: 'host', directory: directory(), run: failing })
  const second = createAppRuntime({ instanceId: 'second', hostId: 'host', directory: directory(), run: failing })
  try {
    const artifact = { id: 'a'.repeat(64), name: 'notes.txt', mime: 'text/plain', size: 12 }
    await first.view.commands.execute('draft.setText', { sessionId: 'session', text: 'keep me' })
    await first.view.commands.execute('draft.setAttachments', {
      sessionId: 'session',
      attachments: [{ kind: 'file', artifact }],
    })
    await expect(
      first.view.commands.execute('draft.setAttachments', {
        sessionId: 'session',
        attachments: [
          { kind: 'file', artifact },
          { kind: 'file', artifact },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      first.view.commands.execute('run.submit', {
        sessionId: 'session',
        modelId: 'model',
        input: { text: 'keep me', images: [], files: [artifact] },
      }),
    ).rejects.toMatchObject({ code: 'EXECUTION_FAILED' })
    expect(first.view.state.drafts.getSnapshot().session).toMatchObject({
      text: 'keep me',
      attachments: [{ kind: 'file', artifact }],
      status: 'failed',
    })
    expect(second.view.state.drafts.getSnapshot().session).toBeUndefined()
  } finally {
    first.dispose()
    second.dispose()
  }
})

test('run client treats a lost submit response as unknown', async () => {
  const commands = createRunCommandClient({
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost')
    },
  })
  await expect(
    commands.execute(
      'run.submit',
      { sessionId: 'session', modelId: 'model', input: { text: 'hello', images: [], files: [] } },
      { idempotencyKey: 'stable-key' },
    ),
  ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
})

test('real Host accepts the runtime draft through the canonical run command', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-prompt-draft-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let runtime: ReturnType<typeof createAppRuntime> | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const session = await kernel.createSession(workspace.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    const info = await client.pair(host.pairing.code, 'prompt draft test')
    runtime = createAppRuntime({
      instanceId: 'prompt-draft-test',
      hostId: info.instanceId,
      directory: createDirectoryQueryAdapter(client),
      run: createRunCommandClient(client),
    })
    await runtime.view.commands.execute('draft.setText', { sessionId: session.id, text: 'hello from draft' })
    const result = await runtime.view.commands.execute('run.submit', {
      sessionId: session.id,
      modelId: 'local-fixture',
      input: { text: 'hello from draft', images: [], files: [] },
    })
    expect(result.status).toBe('accepted')
    expect(runtime.view.state.drafts.getSnapshot()[session.id]).toMatchObject({ text: '', status: 'idle' })
    await kernel.waitForIdle()
    const stored = await kernel.snapshot(session.id)
    expect(stored.messages.some((message) => message.role === 'user' && message.content[0]?.type === 'text')).toBeTrue()
  } finally {
    runtime?.dispose()
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
