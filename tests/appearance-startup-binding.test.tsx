import { expect, test } from 'bun:test'
import { createStore } from 'zustand/vanilla'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ClientPreferencesState } from '@hbar/app-runtime'
import { WebAppearanceSettings } from '../apps/web/src/AppearanceSettings'
import {
  createWebAppearanceEditor,
  type AppearanceEditor,
  type AppearanceEditorBinding,
  type AppearanceEditorPort,
} from '../apps/web/src/appearance-editor'
import type { PreferenceMutationResult } from '../apps/web/src/appearance'
import { getShellCopy } from '../apps/web/src/shell-copy'

const pending: AppearanceEditorBinding = { endpointId: 'browser-origin', generation: 1, hostId: null }
const confirmed: AppearanceEditorBinding = { ...pending, hostId: 'confirmed-host' }

function preferences(values: ClientPreferencesState['values'] = {}, revision = 0): ClientPreferencesState {
  return { status: 'ready', values, revision, persisted: true, restoreError: null }
}

function fixture(initial = preferences()) {
  let current = initial
  let failure: Error | null = null
  const calls: { kind: string; revision?: number }[] = []
  const port: AppearanceEditorPort = {
    save(target, revision) {
      calls.push({ kind: 'save', revision })
      if (failure) return Promise.reject(failure)
      expect(revision).toBe(current.revision)
      current = {
        ...current,
        revision: revision + 1,
        values: {
          ...current.values,
          theme: target.theme,
          'appearance.controlSize': target.controlSize,
          'appearance.textSize': target.textSize,
          'appearance.cornerSize': target.cornerSize,
        },
      }
      return Promise.resolve({ revision: current.revision, values: current.values, persisted: true })
    },
    reset(revision) {
      calls.push({ kind: 'reset', revision })
      return Promise.resolve({ revision: revision + 1, values: {}, persisted: true })
    },
    refresh() {
      calls.push({ kind: 'refresh' })
      return Promise.resolve(current)
    },
  }
  return {
    port,
    calls,
    set: (value: ClientPreferencesState) => {
      current = value
    },
    fail: (value: Error | null) => {
      failure = value
    },
  }
}

function render(editor: AppearanceEditor, locale: 'en-US' | 'zh-CN') {
  // SSR consumes getInitialState. Seed a render-only snapshot from actual owner
  // actions; this adapter does not manufacture an applied business result.
  return renderToStaticMarkup(
    <WebAppearanceSettings
      labels={getShellCopy(locale).appearance}
      editor={{ ...editor, store: createStore(() => editor.store.getState()) }}
      systemPrefersDark={false}
    />,
  )
}

test('pending identity permits bootstrap draft edits and discard but cannot save, reset or read pending persistence', async () => {
  const old = fixture(preferences({ theme: 'light' }))
  const editor = createWebAppearanceEditor({ ...preferences({ theme: 'light' }), status: 'loading' }, old.port, pending)
  editor.change('theme', 'dark')
  editor.change('controlSize', 's')
  await editor.save()
  await editor.reset()
  await editor.check()
  expect(editor.store.getState()).toMatchObject({
    available: false,
    editable: true,
    writable: false,
    persisted: false,
    status: 'idle',
    baseline: { theme: 'light' },
    draft: { theme: 'dark', controlSize: 's' },
    binding: pending,
  })
  editor.sync(preferences({ theme: 'dark', 'appearance.textSize': 'l' }, 99), pending)
  expect(editor.store.getState().baseline.theme).toBe('light')
  editor.discard()
  expect(editor.store.getState().draft).toMatchObject({ theme: 'light', controlSize: 'm' })
  expect(old.calls).toEqual([])
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`pending Appearance renders honest host copy and editable choices with disabled persistence: ${locale}`, () => {
    const old = fixture()
    const editor = createWebAppearanceEditor(preferences(), old.port, pending)
    editor.change('theme', 'dark')
    const labels = getShellCopy(locale).appearance
    const html = render(editor, locale)
    expect(html).toContain(labels.identityPending)
    expect(html).not.toContain(labels.saved)
    expect(html).not.toContain(labels.volatile)
    expect(html.match(/role="radio"/g)).toHaveLength(3)
    expect(html.match(/role="radio"[^>]*disabled=""/g)).toBeNull()
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled="")[^>]*>/)
    expect(html).toContain(labels.save)
    expect(html).toContain(labels.discard)
  })
}

