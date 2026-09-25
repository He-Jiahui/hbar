import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer material intake stays local, bounded and recoverable: ${locale}`, async ({ browser }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-attachments-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const commands = createWorkspaceSessionCommandClient(host.client)
      const other = await commands.execute(
        'session.create',
        { workspaceId: host.ready.workspaceId, title: 'Unrelated session — 其他会话' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const labels = copy.session.attachments
      const target = page.locator('.hbar-composer-attachment-target')
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      let mode: 'normal' | 'reject' | 'unknown' | 'hold' = 'normal'
      let uploads = 0
      let release: (() => void) | undefined
      let heldReady: (() => void) | undefined
      const waiting = new Promise<void>((resolve) => {
        heldReady = resolve
      })
      await page.route('**/api/artifacts', async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue()
          return
        }
        uploads++
        if (mode === 'reject') {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'UNSUPPORTED_TYPE', error: 'test-only unsupported file' }),
          })
          return
        }
        const response = await route.fetch()
        if (mode === 'unknown') {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'CONNECTION_CLOSED', error: 'test-only response lost after real upload' }),
          })
          return
        }
        if (mode === 'hold') {
          heldReady?.()
          await new Promise<void>((resolve) => {
            release = resolve
          })
        }
        await route.fulfill({ response })
      })
      await page.goto(base)
      const row = (sessionId: string) => page.locator(`[data-session-id="${sessionId}"] .hbar-app-react-session-target`)
      await row(host.ready.sessionId).click()
      await expect(prompt).toBeEnabled()
      await prompt.fill('Keep my draft — 保留原草稿')
      await prompt.evaluate((element) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', 'ordinary clipboard text')
        const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
        element.dispatchEvent(event)
      })
      await expectComposerText(prompt, 'Keep my draft — 保留原草稿ordinary clipboard text')
      expect(uploads).toBe(0)
      await prompt.fill('Keep my draft — 保留原草稿')
      const dropped = await page.evaluateHandle(() => {
        const data = new DataTransfer()
        data.items.add(new File(['dropped content'], 'dropped-notes.txt', { type: 'text/plain' }))
        return data
      })
      await target.dispatchEvent('dragenter', { dataTransfer: dropped })
      await expect(page.getByText(labels.drop, { exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/composer-attachments/drop-overlay-${locale}.png` })
      await target.dispatchEvent('drop', { dataTransfer: dropped })
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'dropped-notes.txt' })).toBeVisible()
      await prompt.evaluate((element) => {
        const data = new DataTransfer()
        const binary = atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWu8AAAAASUVORK5CYII=',
        )
        data.items.add(
          new File([Uint8Array.from(binary, (char) => char.charCodeAt(0))], 'pasted-image.png', { type: 'image/png' }),
        )
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      })
      await expect(
        page.locator('.lumen-attachment-chip[data-kind="image"]').filter({ hasText: 'pasted-image.png' }),
      ).toBeVisible()
      await expectComposerText(prompt, 'Keep my draft — 保留原草稿')
      expect(uploads).toBe(2)
      mode = 'reject'
      await target
        .locator('input[type="file"]')
        .setInputFiles({ name: 'rejected.txt', mimeType: 'text/plain', buffer: Buffer.from('reject') })
      const failed = page.locator('.hbar-composer-attachment-transfer[data-status="failed"]')
      await expect(failed).toContainText(labels.error('UNSUPPORTED_TYPE'))
      await failed.getByRole('button', { name: labels.remove('rejected.txt'), exact: true }).click()
      await expect(failed).toHaveCount(0)
      mode = 'unknown'
      const unknownName = 'long-original-target-上传结果需要核对但不能重复发送.txt'
      await target
        .locator('input[type="file"]')
        .setInputFiles({ name: unknownName, mimeType: 'text/plain', buffer: Buffer.from('unknown uploaded bytes') })
      const unknown = page.locator('.hbar-composer-attachment-transfer[data-status="unknown"]')
      await expect(unknown).toContainText(unknownName)
      expect(uploads).toBe(4)
      await expect(unknown.getByRole('button', { name: labels.remove(unknownName), exact: true })).toHaveCount(0)
      await prompt.fill('New text while result unknown — 仍保留草稿')
      for (const width of [1440, 980, 480, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(unknown.getByRole('button', { name: labels.reconcile(unknownName), exact: true })).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/composer-attachments/unknown-${locale}-${width}.png` })
      }
      mode = 'normal'
      await unknown.getByRole('button', { name: labels.reconcile(unknownName), exact: true }).click()
      await expect(unknown).toHaveCount(0)
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: unknownName })).toBeVisible()
      expect(uploads).toBe(4)
      await expectComposerText(prompt, 'New text while result unknown — 仍保留草稿')
      for (const name of ['dropped-notes.txt', 'pasted-image.png', unknownName]) {
        await page.locator('.lumen-attachment-chip').filter({ hasText: name }).getByRole('button').click()
      }
      await expect(page.locator('.lumen-attachment-chip')).toHaveCount(0)
      await target.locator('input[type="file"]').setInputFiles(
        Array.from({ length: 12 }, (_, index) => ({
          name: `${index}-需要明确指出问题并允许移除的长文件名.txt`,
          mimeType: 'text/plain',
          buffer: Buffer.alloc(0),
        })),
      )
      await expect(page.locator('.hbar-composer-attachment-transfer')).toHaveCount(12)
      const list = page.getByRole('list', { name: labels.label, exact: true })
      expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      await expect(prompt).toBeInViewport()
      const over = await page.evaluateHandle(() => {
        const data = new DataTransfer()
        data.items.add(new File(['13'], 'over-capacity.txt', { type: 'text/plain' }))
        return data
      })
      await target.dispatchEvent('drop', { dataTransfer: over })
      await expect(target.getByRole('alert')).toContainText(labels.error('ATTACHMENT_LIMIT'))
      expect(uploads).toBe(4)
      await page.screenshot({ path: `artifacts/composer-attachments/boundary-${locale}-320.png` })
      for (let index = 0; index < 12; index++)
        await list
          .getByRole('button', {
            name: labels.remove(`${index}-需要明确指出问题并允许移除的长文件名.txt`),
            exact: true,
          })
          .click()
      await expect(list).toHaveCount(0)
      await page.setViewportSize({ width: 1440, height: 960 })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      mode = 'hold'
      await target.locator('input[type="file"]').setInputFiles({
        name: 'original-session-only.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('original target only'),
      })
      await waiting
      await row(other.id).click()
      release?.()
      await expect(page.locator('.lumen-attachment-chip')).toHaveCount(0)
      await expectComposerText(prompt, '')
      await row(host.ready.sessionId).click()
      await expect(
        page.locator('.lumen-attachment-chip').filter({ hasText: 'original-session-only.txt' }),
      ).toBeVisible()
      await expectComposerText(prompt, 'New text while result unknown — 仍保留草稿')
      expect(uploads).toBe(5)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
