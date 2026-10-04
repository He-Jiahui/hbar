import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

async function removeOwnedQueueEditRoot(root: string): Promise<void> {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-queued-edit-e2e-'))
    throw new Error('Refusing to remove an unexpected E2E directory')
  await rm(root, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`queued message edits in place at desktop and narrow width: ${locale}`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-queued-edit-e2e-'))
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
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep this unsent composer draft — 保留未发送草稿。'
      await prompt.fill(draft)
      const active = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"must-not-write.txt","text":"should not be written"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await host!.client.call('session.snapshot', { sessionId })).approvals.length)
        .toBe(1)
      const original = `${'Queued text with a full tail '.repeat(20)}\n\n## 第二步 / Next step\nKeep the final line intact.`
      const queued = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: { text: original, images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const card = page.locator('.hbar-queued-user-run').first()
      await expect(card).toBeVisible()
      await expect(card).toContainText(original.slice(0, 60))
      await card.getByRole('button', { name: copy.session.queuedUserRuns.edit(1) }).click()
      const input = card.getByRole('textbox', { name: copy.session.queuedUserRuns.editInput(1) })
      await page.screenshot({ path: testInfo.outputPath(`queued-edit-open-${locale}.png`) })
      const save = card.getByRole('button', { name: copy.session.queuedUserRuns.saveEdit })
      const cancel = card.getByRole('button', { name: copy.session.queuedUserRuns.cancelEdit })
      await expect(save).toHaveAttribute('data-lumen-indicator', 'none')
      await expect(save).toHaveAttribute('data-lumen-variant', 'outlined')
      await expect(cancel).toHaveAttribute('data-lumen-indicator', 'none')
      await expect(card.locator('.hbar-queued-user-run-edit-actions [data-edge]')).toHaveCount(0)
      await input.press('Tab')
      await expect(save).toBeFocused()
      expect(await save.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      await page.screenshot({ path: testInfo.outputPath(`queued-edit-keyboard-focus-${locale}.png`) })
      await input.focus()
      await expect(input).toHaveValue(original)
      await expect(input).toHaveAttribute('aria-description', copy.session.queuedUserRuns.editHint)
      // A long native editor remains scrollable instead of growing over the main composer.
      expect(await input.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      // Editing a single character must not flatten the original paragraphs.
      await input.press('ControlOrMeta+End')
      await input.press('!')
      await expect(input).toHaveValue(`${original}!`)
      await input.fill('  ')
      await expect(card.getByRole('button', { name: copy.session.queuedUserRuns.saveEdit })).toBeDisabled()
      await input.fill('Edit cancelled')
      await input.press('Escape')
      await expect(card.getByRole('textbox')).toHaveCount(0)
      await expectComposerText(prompt, draft)
      expect(
        (await host.client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === queued.operationId)
          ?.input.text,
      ).toBe(original)
      await page.setViewportSize({ width: 320, height: 960 })
      await card.getByRole('button', { name: copy.session.queuedUserRuns.edit(1) }).click()
      await expect(input).toHaveValue(original)
      await input.press('ControlOrMeta+End')
      await input.press('Shift+Enter')
      await input.press('K')
      const edited = `${original}\nK`
      await expect(input).toHaveValue(edited)
      expect(await input.evaluate((element) => element.tagName)).toBe('TEXTAREA')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
      await page.screenshot({ path: testInfo.outputPath(`queued-edit-${locale}-320.png`) })
      await input.press('Enter')
      await expect(card.getByRole('textbox')).toHaveCount(0)
      expect(
        (await host.client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === queued.operationId)
          ?.input.text,
      ).toBe(edited)
      await expectComposerText(prompt, draft)
      // A fresh Host read must return the exact saved multiline value.
      await card.getByRole('button', { name: copy.session.queuedUserRuns.edit(1) }).click()
      await expect(input).toHaveValue(edited)
      await input.fill('Short queued message')
      await expect(input).toHaveValue('Short queued message')
      const compact = await input.boundingBox()
      expect(compact?.height).toBeLessThan(60)
      await card.getByRole('button', { name: copy.session.queuedUserRuns.saveEdit }).click()
      await expect(card.getByRole('textbox')).toHaveCount(0)
      expect(
        (await host.client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === queued.operationId)
          ?.input.text,
      ).toBe('Short queued message')
      await expectComposerText(prompt, draft)
      expect((await runs.execute('operation.get', { operationId: active.operationId })).status).toBe('waiting_approval')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedQueueEditRoot(root)
    }
  })
}
