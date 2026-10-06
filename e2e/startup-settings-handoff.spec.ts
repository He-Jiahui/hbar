import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectLumenValue, selectLumenOption } from './support/lumen-controls'

const evidence = process.env.HBAR_STARTUP_EVIDENCE_DIR ?? 'artifacts/startup-handoff'
if (!/^artifacts\/startup-handoff(?:\/[A-Za-z0-9_-]+)*$/.test(evidence))
  throw new Error('Startup evidence must stay under the ignored startup-handoff directory')
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45015}`
const settings = (page: Page) => page.locator('.hbar-app-react-settings-workspace')
const envelope = z
  .object({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional() })
  .passthrough()
const preferenceWritesKey = 'hbar:e2e:startup-preference-writes'
const preferenceReadsKey = 'hbar:e2e:startup-preference-reads'
const writesSchema = z.array(z.string())
async function removeOwnedRoot(root: string) {
  const resolved = await realpath(root)
  const parent = await realpath(tmpdir())
  if (dirname(resolved) !== parent || !basename(resolved).startsWith('hbar-startup-handoff-'))
    throw new Error('Refusing cleanup outside this test-owned temporary root')
  await rm(resolved, { recursive: true, force: true })
}

async function gateActualHello(page: Page) {
  let helloId: string | number | undefined
  let released = false
  let heldAt = 0
  let releasedAt = 0
  const held = Promise.withResolvers<() => void>()
  const commands: string[] = []
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = envelope.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.method === 'system.hello' && !released) helloId = parsed.data.id
        const command = z.object({ params: z.object({ commandId: z.string() }) }).safeParse(JSON.parse(message))
        if (command.success) commands.push(command.data.params.commandId)
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = envelope.safeParse(JSON.parse(message))
        if (parsed.success && helloId !== undefined && parsed.data.id === helloId && !released) {
          heldAt = Date.now()
          held.resolve(() => {
            released = true
            releasedAt = Date.now()
            socket.send(message)
          })
          return
        }
      }
      socket.send(message)
    })
  })
  return {
    async waitForReply() {
      const timeout = Promise.withResolvers<never>()
      const timer = setTimeout(
        () => timeout.reject(new Error('The real hello reply was not received within 10 seconds')),
        10_000,
      )
      try {
        return await Promise.race([held.promise, timeout.promise])
      } finally {
        clearTimeout(timer)
      }
    },
    commands,
    get heldAt() {
      return heldAt
    },
    get released() {
      return released
    },
    get releasedAt() {
      return releasedAt
    },
  }
}

async function selectGroup(page: Page, locale: ShellLocale, group: 'general' | 'providers' | 'appearance') {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, group)
  else {
    const label =
      group === 'general'
        ? copy.general.group
        : group === 'appearance'
          ? copy.appearance.group
          : copy.settings.resolve('i18n:settings.groups.providers')
    await page
      .getByRole('navigation', { name: copy.settings.groups, exact: true })
      .getByRole('button', { name: label, exact: true })
      .click()
  }
}
async function openSettings(page: Page, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
  await expect(settings(page)).toBeVisible()
}
async function preferenceWrites(page: Page) {
  return writesSchema.parse(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as unknown, preferenceWritesKey),
  )
}
async function installPreferenceObserver(
  page: Page,
  seed?: { key: string; value: string },
  blockedPreferenceKey?: string,
) {
  await page.addInitScript(
    ({ observerKey, readsKey, initial, blockedKey }) => {
      const read = Storage.prototype.getItem
      const write = Storage.prototype.setItem
      if (initial && localStorage.getItem(initial.key) === null) write.call(localStorage, initial.key, initial.value)
      if (localStorage.getItem(observerKey) === null) write.call(localStorage, observerKey, '[]')
      write.call(localStorage, readsKey, '[]')
      Storage.prototype.setItem = function observedPreferenceWrite(key: string, value: string) {
        if (key.endsWith(':preferences')) {
          const prior: unknown = JSON.parse(localStorage.getItem(observerKey) ?? '[]')
          if (!Array.isArray(prior)) throw new Error('Invalid test preference observer')
          const keys = prior.map((entry: unknown) => {
            if (typeof entry !== 'string') throw new Error('Invalid test preference observer key')
            return entry
          })
          write.call(localStorage, observerKey, JSON.stringify([...keys, key]))
        }
        return write.call(this, key, value)
      }
      if (blockedKey) write.call(localStorage, 'hbar:e2e:startup-block-confirmed-read', '1')
      Storage.prototype.getItem = function observedConfirmedRead(key: string) {
        if (key.endsWith(':preferences')) {
          const prior: unknown = JSON.parse(read.call(localStorage, readsKey) ?? '[]')
          if (!Array.isArray(prior)) throw new Error('Invalid test preference read observer')
          const keys = prior.map((entry: unknown) => {
            if (typeof entry !== 'string') throw new Error('Invalid test preference read key')
            return entry
          })
          write.call(localStorage, readsKey, JSON.stringify([...keys, key]))
        }
        if (key === blockedKey && read.call(this, 'hbar:e2e:startup-block-confirmed-read') === '1')
          throw new DOMException('Fixture confirmed preference read is unavailable', 'SecurityError')
        return read.call(this, key)
      }
    },
    {
      observerKey: preferenceWritesKey,
      readsKey: preferenceReadsKey,
      initial: seed ?? null,
      blockedKey: blockedPreferenceKey ?? null,
    },
  )
}

test('Provider editing is gated before hello; the original entry survives and becomes usable without a Provider write', async ({
  browser,
}) => {
  const f = await startupFixture(browser, 'en-US', 1440, 'provider-draft')
  try {
    await openSettings(f.page, 'en-US')
    await selectGroup(f.page, 'en-US', 'providers')
    const add = f.page.getByRole('button', { name: f.copy.providers.list.add, exact: true })
    await expect(add).toBeDisabled()
    expect(f.gate.released).toBe(false)
    const dialog = f.page.locator('.hbar-app-react-provider-dialog')
    await expect(dialog).toHaveCount(0)
    const original = await settings(f.page).elementHandle()
    const focus = await f.page.locator(':focus').elementHandle()
    await f.snapshot('before', { preferenceWrites: await preferenceWrites(f.page), commands: f.gate.commands })
    await f.connect()
    const originalConnected = await original?.evaluate((node) => node.isConnected)
    const sameFocus = await focus?.evaluate((node) => node.isConnected && document.activeElement === node)
    const focusConnected = await focus?.evaluate((node) => node.isConnected)
    const focusAfter = await f.page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      id: document.activeElement?.id,
      text: document.activeElement?.textContent?.slice(0, 80),
    }))
    await f.snapshot('after', { originalConnected, sameFocus, focusConnected, focusAfter, commands: f.gate.commands })
    expect(originalConnected).toBe(true)
    expect(sameFocus).toBe(true)
    await expect(add).toBeEnabled()
    await add.click()
    await expect(dialog).toBeVisible()
    await dialog.locator('#provider-name').fill('Confirmed local Provider draft — no API key, no mutation')
    await expect(dialog.locator('#provider-name')).toHaveValue(
      'Confirmed local Provider draft — no API key, no mutation',
    )
    expect(f.gate.commands.filter((command) => command === 'provider.save' || command === 'provider.remove')).toEqual(
      [],
    )
    await f.finish()
    await original?.dispose()
    await focus?.dispose()
  } finally {
    await f.close()
  }
})

async function startupFixture(
  browser: Browser,
  locale: ShellLocale,
  width: number,
  name: string,
  seed: 'none' | 'different' | 'read-error' = 'none',
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-startup-handoff-'))
  const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    await mkdir(evidence, { recursive: true })
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45017),
      goalAutoContinue: false,
    })
    const hostInfo = await host.client.connect()
    const confirmedKey = `hbar:web:hbar:${hostInfo.instanceId}:preferences`
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const values = { theme: 'light', 'appearance.controlSize': 'm', 'appearance.textSize': 's' }
    await installPreferenceObserver(
      page,
      seed === 'none'
        ? undefined
        : { key: confirmedKey, value: JSON.stringify({ version: 1, revision: 7, value: values }) },
      seed === 'read-error' ? confirmedKey : undefined,
    )
    const gate = await gateActualHello(page)
    await page.goto(base())
    const release = await gate.waitForReply()
    const copy = getShellCopy(locale)
    const capturedHost = host
    return {
      page,
      context,
      host: capturedHost,
      gate,
      release,
      copy,
      confirmedKey,
      errors,
      async connect() {
        release()
        await expect(
          page
            .getByRole('complementary', { name: copy.shell.projectsAndSessions, includeHidden: true })
            .locator('footer'),
        ).toContainText(copy.shell.connected)
        await expect
          .poll(async () =>
            writesSchema.parse(
              await page.evaluate(
                (key) => JSON.parse(localStorage.getItem(key) ?? '[]') as unknown,
                preferenceReadsKey,
              ),
            ),
          )
          .toContain(confirmedKey)
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
        )
      },
      async snapshot(suffix: string, report: object) {
        await page.screenshot({ path: `${evidence}/${name}-${locale}-${width}-${suffix}.png` })
        await writeFile(`${evidence}/${name}-${locale}-${width}-${suffix}.json`, JSON.stringify(report, null, 2))
      },
      async finish() {
        expect(
          (await capturedHost.client.call('session.snapshot', { sessionId: capturedHost.ready.sessionId })).runs,
        ).toEqual([])
        expect(errors).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      },
      async close() {
        await context.close()
        await stopWebSessionHost(capturedHost)
        await removeOwnedRoot(root)
      },
    }
  } catch (error) {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedRoot(root)
    throw error
  }
}

async function changeAppearance(page: Page, locale: ShellLocale) {
  const labels = getShellCopy(locale).appearance
  const form = page.locator('.hbar-web-appearance-settings')
  await form.getByRole('radio', { name: labels.theme.dark, exact: true }).click()
  await selectLumenOption(form.getByRole('combobox', { name: labels.controlSize.label, exact: true }), 's')
  await selectLumenOption(form.getByRole('combobox', { name: labels.textSize.label, exact: true }), 'l')
  return form
}
async function assertDraft(page: Page, locale: ShellLocale) {
  const labels = getShellCopy(locale).appearance
  const form = page.locator('.hbar-web-appearance-settings')
  await expect(form.getByRole('radio', { name: labels.theme.dark, exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expectLumenValue(form.getByRole('combobox', { name: labels.controlSize.label, exact: true }), 's')
  await expectLumenValue(form.getByRole('combobox', { name: labels.textSize.label, exact: true }), 'l')
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    for (const group of ['general', 'providers', 'appearance'] as const) {
      test(`startup handoff preserves original ${group} page, focus and local choices: ${locale} ${width}`, async ({
        browser,
      }) => {
        test.setTimeout(60_000)
        const root = await mkdtemp(join(tmpdir(), 'hbar-startup-handoff-'))
        const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
        let host: WebSessionHost | undefined
        let report: object = { locale, width, group, completed: false }
        try {
          await mkdir(evidence, { recursive: true })
          host = await startWebSessionHost({
            root,
            port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45017),
            goalAutoContinue: false,
          })
          const hostInfo = await host.client.connect()
          expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
            true,
          )
          const page = await context.newPage()
          const errors: string[] = []
          page.on('pageerror', (error) => errors.push(error.message))
          await installPreferenceObserver(page)
          const gate = await gateActualHello(page)
          await page.goto(base())
          const release = await gate.waitForReply()
          expect(gate.released).toBe(false)
          await openSettings(page, locale)
          await selectGroup(page, locale, group)
          let activeLocale = locale
          let copy = getShellCopy(activeLocale)
          if (group === 'general') {
            activeLocale = locale === 'en-US' ? 'zh-CN' : 'en-US'
            const language = getShellCopy(activeLocale).general.options[activeLocale]
            await page.getByRole('radio', { name: language, exact: true }).click()
            copy = getShellCopy(activeLocale)
            await expect(page.locator('html')).toHaveAttribute('lang', activeLocale)
          }
          if (group === 'appearance') {
            const form = page.locator('.hbar-web-appearance-settings')
            await form.getByRole('radio', { name: copy.appearance.theme.dark, exact: true }).click()
            await selectLumenOption(
              form.getByRole('combobox', { name: copy.appearance.controlSize.label, exact: true }),
              's',
            )
            await selectLumenOption(
              form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true }),
              'l',
            )
            await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeDisabled()
            await expect(form.getByRole('button', { name: copy.appearance.reset, exact: true })).toBeDisabled()
            await expect(form.getByText(copy.appearance.identityPending, { exact: true })).toBeVisible()
            await form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true }).focus()
          }
          expect(await preferenceWrites(page)).toEqual([])
          const originalPage = await settings(page).elementHandle()
          const originalFocus = await page.locator(':focus').elementHandle()
          if (!originalPage || !originalFocus) throw new Error('Expected original Settings DOM and keyboard focus')
          await page.screenshot({ path: `${evidence}/${group}-${locale}-${width}-before.png` })
          if (group === 'appearance') {
            const form = page.locator('.hbar-web-appearance-settings')
            await form.locator('footer').scrollIntoViewIfNeeded()
            await expect(form.getByText(copy.appearance.identityPending, { exact: true })).toBeInViewport()
            await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeInViewport()
            await expect(form.getByRole('button', { name: copy.appearance.reset, exact: true })).toBeInViewport()
            await page.screenshot({ path: `${evidence}/${group}-${locale}-${width}-before-actions.png` })
          }
          expect(gate.released).toBe(false)
          release()
          const footer = page
            .getByRole('complementary', { name: copy.shell.projectsAndSessions, includeHidden: true })
            .locator('footer')
          await expect(footer).toContainText(copy.shell.connected)
          await expect
            .poll(async () =>
              writesSchema.parse(
                await page.evaluate(
                  (key) => JSON.parse(localStorage.getItem(key) ?? '[]') as unknown,
                  preferenceReadsKey,
                ),
              ),
            )
            .toContain(`hbar:web:hbar:${hostInfo.instanceId}:preferences`)
          if (group === 'providers')
            await expect(page.getByRole('button', { name: copy.providers.list.add, exact: true })).toBeEnabled()
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          )
          const sameDom = await originalPage.evaluate((node) => node.isConnected)
          const sameFocus = await originalFocus.evaluate((node) => node.isConnected && node === document.activeElement)
          const focusConnected = await originalFocus.evaluate((node) => node.isConnected)
          const focusAfter = await page.evaluate(() => ({
            tag: document.activeElement?.tagName,
            id: document.activeElement?.id,
            text: document.activeElement?.textContent?.slice(0, 80),
          }))
          report = {
            locale,
            activeLocale,
            width,
            group,
            sameDom,
            sameFocus,
            focusConnected,
            focusAfter,
            heldMs: gate.releasedAt - gate.heldAt,
            preferenceWrites: await preferenceWrites(page),
            commands: gate.commands,
            errors,
          }
          await page.screenshot({ path: `${evidence}/${group}-${locale}-${width}-after.png` })
          expect(sameDom).toBe(true)
          expect(sameFocus).toBe(true)
          await expectLumenValue(page.getByRole('combobox', { name: copy.settings.groups, exact: true }), group)
          await expect(page.locator('html')).toHaveAttribute('lang', activeLocale)
          expect(await page.evaluate((key) => localStorage.getItem(key), WEB_LANGUAGE_STORAGE_KEY)).toBe(
            group === 'general' ? activeLocale : null,
          )
          expect((await preferenceWrites(page)).some((key) => key.includes(':pending:'))).toBe(false)
          if (group === 'appearance') {
            const form = page.locator('.hbar-web-appearance-settings')
            await form.locator('footer').scrollIntoViewIfNeeded()
            await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeInViewport()
            await expect(form.getByRole('button', { name: copy.appearance.reset, exact: true })).toBeInViewport()
            await page.screenshot({ path: `${evidence}/${group}-${locale}-${width}-after-actions.png` })
            await expect(form.getByRole('radio', { name: copy.appearance.theme.dark, exact: true })).toHaveAttribute(
              'aria-checked',
              'true',
            )
            await expectLumenValue(
              form.getByRole('combobox', { name: copy.appearance.controlSize.label, exact: true }),
              's',
            )
            await expectLumenValue(
              form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true }),
              'l',
            )
            await form.getByRole('button', { name: copy.appearance.save, exact: true }).click()
            await expect(form.getByText(copy.appearance.saved, { exact: true })).toBeVisible()
            const written = await preferenceWrites(page)
            expect(written).toContain(`hbar:web:hbar:${hostInfo.instanceId}:preferences`)
            expect(written.every((key) => key === `hbar:web:hbar:${hostInfo.instanceId}:preferences`)).toBe(true)
            await page.reload()
            await openSettings(page, activeLocale)
            await selectGroup(page, activeLocale, 'appearance')
            await expect(form.getByRole('radio', { name: copy.appearance.theme.dark, exact: true })).toHaveAttribute(
              'aria-checked',
              'true',
            )
            await expectLumenValue(
              form.getByRole('combobox', { name: copy.appearance.controlSize.label, exact: true }),
              's',
            )
            await expectLumenValue(
              form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true }),
              'l',
            )
            await form.getByRole('button', { name: copy.appearance.reset, exact: true }).click()
            await expect(form.getByText(copy.appearance.saved, { exact: true })).toBeVisible()
            await expect(form.getByRole('radio', { name: copy.appearance.theme.system, exact: true })).toHaveAttribute(
              'aria-checked',
              'true',
            )
            await expectLumenValue(
              form.getByRole('combobox', { name: copy.appearance.controlSize.label, exact: true }),
              'm',
            )
            await expectLumenValue(
              form.getByRole('combobox', { name: copy.appearance.textSize.label, exact: true }),
              'm',
            )
            expect(
              (await preferenceWrites(page)).every((key) => key === `hbar:web:hbar:${hostInfo.instanceId}:preferences`),
            ).toBe(true)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          expect(
            gate.commands.filter(
              (name) =>
                name.startsWith('provider.') &&
                !name.endsWith('.list') &&
                !name.endsWith('.get') &&
                !name.endsWith('.describe') &&
                !name.startsWith('provider.preset.'),
            ),
          ).toEqual([])
          expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toEqual([])
          expect(errors).toEqual([])
          await originalPage.dispose()
          await originalFocus.dispose()
        } finally {
          await writeFile(`${evidence}/${group}-${locale}-${width}.json`, JSON.stringify(report, null, 2))
          await context.close()
          if (host) await stopWebSessionHost(host)
          await removeOwnedRoot(root)
        }
      })
    }
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    for (const latest of ['back', 'category'] as const) {
      test(`a late startup hello respects the user's latest ${latest} choice and retains the Appearance draft: ${locale} ${width}`, async ({
        browser,
      }) => {
        const f = await startupFixture(browser, locale, width, latest)
        try {
          await openSettings(f.page, locale)
          await selectGroup(f.page, locale, 'appearance')
          await changeAppearance(f.page, locale)
          expect(f.gate.released).toBe(false)
          expect(await preferenceWrites(f.page)).toEqual([])
          if (latest === 'back') await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
          else await selectGroup(f.page, locale, 'general')
          const node = latest === 'category' ? await settings(f.page).elementHandle() : null
          await f.snapshot('before', { settingsCount: await settings(f.page).count(), released: f.gate.released })
          await f.connect()
          await f.snapshot('after', {
            settingsCount: await settings(f.page).count(),
            originalConnected: node ? await node.evaluate((element) => element.isConnected) : null,
          })
          if (latest === 'back') {
            await expect(settings(f.page)).toHaveCount(0)
            await openSettings(f.page, locale)
          } else {
            expect(await node?.evaluate((element) => element.isConnected)).toBe(true)
            await expectLumenValue(
              f.page.getByRole('combobox', { name: f.copy.settings.groups, exact: true }),
              'general',
            )
          }
          await selectGroup(f.page, locale, 'appearance')
          await assertDraft(f.page, locale)
          expect((await preferenceWrites(f.page)).some((key) => key.includes(':pending:'))).toBe(false)
          await f.finish()
          await node?.dispose()
        } finally {
          await f.close()
        }
      })
    }
    test(`confirmed Host preferences differ from startup draft, requiring explicit recovery without overwriting either: ${locale} ${width}`, async ({
      browser,
    }) => {
      const f = await startupFixture(browser, locale, width, 'conflict', 'different')
      try {
        await openSettings(f.page, locale)
        await selectGroup(f.page, locale, 'appearance')
        const form = await changeAppearance(f.page, locale)
        await expect(form.getByRole('button', { name: f.copy.appearance.save, exact: true })).toBeDisabled()
        expect(await preferenceWrites(f.page)).toEqual([])
        const original = await settings(f.page).elementHandle()
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).focus()
        await f.snapshot('before', { preferenceWrites: await preferenceWrites(f.page) })
        await f.connect()
        expect(await original?.evaluate((element) => element.isConnected)).toBe(true)
        await assertDraft(f.page, locale)
        await expect(form.getByText(f.copy.appearance.conflict, { exact: true })).toBeVisible()
        await expect(form.getByRole('button', { name: f.copy.appearance.save, exact: true })).toBeDisabled()
        expect(await preferenceWrites(f.page)).toEqual([])
        await f.snapshot('conflict', { preferenceWrites: await preferenceWrites(f.page), namespace: f.confirmedKey })
        await form.getByRole('button', { name: f.copy.appearance.check, exact: true }).click()
        await assertDraft(f.page, locale)
        expect(await preferenceWrites(f.page)).toEqual([])
        await form.getByRole('button', { name: f.copy.appearance.continueDraft, exact: true }).click()
        await assertDraft(f.page, locale)
        await form.getByRole('button', { name: f.copy.appearance.save, exact: true }).click()
        await expect(form.getByText(f.copy.appearance.saved, { exact: true })).toBeVisible()
        expect((await preferenceWrites(f.page)).every((key) => key === f.confirmedKey)).toBe(true)
        await f.page.reload()
        await openSettings(f.page, locale)
        await selectGroup(f.page, locale, 'appearance')
        await assertDraft(f.page, locale)
        await f.finish()
        await original?.dispose()
      } finally {
        await f.close()
      }
    })
  }
  test(`confirmed preference read failure preserves startup draft and offers explicit read-only recovery: ${locale}`, async ({
    browser,
  }) => {
    const width = locale === 'en-US' ? 1440 : 320
    const f = await startupFixture(browser, locale, width, 'read-error', 'read-error')
    try {
      await openSettings(f.page, locale)
      await selectGroup(f.page, locale, 'appearance')
      const form = await changeAppearance(f.page, locale)
      expect(await preferenceWrites(f.page)).toEqual([])
      await f.connect()
      await assertDraft(f.page, locale)
      await expect(form.getByText(f.copy.appearance.restoreError('PERSISTENCE_FAILED'), { exact: true })).toBeVisible()
      await expect(form.getByRole('button', { name: f.copy.appearance.save, exact: true })).toBeDisabled()
      await expect(form.getByRole('button', { name: f.copy.appearance.reset, exact: true })).toBeDisabled()
      await f.snapshot('blocked', { preferenceWrites: await preferenceWrites(f.page) })
      await f.page.evaluate(() => localStorage.setItem('hbar:e2e:startup-block-confirmed-read', '0'))
      await form.getByRole('button', { name: f.copy.appearance.check, exact: true }).click()
      await assertDraft(f.page, locale)
      await expect(form.getByText(f.copy.appearance.conflict, { exact: true })).toBeVisible()
      expect(await preferenceWrites(f.page)).toEqual([])
      await f.snapshot('recovered', { preferenceWrites: await preferenceWrites(f.page) })
      await f.finish()
    } finally {
      await f.close()
    }
  })
}
