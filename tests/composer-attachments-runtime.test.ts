import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { AttachmentUploadInput } from '@hbar/contracts/commands/files'
import { directoryCommands } from '@hbar/contracts/commands'
import type { PromptAttachment } from '@hbar/contracts/commands/draft'
import { addComposerAttachments } from '../packages/app-react/src/composer-attachment-input'

const descriptor: AttachmentUploadInput = {
  sourceId: 'source',
  sha256: 'a'.repeat(64),
  name: 'notes.txt',
  mime: 'text/plain',
  size: 4,
}
const artifact = { id: descriptor.sha256, name: descriptor.name, mime: descriptor.mime, size: descriptor.size }
const directory = {
  async execute(name: string, input: unknown) {
    if (name === 'workspace.list' || name === 'session.list') return { items: [], nextCursor: null }
    if (name === 'session.get') {
      const { sessionId } = directoryCommands['session.get'].input.parse(input)
      return {
        id: sessionId,
        workspaceId: 'workspace',
        title: sessionId,
        archived: false,
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
        seq: 1,
      }
    }
    throw new Error(name)
  },
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function setup(attachments?: CommandExecutor, files?: CommandExecutor) {
  return createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'host',
    directory,
    ...(attachments ? { attachments } : {}),
    ...(files ? { files } : {}),
  })
}
async function reserve(runtime: ReturnType<typeof setup>, name = descriptor.name, sessionId = 'one') {
  const revision = runtime.view.state.drafts.getSnapshot()[sessionId]?.revision ?? 0
  const result = await runtime.view.commands.execute('draft.reserveAttachments', {
    sessionId,
    expectedRevision: revision,
    files: [{ name, mime: descriptor.mime, size: descriptor.size }],
  })
  const token = result.reservations[0]!
  return { sessionId, reservationId: token.reservationId, ownerRevision: token.ownerRevision }
}

