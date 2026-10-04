import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime, type ClientJsonValue, type ClientLayoutState } from '@hbar/app-runtime'
import { saveSidebarWidth, saveToolPaneWidth, type ToolPaneLayoutPort } from '../apps/web/src/tool-pane-layout'
import { sidebarLayoutCopy } from '../apps/web/src/sidebar-layout-copy'
import { ToolPaneLayoutFeedback } from '../apps/web/src/ToolPaneLayoutFeedback'
import {
  normalizeShellLayout,
  shellLayout,
  shellLayoutModule,
  withSidebarWidth,
  type ShellLayoutDescription,
} from '../apps/web/src/shell-layout'

function snapshot(overrides: Partial<ClientLayoutState> = {}): ClientLayoutState {
  return {
    status: 'ready',
    revision: 7,
    source: 'saved',
    persisted: true,
    description: structuredClone(shellLayout),
    restoreError: null,
    ...overrides,
  }
}

test('sidebar width changes only its descriptor module, including exact minimum and maximum', () => {
  const original = structuredClone(shellLayout)
  shellLayoutModule(original, 'session-tool').size.preferredRem = 31
  shellLayoutModule(original, 'projects').visible = false
  for (const width of [12, 12.01, 17, 23.99, 24]) {
    const next = withSidebarWidth(original, width)
    expect(shellLayoutModule(next, 'projects')).toMatchObject({ visible: false, size: { preferredRem: width } })
    expect(shellLayoutModule(next, 'session-tool')).toEqual(shellLayoutModule(original, 'session-tool'))
    expect(shellLayoutModule(next, 'workspace')).toEqual(shellLayoutModule(original, 'workspace'))
  }
  for (const width of [11.99, 24.01, 0, Number.NaN, Infinity, -Infinity])
    expect(() => withSidebarWidth(original, width)).toThrow()
  expect(shellLayoutModule(original, 'projects').size.preferredRem).toBe(17)
})

test('sidebar save captures a revision and does not alter a newer selection or tool width', async () => {
  let current = snapshot()
  const saved: { description: ShellLayoutDescription; revision: number }[] = []
  const pending = Promise.withResolvers<{ persisted: boolean }>()
  const request = saveSidebarWidth(
    {
      read: () => current,
      commit: (description, revision) => {
        saved.push({ description, revision })
        return pending.promise
      },
    },
    21.5,
  )
  current = snapshot({ revision: 8 })
  expect(saved).toHaveLength(1)
  expect(saved[0]?.revision).toBe(7)
  expect(shellLayoutModule(saved[0]!.description, 'projects').size.preferredRem).toBe(21.5)
  expect(shellLayoutModule(saved[0]!.description, 'session-tool')).toEqual(
    shellLayoutModule(shellLayout, 'session-tool'),
  )
  pending.resolve({ persisted: true })
  await request
  expect(current.revision).toBe(8)
})

test('unread, failed restore and malformed sidebar width cannot write preferences', async () => {
  let writes = 0
  const commit = async () => {
    writes++
    return { persisted: true }
  }
  for (const current of [snapshot({ status: 'loading' }), snapshot({ restoreError: 'INVALID_PERSISTED_STATE' })])
    await expect(saveSidebarWidth({ read: () => current, commit }, 20)).rejects.toMatchObject({
      code: 'PERSISTENCE_RESTORE_FAILED',
    })
  for (const width of [11.9, 24.1, Number.NaN, Infinity])
    await expect(saveSidebarWidth({ read: () => snapshot(), commit }, width)).rejects.toBeDefined()
  expect(writes).toBe(0)
})

test('manual sidebar retry merges only original width into the latest layout after a conflict', async () => {
  let current = snapshot()
  let attempts = 0
  const changes: ShellLayoutDescription[] = []
  const port: ToolPaneLayoutPort = {
    read: () => current,
    commit: async (description, revision) => {
      attempts++
      if (attempts === 1) throw new CommandError('COMMAND_CONFLICT', 'Layout changed')
      expect(revision).toBe(9)
      changes.push(description)
      return { persisted: true }
    },
  }
  await expect(saveSidebarWidth(port, 20)).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
  expect(attempts).toBe(1)
  const newer = structuredClone(shellLayout)
  shellLayoutModule(newer, 'projects').visible = false
  shellLayoutModule(newer, 'session-tool').size.preferredRem = 30
  current = snapshot({ revision: 9, description: newer })
  await saveSidebarWidth(port, 20)
  expect(attempts).toBe(2)
  expect(shellLayoutModule(changes[0]!, 'projects')).toMatchObject({ visible: false, size: { preferredRem: 20 } })
  expect(shellLayoutModule(changes[0]!, 'session-tool').size.preferredRem).toBe(30)
})

