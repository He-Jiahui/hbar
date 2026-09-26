import { expect, type Page } from '@playwright/test'
import type { HbarClient } from '@hbar/client'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import {
  readAppearanceBootstrap,
  resolveWebAppearancePreferences,
  sameWebAppearance,
  WEB_APPEARANCE_STORAGE_KEY,
  type WebAppearancePreferences,
} from '../apps/web/src/appearance'
import { readThemeBootstrap, WEB_THEME_STORAGE_KEY } from '../apps/web/src/theme'

const envelope = z
  .object({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional() })
  .passthrough()
const command = z.object({ params: z.object({ commandId: z.string() }) })
const writesKey = 'hbar:native:startup-settings:preference-writes'
const readsKey = 'hbar:native:startup-settings:preference-reads'
const keyLog = z.array(z.string()).max(256)
const preference = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  value: z.record(z.string(), z.unknown()),
})
const savedTabs = z.object({
  version: z.literal(1),
  activeId: z.string().nullable(),
  items: z
    .array(
      z.object({
        kind: z.literal('session'),
        id: z.string().min(1),
        sessionId: z.string().min(1),
        workspaceId: z.string().min(1),
      }),
    )
    .min(1)
    .max(32),
})
type Group = 'general' | 'appearance' | 'providers'

function decoded(message: string): unknown {
  try {
    return JSON.parse(message) as unknown
  } catch {
    return null
  }
}

async function installHelloGate(page: Page) {
  let current: ReturnType<typeof capture> | null = null
  function capture() {
    const held = Promise.withResolvers<void>()
    let sendHeld: (() => void) | null = null
    let released = false
    let heldAt = 0
    let releasedAt = 0
    const commands: string[] = []
    let commandOverflow = false
    return {
      held: held.promise,
      commands,
      recordCommand(id: string) {
        if (commands.length >= 256) commandOverflow = true
        else commands.push(id)
      },
      hold(send: () => void) {
        if (sendHeld || released) throw new Error('Unexpected duplicate native hello reply')
        sendHeld = send
        heldAt = Date.now()
        held.resolve()
      },
      release() {
        if (released || !sendHeld) return
        released = true
        releasedAt = Date.now()
        sendHeld()
      },
      get released() {
        return released
      },
      get heldMs() {
        return releasedAt - heldAt
      },
      get commandOverflow() {
        return commandOverflow
      },
    }
  }
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    let helloId: string | number | undefined
    let owner: ReturnType<typeof capture> | null = null
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const value = decoded(message)
        const parsed = envelope.safeParse(value)
        if (parsed.success && parsed.data.method === 'system.hello' && current && !current.released) {
          helloId = parsed.data.id
          owner = current
        }
        const invocation = command.safeParse(value)
        if (invocation.success) (owner ?? current)?.recordCommand(invocation.data.params.commandId)
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string' && owner && !owner.released) {
        const parsed = envelope.safeParse(decoded(message))
        if (parsed.success && helloId !== undefined && parsed.data.id === helloId) {
          owner.hold(() => socket.send(message)) // Preserve the actual Host reply byte-for-byte.
          return
        }
      }
      socket.send(message)
    })
  })
  return {
    arm() {
      current = capture()
      return current
    },
    release() {
      current?.release()
      current = null
    },
  }
}

async function waitForHeld(held: Promise<void>): Promise<void> {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(
    () => timeout.reject(new Error('Native system.hello reply was not observed within 10 seconds')),
    10_000,
  )
  try {
    await Promise.race([held, timeout.promise])
  } finally {
    clearTimeout(timer)
  }
}

async function installPreferenceObserver(page: Page) {
  await page.addInitScript(
    ({ writesKey, readsKey }) => {
      const read = Storage.prototype.getItem
      const write = Storage.prototype.setItem
      write.call(localStorage, writesKey, '[]')
      write.call(localStorage, readsKey, '[]')
      const record = (key: string, target: string) => {
        const raw: unknown = JSON.parse(read.call(localStorage, target) ?? '[]')
        if (!Array.isArray(raw) || raw.length >= 256)
          throw new Error('Native preference observer exceeded its validated capacity')
        const keys = raw.map((item: unknown) => {
          if (typeof item !== 'string') throw new Error('Native preference observer contains an invalid key')
          return item
        })
        write.call(localStorage, target, JSON.stringify([...keys, key]))
      }
      Storage.prototype.setItem = function observedWrite(key: string, value: string) {
        if (key.endsWith(':preferences')) record(key, writesKey)
        return write.call(this, key, value)
      }
      Storage.prototype.getItem = function observedRead(key: string) {
        if (key.endsWith(':preferences')) record(key, readsKey)
        return read.call(this, key)
      }
    },
    { writesKey, readsKey },
  )
}

async function logs(page: Page, key: string) {
  return keyLog.parse(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as unknown, key))
}
const settings = (page: Page) => page.locator('.hbar-app-react-settings-workspace')

