import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError } from '@hbar/commands'
import { createAppRuntime, type RunCommandPort } from '@hbar/app-runtime'
import {
  HbarClient,
  createBrowserAttachmentController,
  createDirectoryQueryAdapter,
  createRunCommandClient,
} from '@hbar/client'
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
    expect(runtime.view.state.runActions.getSnapshot()[receipt!.operationId]?.status).toBe('succeeded')

    mode = 'unknown'
    const retryInput = { sessionId: 'session-one', operationId: receipt!.operationId }
    await expect(runtime.view.commands.execute('run.retry', retryInput)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    const unknownRetry = calls.at(-1)
    expect(unknownRetry).toMatchObject({ name: 'run.retry', input: retryInput })
    expect(unknownRetry?.key).toBeString()
    expect(runtime.view.state.runActions.getSnapshot()[receipt!.operationId]).toMatchObject({
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
    })
    mode = 'success'
    const retried = await runtime.view.commands.execute('run.retry', retryInput)
    expect(calls.at(-1)?.key).toBe(unknownRetry?.key)
    expect(retried.sessionId).toBe('session-one')
    expect(runtime.view.state.runActions.getSnapshot()[receipt!.operationId]?.status).toBe('succeeded')
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

test('attachment commands reserve draft slots and merge uploaded artifacts with newer text', async () => {
  let finishUpload!: () => void
  const held = new Promise<void>((resolve) => {
    finishUpload = resolve
  })
  let fail = false
  const attachments = {
    async execute(_name: string, input: unknown) {
      await held
      if (fail) throw new CommandError('UPLOAD_FAILED', 'Upload rejected')
      const upload = input as { sha256: string; name: string; mime: string; size: number }
      return { id: upload.sha256, name: upload.name, mime: upload.mime, size: upload.size }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'attachment-drafts',
    hostId: 'host',
    directory: directory(),
    attachments,
  })
  const artifact = (index: number) => ({
    kind: 'file' as const,
    artifact: {
      id: index.toString(16).padStart(64, '0'),
      name: `existing-${index}.txt`,
      mime: 'text/plain',
      size: index + 1,
    },
  })
  const upload = {
    sourceId: 'browser-source',
    sha256: 'f'.repeat(64),
    name: 'selected.png',
    mime: 'image/png',
    size: 42,
  }
  try {
    await runtime.view.commands.execute('draft.setText', { sessionId: 'session', text: 'before upload' })
    await runtime.view.commands.execute('draft.setAttachments', {
      sessionId: 'session',
      attachments: Array.from({ length: 11 }, (_, index) => artifact(index + 1)),
    })
    const pending = runtime.view.commands.execute('draft.addAttachment', {
      sessionId: 'session',
      kind: 'image',
      upload,
    })
    expect(runtime.view.state.drafts.getSnapshot().session).toMatchObject({ uploading: 1, uploadError: null })
    await runtime.view.commands.execute('draft.setText', { sessionId: 'session', text: 'edited during upload' })
    await expect(
      runtime.view.commands.execute('draft.addAttachment', {
        sessionId: 'session',
        kind: 'image',
        upload: { ...upload, sourceId: 'second-source' },
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      runtime.view.commands.execute('draft.setAttachments', {
        sessionId: 'session',
        attachments: [...Array.from({ length: 11 }, (_, index) => artifact(index + 1)), artifact(12)],
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    finishUpload()
    const result = await pending
    expect(result.attachment).toEqual({
      kind: 'image',
      artifact: { id: upload.sha256, name: upload.name, mime: upload.mime, size: upload.size },
    })
    expect(runtime.view.state.drafts.getSnapshot().session).toMatchObject({
      text: 'edited during upload',
      uploading: 0,
      uploadError: null,
    })
    expect(runtime.view.state.drafts.getSnapshot().session!.attachments).toHaveLength(12)

    await runtime.view.commands.execute('draft.setAttachments', { sessionId: 'failed', attachments: [] })
    fail = true
    await expect(
      runtime.view.commands.execute('draft.addAttachment', { sessionId: 'failed', kind: 'image', upload }),
    ).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
    expect(runtime.view.state.drafts.getSnapshot().failed).toMatchObject({
      attachments: [],
      uploading: 0,
      uploadError: 'UPLOAD_FAILED',
    })
  } finally {
    runtime.dispose()
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
  let attachments: ReturnType<typeof createBrowserAttachmentController> | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const session = await kernel.createSession(workspace.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    const info = await client.pair(host.pairing.code, 'prompt draft test')
    attachments = createBrowserAttachmentController(client)
    runtime = createAppRuntime({
      instanceId: 'prompt-draft-test',
      hostId: info.instanceId,
      directory: createDirectoryQueryAdapter(client),
      run: createRunCommandClient(client),
      attachments: attachments.commands,
    })
    await runtime.view.commands.execute('draft.setText', { sessionId: session.id, text: 'hello from draft' })
    const selected = await attachments.prepare(new File(['attached'], 'notes.txt', { type: 'text/plain' }))
    const uploaded = await runtime.view.commands.execute('draft.addAttachment', {
      sessionId: session.id,
      kind: selected.kind,
      upload: selected.upload,
    })
    selected.release()
    const result = await runtime.view.commands.execute('run.submit', {
      sessionId: session.id,
      modelId: 'local-fixture',
      input: { text: 'hello from draft', images: [], files: [uploaded.attachment.artifact] },
    })
    expect(result.status).toBe('accepted')
    expect(runtime.view.state.drafts.getSnapshot()[session.id]).toMatchObject({ text: '', status: 'idle' })
    await kernel.waitForIdle()
    const stored = await kernel.snapshot(session.id)
    expect(stored.messages.some((message) => message.role === 'user' && message.content[0]?.type === 'text')).toBeTrue()
    expect(stored.messages.some((message) => message.content.some((block) => block.type === 'file'))).toBeTrue()
  } finally {
    runtime?.dispose()
    attachments?.dispose()
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
