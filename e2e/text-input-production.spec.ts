import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { chatDatabaseCopy } from '../apps/web/src/chat-database-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const exact = await realpath(root)
  if (
    dirname(exact).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(exact).startsWith('hbar-chat-browser-padding-')
  )
    throw new Error('Refusing cleanup outside owned text input fixture')
  await rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`settings content stays inside its frame with a real Host: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-chat-browser-padding-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        fixture: 'chat-database',
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const shell = getShellCopy(locale)
      const copy = chatDatabaseCopy(locale)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(page.getByRole('region', { name: host.ready.sessionTitle, exact: true })).toBeVisible()
      await page.getByRole('button', { name: shell.shell.settings, exact: true }).click()
      await page
        .getByRole('navigation', { name: shell.settings.groups })
        .getByRole('button', { name: copy.title, exact: true })
        .click()
      const retention = page.getByRole('textbox', {
        name: shell.settings.resolve('i18n:settings.chatDatabase.retentionDays.label'),
        exact: true,
      })
      await expect(retention).toHaveValue('90')
      const field = page.locator('.hbar-schema-form-field').filter({ has: retention })
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', theme)
        for (const width of [1440, 768, 320]) {
          await page.setViewportSize({ width, height: 960 })
          await retention.scrollIntoViewIfNeeded()
          const insets = await field.locator('.hbar-schema-form-copy > *').evaluateAll((elements) =>
            elements.map((element) => {
              const owner = element.closest('.lumen-settings-form-root-surface')
              if (!owner) throw new Error('Missing settings frame')
              const rect = element.getBoundingClientRect(),
                boundary = owner.getBoundingClientRect(),
                style = getComputedStyle(owner)
              return {
                left: rect.left - boundary.left - parseFloat(style.borderLeftWidth),
                right: boundary.right - parseFloat(style.borderRightWidth) - rect.right,
              }
            }),
          )
          expect(insets.length).toBeGreaterThanOrEqual(3)
          for (const inset of insets) {
            expect(inset.left).toBeGreaterThanOrEqual(12)
            expect(inset.right).toBeGreaterThanOrEqual(12)
          }
          await expect(retention).toHaveCSS('padding', '6px 12px')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await expect(retention).toHaveValue('90')
          if (locale === 'zh-CN')
            await page.screenshot({ path: info.outputPath(`settings-padding-${theme}-${width}.png`) })
        }
      }
      await retention.fill('95')
      await expect(retention).toHaveValue('95')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
