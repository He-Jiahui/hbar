import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { imageFile } from './support/image-file'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionImageCopy } from '../apps/web/src/session-image-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeImageFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-image-viewer-e2e-'))
    throw new Error('Unsafe image fixture cleanup target')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`paired image attachments open, navigate, recover and survive sending: ${locale}`, async ({ browser }) => {
    test.setTimeout(150_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-image-viewer-e2e-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      const currentHost = host
      const copy = getShellCopy(locale)
      const images = sessionImageCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      let uploads = 0
      let reads = 0
      let rejectRead = false
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/artifacts' && request.method() === 'POST') uploads++
      })
      await page.route('**/api/artifacts/*', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue()
          return
        }
        reads++
        if (rejectRead)
          await route.fulfill({
            status: 503,
            contentType: 'text/html',
            body: 'private-fixture-failure-must-not-be-rendered',
          })
        else await route.continue()
      })
      await page.goto(base)
      await page.locator(`[data-session-id="${host.ready.sessionId}"] .hbar-app-react-session-target`).click()
      const composer = page.locator('.lumen-prompt-composer')
      const prompt = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep this original draft — 保留原草稿'
      await expect(prompt).toBeEnabled()
      await prompt.fill(draft)
      const name = 'same-name-同名但内容不同.png'
      await composer.locator('input[type="file"]').setInputFiles([imageFile(0, name), imageFile(1, name)])
      const tiles = composer.locator('.lumen-image-tile')
      await expect(tiles).toHaveCount(2)
      await expect(tiles.locator('img')).toHaveCount(2)
      expect(uploads).toBe(2)
      const open = composer.getByRole('button', { name: images.open(name), exact: true })
      const dialog = page.getByRole('dialog', { name: images.gallery.title, exact: true })
      for (const width of [1440, 900, 320]) {
        await page.setViewportSize({ width, height: 960 })
        const hideSidebar = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
        if (width === 320 && (await hideSidebar.isVisible())) await hideSidebar.click()
        await expect(open.first()).toBeInViewport()
        await page.screenshot({ path: `artifacts/image-viewer-product/composer-${locale}-${width}.png` })
        await open.first().focus()
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await expect(dialog.locator('.lumen-image-gallery-media img')).toHaveAttribute('src', /^blob:/)
        await expect(dialog.getByText(images.gallery.position(1, 2), { exact: true })).toBeVisible()
        await page.keyboard.press('ArrowLeft')
        await expect(dialog.getByText(images.gallery.position(2, 2), { exact: true })).toBeVisible()
        await expect
          .poll(() =>
            dialog.locator('.lumen-image-gallery-media img').evaluate((image: HTMLImageElement) => image.naturalWidth),
          )
          .toBe(240)
        await page.screenshot({ path: `artifacts/image-viewer-product/gallery-${locale}-${width}.png` })
        for (let index = 0; index < 9; index++) {
          await page.keyboard.press('Tab')
          expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
        }
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(open.first()).toBeFocused()
        await expectComposerText(prompt, draft)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      // Reading failure cannot become an upload retry or expose an arbitrary server body.
      rejectRead = true
      await open.first().click()
      await expect(dialog.getByText(images.error('READ_FAILED'), { exact: true })).toBeVisible()
      await expect(page.getByText('private-fixture-failure-must-not-be-rendered')).toHaveCount(0)
      rejectRead = false
      await dialog.getByRole('button', { name: images.gallery.retry, exact: true }).click()
      await expect(dialog.locator('.lumen-image-gallery-media img')).toBeVisible()
      expect(uploads).toBe(2)
      await page.keyboard.press('Escape')
      await composer
        .getByRole('button', {
          name: copy.session.prompt.removeAttachment({ id: '', kind: 'image', name }),
          exact: true,
        })
        .first()
        .click()
      await expect(tiles).toHaveCount(1)
      await expect(dialog).not.toBeVisible()
      await open.first().click()
      await expect(dialog.getByText(images.gallery.position(1, 1), { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: images.gallery.next, exact: true })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expectComposerText(prompt, draft)
      // Explicit UI send uses the isolated Host's local-fixture model, never a paid provider.
      await composer.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(
          async () =>
            (
              await currentHost.client.call('session.snapshot', { sessionId: currentHost.ready.sessionId })
            ).messages.filter(
              (message) => message.role === 'user' && message.content.some((block) => block.type === 'image'),
            ).length,
        )
        .toBe(1)
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
      const sent = snapshot.messages.find(
        (message) => message.role === 'user' && message.content.some((block) => block.type === 'image'),
      )!
      expect(sent.content.filter((block) => block.type === 'image')).toHaveLength(1)
      const message = page.locator(`[data-message-id="${sent.id}"]`)
      await expect(message.locator('.lumen-image-tile img')).toBeVisible()
      await message.getByRole('button', { name: images.open(name), exact: true }).click()
      await expect(dialog.locator('.lumen-image-gallery-media img')).toBeVisible()
      await page.keyboard.press('Escape')
      await page.reload()
      await expect(message.getByRole('button', { name: images.open(name), exact: true })).toBeVisible()
      await message.getByRole('button', { name: images.open(name), exact: true }).click()
      await expect(dialog.locator('.lumen-image-gallery-media img')).toBeVisible()
      await page.keyboard.press('Escape')
      // External archival does not remove an already loaded history image's read capability.
      await createWorkspaceSessionCommandClient(host.client).execute(
        'session.archive',
        { sessionId: host.ready.sessionId, archived: true },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect(message.getByRole('button', { name: images.open(name), exact: true })).toBeVisible()
      await message.getByRole('button', { name: images.open(name), exact: true }).click()
      await expect(dialog.locator('.lumen-image-gallery-media img')).toBeVisible()
      await page.screenshot({ path: `artifacts/image-viewer-product/archived-${locale}-320.png` })
      await page.keyboard.press('Escape')
      expect(uploads).toBe(2)
      expect(reads).toBeGreaterThan(8)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeImageFixture(root)
    }
  })
}
