import { expect, test } from '@playwright/test'
import { createSettingsCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { chatDatabaseCopy } from '../apps/web/src/chat-database-copy'
import { resolveChatDatabaseChoiceCopy } from '../apps/web/src/chat-database-settings-copy'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const exact = await realpath(root)
  if (
    dirname(exact).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(exact).startsWith('hbar-chat-browser-schedule-')
  )
    throw new Error('Refusing cleanup outside owned schedule fixture')
  await rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`schedule conditions, native time picker, weekly calendar and automatic zone persist: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-chat-browser-schedule-'))
    const zone = locale === 'zh-CN' ? 'Asia/Shanghai' : 'America/Los_Angeles'
    const context = await browser.newContext({
      locale,
      timezoneId: zone,
      colorScheme: locale === 'zh-CN' ? 'dark' : 'light',
      viewport: { width: 1440, height: 960 },
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        fixture: 'chat-database',
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4437),
      })
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4439}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const fieldLabel = (name: string) => copy.settings.resolve(`i18n:settings.chatDatabase.${name}.label`)
      const enter = async () => {
        await page.goto(origin)
        await page.getByRole('treeitem', { name: host!.ready.sessionTitle, exact: true }).click()
        await expect(page.getByRole('region', { name: host!.ready.sessionTitle, exact: true })).toBeVisible()
        await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
        await page
          .getByRole('navigation', { name: copy.settings.groups })
          .getByRole('button', { name: chatDatabaseCopy(locale).title, exact: true })
          .click()
      }
      await enter()
      const scheduled = page.getByRole('switch', { name: fieldLabel('scheduleEnabled'), exact: true })
      const frequency = page.getByRole('combobox', { name: fieldLabel('scheduleKind'), exact: true })
      const time = page.locator('input[type=time]')
      const timeRow = page.locator('[data-field="f:chatDatabase.scheduleHour"]')
      const days = page.getByRole('group', { name: fieldLabel('scheduleWeekdays'), exact: true })
      await expect(time).toHaveValue('03:00')
      await expect(time).toHaveAccessibleName(fieldLabel('scheduleHour'))
      await expect(days).toHaveCount(0)
      await expect(
        page.locator('[data-field="f:chatDatabase.scheduleMinute"], [data-field="f:chatDatabase.timezone"]'),
      ).toHaveCount(0)
      await scheduled.click()
      await expect(time).toHaveCount(0)
      await expect(frequency).toHaveCount(0)
      await expect(days).toHaveCount(0)
      await scheduled.click()
      await expect(time).toHaveValue('03:00')
      await expect(timeRow).toContainText(zone)
      await time.click()
      await page.keyboard.press('Escape')
      await time.fill('18:45')
      await expect(time).toHaveValue('18:45')
      await selectLumenOption(frequency, 'string:weekly')
      await expect(days.getByRole('button')).toHaveCount(7)
      const day = (value: number) => {
        const name = resolveChatDatabaseChoiceCopy(locale, 'f:chatDatabase.scheduleWeekdays', value)
        if (!name) throw new Error('Missing weekday label')
        return days.getByRole('button', {
          name,
          exact: true,
        })
      }
      await day(0).click()
      await expect(day(0)).toHaveAttribute('aria-pressed', 'true')
      await day(1).click()
      await day(5).click()
      await day(0).click()
      await expect(day(1)).toHaveAttribute('aria-pressed', 'true')
      await expect(day(5)).toHaveAttribute('aria-pressed', 'true')
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await days.scrollIntoViewIfNeeded()
        await expect(days).toBeVisible()
        await expect(time).toHaveCSS('padding', '6px 12px')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`schedule-${width}.png`) })
      }
      await selectLumenOption(frequency, 'string:daily')
      await expect(days).toHaveCount(0)
      await selectLumenOption(frequency, 'string:weekly')
      await expect(day(5)).toHaveAttribute('aria-pressed', 'true')
      await scheduled.click()
      await expect(time).toHaveCount(0)
      await page.getByRole('button', { name: copy.settings.save, exact: true }).click()
      const settings = createSettingsCommandClient(host.client)
      const read = async () =>
        (await settings.execute('settings.get', { scope: { kind: 'global' } })).resolution.reports
      await expect.poll(async () => (await read())['f:chatDatabase.scheduleHour']?.effectiveValue).toBe(18)
      const reports = await read()
      expect(reports['f:chatDatabase.scheduleMinute']?.effectiveValue).toBe(45)
      expect(reports['f:chatDatabase.scheduleWeekdays']?.effectiveValue).toEqual([1, 5])
      expect(reports['f:chatDatabase.timezone']?.effectiveValue).toBe(zone)
      expect(reports['f:chatDatabase.scheduleEnabled']?.effectiveValue).toBe(false)
      await page.setViewportSize({ width: 1440, height: 960 })
      await enter()
      await expect(time).toHaveCount(0)
      await scheduled.click()
      await expect(time).toHaveValue('18:45')
      await expect(day(1)).toHaveAttribute('aria-pressed', 'true')
      await expect(timeRow).toContainText(zone)
      const scopes = page.getByRole('combobox', { name: copy.settings.scopes, exact: true })
      await selectLumenOption(scopes, 'workspace')
      await expect(time).toHaveCount(0)
      await scheduled.click()
      await time.fill('09:15')
      await page.getByRole('button', { name: copy.settings.save, exact: true }).click()
      await expect(timeRow.getByRole('button', { name: copy.settings.restoreInheritance, exact: true })).toBeVisible()
      await timeRow.getByRole('button', { name: copy.settings.restoreInheritance, exact: true }).click()
      await expect(time).toHaveValue('18:45')
      await page.getByRole('button', { name: copy.settings.save, exact: true }).click()
      const inherited = (
        await settings.execute('settings.get', { scope: { kind: 'workspace', targetId: host.ready.workspaceId } })
      ).resolution.reports
      expect(inherited['f:chatDatabase.scheduleHour']?.localPresence).toBe(false)
      expect(inherited['f:chatDatabase.scheduleMinute']?.localPresence).toBe(false)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
