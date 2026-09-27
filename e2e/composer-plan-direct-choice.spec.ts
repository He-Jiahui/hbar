import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`one composer choice leaves Plan and selects approval: ${locale}`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-plan-direct-choice-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sessionId = host.ready.sessionId
      const copy = getShellCopy(locale)
      const labels = copy.session.permissionPicker
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const picker = page.locator('.hbar-composer-permission-picker')
      const open = async (label: string) => {
        await picker.getByRole('button', { name: labels.trigger(label), exact: true }).click()
      }
      const plan = picker.getByRole('menuitemcheckbox', { name: labels.plan.label, exact: false })
      await open(labels.options.inherit.label)
      await plan.click()
      await expect(picker.getByRole('button', { name: labels.trigger(labels.plan.label) })).toBeVisible()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await open(labels.plan.label)
        const deny = picker.getByRole('menuitemradio', { name: labels.options.deny.label, exact: false })
        await expect(deny).toBeEnabled()
        await expect(plan).toHaveAttribute('aria-checked', 'true')
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`plan-direct-${locale}-${width}.png`) })
        if (width === 1440) {
          await picker.getByRole('menuitemradio', { name: labels.options.allow.label, exact: false }).click()
          await expect(picker.getByText(labels.confirmTitle)).toBeVisible()
          expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
          await picker.getByRole('button', { name: labels.cancel }).click()
          await picker.getByRole('button', { name: labels.close }).click()
        }
      }
      await picker.getByRole('menuitemradio', { name: labels.options.deny.label, exact: false }).click()
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
      await rm(root, { recursive: true, force: true })
    }
  })
}