test('reservation owns all twelve slots before preparation, rejects stale revisions and never slices over-capacity intake', async () => {
  const runtime = setup()
  try {
    const files = Array.from({ length: 12 }, (_, index) => ({ name: `${index}.txt`, mime: 'text/plain', size: 1 }))
    await runtime.view.commands.execute('draft.reserveAttachments', { sessionId: 'one', expectedRevision: 0, files })
    expect(runtime.view.state.drafts.getSnapshot().one?.attachmentTransfers).toHaveLength(12)
    expect(runtime.view.state.drafts.getSnapshot().one?.uploading).toBe(12)
    await expect(reserve(runtime)).rejects.toMatchObject({ code: 'ATTACHMENT_LIMIT' })
    await expect(
      runtime.view.commands.execute('draft.reserveAttachments', {
        sessionId: 'one',
        expectedRevision: 0,
        files: files.slice(0, 1),
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    let prepares = 0
    await addComposerAttachments(
      runtime.view,
      { sessionId: 'two', revision: 0 },
      Array.from({ length: 13 }, (_, index) => new File(['x'], `${index}.txt`)),
      async () => {
        prepares++
        throw new Error('must not prepare')
      },
    )
    expect(prepares).toBe(0)
    expect(runtime.view.state.drafts.getSnapshot().two).toMatchObject({
      uploadError: 'ATTACHMENT_LIMIT',
      attachments: [],
      attachmentTransfers: [],
    })
  } finally {
    runtime.dispose()
  }
})

test('late upload merges original session with newer text and removal uses current revision', async () => {
  const held = deferred()
  const runtime = setup({
    async execute() {
      await held.promise
      return artifact
    },
  })
  try {
    const target = await reserve(runtime)
    const pending = runtime.view.commands.execute('draft.uploadAttachment', {
      ...target,
      kind: 'file',
      upload: descriptor,
    })
    await runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'typed while uploading' })
    await runtime.view.commands.execute('draft.setText', { sessionId: 'two', text: 'unrelated' })
    await expect(runtime.view.commands.execute('draft.removeAttachmentTransfer', target)).rejects.toMatchObject({
      code: 'BUSY',
    })
    held.resolve()
    await pending
    const draft = runtime.view.state.drafts.getSnapshot().one!
    expect(draft).toMatchObject({
      text: 'typed while uploading',
      attachments: [{ kind: 'file', artifact }],
      attachmentTransfers: [],
      uploading: 0,
    })
    expect(runtime.view.state.drafts.getSnapshot().two?.attachments).toHaveLength(0)
    await expect(
      runtime.view.commands.execute('draft.removeAttachment', {
        sessionId: 'one',
        expectedRevision: draft.revision - 1,
        kind: 'file',
        artifactId: artifact.id,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await runtime.view.commands.execute('draft.removeAttachment', {
      sessionId: 'one',
      expectedRevision: draft.revision,
      kind: 'file',
      artifactId: artifact.id,
    })
    expect(runtime.view.state.drafts.getSnapshot().one).toMatchObject({
      text: 'typed while uploading',
      attachments: [],
    })
  } finally {
    runtime.dispose()
  }
})

for (const code of ['RESULT_UNKNOWN', 'CONNECTION_CLOSED', 'EXECUTION_FAILED', 'CANCELLED', 'INVALID_OUTPUT']) {
  test(`uncertain ${code} retains SHA/owner and reconciles without another upload`, async () => {
    let writes = 0
    const reads: unknown[] = []
    const runtime = setup(
      {
        async execute() {
          writes++
          if (code === 'EXECUTION_FAILED') throw new Error('response lost')
          throw new CommandError(code, 'response lost')
        },
      },
      {
        async execute(name, input) {
          expect(name).toBe('attachment.query')
          reads.push(input)
          return { ...artifact, name: 'old-content-alias.txt' }
        },
      },
    )
    try {
      const target = await reserve(runtime)
      await expect(
        runtime.view.commands.execute('draft.uploadAttachment', { ...target, kind: 'file', upload: descriptor }),
      ).rejects.toBeDefined()
      expect(runtime.view.state.drafts.getSnapshot().one?.attachmentTransfers[0]).toMatchObject({
        id: target.reservationId,
        status: 'unknown',
        upload: descriptor,
      })
      await expect(
        runtime.view.commands.execute('draft.uploadAttachment', { ...target, kind: 'file', upload: descriptor }),
      ).rejects.toMatchObject({ code: 'BUSY' })
      await expect(runtime.view.commands.execute('draft.removeAttachmentTransfer', target)).rejects.toMatchObject({
        code: 'BUSY',
      })
      await expect(reserve(runtime, 'second.txt')).rejects.toMatchObject({ code: 'BUSY' })
      await runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'keep this' })
      await runtime.view.commands.execute('draft.reconcileAttachment', target)
      expect(writes).toBe(1)
      expect(reads).toEqual([{ artifactId: descriptor.sha256 }])
      expect(runtime.view.state.drafts.getSnapshot().one).toMatchObject({
        text: 'keep this',
        attachments: [{ kind: 'file', artifact }],
        attachmentTransfers: [],
      })
    } finally {
      runtime.dispose()
    }
  })
}

test('not-found and content-mismatch reads stay unknown, preserving the exact pending descriptor', async () => {
  let mismatch = false
  const runtime = setup(
    {
      async execute() {
        throw new CommandError('TIMEOUT', 'lost')
      },
    },
    {
      async execute() {
        if (!mismatch) throw new CommandError('NOT_FOUND', 'not visible yet')
        return { ...artifact, size: artifact.size + 1 }
      },
    },
  )
  try {
    const target = await reserve(runtime)
    await runtime.view.commands
      .execute('draft.uploadAttachment', { ...target, kind: 'file', upload: descriptor })
      .catch(() => {})
    await expect(runtime.view.commands.execute('draft.reconcileAttachment', target)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    mismatch = true
    await expect(runtime.view.commands.execute('draft.reconcileAttachment', target)).rejects.toMatchObject({
      code: 'CONTENT_MISMATCH',
    })
    expect(runtime.view.state.drafts.getSnapshot().one).toMatchObject({
      attachments: [],
      attachmentTransfers: [{ status: 'unknown', upload: descriptor }],
    })
  } finally {
    runtime.dispose()
  }
})

test('known rejection is local and removable without clearing text or confirmed materials', async () => {
  const runtime = setup({
    async execute() {
      throw new CommandError('UNSUPPORTED_TYPE', 'type rejected')
    },
  })
  try {
    await runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'keep text' })
    const target = await reserve(runtime)
    await expect(
      runtime.view.commands.execute('draft.uploadAttachment', { ...target, kind: 'file', upload: descriptor }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' })
    expect(runtime.view.state.drafts.getSnapshot().one?.attachmentTransfers[0]).toMatchObject({
      status: 'failed',
      error: 'UNSUPPORTED_TYPE',
    })
    await runtime.view.commands.execute('draft.removeAttachmentTransfer', target)
    expect(runtime.view.state.drafts.getSnapshot().one).toMatchObject({
      text: 'keep text',
      attachmentTransfers: [],
      uploading: 0,
    })
  } finally {
    runtime.dispose()
  }
})

test('remove during hash preparation prevents upload and releases the source when it eventually completes', async () => {
  const held = deferred()
  const preparing = deferred()
  let writes = 0
  let releases = 0
  const runtime = setup({
    async execute() {
      writes++
      return artifact
    },
  })
  try {
    const adding = addComposerAttachments(
      runtime.view,
      { sessionId: 'one', revision: 0 },
      [new File(['data'], 'notes.txt', { type: 'text/plain' })],
      async () => {
        preparing.resolve()
        await held.promise
        return {
          kind: 'file',
          upload: descriptor,
          release() {
            releases++
          },
        }
      },
    )
    await preparing.promise
    const item = runtime.view.state.drafts.getSnapshot().one?.attachmentTransfers[0]
    expect(item?.status).toBe('preparing')
    await runtime.view.commands.execute('draft.removeAttachmentTransfer', {
      sessionId: 'one',
      reservationId: item!.id,
      ownerRevision: item!.ownerRevision,
    })
    held.resolve()
    await adding
    expect(writes).toBe(0)
    expect(releases).toBe(1)
    expect(runtime.view.state.drafts.getSnapshot().one).toMatchObject({ attachments: [], attachmentTransfers: [] })
  } finally {
    runtime.dispose()
  }
})

test('preparation failure and invalid files keep named recovery rows; cancelled picker is a no-op', async () => {
  const runtime = setup()
  try {
    await addComposerAttachments(runtime.view, { sessionId: 'one', revision: 0 }, [], async () => {
      throw new Error('should not run')
    })
    expect(runtime.view.state.drafts.getSnapshot().one).toBeUndefined()
    await addComposerAttachments(
      runtime.view,
      { sessionId: 'one', revision: 0 },
      [new File(['data'], 'notes.txt')],
      async () => {
        throw new CommandError('SOURCE_NOT_FOUND', 'expired')
      },
    )
    expect(runtime.view.state.drafts.getSnapshot().one?.attachmentTransfers[0]).toMatchObject({
      name: 'notes.txt',
      status: 'failed',
      error: 'SOURCE_NOT_FOUND',
    })
    let prepares = 0
    await addComposerAttachments(
      runtime.view,
      { sessionId: 'two', revision: 0 },
      [new File([], 'empty.txt')],
      async () => {
        prepares++
        throw new Error('should not run')
      },
    )
    expect(prepares).toBe(0)
    expect(runtime.view.state.drafts.getSnapshot().two?.attachmentTransfers[0]).toMatchObject({
      name: 'empty.txt',
      status: 'failed',
      error: 'FILE_LIMIT',
    })
    await addComposerAttachments(
      runtime.view,
      { sessionId: 'three', revision: 0 },
      [new File(['data'], 'unreadable.txt')],
      async () => {
        throw new Error('local read failed')
      },
    )
    expect(runtime.view.state.drafts.getSnapshot().three?.attachmentTransfers[0]).toMatchObject({
      status: 'failed',
      error: 'PREPARATION_FAILED',
    })
  } finally {
    runtime.dispose()
  }
})

test('an accepted Run is a new generation: late artifact waits for explicit acceptance into the current draft', async () => {
  const held = deferred()
  const runtime = createAppRuntime({
    instanceId: 'new-generation',
    hostId: 'host',
    directory,
    attachments: {
      async execute() {
        await held.promise
        return artifact
      },
    },
    run: {
      async execute(_command, _input, options) {
        return {
          status: 'accepted',
          commandId: 'run.submit',
          commandVersion: 1,
          requestId: 'request',
          idempotencyKey: options?.idempotencyKey,
          operationId: 'new-run',
          sessionId: 'one',
          acceptedAt: 1,
        }
      },
      async getReceipt() {
        return null
      },
    },
  })
  try {
    await runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'old prompt' })
    const target = await reserve(runtime)
    const uploading = runtime.view.commands.execute('draft.uploadAttachment', {
      ...target,
      kind: 'file',
      upload: descriptor,
    })
    // A public command caller can still submit independently of the composer's disabled button.
    await runtime.view.commands.execute('run.submit', {
      sessionId: 'one',
      modelId: 'model',
      input: { text: 'old prompt', images: [], files: [] },
    })
    await runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'new draft' })
    held.resolve()
    await uploading
    const current = runtime.view.state.drafts.getSnapshot().one!
    expect(current).toMatchObject({
      text: 'new draft',
      attachments: [],
      attachmentTransfers: [{ status: 'ready', confirmed: { kind: 'file', artifact }, originalOperationId: null }],
    })
    await runtime.view.commands.execute('draft.acceptReadyAttachment', {
      ...target,
      expectedRevision: current.revision,
    })
    expect(runtime.view.state.drafts.getSnapshot().one).toMatchObject({
      text: 'new draft',
      attachments: [{ kind: 'file', artifact }],
      attachmentTransfers: [],
    })
  } finally {
    runtime.dispose()
  }
})

