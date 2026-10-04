import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { createPromptTemplateStorage, PROMPT_TEMPLATES_SQL } from '../packages/storage/src/prompt-templates'
import { promptTemplateSaveInputSchema, renderPromptTemplate } from '@hbar/contracts/commands/prompt-templates'

describe('prompt template storage', () => {
  test('persists, pages stably, enforces CAS and workspace ownership', () => {
    const db = new Database(':memory:')
    db.query('CREATE TABLE workspaces(id TEXT PRIMARY KEY)').run()
    db.query('INSERT INTO workspaces VALUES (?)').run('w1')
    db.exec(PROMPT_TEMPLATES_SQL)
    const storage = createPromptTemplateStorage(db)
    const first = storage.save({ workspaceId: 'w1', name: 'One', description: '', body: 'Hello', variables: [] })
    expect(first.revision).toBe(1)
    expect(storage.list({ workspaceId: 'w1', limit: 1 }).items).toHaveLength(1)
    expect(() => storage.save({ workspaceId: 'w1', id: first.id, name: 'missing-cas', description: '', body: 'x', variables: [] })).toThrow()
    expect(() => storage.save({ workspaceId: 'w1', id: first.id, expectedRevision: 0, name: 'bad', description: '', body: 'x', variables: [] })).toThrow()
    expect(() => storage.save({ workspaceId: 'w2', id: first.id, expectedRevision: 1, name: 'bad', description: '', body: 'x', variables: [] })).toThrow()
    expect(storage.delete({ workspaceId: 'w1', id: first.id, expectedRevision: 1 }).deleted).toBe(true)
    expect(() => storage.save({ workspaceId: 'w1', id: first.id, expectedRevision: 0, name: 'resurrect', description: '', body: 'x', variables: [] })).toThrow()
    db.close()
  })

  test('returns bounded stable pages and rejects invalid variable declarations', () => {
    const db = new Database(':memory:')
    db.query('CREATE TABLE workspaces(id TEXT PRIMARY KEY)').run()
    db.query('INSERT INTO workspaces VALUES (?)').run('w1')
    db.exec(PROMPT_TEMPLATES_SQL)
    const storage = createPromptTemplateStorage(db)
    for (let index = 0; index < 51; index++)
      storage.save({ workspaceId: 'w1', name: `Template ${index}`, description: '', body: `Body ${index}`, variables: [] })
    const first = storage.list({ workspaceId: 'w1', limit: 50 })
    expect(first.items).toHaveLength(50)
    expect(first.nextCursor).toMatch(/^\d+:\S+$/)
    const second = storage.list({ workspaceId: 'w1', after: first.nextCursor, limit: 50 })
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    expect(() =>
      promptTemplateSaveInputSchema.parse({
        workspaceId: 'w1',
        name: 'Duplicate',
        description: '',
        body: 'Hi {{name}}',
        variables: [
          { id: 'name', label: 'Name', required: true },
          { id: 'name', label: 'Name again', required: false },
        ],
      }),
    ).toThrow()
    expect(() =>
      promptTemplateSaveInputSchema.parse({ workspaceId: 'w1', name: 'Undeclared', description: '', body: 'Hi {{missing}}', variables: [] }),
    ).toThrow()
    db.close()
  })

  test('resolves defaults consistently and rejects empty required values', () => {
    const withDefault = {
      id: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      name: 'Defaults',
      description: '',
      body: 'Hello {{name}}',
      variables: [{ id: 'name', label: 'Name', required: true, defaultValue: 'Ada' }],
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    }
    expect(renderPromptTemplate(withDefault, { name: '  ' })).toBe('Hello Ada')
    expect(() => renderPromptTemplate({ ...withDefault, variables: [{ id: 'name', label: 'Name', required: true }], body: 'Hello {{name}}' }, { name: '  ' })).toThrow()
  })
})