test('same startup baseline binds the confirmed port and revision without replacing owner, store or dirty draft', async () => {
  const old = fixture()
  const next = fixture(preferences({ unrelated: true }, 8))
  const editor = createWebAppearanceEditor(preferences(), old.port, pending)
  const store = editor.store
  editor.change('theme', 'dark')
  editor.change('textSize', 'l')
  expect(editor.bind({ binding: confirmed, preferences: preferences({ unrelated: true }, 8), port: next.port })).toBe(
    true,
  )
  expect(editor.store).toBe(store)
  expect(editor.store.getState()).toMatchObject({
    binding: confirmed,
    revision: 8,
    latestRevision: 8,
    available: true,
    writable: true,
    status: 'idle',
    baseline: { theme: 'system' },
    draft: { theme: 'dark', textSize: 'l' },
  })
  expect(next.calls).toEqual([])
  await editor.save()
  expect(next.calls).toEqual([{ kind: 'save', revision: 8 }])
  expect(old.calls).toEqual([])
  expect(editor.store.getState()).toMatchObject({ status: 'saved', revision: 9, latestValues: { unrelated: true } })
})

test('different confirmed values preserve the startup draft and require readback plus an explicit rebase', async () => {
  const old = fixture()
  const saved = preferences({ theme: 'light', unrelated: true }, 7)
  const next = fixture(saved)
  const editor = createWebAppearanceEditor(preferences(), old.port, pending)
  editor.change('theme', 'dark')
  expect(editor.bind({ binding: confirmed, preferences: saved, port: next.port })).toBe(true)
  expect(editor.store.getState()).toMatchObject({
    status: 'conflict',
    checked: false,
    revision: 0,
    draft: { theme: 'dark' },
    latest: { theme: 'light' },
    latestRevision: 7,
  })
  await editor.save()
  editor.continueDraft()
  editor.discard()
  expect(editor.store.getState().draft.theme).toBe('dark')
  expect(next.calls).toEqual([])
  await editor.check()
  expect(editor.store.getState()).toMatchObject({ status: 'conflict', checked: true })
  editor.continueDraft()
  expect(editor.store.getState()).toMatchObject({
    status: 'idle',
    revision: 7,
    draft: { theme: 'dark' },
    baseline: { theme: 'light' },
  })
  await editor.save()
  expect(next.calls).toEqual([{ kind: 'refresh' }, { kind: 'save', revision: 7 }])
  expect(old.calls).toEqual([])
})

test('confirmed loading preserves an editable draft, blocks writes, and rebases only after authoritative ready', async () => {
  const old = fixture()
  const next = fixture(preferences({}, 6))
  const editor = createWebAppearanceEditor(preferences(), old.port, pending)
  editor.change('theme', 'dark')
  expect(
    editor.bind({ binding: confirmed, preferences: { ...preferences({}, 6), status: 'loading' }, port: next.port }),
  ).toBe(true)
  editor.change('controlSize', 's')
  await editor.save()
  await editor.reset()
  editor.discard()
  expect(editor.store.getState()).toMatchObject({
    editable: true,
    available: false,
    writable: false,
    draft: { theme: 'dark', controlSize: 's' },
  })
  editor.sync(preferences({}, 6), confirmed)
  expect(editor.store.getState()).toMatchObject({
    status: 'idle',
    available: true,
    writable: true,
    revision: 6,
    draft: { theme: 'dark', controlSize: 's' },
  })
  expect(next.calls).toEqual([])
  expect(old.calls).toEqual([])
})

