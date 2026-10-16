import { expect, test } from 'bun:test'
import { describeCommand, compileCommandParameterForm } from '@hbar/commands'
import { decisionCommands } from '@hbar/contracts/commands/decisions'
import { createAppRuntime } from '@hbar/app-runtime'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { createWebRuntimeCopy } from '../apps/web/src/runtime-copy'
import type { ShellLocale } from '../apps/web/src/shell-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('decision commands and their kind/status choices have host-owned copy in both locales', () => {
  const fields = compileCommandParameterForm(describeCommand(decisionCommands['decision.list'])).fields
  const kind = fields.find((field) => field.name === 'kind')
  const status = fields.find((field) => field.name === 'status')
  if (!kind || !status) throw new Error('Decision list fields must be available to the palette')
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const copy = getShellCopy(locale).commandPalette
    for (const id of ['decision.list', 'decision.get', 'decision.resolve']) {
      expect(copy.resolve(`commands.${id}.title`)).not.toContain('commands.')
      expect(copy.resolve(`commands.${id}.description`)).not.toContain('commands.')
    }
    expect(copy.category('run.decisions')).toBe(locale === 'zh-CN' ? '待决事项' : 'Decisions')
    expect(copy.option(kind, 'questionnaire')).toBe(locale === 'zh-CN' ? '问答' : 'Question')
    expect(copy.option(kind, 'plan_exit')).toBe(locale === 'zh-CN' ? '计划决定' : 'Plan decision')
    expect(copy.option(status, 'pending')).toBe(locale === 'zh-CN' ? '待处理' : 'Pending')
  }
})

test('localized search reindexes in place without querying a catalog or choosing a different command', async () => {
  let locale: ShellLocale = 'zh-CN'
  const copy = createWebRuntimeCopy(() => locale)
  const runtime = createAppRuntime({
    instanceId: 'palette-localized-search',
    hostId: 'test',
    commandText: copy.commandText,
    directory: { execute: () => Promise.resolve(null) },
  })
  try {
    await runtime.view.commands.execute('commandPalette.refresh', {})
    await runtime.view.commands.execute('commandPalette.setQuery', { query: '工程' })
    const original = runtime.view.state.commandPalette.getSnapshot()
    expect(original.visibleIds.length).toBeGreaterThan(0)
    locale = 'en-US'
    // A consumer may resolve copy first; that must not consume the change notification.
    copy.commandText.resolve('commands.workspace.open.title')
    copy.refresh()
    const changed = runtime.view.state.commandPalette.getSnapshot()
    expect(changed.query).toBe('工程')
    expect(changed.visibleIds).toEqual([])
    expect(changed.categories).toEqual([])
    expect(changed.selectedId).toBe(original.selectedId)
    expect(changed.items).toBe(original.items)
    expect(changed.draft).toBe(original.draft)
    expect(changed.execution).toBe(original.execution)
    copy.refresh()
    expect(runtime.view.state.commandPalette.getSnapshot()).toBe(changed)
    locale = 'zh-CN'
    copy.refresh()
    expect(runtime.view.state.commandPalette.getSnapshot().visibleIds).toEqual(original.visibleIds)
    runtime.dispose()
    const disposed = runtime.view.state.commandPalette.getSnapshot()
    locale = 'en-US'
    copy.refresh()
    expect(runtime.view.state.commandPalette.getSnapshot()).toBe(disposed)
  } finally {
    runtime.dispose()
  }
})

for (const outcome of ['succeeded', 'unknown'] as const) {
  test(`copy changes preserve parameter drafts, captured in-flight target and ${outcome} result/lock`, async () => {
    let locale: ShellLocale = 'zh-CN'
    const copy = createWebRuntimeCopy(() => locale)
    const descriptor = describeCommand(budgetCommands['session.setBudget'])
    const reply = Promise.withResolvers<unknown>()
    const started = Promise.withResolvers<void>()
    const calls: Readonly<Record<string, unknown>>[] = []
    let catalogReads = 0
    const runtime = createAppRuntime({
      instanceId: `palette-language-${outcome}`,
      hostId: 'test',
      commandText: copy.commandText,
      directory: { execute: () => Promise.resolve(null) },
      commandCatalog: {
        list: () => {
          catalogReads++
          return Promise.resolve({ revision: 1, items: [descriptor] })
        },
        execute: (_command, input) => {
          calls.push(input)
          started.resolve()
          return reply.promise
        },
      },
    })
    try {
      await runtime.view.commands.execute('commandPalette.refresh', {})
      await runtime.view.commands.execute('commandPalette.setQuery', {
        query: copy.commandText.resolve(descriptor.metadata.titleKey),
      })
      await runtime.view.commands.execute('commandPalette.openCommand', { commandId: descriptor.metadata.id })
      await runtime.view.commands.execute('commandPalette.setParameter', {
        field: 'sessionId',
        value: 'captured-original-session',
      })
      await runtime.view.commands.execute('commandPalette.setParameter', { field: 'tokens', value: '777' })
      const draft = runtime.view.state.commandPalette.getSnapshot().draft
      locale = 'en-US'
      copy.refresh()
      expect(runtime.view.state.commandPalette.getSnapshot()).toMatchObject({
        view: 'parameters',
        selectedId: descriptor.metadata.id,
      })
      expect(runtime.view.state.commandPalette.getSnapshot().draft).toBe(draft)
      const execute = runtime.view.commands.execute('commandPalette.execute', {})
      const settled = execute.then(
        () => null,
        (error: unknown) => error,
      )
      await started.promise
      const submitting = runtime.view.state.commandPalette.getSnapshot().execution
      locale = 'zh-CN'
      copy.refresh()
      expect(runtime.view.state.commandPalette.getSnapshot().execution).toBe(submitting)
      expect(calls).toEqual([{ sessionId: 'captured-original-session', tokens: 777 }])
      if (outcome === 'unknown') reply.reject(Object.assign(new Error('Lost test reply'), { code: 'RESULT_UNKNOWN' }))
      else reply.resolve({ status: 'succeeded', budget: { limit: 777 } })
      await settled
      const before = runtime.view.state.commandPalette.getSnapshot()
      expect(before.execution.status).toBe(outcome)
      locale = 'en-US'
      copy.refresh()
      const after = runtime.view.state.commandPalette.getSnapshot()
      expect(after.view).toBe(before.view)
      expect(after.selectedId).toBe(before.selectedId)
      expect(after.draft).toBe(before.draft)
      expect(after.execution).toBe(before.execution)
      expect(after.sensitiveResetRevision).toBe(before.sensitiveResetRevision)
      if (outcome === 'unknown')
        await expect(runtime.view.commands.execute('commandPalette.execute', {})).rejects.toMatchObject({
          code: 'RESULT_UNKNOWN',
        })
      expect(calls).toHaveLength(1)
      expect(catalogReads).toBe(1)
    } finally {
      reply.resolve(null)
      runtime.dispose()
    }
  })
}
