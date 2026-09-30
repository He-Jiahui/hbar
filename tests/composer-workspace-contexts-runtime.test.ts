import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry } from '@hbar/commands'
import {
  draftCommands,
  type PromptAttachment,
  type PromptMention,
  type PromptWorkspaceContextInput,
} from '@hbar/contracts/commands/draft'
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
