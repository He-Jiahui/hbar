import { expect, test } from 'bun:test'
import { desktopChromeCopySchema, desktopCloseConfirmationCopySchema, type DesktopChromeCopy } from '@hbar/contracts'
import { desktopChromeCopy } from '../apps/web/src/desktop-chrome-copy'
import {
  bindDesktopChromeLanguage,
  createDesktopChromeController,
  createDesktopChromePort,
} from '../apps/web/src/desktop-chrome'
import { createWebLanguageController } from '../apps/web/src/language'

function controlledPort() {
  const pending: { readonly copy: DesktopChromeCopy; readonly resolve: () => void; readonly reject: () => void }[] = []
  return {
    pending,
    port: {
      isAvailable: true,
      apply: (copy: DesktopChromeCopy) =>
        new Promise<void>((resolve, reject) =>
          pending.push({ copy, resolve, reject: () => reject(new Error('Owned native failure')) }),
        ),
    },
  }
}
async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

test('Desktop copy catalog bounds UTF16 and rejects missing, unknown, control or overcapacity labels', () => {
  expect(desktopChromeCopy('zh-CN').trayOpen).toBe('打开 hbar')
  expect(desktopChromeCopy('en-US').trayOpen).toBe('Open hbar')
  for (const value of ['', ' ', 'line\nbreak', 'null\0byte', '界'.repeat(128), '🙂'.repeat(64)])
    expect(desktopChromeCopySchema.safeParse({ ...desktopChromeCopy('zh-CN'), trayTooltip: value }).success).toBe(false)
  for (const value of ['界'.repeat(127), '🙂'.repeat(63)])
    expect(desktopChromeCopySchema.safeParse({ ...desktopChromeCopy('zh-CN'), trayTooltip: value }).success).toBe(true)
  expect(desktopChromeCopySchema.safeParse({ ...desktopChromeCopy('en-US'), extra: 'unowned' }).success).toBe(false)
  expect(desktopChromeCopySchema.safeParse({ windowTitle: 'hbar' }).success).toBe(false)
})
test('native port is inert outside Tauri and validates the exact replacement receipt', async () => {
  let calls = 0
  let mismatch = false
  const targets: unknown[] = []
  const scope = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls++
        expect(command).toBe('set_desktop_chrome_copy')
        targets.push(args?.copy)
        return mismatch ? desktopChromeCopy('zh-CN') : args?.copy
      },
    },
  }
  const inactive = createDesktopChromePort(scope, false)
  expect(inactive.isAvailable).toBe(false)
  await expect(inactive.apply(desktopChromeCopy('en-US'))).rejects.toThrow('UNAVAILABLE')
  expect(calls).toBe(0)
  const port = createDesktopChromePort(scope, true)
  await port.apply(desktopChromeCopy('en-US'))
  expect(targets).toEqual([desktopChromeCopy('en-US')])
  mismatch = true
  await expect(port.apply(desktopChromeCopy('en-US'))).rejects.toThrow('MISMATCH')
})
test('close confirmation preserves localized paragraphs with separate title and UTF16 message capacities', () => {
  const original = desktopChromeCopy('zh-CN').closeConfirmation
  expect(original.message).toContain('\n')
  expect(desktopChromeCopy('en-US').closeConfirmation.title).toBe('Exit hbar')
  for (const message of ['界'.repeat(4000), '🙂'.repeat(2000), 'one\r\ntwo'])
    expect(desktopCloseConfirmationCopySchema.safeParse({ ...original, message }).success).toBe(true)
  for (const message of ['', ' ', '界'.repeat(4001), '🙂'.repeat(2001), 'null\0byte', 'tab\tbyte'])
    expect(desktopCloseConfirmationCopySchema.safeParse({ ...original, message }).success).toBe(false)
  expect(desktopCloseConfirmationCopySchema.safeParse({ ...original, title: 'a'.repeat(128) }).success).toBe(false)
  expect(desktopCloseConfirmationCopySchema.safeParse({ ...original, extra: 'unowned' }).success).toBe(false)
})
test('native confirmation receipt must match even when the four window and tray fields match', async () => {
  const copy = desktopChromeCopy('en-US')
  const port = createDesktopChromePort(
    {
      __TAURI_INTERNALS__: {
        invoke: async () => ({ ...copy, closeConfirmation: desktopChromeCopy('zh-CN').closeConfirmation }),
      },
    },
    true,
  )
  await expect(port.apply(copy)).rejects.toThrow('MISMATCH')
})
test('rapid language changes keep one in-flight command and one latest replacement', async () => {
  const controlled = controlledPort()
  const owner = createDesktopChromeController(controlled.port)
  owner.select('en-US')
  for (let index = 0; index < 1000; index++) owner.select(index % 2 ? 'zh-CN' : 'en-US')
  expect(controlled.pending).toHaveLength(1)
  expect(owner.store.getState()).toMatchObject({ locale: 'zh-CN', appliedLocale: null, status: 'pending' })
  controlled.pending[0]?.resolve()
  await settle()
  expect(controlled.pending).toHaveLength(2)
  expect(controlled.pending[1]?.copy).toEqual(desktopChromeCopy('zh-CN'))
  expect(owner.store.getState()).toMatchObject({ appliedLocale: 'en-US', status: 'pending' })
  controlled.pending[1]?.resolve()
  await settle()
  expect(owner.store.getState()).toMatchObject({ locale: 'zh-CN', appliedLocale: 'zh-CN', status: 'synced' })
  owner.select('zh-CN')
  expect(controlled.pending).toHaveLength(2)
  owner.dispose()
})
test('failure is explicit; retries deduplicate and an old failure cannot mark the new locale failed', async () => {
  const controlled = controlledPort()
  const owner = createDesktopChromeController(controlled.port)
  owner.select('en-US')
  controlled.pending[0]?.reject()
  await settle()
  expect(owner.store.getState().status).toBe('error')
  expect(controlled.pending).toHaveLength(1)
  owner.retry()
  owner.retry()
  expect(controlled.pending).toHaveLength(2)
  owner.select('zh-CN')
  controlled.pending[1]?.reject()
  await settle()
  expect(owner.store.getState().status).toBe('pending')
  expect(controlled.pending).toHaveLength(3)
  expect(controlled.pending[2]?.copy).toEqual(desktopChromeCopy('zh-CN'))
  controlled.pending[2]?.resolve()
  await settle()
  expect(owner.store.getState()).toMatchObject({ appliedLocale: 'zh-CN', status: 'synced' })
  owner.dispose()
})
test('language binding preserves environment semantics and disposal ignores late replies', async () => {
  const controlled = controlledPort()
  const owner = createDesktopChromeController(controlled.port)
  const values = new Map<string, string>()
  const language = createWebLanguageController('zh-CN', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  })
  const release = bindDesktopChromeLanguage(owner, language)
  controlled.pending[0]?.resolve()
  await settle()
  language.setSystemLocale('en-US')
  expect(controlled.pending).toHaveLength(2)
  language.select('zh-CN')
  language.setSystemLocale('en-US')
  controlled.pending[1]?.resolve()
  await settle()
  expect(controlled.pending[2]?.copy).toEqual(desktopChromeCopy('zh-CN'))
  release()
  owner.dispose()
  const before = owner.store.getState()
  language.select('en-US')
  controlled.pending[2]?.resolve()
  await settle()
  expect(owner.store.getState()).toBe(before)
  expect(controlled.pending).toHaveLength(3)
  const unavailable = createDesktopChromeController(createDesktopChromePort({}, false))
  unavailable.select('zh-CN')
  expect(unavailable.store.getState().status).toBe('unavailable')
})
