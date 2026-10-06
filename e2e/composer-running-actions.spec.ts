import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeOwnedComposerRoot(root: string) {
  const ownedRoot = resolve(root)
  if (
    dirname(ownedRoot) !== resolve(tmpdir()) ||
    !ownedRoot.split(/[\\/]/).at(-1)?.startsWith('hbar-composer-running-')
  )
    throw new Error('Refusing to remove an unexpected composer test root')
  await rm(ownedRoot, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer keeps Stop stable and explicitly queues drafted messages: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-running-'))
    const context = await browser.newContext({ locale, colorScheme: 'light', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const target = host
      const sessionId = host.ready.sessionId
      const runs = createRunCommandClient(host.client)
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const composer = page.locator('.lumen-prompt-composer')
      const prompt = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const send = composer.getByRole('button', { name: copy.session.prompt.send, exact: true })
      const queue = composer.getByRole('button', { name: copy.session.runningActions.queueLabel, exact: true })
      const stop = composer.getByRole('button', { name: copy.session.prompt.stop, exact: true })
      await expect(send).toBeVisible()
      await expect(send).toBeDisabled()
      await expect(send).toHaveAttribute('data-lumen-indicator', 'none')
      await expect(send).toHaveAttribute('data-lumen-variant', 'solid')
      await expect(send.locator('.lucide-arrow-up')).toHaveCount(1)
      await expect(send.locator('[data-edge]')).toHaveCount(0)
      await expect(stop).toHaveCount(0)
      // A real approval keeps the first Run executing until the user chooses Stop.
      const original = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"must-not-write.txt","text":"should be cancelled"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await target.client.call('session.snapshot', { sessionId })).approvals.length)
        .toBe(1)
      await expect(stop).toBeVisible()
      await expect(stop).toHaveAttribute('data-lumen-indicator', 'none')
      await expect(stop).toHaveAttribute('data-lumen-variant', 'solid')
      await expect(stop).toHaveAttribute('data-tone', 'danger')
      await expect(stop).toHaveCSS('background-color', 'rgb(183, 53, 72)')
      await expect(stop.locator('[data-edge]')).toHaveCount(0)
      await expect(send).toHaveCount(0)
      await expect(queue).toHaveCount(0)
      await prompt.focus()
      await page.keyboard.press('Enter')
      expect((await runs.execute('operation.get', { operationId: original.operationId })).status).toBe(
        'waiting_approval',
      )
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(1)
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(stop).toBeVisible()
        await expect(send).toHaveCount(0)
        await page.screenshot({ path: testInfo.outputPath(`running-empty-${locale}-${width}.png`) })
        await prompt.fill('Queued after the current run — 当前任务完成后处理这条消息。')
        await expect(queue).toBeVisible()
        await expect(queue).toBeEnabled()
        await expect(queue).toHaveAttribute('data-lumen-variant', 'text')
        const actionStyle = await stop.evaluate((element) => {
          const style = getComputedStyle(element)
          const box = element.getBoundingClientRect()
          return { radius: style.borderRadius, square: Math.abs(box.width - box.height) < 1, width: box.width }
        })
        expect(actionStyle.radius).toBe('50%')
        expect(actionStyle.square).toBe(true)
        expect(actionStyle.width).toBeGreaterThanOrEqual(width <= 390 ? 44 : 36)
        const [queueBox, stopBox] = await Promise.all([queue.boundingBox(), stop.boundingBox()])
        expect(queueBox).not.toBeNull()
        expect(stopBox).not.toBeNull()
        // The running-actions flow permits wrapping; Stop follows Queue either
        // to its right or on a later row, without sharing a hit rectangle.
        expect(
          queueBox!.x + queueBox!.width <= stopBox!.x + 1 || queueBox!.y + queueBox!.height <= stopBox!.y + 1,
        ).toBe(true)
        expect(queueBox!.x).toBeGreaterThanOrEqual(0)
        expect(queueBox!.x + queueBox!.width).toBeLessThanOrEqual(width + 1)
        expect(stopBox!.x + stopBox!.width).toBeLessThanOrEqual(width + 1)
        expect(stopBox!.x).toBeGreaterThanOrEqual(0)
        for (const control of [queue, stop]) {
          expect(
            await control.evaluate((element) => {
              const box = element.getBoundingClientRect()
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
              return hit === element || (hit !== null && element.contains(hit))
            }),
          ).toBe(true)
          await control.click({ trial: true })
        }
        expect(
          await composer
            .locator('.lumen-composer-running-actions')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`running-draft-${locale}-${width}.png`) })
        await prompt.fill('')
      }
      const firstText = 'First message queued by Enter — 键盘排队。'
      await prompt.fill(firstText)
      await page.keyboard.press('Enter')
      await expectComposerText(prompt, '')
      await expect(queue).toHaveCount(0)
      await expect
        .poll(
          async () =>
            (await target.client.call('session.snapshot', { sessionId })).runs.filter(
              (run) => run.input.text === firstText && run.status === 'queued',
            ).length,
        )
        .toBe(1)
      const secondText = 'Second message queued by button — 按钮排队。'
      await prompt.fill(secondText)
      await queue.focus()
      await page.keyboard.press('Space')
      await expectComposerText(prompt, '')
      await expect
        .poll(
          async () =>
            (await target.client.call('session.snapshot', { sessionId })).runs.filter((run) => run.status === 'queued')
              .length,
        )
        .toBe(2)
      const queuedCards = composer.locator('.hbar-queued-user-run')
      await expect(queuedCards).toHaveCount(2)
      await expect(queuedCards.nth(0)).toContainText(firstText)
      await expect(queuedCards.nth(1)).toContainText(secondText)
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(queuedCards.nth(0)).toBeVisible()
        await expect(queuedCards.nth(1)).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        expect(await queuedCards.nth(0).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
          true,
        )
        await page.screenshot({ path: testInfo.outputPath(`queued-cards-${locale}-${width}.png`) })
      }
      const beforeStop = await host.client.call('session.snapshot', { sessionId })
      expect(beforeStop.runs).toHaveLength(3)
      expect(beforeStop.runs.find((run) => run.id === original.operationId)?.status).toBe('waiting_approval')
      await stop.focus()
      await expect(stop).toBeFocused()
      expect(await stop.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      await page.screenshot({ path: testInfo.outputPath(`stop-keyboard-focus-${locale}.png`) })
      await page.keyboard.press('Enter')
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: original.operationId })).status)
        .toBe('cancelled')
      await expect
        .poll(
          async () =>
            (await target.client.call('session.snapshot', { sessionId })).runs.filter(
              (run) => [firstText, secondText].includes(run.input.text) && run.status === 'completed',
            ).length,
        )
        .toBe(2)
      await expect(stop).toHaveCount(0)
      await expect(queuedCards).toHaveCount(0)
      await expect(queue).toHaveCount(0)
      await expect(send).toBeVisible()
      await expect(send).toBeDisabled()
      await expect(access(join(root, 'must-not-write.txt'))).rejects.toThrow()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedComposerRoot(root)
    }
  })
}
