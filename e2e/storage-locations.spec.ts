import { expect, test } from '@playwright/test'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { storageLocationCopy } from '../apps/web/src/storage-location-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'

async function cleanup(root: string) {
  const path = await realpath(root)
  if (
    dirname(path).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(path).startsWith('hbar-storage-browser-')
  )
    throw new Error('Unexpected storage test root')
  await rm(path, { recursive: true, force: true })
}
for (const locale of ['zh-CN', 'en-US'] as const)
  test(`storage locations preserve drafts, save intent, and restore after refresh: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-storage-browser-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45490),
        budgetAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45489}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const labels = storageLocationCopy(locale)
      const shell = getShellCopy(locale)
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await page.getByRole('button', { name: shell.shell.settings, exact: true }).click()
      await page
        .getByRole('navigation', { name: shell.settings.groups })
        .getByRole('button', { name: labels.title, exact: true })
        .click()
      const field = (name: string) =>
        page.getByRole('textbox', { name: labels.form.resolve(`i18n:storage.${name}`), exact: true })
      await expect(field('sessionsRoot')).toHaveValue(join(root, 'data', 'sessions'))
      const savedRoots = {
        dataRoot: join(root, 'relocated', 'data'),
        cacheRoot: join(root, 'relocated', 'cache'),
        settingsRoot: join(root, 'relocated', 'config'),
        sessionsRoot: join(root, 'relocated', 'history'),
        skillsRoot: join(root, 'relocated', 'skills'),
      }
      await field('sessionsRoot').fill(savedRoots.sessionsRoot)
      await page
        .getByRole('navigation', { name: shell.settings.groups })
        .getByRole('button', { name: shell.general.group, exact: true })
        .click()
      await page
        .getByRole('navigation', { name: shell.settings.groups })
        .getByRole('button', { name: labels.title, exact: true })
        .click()
      await expect(field('sessionsRoot')).toHaveValue(savedRoots.sessionsRoot)
      for (const [name, value] of Object.entries(savedRoots)) await field(name).fill(value)
      await page.getByRole('button', { name: labels.save, exact: true }).click()
      await expect(page.getByText(labels.pending, { exact: true })).toBeVisible()
      const persisted: unknown = JSON.parse(await readFile(join(root, 'bootstrap', 'paths.json'), 'utf8'))
      expect(persisted).toMatchObject({
        version: 2,
        ...savedRoots,
        migration: { source: { dataRoot: join(root, 'data') } },
      })
      await page.reload()
      await page.getByRole('button', { name: shell.shell.settings, exact: true }).click()
      await expect(field('sessionsRoot')).toHaveValue(savedRoots.sessionsRoot)
      await expect(page.getByText(labels.active(join(root, 'data', 'sessions')), { exact: true })).toBeVisible()
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 })
        if (width <= 390)
          await selectLumenOption(page.getByRole('combobox', { name: shell.settings.groups, exact: true }), 'storage')
        await expect(page.getByRole('button', { name: labels.save, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/settings-storage/storage-${locale}-${width}.png` })
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
