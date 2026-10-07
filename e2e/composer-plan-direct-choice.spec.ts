import { expect, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { cleanupOwnedPermissionFixture } from './support/permission-fixture-cleanup'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`visible Plan exit keeps the original approval choice and draft: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-plan-exit-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        budgetAutoContinue: false,
      })
      const { sessionId } = host.ready
      const copy = getShellCopy(locale)
      const labels = copy.session.permissionPicker
      const permissionBefore = await host.client.call('permission.get', {})
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const picker = page.locator('.hbar-composer-permission-picker')
      const popup = page.locator('.hbar-composer-permission-surface')
      const draft = 'Preserve this draft while leaving Plan mode — 保留草稿'
      await prompt.fill(draft)
      await picker
        .getByRole('button', { name: labels.trigger(labels.inheritedTrigger(labels.options.ask.label)) })
        .click()
      await popup.getByRole('menuitemradio', { name: labels.options.deny.label, exact: false }).click()
      await expect(picker.getByRole('button', { name: labels.trigger(labels.options.deny.label) })).toBeVisible()
      await picker.getByRole('button', { name: labels.trigger(labels.options.deny.label) }).click()
      await popup.getByRole('menuitemradio', { name: labels.plan.label, exact: false }).click()
      await expect(picker.getByRole('button', { name: labels.trigger(labels.plan.label) })).toBeVisible()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 900 })
        await picker.getByRole('button', { name: labels.trigger(labels.plan.label) }).click()
        const exit = popup.getByRole('button', { name: labels.plan.exit, exact: true })
        await expect(exit).toBeInViewport()
        await expect(exit).toBeFocused()
        await expect(popup.getByText(labels.plan.exitDescription)).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/plan-exit-${locale}-${width}.png` })
        if (width === 1440) await popup.getByRole('button', { name: labels.close }).click()
      }
      await popup.getByRole('button', { name: labels.plan.exit, exact: true }).click()
      await expect(picker.getByRole('button', { name: labels.trigger(labels.options.deny.label) })).toBeVisible()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
      expect(await host.client.call('permission.get', {})).toEqual(permissionBefore)
      await expectComposerText(prompt, draft)
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupOwnedPermissionFixture(root, 'hbar-plan-exit-')
    }
  })

  test(`one composer choice leaves Plan and selects approval: ${locale}`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-plan-direct-choice-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        budgetAutoContinue: false,
      })
      const sessionId = host.ready.sessionId
      const copy = getShellCopy(locale)
      const labels = copy.session.permissionPicker
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const picker = page.locator('.hbar-composer-permission-picker')
      const popup = page.locator('.hbar-composer-permission-surface')
      const open = async (label: string) => {
        await picker.getByRole('button', { name: labels.trigger(label), exact: true }).click()
      }
      const plan = popup.getByRole('menuitemradio', { name: labels.plan.label, exact: false })
      await open(labels.inheritedTrigger(labels.options.ask.label))
      await plan.click()
      await expect(picker.getByRole('button', { name: labels.trigger(labels.plan.label) })).toBeVisible()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
      await open(labels.plan.label)
      await plan.click()
      await expect(popup).toBeHidden()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 960 })
        await open(labels.plan.label)
        const deny = popup.getByRole('menuitemradio', { name: labels.options.deny.label, exact: false })
        await expect(deny).toBeEnabled()
        await expect(plan).toHaveAttribute('aria-checked', 'true')
        await expect(plan).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`plan-direct-${locale}-${width}.png`) })
        if (width === 1440) {
          await popup.getByRole('menuitemradio', { name: labels.options.allow.label, exact: false }).click()
          await expect(popup.getByText(labels.confirmTitle)).toBeVisible()
          expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
          await popup.getByRole('button', { name: labels.cancel }).click()
          await popup.getByRole('button', { name: labels.close }).click()
        }
      }
      await popup.getByRole('menuitemradio', { name: labels.options.deny.label, exact: false }).click()
      await expect(picker.getByRole('button', { name: labels.trigger(labels.options.deny.label) })).toBeVisible()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Check the selected approval')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(async () => (await host!.client.call('session.snapshot', { sessionId })).runs.length)
        .toBeGreaterThan(0)
      const userRun = (await host.client.call('session.snapshot', { sessionId })).runs.find(
        (run) => run.input.source === 'user',
      )
      expect(userRun?.input).toMatchObject({ approval: 'deny', mode: 'default' })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupOwnedPermissionFixture(root, 'hbar-plan-direct-choice-')
    }
  })
}
