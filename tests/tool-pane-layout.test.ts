import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import type { ClientLayoutState } from '@hbar/app-runtime'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { saveToolPaneWidth, type ToolPaneLayoutPort } from '../apps/web/src/tool-pane-layout'
import { toolPaneLayoutCopy } from '../apps/web/src/tool-pane-layout-copy'
import { ToolPaneLayoutFeedback } from '../apps/web/src/ToolPaneLayoutFeedback'
import { shellLayout, shellLayoutModule, type ShellLayoutDescription } from '../apps/web/src/shell-layout'

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

test('tool resize saves only captured width through the existing versioned layout owner', async () => {
  let current = snapshot()
  const saved: { description: ShellLayoutDescription; revision: number }[] = []
  const pending = Promise.withResolvers<{ persisted: boolean }>()
  const port: ToolPaneLayoutPort = {
    read: () => current,
    commit: (description, revision) => {
      saved.push({ description, revision })
      return pending.promise
    },
  }
  const request = saveToolPaneWidth(port, 29.5)
  current = snapshot({ revision: 8 })
  expect(saved).toHaveLength(1)
  expect(saved[0]?.revision).toBe(7)
  expect(shellLayoutModule(saved[0]!.description, 'session-tool').size.preferredRem).toBe(29.5)
  expect(shellLayoutModule(saved[0]!.description, 'projects')).toEqual(shellLayoutModule(shellLayout, 'projects'))
  pending.resolve({ persisted: true })
  await request
  expect(current.revision).toBe(8)
})

test('unread or failed restore and invalid width never submit a layout mutation', async () => {
  let writes = 0
  const commit = async () => {
    writes++
    return { persisted: true }
  }
  for (const current of [snapshot({ status: 'loading' }), snapshot({ restoreError: 'INVALID_PERSISTED_STATE' })])
    await expect(saveToolPaneWidth({ read: () => current, commit }, 25)).rejects.toMatchObject({
      code: 'PERSISTENCE_RESTORE_FAILED',
    })
  for (const width of [0, 19.9, 36.1, Number.NaN, Number.POSITIVE_INFINITY])
    await expect(saveToolPaneWidth({ read: () => snapshot(), commit }, width)).rejects.toBeDefined()
  expect(writes).toBe(0)
})

test('conflict/failure remains explicit and a manual retry merges only width into the latest layout', async () => {
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
  await expect(saveToolPaneWidth(port, 30)).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
  expect(attempts).toBe(1)
  const newer = structuredClone(shellLayout)
  shellLayoutModule(newer, 'projects').visible = false
  current = snapshot({ revision: 9, description: newer })
  await saveToolPaneWidth(port, 30)
  expect(attempts).toBe(2)
  expect(shellLayoutModule(changes[0]!, 'projects').visible).toBe(false)
  expect(shellLayoutModule(changes[0]!, 'session-tool').size.preferredRem).toBe(30)
})

test('a local-only layout result is not reported as device-persisted success', async () => {
  await expect(
    saveToolPaneWidth({ read: () => snapshot(), commit: async () => ({ persisted: false }) }, 28),
  ).rejects.toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' })
})

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`pane width feedback renders host-owned pending, conflict and retry states: ${locale}`, () => {
    const labels = toolPaneLayoutCopy(locale)
    const commit = async () => undefined
    const idle = renderToStaticMarkup(
      createElement(ToolPaneLayoutFeedback, {
        labels,
        controller: { disabled: false, receipt: { status: 'idle' }, commit },
      }),
    )
    expect(idle).toBe('')
    const saving = renderToStaticMarkup(
      createElement(ToolPaneLayoutFeedback, {
        labels,
        controller: { disabled: true, receipt: { status: 'saving', target: 'original-panel', widthRem: 28 }, commit },
      }),
    )
    expect(saving).toContain('role="status"')
    expect(saving).toContain(labels.saving)
    expect(saving).not.toContain('<button')
    const conflict = renderToStaticMarkup(
      createElement(ToolPaneLayoutFeedback, {
        labels,
        controller: {
          disabled: false,
          receipt: { status: 'failed', target: 'original-panel', widthRem: 28, code: 'COMMAND_CONFLICT' },
          commit,
        },
      }),
    )
    expect(conflict).toContain('role="alert"')
    expect(conflict).toContain(labels.failed('COMMAND_CONFLICT'))
    expect(conflict).toContain(labels.retry)
    expect(conflict).not.toContain('original-panel')
    expect(conflict).not.toContain('COMMAND_CONFLICT')
    const unavailable = renderToStaticMarkup(
      createElement(ToolPaneLayoutFeedback, {
        labels: { ...labels, retry: `${labels.retry} ${'长标签 '.repeat(12)}` },
        controller: {
          disabled: true,
          receipt: { status: 'failed', target: 'original-panel', widthRem: 28, code: 'PERSISTENCE_UNAVAILABLE' },
          commit,
        },
      }),
    )
    expect(unavailable).toContain(labels.failed('PERSISTENCE_UNAVAILABLE'))
    expect(unavailable).toContain('disabled=""')
    expect(unavailable).not.toContain('PERSISTENCE_UNAVAILABLE')
  })
