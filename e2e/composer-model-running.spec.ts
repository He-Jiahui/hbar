import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`active Run keeps model choices stable and preserves a /model draft: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-running-model-e2e-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sessionId = host.ready.sessionId
      const runs = createRunCommandClient(host.client)
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const composer = page.locator('.lumen-prompt-composer')
      const prompt = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const model = composer.locator('.hbar-composer-model-trigger')
      const thinking = composer.locator('.hbar-composer-thinking-trigger')
      await expect(model).toBeEnabled()
      await model.click()
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toBeVisible()
      const original = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"must-not-write.txt","text":"cancel this"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await host!.client.call('session.snapshot', { sessionId })).approvals.length)
        .toBe(1)
      await expect(model).toBeDisabled()
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toBeHidden()
      if (await thinking.count()) await expect(thinking).toBeDisabled()
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(model).toBeDisabled()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`running-model-${locale}-${width}.png`) })
      }
      await prompt.fill('/model ')
      await composer.getByRole('button', { name: copy.session.runningActions.queueLabel, exact: true }).click()
      await expect(page.getByText(copy.session.slash.modelBusy, { exact: true })).toBeVisible()
      await expectComposerText(prompt, '/model ')
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toHaveCount(0)
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(1)
      await page.screenshot({ path: testInfo.outputPath(`running-model-slash-${locale}-320.png`) })
      await composer.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: original.operationId })).status)
        .toBe('cancelled')
      await expect(model).toBeEnabled()
      await expectComposerText(prompt, '/model ')
      await prompt.fill('')
      await model.click()
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