test('failed confirmed preference restore never treats defaults as saved and recovers through the new read port', async () => {
  const old = fixture()
  const next = fixture(preferences({}, 3))
  const editor = createWebAppearanceEditor(preferences(), old.port, pending)
  editor.change('theme', 'dark')
  const failed = { ...preferences(), persisted: false, restoreError: 'INVALID_PERSISTED_STATE' }
  expect(editor.bind({ binding: confirmed, preferences: failed, port: next.port })).toBe(true)
  await editor.save()
  await editor.reset()
  editor.discard()
  expect(editor.store.getState()).toMatchObject({
    status: 'restore-error',
    available: false,
    editable: false,
    writable: false,
    draft: { theme: 'dark' },
  })
  expect(render(editor, 'zh-CN')).toContain(getShellCopy('zh-CN').appearance.restoreError('INVALID_PERSISTED_STATE'))
  await editor.check()
  expect(editor.store.getState()).toMatchObject({
    status: 'idle',
    available: true,
    revision: 3,
    draft: { theme: 'dark' },
  })
  expect(next.calls).toEqual([{ kind: 'refresh' }])
  expect(old.calls).toEqual([])
})

test('cross-endpoint/generation/Host and same-Host port replacement are rejected; late old readers cannot overwrite', () => {
  const old = fixture()
  const next = fixture(preferences({}, 5))
  const foreign = fixture(preferences({ theme: 'light' }, 22))
  const editor = createWebAppearanceEditor(preferences(), old.port, pending)
  editor.change('theme', 'dark')
  expect(
    editor.bind({
      binding: { ...confirmed, endpointId: 'another-endpoint' },
      preferences: preferences(),
      port: foreign.port,
    }),
  ).toBe(false)
  expect(
    editor.bind({ binding: { ...confirmed, generation: 2 }, preferences: preferences(), port: foreign.port }),
  ).toBe(false)
  expect(editor.bind({ binding: confirmed, preferences: preferences({}, 5), port: next.port })).toBe(true)
  expect(
    editor.bind({ binding: confirmed, preferences: preferences({ theme: 'light' }, 22), port: foreign.port }),
  ).toBe(false)
  expect(
    editor.bind({ binding: { ...confirmed, hostId: 'other-host' }, preferences: preferences(), port: foreign.port }),
  ).toBe(false)
  const before = editor.store.getState()
  editor.sync(preferences({ theme: 'light' }, 99), pending)
  editor.sync(preferences({ theme: 'light' }, 99))
  expect(editor.store.getState()).toBe(before)
  expect(editor.bind({ binding: confirmed, preferences: preferences({}, 5), port: next.port })).toBe(true)
  expect(editor.store.getState()).toMatchObject({ revision: 5, draft: { theme: 'dark' } })
  expect(foreign.calls).toEqual([])
})

test('saving and unknown results stay bound to their original port and cannot be migrated or replaced', async () => {
  const old = fixture()
  const newPort = fixture(preferences({}, 20))
  let rejectSave: ((reason: Error) => void) | undefined
  const port: AppearanceEditorPort = {
    ...old.port,
    save: () =>
      new Promise<PreferenceMutationResult>((_resolve, reject) => {
        rejectSave = reject
      }),
  }
  const editor = createWebAppearanceEditor(preferences(), port, confirmed)
  editor.change('theme', 'dark')
  const operation = editor.save()
  expect(editor.store.getState().status).toBe('saving')
  expect(editor.bind({ binding: confirmed, preferences: preferences({}, 20), port: newPort.port })).toBe(false)
  expect(
    editor.bind({ binding: { ...confirmed, generation: 2 }, preferences: preferences(), port: newPort.port }),
  ).toBe(false)
  if (!rejectSave) throw new Error('Expected the pending original save')
  rejectSave(new Error('Result was lost'))
  await operation
  expect(editor.store.getState()).toMatchObject({
    status: 'unknown',
    binding: confirmed,
    action: { kind: 'save' },
    draft: { theme: 'dark' },
  })
  expect(
    editor.bind({
      binding: { ...confirmed, hostId: 'different-host' },
      preferences: preferences(),
      port: newPort.port,
    }),
  ).toBe(false)
  expect(newPort.calls).toEqual([])
})