test('sidebar local-only result remains a persistence error', async () => {
  await expect(
    saveSidebarWidth({ read: () => snapshot(), commit: async () => ({ persisted: false }) }, 20),
  ).rejects.toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' })
})

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`sidebar feedback has localized saving/error/retry and no tool feedback identity: ${locale}`, () => {
    const labels = sidebarLayoutCopy(locale)
    const commit = async () => undefined
    expect(labels.width(23.123)).toContain('23.12')
    expect(labels.resize).not.toBe(labels.reset)
    for (const status of ['saving', 'failed'] as const) {
      const html = renderToStaticMarkup(
        createElement(ToolPaneLayoutFeedback, {
          surface: 'sidebar',
          labels: { ...labels, retry: `${labels.retry} ${'较长说明 '.repeat(12)}` },
          controller: {
            disabled: status === 'saving',
            receipt: { status, target: 'original-host', widthRem: 23, code: 'COMMAND_CONFLICT' },
            commit,
          },
        }),
      )
      expect(html).toContain(`data-sidebar-layout-status="${status}"`)
      expect(html).not.toContain('data-tool-layout-status')
      expect(html).not.toContain('original-host')
      expect(html).not.toContain('COMMAND_CONFLICT')
      expect(html).toContain(status === 'saving' ? labels.saving : labels.failed('COMMAND_CONFLICT'))
      expect(html).toContain(status === 'saving' ? 'role="status"' : 'role="alert"')
      if (status === 'failed') expect(html).toContain(labels.retry)
      else expect(html).not.toContain('<button')
    }
  })

test('sidebar and tool share real layout CAS, with failure recovery, reload and host isolation', async () => {
  const values = new Map<string, ClientJsonValue>()
  let failWrite = false
  const directory: CommandExecutor = {
    execute: (name) =>
      Promise.resolve(name === 'workspace.list' || name === 'session.list' ? { items: [], nextCursor: null } : null),
  }
  const persistence = {
    read: (key: string) => Promise.resolve(values.get(key) ?? null),
    write: (key: string, value: ClientJsonValue) => {
      if (failWrite) return Promise.reject(new Error('Fixture storage unavailable'))
      values.set(key, value)
      return Promise.resolve()
    },
    remove: (key: string) => {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const create = (hostId: string) =>
    createAppRuntime({
      instanceId: crypto.randomUUID(),
      hostId,
      directory,
      persistence,
      defaultLayout: shellLayout,
      layoutDescription: { normalize: normalizeShellLayout },
    })
  const runtime = create('sidebar-original')
  const port: ToolPaneLayoutPort = {
    read: runtime.view.state.layout.getSnapshot,
    commit: (description, expectedRevision) =>
      runtime.view.commands.execute('layout.commit', { description, expectedRevision }),
  }
  try {
    await runtime.ready
    failWrite = true
    await expect(saveSidebarWidth(port, 22)).rejects.toBeDefined()
    expect(port.read().revision).toBe(0)
    expect(shellLayoutModule(normalizeShellLayout(port.read().description), 'projects').size.preferredRem).toBe(17)
    failWrite = false
    const parallel = await Promise.allSettled([saveSidebarWidth(port, 22), saveToolPaneWidth(port, 31)])
    expect(parallel[0]?.status).toBe('fulfilled')
    expect(parallel[1]).toMatchObject({ status: 'rejected', reason: { code: 'COMMAND_CONFLICT' } })
    await saveToolPaneWidth(port, 31)
    expect(port.read().revision).toBe(2)
    const restored = create('sidebar-original')
    const other = create('sidebar-other')
    try {
      await Promise.all([restored.ready, other.ready])
      const read = normalizeShellLayout(restored.view.state.layout.getSnapshot().description)
      expect(shellLayoutModule(read, 'projects').size.preferredRem).toBe(22)
      expect(shellLayoutModule(read, 'session-tool').size.preferredRem).toBe(31)
      expect(normalizeShellLayout(other.view.state.layout.getSnapshot().description)).toEqual(shellLayout)
    } finally {
      restored.dispose()
      other.dispose()
    }
  } finally {
    runtime.dispose()
  }
})