async function readBootstrap(page: Page): Promise<WebAppearancePreferences> {
  const raw = await page.evaluate(
    ({ theme, appearance }) => ({
      theme: localStorage.getItem(theme),
      appearance: localStorage.getItem(appearance),
    }),
    { theme: WEB_THEME_STORAGE_KEY, appearance: WEB_APPEARANCE_STORAGE_KEY },
  )
  const values = new Map([
    [WEB_THEME_STORAGE_KEY, raw.theme],
    [WEB_APPEARANCE_STORAGE_KEY, raw.appearance],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: () => {
      throw new Error('Native bootstrap verification only permits reads')
    },
  }
  return { theme: readThemeBootstrap(storage), ...readAppearanceBootstrap(storage) }
}

async function openSettings(page: Page, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
  await expect(settings(page)).toBeVisible()
}

async function selectGroup(page: Page, locale: ShellLocale, group: Group) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) {
    await mobile.focus()
    await mobile.selectOption(group)
    await expect(mobile).toBeFocused()
  } else {
    const name =
      group === 'general'
        ? copy.general.group
        : group === 'appearance'
          ? copy.appearance.group
          : copy.settings.resolve('i18n:settings.groups.providers')
    const control = page
      .getByRole('navigation', { name: copy.settings.groups, exact: true })
      .getByRole('button', { name, exact: true })
    await control.click()
    await expect(control).toBeFocused()
  }
}