test('a pending check cannot replace its port and its eventual fact only settles the original owner', async () => {
  const old = fixture()
  const foreign = fixture(preferences({ theme: 'light' }, 80))
  old.fail(new Error('Local write result lost'))
  let resolveRead: ((value: ClientPreferencesState) => void) | undefined
  let reads = 0
  const port: AppearanceEditorPort = {
    ...old.port,
    refresh: () => {
      reads++
      return new Promise<ClientPreferencesState>((resolve) => {
        resolveRead = resolve
      })
    },
  }
  const editor = createWebAppearanceEditor(preferences(), port, confirmed)
  editor.change('theme', 'dark')
  await editor.save()
  const checking = editor.check()
  expect(editor.store.getState().status).toBe('checking')
  expect(
    editor.bind({ binding: confirmed, preferences: preferences({ theme: 'light' }, 80), port: foreign.port }),
  ).toBe(false)
  expect(
    editor.bind({ binding: { ...confirmed, generation: 2 }, preferences: preferences(), port: foreign.port }),
  ).toBe(false)
  if (!resolveRead) throw new Error('Expected the original bounded check')
  resolveRead(preferences({ theme: 'dark' }, 1))
  await checking
  expect(editor.store.getState()).toMatchObject({
    status: 'saved',
    binding: confirmed,
    revision: 1,
    draft: { theme: 'dark' },
  })
  expect(reads).toBe(1)
  expect(foreign.calls).toEqual([])
})

test('a restore read that remains loading cannot unlock writes or discard the original startup draft', async () => {
  const old = fixture()
  const next = fixture({ ...preferences(), status: 'loading' })
  const editor = createWebAppearanceEditor(preferences(), old.port, pending)
  editor.change('theme', 'dark')
  editor.bind({
    binding: confirmed,
    preferences: { ...preferences(), restoreError: 'PERSISTENCE_FAILED' },
    port: next.port,
  })
  await editor.check()
  await editor.save()
  editor.discard()
  expect(editor.store.getState()).toMatchObject({
    status: 'restore-error',
    available: false,
    writable: false,
    checked: false,
    draft: { theme: 'dark' },
    error: 'PREFERENCES_NOT_READY',
  })
  expect(next.calls).toEqual([{ kind: 'refresh' }])
  next.set(preferences({ theme: 'light' }, 4))
  await editor.check()
  expect(editor.store.getState()).toMatchObject({
    status: 'conflict',
    checked: true,
    latestRevision: 4,
    draft: { theme: 'dark' },
  })
  editor.discard()
  expect(editor.store.getState()).toMatchObject({ status: 'idle', revision: 4, draft: { theme: 'light' } })
})

test('different endpoint owners never share bootstrap drafts or binding effects', () => {
  const firstPort = fixture()
  const secondPort = fixture()
  const first = createWebAppearanceEditor(preferences(), firstPort.port, pending)
  const otherBinding = { ...pending, endpointId: 'another-origin', generation: 2 }
  const second = createWebAppearanceEditor(preferences({ theme: 'light' }), secondPort.port, otherBinding)
  first.change('theme', 'dark')
  first.bind({ binding: confirmed, preferences: preferences(), port: fixture().port })
  expect(first.store.getState().draft.theme).toBe('dark')
  expect(second.store.getState()).toMatchObject({ binding: otherBinding, draft: { theme: 'light' }, writable: false })
  expect(first.store).not.toBe(second.store)
})
