import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError } from '@hbar/commands'
import type { ClientPreferencesState } from '@hbar/app-runtime'
import { WebAppearanceSettings } from '../apps/web/src/AppearanceSettings'
import { createWebAppearanceEditor, partiallyApplied } from '../apps/web/src/appearance-editor'
import { resetWebAppearancePreferences, saveWebAppearancePreferences } from '../apps/web/src/appearance'
import { getShellCopy } from '../apps/web/src/shell-copy'

function fixture() {
  let preferences: ClientPreferencesState = {
    status: 'ready',
    revision: 0,
    persisted: true,
    values: {},
    restoreError: null,
  }
  let failAt: string | null = null
  let postWriteError = false
  let unreadable = false
  let writes = 0
  const mutation = {
    async set(input: { key: string; value: string; expectedRevision: number }) {
      if (input.expectedRevision !== preferences.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Another device preference changed')
      if (failAt === input.key) {
        failAt = null
        preferences = {
          ...preferences,
          revision: preferences.revision + 1,
          values: { ...preferences.values, otherModule: true },
        }
        throw new CommandError('COMMAND_CONFLICT', 'Another preference committed')
      }
      writes++
      preferences = {
        ...preferences,
        revision: preferences.revision + 1,
        values: { ...preferences.values, [input.key]: input.value },
      }
      if (postWriteError) throw new Error('Result lost after local write')
      return { revision: preferences.revision, values: preferences.values, persisted: true }
    },
    async unset(input: { key: string; expectedRevision: number }) {
      if (input.expectedRevision !== preferences.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Another device preference changed')
      if (failAt === input.key) {
        failAt = null
        preferences = {
          ...preferences,
          revision: preferences.revision + 1,
          values: { ...preferences.values, otherModule: true },
        }
        throw new CommandError('COMMAND_CONFLICT', 'Another preference committed')
      }
      writes++
      const { [input.key]: _removed, ...remaining } = preferences.values
      preferences = { ...preferences, revision: preferences.revision + 1, values: remaining }
      return { revision: preferences.revision, values: preferences.values, persisted: true }
    },
  }
  const port = {
    save: (target: Parameters<typeof saveWebAppearancePreferences>[2], expectedRevision: number) => {
      if (expectedRevision !== preferences.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Appearance revision changed')
      return saveWebAppearancePreferences(mutation, preferences.values, target, expectedRevision)
    },
    reset: (expectedRevision: number) => resetWebAppearancePreferences(mutation, preferences.values, expectedRevision),
    refresh: () => (unreadable ? Promise.reject(new Error('Read still unavailable')) : Promise.resolve(preferences)),
  }
  return {
    editor: createWebAppearanceEditor(preferences, port),
    preferences: () => preferences,
    failOn: (key: string) => {
      failAt = key
    },
    loseResult: (lost: boolean) => {
      postWriteError = lost
    },
    unreadable: (value: boolean) => {
      unreadable = value
    },
    writes: () => writes,
  }
}

test('draft belongs to one runtime across category/unmount/return, not another runtime', () => {
  const first = fixture()
  const second = fixture()
  first.editor.change('theme', 'dark')
  first.editor.change('controlSize', 'l')
  const labels = getShellCopy('zh-CN').appearance
  const render = () =>
    renderToStaticMarkup(<WebAppearanceSettings labels={labels} editor={first.editor} systemPrefersDark={false} />)
  expect(render()).toContain(labels.title)
  first.editor.sync(first.preferences())
  expect(render()).toContain(labels.save)
  expect(first.editor.store.getState().draft).toMatchObject({ theme: 'dark', controlSize: 'l' })
  expect(second.editor.store.getState().draft).toMatchObject({ theme: 'system', controlSize: 'm' })
  first.editor.discard()
  expect(first.editor.store.getState().draft).toMatchObject({ theme: 'system', controlSize: 'm' })
  expect(first.writes()).toBe(0)
})

test('a second-key CAS conflict after one applied field keeps the draft and offers an explicit rebase', async () => {
  const f = fixture()
  f.editor.change('theme', 'dark')
  f.editor.change('controlSize', 'l')
  f.failOn('appearance.controlSize')
  await f.editor.save()
  expect(f.editor.store.getState()).toMatchObject({
    status: 'conflict',
    revision: 0,
    draft: { theme: 'dark', controlSize: 'l' },
  })
  expect(f.preferences()).toMatchObject({ revision: 2, values: { theme: 'dark', otherModule: true } })
  await f.editor.check()
  expect(f.editor.store.getState()).toMatchObject({ status: 'conflict', checked: true, latestRevision: 2 })
  expect(partiallyApplied(f.editor.store.getState())).toEqual({ count: 1, total: 2 })
  f.editor.sync(f.preferences())
  expect(f.editor.store.getState().checked).toBe(true)
  f.editor.continueDraft()
  expect(f.editor.store.getState()).toMatchObject({
    status: 'idle',
    revision: 2,
    draft: { theme: 'dark', controlSize: 'l' },
  })
  await f.editor.save()
  expect(f.editor.store.getState()).toMatchObject({ status: 'saved', revision: 3 })
  expect(f.preferences().values).toMatchObject({ theme: 'dark', 'appearance.controlSize': 'l', otherModule: true })
  expect(f.writes()).toBe(2)
})

test('plain post-write error freezes draft; a serialized read confirms outcome without replay', async () => {
  const f = fixture()
  f.editor.change('theme', 'light')
  f.loseResult(true)
  await f.editor.save()
  expect(f.editor.store.getState()).toMatchObject({ status: 'unknown', draft: { theme: 'light' } })
  await f.editor.save()
  f.editor.discard()
  expect(f.writes()).toBe(1)
  f.unreadable(true)
  await f.editor.check()
  expect(f.editor.store.getState().status).toBe('unknown')
  f.unreadable(false)
  await f.editor.check()
  expect(f.editor.store.getState()).toMatchObject({ status: 'saved', draft: { theme: 'light' } })
  expect(f.writes()).toBe(1)
})

test('partial reset is not silently retried or confused with saving the old draft', async () => {
  const f = fixture()
  f.editor.change('theme', 'dark')
  f.editor.change('controlSize', 'l')
  await f.editor.save()
  expect(f.preferences().revision).toBe(2)
  f.failOn('appearance.controlSize')
  await f.editor.reset()
  expect(f.editor.store.getState()).toMatchObject({ status: 'conflict', action: { kind: 'reset' } })
  expect(f.preferences()).toMatchObject({ revision: 4, values: { 'appearance.controlSize': 'l' } })
  await f.editor.check()
  expect(f.editor.store.getState()).toMatchObject({
    status: 'conflict',
    checked: true,
    draft: { theme: 'dark', controlSize: 'l' },
    latest: { theme: 'system', controlSize: 'l' },
  })
  f.editor.discard()
  expect(f.editor.store.getState()).toMatchObject({ status: 'idle', draft: { theme: 'system', controlSize: 'l' } })
  await f.editor.reset()
  expect(f.editor.store.getState()).toMatchObject({ status: 'saved', draft: { theme: 'system', controlSize: 'm' } })
  expect(f.preferences().values).toEqual({ otherModule: true })
})

test('read failure disables mutations until a read succeeds and never discards the saved envelope', async () => {
  const f = fixture()
  f.editor.change('theme', 'dark')
  const damaged: ClientPreferencesState = {
    status: 'ready',
    revision: 0,
    persisted: false,
    values: {},
    restoreError: 'INVALID_PERSISTED_STATE',
  }
  f.editor.sync(damaged)
  f.editor.discard()
  expect(f.editor.store.getState().draft.theme).toBe('dark')
  await f.editor.save()
  await f.editor.reset()
  expect(f.editor.store.getState()).toMatchObject({ status: 'restore-error', available: false })
  expect(f.writes()).toBe(0)
  await f.editor.check()
  expect(f.editor.store.getState()).toMatchObject({
    status: 'conflict',
    checked: true,
    available: true,
    draft: { theme: 'dark' },
    latest: { theme: 'system' },
  })
  f.editor.discard()
  expect(f.editor.store.getState()).toMatchObject({ status: 'idle', draft: { theme: 'system' } })
})

test('a not-ready refresh cannot confirm an unknown local write', async () => {
  const initial: ClientPreferencesState = {
    status: 'ready',
    revision: 0,
    persisted: true,
    values: {},
    restoreError: null,
  }
  const editor = createWebAppearanceEditor(initial, {
    save: () => Promise.reject(new Error('Result lost')),
    reset: () => Promise.reject(new Error('Result lost')),
    refresh: () => Promise.resolve({ ...initial, status: 'loading', values: { theme: 'dark' } }),
  })
  editor.change('theme', 'dark')
  await editor.save()
  await editor.check()
  expect(editor.store.getState()).toMatchObject({
    status: 'unknown',
    checked: false,
    draft: { theme: 'dark' },
    error: 'PREFERENCES_NOT_READY',
  })
})

test('a successful non-persistent preference command reports volatile application, not saved', async () => {
  const initial: ClientPreferencesState = {
    status: 'ready',
    revision: 0,
    persisted: false,
    values: {},
    restoreError: null,
  }
  const editor = createWebAppearanceEditor(initial, {
    save: () => Promise.resolve({ revision: 1, values: { theme: 'dark' }, persisted: false }),
    reset: () => Promise.resolve({ revision: 1, values: {}, persisted: false }),
    refresh: () => Promise.resolve({ ...initial, revision: 1, values: { theme: 'dark' } }),
  })
  editor.change('theme', 'dark')
  await editor.save()
  expect(editor.store.getState()).toMatchObject({ status: 'volatile', persisted: false, draft: { theme: 'dark' } })
  const html = renderToStaticMarkup(
    <WebAppearanceSettings labels={getShellCopy('en-US').appearance} editor={editor} systemPrefersDark={false} />,
  )
  // SSR reads the initial store snapshot; the state assertion above verifies the post-command fact.
  expect(html).toContain('Appearance')
})
