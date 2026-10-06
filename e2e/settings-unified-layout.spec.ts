import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const path = await realpath(root)
  if (
    dirname(path).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(path).startsWith('hbar-settings-unified-')
  )
    throw new Error('Unexpected settings fixture root')
  await rm(path, { recursive: true, force: true })
}

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`every settings group uses the same declared content column: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-settings-unified-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45490) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45489}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await page.getByRole('button', { name: getShellCopy(locale).shell.settings, exact: true }).click()
      const labels = getShellCopy(locale).settings
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        for (const group of [
          'general',
          'appearance',
          'model',
          'session',
          'providers',
          'sandbox',
          'skills',
          'extensions',
          'usage',
          'diagnostics',
        ]) {
          if (width > 390)
            await page
              .getByRole('navigation', { name: labels.groups })
              .getByRole('button', {
                name:
                  group === 'general'
                    ? getShellCopy(locale).general.group
                    : group === 'appearance'
                      ? getShellCopy(locale).appearance.group
                      : group === 'usage'
                        ? getShellCopy(locale).settingsUsage.title
                        : group === 'diagnostics'
                          ? getShellCopy(locale).diagnostics.title
                          : labels.resolve(`i18n:settings.groups.${group}`),
                exact: true,
              })
              .click()
          else await selectLumenOption(page.getByRole('combobox', { name: labels.groups, exact: true }), group)
          const content = page.locator('.hbar-app-react-settings-content')
          await expect(content).toBeVisible()
          await expect(content.locator('.hbar-app-react-settings-state')).toHaveCount(0)
          const geometry = await content.evaluate((node) => {
            const scroll = node.closest('.hbar-app-react-settings-scroll')!
            const left = node.getBoundingClientRect().left
            const padding = Number.parseFloat(getComputedStyle(scroll).paddingLeft)
            const child = node.firstElementChild?.getBoundingClientRect()
            return {
              column: Math.abs(left - scroll.getBoundingClientRect().left - padding) < 2,
              child: !child || Math.abs(child.left - left) < 2,
              fits: node.scrollWidth <= node.clientWidth + 1,
            }
          })
          expect(geometry, `${group} at ${width}`).toEqual({ column: true, child: true, fits: true })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (['general', 'model', 'skills'].includes(group))
            await page.screenshot({ path: `artifacts/settings-storage/layout-${locale}-${group}-${width}.png` })
        }
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
