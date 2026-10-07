import { describe, expect, test } from 'bun:test'
import { createPromptTemplates } from '../packages/app-runtime/src/prompt-templates'
import { promptTemplateSaveInputSchema, type PromptTemplate } from '@hbar/contracts/commands/prompt-templates'
import type { CommandExecutor } from '@hbar/commands'

const id = '00000000-0000-0000-0000-000000000001'
const template: PromptTemplate = {
  id,
  workspaceId: id,
  name: 'T',
  description: '',
  body: 'Hi {{name}}',
  variables: [{ id: 'name', label: 'Name', required: true }],
  revision: 1,
  createdAt: 0,
  updatedAt: 0,
}

describe('prompt templates runtime', () => {
  test('retains failed draft and rejects changed target without sending', async () => {
    let shouldFail = true
    let sent = 0
    const runtime = createPromptTemplates(
      {
        execute: async (name, _input) => {
          if (name === 'promptTemplate.save' && shouldFail) throw new Error('failed')
          return template
        },
      },
      () => undefined,
    )
    runtime.edit(template)
    runtime.updateDraft({ body: 'Changed {{name}}' })
    await expect(runtime.save()).rejects.toThrow('failed')
    expect(runtime.reader.getSnapshot().draft?.body).toBe('Changed {{name}}')
    shouldFail = false
    await runtime.save()
    const target = {
      kind: 'session' as const,
      id,
      readText: async () => ({ text: 'old' }),
      applyText: async (input: { expectedText: string }) => {
        if (input.expectedText !== 'original') throw new Error('changed')
        sent++
      },
    }
    await expect(runtime.apply(template, { name: 'Ada' }, target, 'append')).rejects.toThrow('changed')
    expect(sent).toBe(0)
    const applied: string[] = []
    await runtime.apply(
      template,
      { name: 'Ada' },
      {
        kind: 'session',
        id,
        readText: async () => ({ text: 'old' }),
        applyText: async (input) => {
          applied.push(input.text)
        },
      },
      'append',
    )
    expect(applied[0]).toBe('old\n\nHi Ada')
    runtime.dispose()
  })

  test('late workspace response cannot replace selected workspace and dispose fences updates', async () => {
    let resolveFirst!: (value: unknown) => void
    const runtime = createPromptTemplates(
      {
        execute: async (_name, rawInput) => {
          const input =
            typeof rawInput === 'object' && rawInput !== null && 'workspaceId' in rawInput
              ? String(rawInput.workspaceId)
              : ''
          if (input === id)
            return await new Promise((resolve) => {
              resolveFirst = resolve
            })
          return { items: [], nextCursor: null }
        },
      },
      () => undefined,
    )
    const first = runtime.list(id)
    await runtime.list('00000000-0000-0000-0000-000000000002')
    resolveFirst({ items: [template], nextCursor: null })
    await first
    expect(runtime.reader.getSnapshot().workspaceId).toBe('00000000-0000-0000-0000-000000000002')
    runtime.dispose()
  })

  test('serializes writes, preserves unknown receipt input, and accepts a receipt for its original workspace', async () => {
    let releaseSave!: (value: unknown) => void
    let saveCalls = 0
    let receiptAvailable = false
    const calls: Array<{ name: string; input: unknown; key?: string }> = []
    const execute: CommandExecutor['execute'] = async (name, rawInput, options) => {
      calls.push({ name, input: rawInput, ...(options?.idempotencyKey ? { key: options.idempotencyKey } : {}) })
      if (name === 'promptTemplate.save') {
        saveCalls++
        promptTemplateSaveInputSchema.parse(rawInput)
        if (saveCalls === 1)
          return await new Promise((resolve) => {
            releaseSave = resolve
          })
        throw new Error('unknown result')
      }
      if (name === 'promptTemplate.receipt') return receiptAvailable ? template : null
      if (name === 'promptTemplate.list') return { items: [], nextCursor: null }
      throw new Error(`unexpected command ${name}`)
    }
    const runtime = createPromptTemplates({ execute }, () => undefined)
    runtime.createDraft(id)
    runtime.updateDraft({
      name: 'Greeting',
      body: 'Hi {{name}}',
      variables: [{ id: 'name', label: 'Name', required: true }],
    })
    const first = runtime.save()
    await Promise.resolve()
    await expect(runtime.save()).rejects.toMatchObject({ code: 'BUSY' })
    releaseSave(template)
    await first

    runtime.createDraft(id)
    runtime.updateDraft({
      name: 'Greeting',
      body: 'Hi {{name}}',
      variables: [{ id: 'name', label: 'Name', required: true }],
    })
    await expect(runtime.save()).rejects.toThrow('unknown result')
    const unknown = runtime.reader.getSnapshot()
    expect(unknown.mutation).toBe('unknown')
    const pendingSave = calls.findLast((call) => call.name === 'promptTemplate.save')
    expect(pendingSave?.key).toBeString()
    expect(pendingSave?.input).toMatchObject({ workspaceId: id, body: 'Hi {{name}}' })
    await expect(runtime.reconcile()).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(calls.filter((call) => call.name === 'promptTemplate.save')).toHaveLength(2)
    receiptAvailable = true
    await runtime.list('00000000-0000-0000-0000-000000000002')
    await runtime.reconcile()
    expect(runtime.reader.getSnapshot().workspaceId).toBe('00000000-0000-0000-0000-000000000002')
    runtime.dispose()
  })

  test('disposed apply cannot write after a pending target read', async () => {
    let releaseRead!: (value: { text: string; revision: number }) => void
    let writes = 0
    const runtime = createPromptTemplates({ execute: async () => template }, () => undefined)
    const pending = runtime.apply(
      template,
      { name: 'Ada' },
      {
        kind: 'session',
        id,
        readText: async () =>
          await new Promise((resolve) => {
            releaseRead = resolve
          }),
        applyText: async () => {
          writes++
        },
      },
      'replace',
    )
    runtime.dispose()
    releaseRead({ text: 'old', revision: 2 })
    await expect(pending).rejects.toMatchObject({ code: 'DISPOSED' })
    expect(writes).toBe(0)
  })

  test('a malformed write reply remains unknown until its original receipt confirms without replay', async () => {
    let writes = 0
    const runtime = createPromptTemplates(
      {
        execute: async (name) => {
          if (name === 'promptTemplate.save') {
            writes++
            return { invalid: true }
          }
          if (name === 'promptTemplate.receipt') return template
          throw new Error(`unexpected command ${name}`)
        },
      },
      () => undefined,
    )
    runtime.edit(template)
    await expect(runtime.save()).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(runtime.reader.getSnapshot().mutation).toBe('unknown')
    await expect(runtime.save()).rejects.toMatchObject({ code: 'BUSY' })
    await runtime.reconcile()
    expect(runtime.reader.getSnapshot().mutation).toBe('succeeded')
    expect(runtime.reader.getSnapshot().selected?.id).toBe(template.id)
    expect(writes).toBe(1)
    runtime.dispose()
  })

  test.each(['duplicate', 'foreign'] as const)(
    'rejects an ambiguous %s template page before rendering actions',
    async (kind) => {
      const runtime = createPromptTemplates(
        {
          execute: async () => ({
            items:
              kind === 'duplicate'
                ? [template, { ...template, name: 'Another name' }]
                : [{ ...template, workspaceId: 'foreign-workspace' }],
            nextCursor: null,
          }),
        },
        () => undefined,
      )
      await expect(runtime.list(template.workspaceId, null)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(runtime.reader.getSnapshot().page).toBeNull()
      expect(runtime.reader.getSnapshot().status).toBe('error')
      runtime.dispose()
    },
  )
})
