import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import {
  draftCommands,
  type PromptAttachment,
  type PromptMention,
  type PromptWorkspaceContextInput,
} from '@hbar/contracts/commands/draft'
import type { Message } from '@hbar/contracts'
import { createDrafts } from '../packages/app-runtime/src/drafts'

const mention: PromptMention = {
  start: 4,
  end: 13,
  label: 'entry.ts',
  path: 'src/entry.ts',
  workspaceId: 'workspace',
  directory: false,
}
const attachment: PromptAttachment = {
  kind: 'file',
  artifact: { id: 'a'.repeat(64), name: 'notes.txt', mime: 'text/plain', size: 5 },
}
const sourceComment: PromptWorkspaceContextInput = {
  kind: 'source-comment',
  workspaceId: 'workspace',
  path: 'src/entry.ts',
  lineStart: 4,
  lineEnd: 4,
  quote: 'const marker = ```quoted```',
  sha256: 'b'.repeat(64),
  note: 'Keep this excerpt attached to the draft.',
}

test('workspace context is revisioned, deduplicated, serialized beside the mention and removable without losing attachments', async () => {
  const local = new CommandRegistry()
  const drafts = createDrafts(
    local,
    undefined,
    undefined,
    () => {},
    () => false,
  )
  try {
    await local.execute('draft.setContent', {
      sessionId: 'session',
      text: 'See @entry.ts',
      mentions: [mention],
      expectedRevision: 0,
    })
    await local.execute('draft.setAttachments', {
      sessionId: 'session',
      attachments: [attachment],
      expectedRevision: 1,
    })
    const added = draftCommands['draft.addWorkspaceContext'].output.parse(
      await local.execute('draft.addWorkspaceContext', {
        sessionId: 'session',
        context: sourceComment,
        expectedRevision: 2,
      }),
    )
    expect(added).toMatchObject({ revision: 3, added: true, context: sourceComment })

    const duplicate = draftCommands['draft.addWorkspaceContext'].output.parse(
      await local.execute('draft.addWorkspaceContext', {
        sessionId: 'session',
        context: sourceComment,
        expectedRevision: 3,
      }),
    )
    expect(duplicate).toMatchObject({ revision: 3, added: false, context: { id: added.context.id } })
    await expect(
      local.execute('draft.addWorkspaceContext', {
        sessionId: 'session',
        context: sourceComment,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })

    const modelText = drafts.serializeSubmission('session', 3, 'workspace', 'See @entry.ts')
    expect(modelText).toContain('See @"src/entry.ts"')
    expect(modelText).toContain('Referenced workspace context:')
    expect(modelText).toContain('Comment: Keep this excerpt attached to the draft.')
    expect(modelText).toContain('````\nconst marker = ```quoted```\n````')
    expect(drafts.serializeGoalObjective('session', 3, 'workspace', 'See @entry.ts')).toBe('See @"src/entry.ts"')
    expect(() => drafts.serializeGoalObjective('session', 3, 'workspace', 'changed text')).toThrow(
      'session draft changed before Goal validation',
    )

    await local.execute('draft.removeWorkspaceContext', {
      sessionId: 'session',
      contextId: added.context.id,
      expectedRevision: 3,
    })
    expect(drafts.reader.getSnapshot().session).toMatchObject({
      text: 'See @entry.ts',
      mentions: [mention],
      workspaceContexts: [],
      attachments: [attachment],
    })
  } finally {
    drafts.dispose()
    local.dispose()
  }
})

test('workspace context cannot smuggle an unsafe path into model input', async () => {
  const local = new CommandRegistry()
  const drafts = createDrafts(
    local,
    undefined,
    undefined,
    () => {},
    () => false,
  )
  try {
    await expect(
      local.execute('draft.addWorkspaceContext', {
        sessionId: 'session',
        expectedRevision: 0,
        context: { ...sourceComment, path: '../outside.ts' },
      }),
    ).rejects.toBeInstanceOf(CommandError)
    expect(drafts.reader.getSnapshot().session?.workspaceContexts ?? []).toEqual([])
  } finally {
    drafts.dispose()
    local.dispose()
  }
})

test('conversation selection uses a loaded authored-message snapshot, deduplicates and serializes with a safe chat address', async () => {
  const local = new CommandRegistry()
  const message: Message = {
    id: 'message/one',
    sessionId: 'target',
    runId: 'run',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Hello **world**' },
      { type: 'thinking', text: 'private reasoning' },
      { type: 'file', artifact: { id: 'f'.repeat(64), name: 'secret.txt', mime: 'text/plain', size: 6 } },
      { type: 'text', text: 'Second paragraph' },
      { type: 'tool_call', callId: 'call', name: 'private_tool', args: { token: 'hidden' } },
      { type: 'tool_result', callId: 'call', name: 'private_tool', text: 'hidden result', isError: false },
    ],
    seq: 1,
    createdAt: 1,
  }
  const drafts = createDrafts(
    local,
    undefined,
    undefined,
    () => {},
    () => false,
    undefined,
    undefined,
    (sessionId, messageId) => (sessionId === 'target' && messageId === message.id ? message : null),
  )
  try {
    await local.execute('draft.setText', { sessionId: 'target', text: 'Review this reply' })
    const added = draftCommands['draft.addConversationSelection'].output.parse(
      await local.execute('draft.addConversationSelection', {
        sessionId: 'target',
        messageId: message.id,
        expectedText: 'Hello **world**\n\nSecond paragraph',
        quote: 'world',
        expectedRevision: 1,
      }),
    )
    expect(added).toMatchObject({
      revision: 2,
      added: true,
      context: {
        kind: 'chat-selection',
        sourceSessionId: 'target',
        messageId: 'message/one',
        sourceRole: 'assistant',
        quote: 'world',
      },
    })

    const duplicate = await local.execute('draft.addConversationSelection', {
      sessionId: 'target',
      messageId: message.id,
      expectedText: 'Hello **world**\n\nSecond paragraph',
      quote: 'world',
      expectedRevision: 2,
    })
    expect(duplicate).toMatchObject({ revision: 2, added: false, context: { id: added.context.id } })

    const modelText = drafts.serializeSubmission('target', 2, 'destination', 'Review this reply')
    expect(modelText).toContain('Referenced chat context:')
    expect(modelText).toContain('chat://target/assistant/message%2Fone:')
    expect(modelText).toContain('```\nworld\n```')
    expect(modelText).not.toContain('private reasoning')
    expect(modelText).not.toContain('secret.txt')
    expect(modelText).not.toContain('private_tool')
    expect(modelText).not.toContain('hidden result')

    await expect(
      local.execute('draft.addWorkspaceContext', {
        sessionId: 'target',
        context: {
          kind: 'chat-selection',
          sourceSessionId: 'source/session',
          messageId: message.id,
          sourceRole: 'assistant',
          quote: 'bypass',
        },
        expectedRevision: 2,
      }),
    ).rejects.toBeInstanceOf(CommandError)
    expect(drafts.reader.getSnapshot().target?.revision).toBe(2)

    await expect(
      local.execute('draft.addConversationSelection', {
        sessionId: 'target',
        messageId: message.id,
        expectedText: 'stale authored source',
        quote: 'world',
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(drafts.reader.getSnapshot().target?.revision).toBe(2)

    const atCapacity = [
      added.context,
      ...Array.from({ length: 11 }, (_, index) => ({
        ...added.context,
        id: crypto.randomUUID(),
        messageId: `other-message-${index}`,
        quote: `other quote ${index}`,
      })),
    ]
    await local.execute('draft.setWorkspaceContexts', {
      sessionId: 'target',
      workspaceContexts: atCapacity,
      expectedRevision: 2,
    })
    await expect(
      local.execute('draft.addConversationSelection', {
        sessionId: 'target',
        messageId: message.id,
        expectedText: 'Hello **world**\n\nSecond paragraph',
        quote: 'a second selection from the same message',
        expectedRevision: 3,
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(drafts.reader.getSnapshot().target).toMatchObject({ revision: 3, workspaceContexts: atCapacity })
  } finally {
    drafts.dispose()
    local.dispose()
  }
})

test('conversation selection rejects messages outside user and assistant roles', async () => {
  const local = new CommandRegistry()
  const message: Message = {
    id: 'tool-message',
    sessionId: 'target',
    runId: 'run',
    role: 'tool',
    content: [{ type: 'text', text: 'tool output is not selectable context' }],
    seq: 1,
    createdAt: 1,
  }
  const drafts = createDrafts(
    local,
    undefined,
    undefined,
    () => {},
    () => false,
    undefined,
    undefined,
    () => message,
  )
  try {
    await expect(
      local.execute('draft.addConversationSelection', {
        sessionId: 'target',
        messageId: message.id,
        expectedText: 'tool output is not selectable context',
        quote: 'tool output',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(drafts.reader.getSnapshot().target).toBeUndefined()
  } finally {
    drafts.dispose()
    local.dispose()
  }
})
