import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSettingsCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { removeOwnedTestDirectory } from '../tests/owned-temp-directory'

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`decision mode settings persist global defaults and session overrides: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const prefix = 'hbar-autonomy-policy-e2e-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4327) })
      const target = await host.client.call('session.create', {
        workspaceId: host.ready.workspaceId,
        title: 'Decision target',
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const copy = getShellCopy(locale)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const open = async () => {
        await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
        await page
          .getByRole('navigation', { name: copy.settings.groups })
          .getByRole('button', {
            name: copy.settings.resolve('i18n:settings.groups.session'),
            exact: true,
          })
          .click()
      }
      await open()
      const scope = page.getByRole('combobox', { name: copy.settings.scopes, exact: true })
      await selectLumenOption(scope, 'global')
      const mode = page.getByRole('combobox', {
        name: copy.settings.resolve('i18n:settings.backend.decisionMode.label'),
        exact: true,
      })
      const targetInput = page.getByRole('textbox', {
        name: copy.settings.resolve('i18n:settings.backend.decisionTarget.label'),
        exact: true,
      })
      await expect(mode).toHaveAttribute('data-value', 'string:wait_user')
      await expect(targetInput).toHaveCount(0)
      await selectLumenOption(mode, 'string:delegate')
      await targetInput.fill(target.id)
      await page
        .locator('.hbar-app-react-settings-footer')
        .getByRole('button', { name: copy.settings.save, exact: true })
        .click()
      const settings = createSettingsCommandClient(host.client)
      await expect
        .poll(async () => {
          const result = await settings.execute('settings.get', { scope: { kind: 'global' } })
          return [
            result.resolution.reports['f:backend.decisionMode']?.effectiveValue,
            result.resolution.reports['f:backend.decisionTargetSessionId']?.effectiveValue,
          ]
        })
        .toEqual(['delegate', target.id])
      await selectLumenOption(scope, 'session')
      await expect(mode).toHaveAttribute('data-value', 'string:delegate')
      await selectLumenOption(mode, 'string:wait_user')
      await expect(targetInput).toHaveCount(0)
      await page
        .locator('.hbar-app-react-settings-footer')
        .getByRole('button', { name: copy.settings.save, exact: true })
        .click()
      const sourceId = host.ready.sessionId
      await expect
        .poll(
          async () =>
            (
              await settings.execute('settings.get', {
                scope: { kind: 'session', targetId: sourceId },
              })
            ).resolution.reports['f:backend.decisionMode']?.effectiveValue,
        )
        .toBe('wait_user')
      await mkdir('artifacts/backend-autonomy', { recursive: true })
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await mode.scrollIntoViewIfNeeded()
        await mode.click()
        await expect(mode).toHaveAttribute('aria-expanded', 'true')
        const listboxId = await mode.getAttribute('aria-controls')
        if (!listboxId) throw new Error('Decision mode has no owned options')
        const listbox = page.locator(`[id=${JSON.stringify(listboxId)}]`)
        await expect(listbox.getByRole('option')).toHaveCount(3)
        const geometry = await listbox.evaluate((element) => {
          const box = element.getBoundingClientRect()
          return {
            fits: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
            portaled: !element.closest('.hbar-app-react-settings-workspace'),
          }
        })
        expect(geometry).toEqual({ fits: true, portaled: true })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({
          path: `artifacts/backend-autonomy/decision-mode-${locale}-${width}.png`,
          fullPage: true,
        })
        await mode.press('Escape')
        await expect(mode).toHaveAttribute('aria-expanded', 'false')
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      await open()
      await selectLumenOption(scope, 'session')
      await expect(mode).toHaveAttribute('data-value', 'string:wait_user')
      await selectLumenOption(scope, 'global')
      await expect(mode).toHaveAttribute('data-value', 'string:delegate')
      await expect(targetInput).toHaveValue(target.id)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedTestDirectory(root, prefix)
    }
  })
}