/** Reuses only the launcher's ownership-verified disposable Page/Host; never launches or cleans another process. */
export async function verifyNativeStartupSettings(page: Page, api: HbarClient): Promise<void> {
  const output = resolve('artifacts/startup-handoff/native')
  await mkdir(output, { recursive: true })
  await expect
    .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width: 900, height: 600 })
  const host = await api.connect()
  const confirmedKey = `hbar:web:hbar:${host.instanceId}:preferences`
  const readPreferences = async () =>
    preference.parse(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, confirmedKey),
    )
  const initial = await readPreferences()
  const descriptions = savedTabs.parse(initial.value.workspaceTabs)
  const sourceId = descriptions.items[0]?.sessionId
  if (!sourceId) throw new Error('Native startup verification requires an existing saved Session tab')
  const source = await api.call('session.get', { sessionId: sourceId })
  if (!source || source.archived) throw new Error('Existing native fixture tab is unavailable')
  const beforeRuns = (await api.call('session.snapshot', { sessionId: source.id })).runs
  const gate = await installHelloGate(page)
  await installPreferenceObserver(page)
  const reports: object[] = []
  const cases: readonly { locale: ShellLocale; group: Group }[] = [
    { locale: 'zh-CN', group: 'general' },
    { locale: 'en-US', group: 'providers' },
    { locale: 'en-US', group: 'appearance' },
    { locale: 'zh-CN', group: 'appearance' },
  ]
  try {
    for (const scenario of cases) {
      // Use actual UI and the real prior preference envelope, never seed another baseline or App state.
      let activeLocale: ShellLocale = (await page.locator('html').getAttribute('lang')) === 'zh-CN' ? 'zh-CN' : 'en-US'
      await openSettings(page, activeLocale)
      await selectGroup(page, activeLocale, 'general')
      await page
        .getByRole('radio', { name: getShellCopy(activeLocale).general.options[scenario.locale], exact: true })
        .click()
      activeLocale = scenario.locale
      await expect(page.locator('html')).toHaveAttribute('lang', activeLocale)
      await page.getByRole('button', { name: getShellCopy(activeLocale).settings.back, exact: true }).click()
      await page.getByRole('tab', { name: source.title, exact: true }).click()
      await expect(page.getByRole('tab', { name: source.title, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect
        .poll(async () => savedTabs.parse((await readPreferences()).value.workspaceTabs).activeId)
        .toBe(source.id)
      const baseline = resolveWebAppearancePreferences((await readPreferences()).value)
      const bootstrap = await readBootstrap(page)
      const draft: WebAppearancePreferences = {
        ...bootstrap,
        theme: bootstrap.theme === 'dark' ? 'light' : 'dark',
        controlSize: bootstrap.controlSize === 's' ? 'l' : 's',
        textSize: bootstrap.textSize === 'l' ? 's' : 'l',
      }
      const held = gate.arm()
      await page.reload()
      await waitForHeld(held.held)
      expect(held.released).toBe(false)
      await openSettings(page, activeLocale)
      await selectGroup(page, activeLocale, scenario.group)
      let copy = getShellCopy(activeLocale)
      const form = page.locator('.hbar-web-appearance-settings')
      if (scenario.group === 'general') {
        activeLocale = activeLocale === 'zh-CN' ? 'en-US' : 'zh-CN'
        await page.getByRole('radio', { name: copy.general.options[activeLocale], exact: true }).click()
        copy = getShellCopy(activeLocale)
        await expect(page.locator('html')).toHaveAttribute('lang', activeLocale)
        expect(await page.evaluate((key) => localStorage.getItem(key), WEB_LANGUAGE_STORAGE_KEY)).toBe(activeLocale)
      } else if (scenario.group === 'appearance') {
        await form.getByRole('radio', { name: copy.appearance.theme[draft.theme], exact: true }).click()
        await form
          .getByRole('combobox', { name: copy.appearance.controlSize.label, exact: true })
          .selectOption(draft.controlSize)
        await form
          .getByRole('combobox', { name: copy.appearance.textSize.label, exact: true })
          .selectOption(draft.textSize)
        await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeDisabled()
        await expect(form.getByRole('button', { name: copy.appearance.reset, exact: true })).toBeDisabled()
        await expect(form.getByText(copy.appearance.identityPending, { exact: true })).toBeVisible()
        await form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true }).focus()
      }
      const original = await settings(page).elementHandle()
      const focus = await page.locator(':focus').elementHandle()
      if (!original || !focus) throw new Error('Expected original native Settings DOM and keyboard focus')
      const prefix = `${scenario.group}-${scenario.locale}-900`
      try {
        expect(await logs(page, writesKey)).toEqual([])
        expect(held.released).toBe(false)
        await page.screenshot({ path: join(output, `${prefix}-held.png`) })
        held.release()
        const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, includeHidden: true })
        await expect(sidebar.locator('footer')).toContainText(copy.shell.connected)
        await expect.poll(() => logs(page, readsKey)).toContain(confirmedKey)
        await expect(page.getByRole('tab', { name: source.title, exact: true })).toHaveAttribute(
          'aria-selected',
          'false',
        )
        if (scenario.group === 'providers')
          await expect(page.getByRole('button', { name: copy.providers.list.add, exact: true })).toBeEnabled()
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
        )
        expect(await original.evaluate((node) => node.isConnected)).toBe(true)
        expect(await focus.evaluate((node) => node.isConnected && document.activeElement === node)).toBe(true)
        await expect(page.locator('.hbar-app-react-settings-mobile-group select')).toHaveValue(scenario.group)
        await expect(page.locator('html')).toHaveAttribute('lang', activeLocale)
        expect(await page.evaluate((key) => localStorage.getItem(key), WEB_LANGUAGE_STORAGE_KEY)).toBe(activeLocale)
        if (scenario.group === 'appearance') {
          await expect(
            form.getByRole('radio', { name: copy.appearance.theme[draft.theme], exact: true }),
          ).toHaveAttribute('aria-checked', 'true')
          await expect(
            form.getByRole('combobox', { name: copy.appearance.controlSize.label, exact: true }),
          ).toHaveValue(draft.controlSize)
          await expect(form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true })).toHaveValue(
            draft.textSize,
          )
          const conflictExpected = !sameWebAppearance(baseline, bootstrap)
          if (conflictExpected) {
            await expect(form.getByText(copy.appearance.conflict, { exact: true })).toBeVisible()
            await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeDisabled()
            await form.getByRole('button', { name: copy.appearance.check, exact: true }).click()
            await form.getByRole('button', { name: copy.appearance.continueDraft, exact: true }).click()
            await expect(form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true })).toHaveValue(
              draft.textSize,
            )
          } else {
            await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeEnabled()
          }
          // No save/reset: existing confirmed preferences may be different; this only verifies the retained draft.
        }
        const writes = await logs(page, writesKey)
        expect(held.commandOverflow).toBe(false)
        expect(writes.some((key) => key.includes(':pending:'))).toBe(false)
        expect(
          await page.evaluate(() =>
            Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some(
              (key) => key?.includes(':pending:') && key.endsWith(':preferences'),
            ),
          ),
        ).toBe(false)
        expect(
          held.commands.filter(
            (id) =>
              id === 'run.submit' ||
              id === 'run.retry' ||
              id === 'operation.cancel' ||
              id === 'goal.create' ||
              (id.startsWith('provider.') &&
                !id.endsWith('.list') &&
                !id.endsWith('.get') &&
                !id.endsWith('.describe')),
          ),
        ).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: join(output, `${prefix}-confirmed.png`) })
        reports.push({
          ...scenario,
          activeLocale,
          width: 900,
          height: 600,
          heldMs: held.heldMs,
          sameSettingsDom: true,
          sameFocus: true,
          savedTabDidNotStealPage: true,
          baseline,
          bootstrap,
          draft: scenario.group === 'appearance' ? draft : null,
          preferenceWrites: writes,
          commands: held.commands,
          noPendingPreferenceSave: true,
          noProviderOrRunWrite: true,
        })
      } finally {
        held.release()
        await original.dispose()
        await focus.dispose()
      }
    }
    expect((await api.call('session.snapshot', { sessionId: source.id })).runs).toEqual(beforeRuns)
  } finally {
    gate.release()
    await writeFile(
      join(output, 'verification.json'),
      JSON.stringify({ cases: reports, expectedCases: cases.length, nativeRunByCallerOnly: true }, null, 2),
    )
  }
}
