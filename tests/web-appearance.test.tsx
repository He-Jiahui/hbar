import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebAppearanceSettings } from '../apps/web/src/AppearanceSettings'
import {
  DEFAULT_WEB_APPEARANCE_PREFERENCES,
  WEB_APPEARANCE_STORAGE_KEY,
  hasWebAppearanceOverrides,
  createWebLumenAppearance,
  readAppearanceBootstrap,
  resetWebAppearancePreferences,
  resolveWebAppearancePreferences,
  saveWebAppearancePreferences,
  writeAppearanceBootstrap,
  type PreferenceMutationPort,
} from '../apps/web/src/appearance'
import { getShellCopy } from '../apps/web/src/shell-copy'

function preferencePort(initial: Readonly<Record<string, unknown>>, revision = 0) {
  let values = { ...initial }
  let currentRevision = revision
  const calls: { readonly kind: 'set' | 'unset'; readonly key: string; readonly revision: number }[] = []
  const port: PreferenceMutationPort = {
    set(input) {
      if (input.expectedRevision !== currentRevision) return Promise.reject({ code: 'COMMAND_CONFLICT' })
      calls.push({ kind: 'set', key: input.key, revision: input.expectedRevision })
      currentRevision += 1
      values = { ...values, [input.key]: input.value }
      return Promise.resolve({ revision: currentRevision, values })
    },
    unset(input) {
      if (input.expectedRevision !== currentRevision) return Promise.reject({ code: 'COMMAND_CONFLICT' })
      calls.push({ kind: 'unset', key: input.key, revision: input.expectedRevision })
      currentRevision += 1
      const { [input.key]: _removed, ...remaining } = values
      values = remaining
      return Promise.resolve({ revision: currentRevision, values })
    },
  }
  return { port, calls, values: () => values }
}

test('web appearance bootstrap validates enum values and tolerates unavailable storage', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
  expect(readAppearanceBootstrap(storage)).toEqual({ controlSize: 'm', textSize: 'm', cornerSize: 'm' })
  expect(writeAppearanceBootstrap(storage, { controlSize: 's', textSize: 'l', cornerSize: 's' })).toBe(true)
  expect(JSON.parse(values.get(WEB_APPEARANCE_STORAGE_KEY)!)).toEqual({
    controlSize: 's',
    textSize: 'l',
    cornerSize: 's',
  })
  expect(readAppearanceBootstrap(storage)).toEqual({ controlSize: 's', textSize: 'l', cornerSize: 's' })
  values.set(WEB_APPEARANCE_STORAGE_KEY, '{broken')
  expect(readAppearanceBootstrap(storage)).toEqual({ controlSize: 'm', textSize: 'm', cornerSize: 'm' })
  const blocked = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  expect(readAppearanceBootstrap(blocked)).toEqual({ controlSize: 'm', textSize: 'm', cornerSize: 'm' })
  expect(writeAppearanceBootstrap(blocked, { controlSize: 'l', textSize: 'l', cornerSize: 'l' })).toBe(false)
})

test('appearance save and reset serialize formal preference commands with revision CAS', async () => {
  const fixture = preferencePort({ theme: 'system', unrelated: true }, 7)
  const target = { theme: 'dark', controlSize: 'l', textSize: 's', cornerSize: 'l' } as const
  const saved = await saveWebAppearancePreferences(fixture.port, fixture.values(), target, 7)
  expect(saved.revision).toBe(11)
  expect(fixture.calls).toEqual([
    { kind: 'set', key: 'theme', revision: 7 },
    { kind: 'set', key: 'appearance.controlSize', revision: 8 },
    { kind: 'set', key: 'appearance.textSize', revision: 9 },
    { kind: 'set', key: 'appearance.cornerSize', revision: 10 },
  ])
  expect(resolveWebAppearancePreferences(saved.values)).toEqual(target)
  expect(hasWebAppearanceOverrides(saved.values)).toBe(true)

  const reset = await resetWebAppearancePreferences(fixture.port, saved.values, saved.revision)
  expect(reset.revision).toBe(15)
  expect(reset.values).toEqual({ unrelated: true })
  expect(resolveWebAppearancePreferences(reset.values)).toEqual(DEFAULT_WEB_APPEARANCE_PREFERENCES)
  expect(hasWebAppearanceOverrides(reset.values)).toBe(false)

  await expect(
    saveWebAppearancePreferences(fixture.port, reset.values, { ...target, theme: 'light' }, 7),
  ).rejects.toEqual({ code: 'COMMAND_CONFLICT' })
})

test('appearance settings renders host copy and shared design-system primitives', () => {
  const labels = getShellCopy('en-US').appearance
  const html = renderToStaticMarkup(
    <WebAppearanceSettings
      labels={labels}
      value={DEFAULT_WEB_APPEARANCE_PREFERENCES}
      revision={0}
      ready
      canReset={false}
      systemPrefersDark
      onSave={() => Promise.resolve({ revision: 1 })}
      onReset={() => Promise.resolve({ revision: 1 })}
    />,
  )
  expect(html).toContain('data-variant="body">Appearance</h2>')
  expect(html).toContain('Applies globally on this device')
  expect(html).toContain('aria-label="Live preview"')
  expect(html).toContain('data-lumen-mode="dark"')
  expect(html).toContain('data-lumen-control-size="m"')
  expect(html.match(/class="lumen-control/g)?.length).toBe(6)
  expect(html).toContain('data-variant="solid"')
  expect(html).toContain('for="hbar-appearance-theme"')
  expect(html).not.toContain('Write a message')
})

test('web appearance maps persisted preferences into the controlled Lumen provider contract', () => {
  expect(createWebLumenAppearance('light', { controlSize: 's', textSize: 'l', cornerSize: 'm' }, false)).toEqual({
    mode: 'light',
    controlSize: 's',
    textSize: 'l',
    cornerSize: 'm',
    shape: 'rounded',
    glow: 65,
    motion: false,
  })
})