for (const fileFirst of [true, false]) {
  test(`an accepted mixed-material Run clears the matching draft (${fileFirst ? 'file then image' : 'image then file'})`, async () => {
    const image = { id: 'b'.repeat(64), name: 'reference.png', mime: 'image/png', size: 8 }
    const fileAttachment: PromptAttachment = { kind: 'file', artifact }
    const imageAttachment: PromptAttachment = { kind: 'image', artifact: image }
    const runtime = createAppRuntime({
      instanceId: crypto.randomUUID(),
      hostId: 'host',
      directory,
      run: {
        async execute(_command, _input, options) {
          return {
            status: 'accepted',
            commandId: 'run.submit',
            commandVersion: 1,
            requestId: 'request',
            idempotencyKey: options?.idempotencyKey,
            operationId: 'mixed-material-run',
            sessionId: 'one',
            acceptedAt: 1,
          }
        },
        async getReceipt() {
          return null
        },
      },
    })
    try {
      await runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'Review both materials' })
      await runtime.view.commands.execute('draft.setAttachments', {
        sessionId: 'one',
        attachments: fileFirst ? [fileAttachment, imageAttachment] : [imageAttachment, fileAttachment],
      })
      await runtime.view.commands.execute('run.submit', {
        sessionId: 'one',
        modelId: 'model',
        input: { text: 'Review both materials', images: [image], files: [artifact] },
      })
      expect(runtime.view.state.drafts.getSnapshot().one).toMatchObject({
        text: '',
        attachments: [],
        status: 'idle',
        lastOperationId: 'mixed-material-run',
      })
    } finally {
      runtime.dispose()
    }
  })
}
