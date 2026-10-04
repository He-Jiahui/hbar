import { expect, test } from 'bun:test'
import {
  createWebLanguageController,
  readLanguagePreference,
  resolveWebLanguage,
  WEB_LANGUAGE_CHOICES,
  WEB_LANGUAGE_STORAGE_KEY,
} from '../apps/web/src/language'
import { createWebRuntimeCopy } from '../apps/web/src/runtime-copy'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

function storage() {
  const values = new Map<string, string>()
  let blocked = false
  return {
    values,
    block: (value: boolean) => {
      blocked = value
    },
    port: {
      getItem(key: string) {
        if (blocked) throw new Error('Storage blocked')
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        if (blocked) throw new Error('Storage blocked')
        values.set(key, value)
      },
    },
  }
}

test('language exposes only supported bounded choices and resolves explicit versus system language', () => {
  expect(WEB_LANGUAGE_CHOICES).toEqual(['system', 'en-US', 'zh-CN'])
  for (const choice of WEB_LANGUAGE_CHOICES) expect(readLanguagePreference(choice)).toBe(choice)
  for (const value of [undefined, null, '', 'fr-FR', '<script>', { locale: 'zh-CN' }, Array(4).fill('en-US')])
    expect(readLanguagePreference(value)).toBeNull()
  expect(resolveWebLanguage('system', 'en-US')).toBe('en-US')
  expect(resolveWebLanguage('system', 'zh-CN')).toBe('zh-CN')
  expect(resolveWebLanguage('zh-CN', 'en-US')).toBe('zh-CN')
})

test('language applies in place, persists independently and survives a fresh controller', () => {
  const data = storage()
  data.values.set('hbar:host:preferences', 'unrelated appearance, tabs and settings')
  const controller = createWebLanguageController('en-US', data.port)
  const identity = controller.store
  expect(controller.store.getState()).toMatchObject({ preference: 'system', locale: 'en-US', status: 'ready' })
  controller.select('zh-CN')
  expect(controller.store).toBe(identity)
  expect(controller.store.getState()).toMatchObject({ preference: 'zh-CN', locale: 'zh-CN', status: 'saved' })
  expect(data.values.get(WEB_LANGUAGE_STORAGE_KEY)).toBe('zh-CN')
  expect(data.values.get('hbar:host:preferences')).toBe('unrelated appearance, tabs and settings')
  expect(createWebLanguageController('en-US', data.port).store.getState().locale).toBe('zh-CN')
  controller.setSystemLocale('zh-CN')
  controller.select('system')
  controller.setSystemLocale('en-US')
  expect(controller.store.getState().locale).toBe('en-US')
  controller.select('zh-CN')
  controller.setSystemLocale('en-US')
  expect(controller.store.getState().locale).toBe('zh-CN')
})

test('blocked or corrupt persistence is explicit, keeps the applied choice and permits safe retry', () => {
  const data = storage()
  data.values.set(WEB_LANGUAGE_STORAGE_KEY, 'unsupported')
  const controller = createWebLanguageController('en-US', data.port)
  expect(controller.store.getState()).toMatchObject({
    locale: 'en-US',
    status: 'read-error',
    error: 'INVALID_PREFERENCE',
  })
  data.block(true)
  controller.refresh()
  expect(controller.store.getState().error).toBe('STORAGE_UNAVAILABLE')
  controller.select('zh-CN')
  expect(controller.store.getState()).toMatchObject({ preference: 'zh-CN', locale: 'zh-CN', status: 'save-error' })
  data.block(false)
  controller.persist()
  expect(controller.store.getState()).toMatchObject({ locale: 'zh-CN', status: 'saved', error: null })
  expect(createWebLanguageController('en-US', data.port).store.getState().locale).toBe('zh-CN')
  data.values.set(WEB_LANGUAGE_STORAGE_KEY, 'en-US')
  controller.refresh()
  expect(controller.store.getState()).toMatchObject({ preference: 'en-US', locale: 'en-US', status: 'ready' })
})

test('stable runtime copy ports follow language without replacing action identity or cached domain values', () => {
  let locale: ShellLocale = 'en-US'
  const port = createWebRuntimeCopy(() => locale)
  const resolver = port.commandText.resolve
  const requestText = port.planProposal.requestText
  const key = 'commands.app.openSettings.title'
  expect(resolver(key)).toBe(getShellCopy('en-US').commandPalette.resolve(key))
  const input = {
    action: 'implement' as const,
    markdown: 'Original plan',
    feedback: '',
    target: { sessionId: 's', messageId: 'm', sourceRunId: 'r', sourceSeq: 1, fingerprint: 'f' },
  }
  const english = requestText(input)
  locale = 'zh-CN'
  expect(port.commandText.resolve).toBe(resolver)
  expect(port.planProposal.requestText).toBe(requestText)
  expect(resolver(key)).toBe(getShellCopy('zh-CN').commandPalette.resolve(key))
  expect(requestText(input)).toBe(getShellCopy('zh-CN').planProposal.requestText(input))
  expect(requestText(input)).not.toBe(english)
  expect(input.markdown).toBe('Original plan')
})
