import { expect, test, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { imageFile } from './support/image-file'
import { sessionImageCopy } from '../apps/web/src/session-image-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ImagePreviewFixtureInput } from '../tests/fixtures/message-image-preview-browser'

const root = join(process.cwd(), 'artifacts/message-image-preview/controlled')
const origin = 'http://127.0.0.1:45160'
let server: PreviewServer | undefined
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/message-image-preview-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45160, strictPort: true },
  })
})
test.afterAll(async () => {
  const current = server
  if (current)
    await new Promise<void>((resolve, reject) =>
      current.httpServer.close((error) => (error ? reject(error) : resolve())),
    )
})
async function render(page: Page, input: ImagePreviewFixtureInput) {
  await page.evaluate((value) => window.imagePreviewFixture.render(value), input)
}

for (const [locale, width] of [
  ['en-US', 1440],
  ['zh-CN', 320],
] as const)
  test(`image URLs auto-load in messages and output with bounded media and retry: ${locale}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 960 }, locale })
    const page = await context.newPage()
    const errors: string[] = []
    const requests: { url: string; referrer: string | undefined }[] = []
    let bad = true
    const held = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    let lateSeen = false
    await context.route('https://images.hbar.invalid/**', async (route) => {
      const request = route.request()
      requests.push({ url: request.url(), referrer: request.headers().referer })
      const path = new URL(request.url()).pathname
      if (path === '/bad.png' && bad)
        return route.fulfill({ status: 404, body: 'private-failure-body', headers: { 'Cache-Control': 'no-store' } })
      if (path === '/late.png') {
        lateSeen = true
        await held.promise
        try {
          await route.fulfill({ contentType: 'image/png', body: imageFile(0).buffer })
        } catch {
          /* A detached lazy image may cancel its old browser request. */
        } finally {
          released.resolve()
        }
      } else
        await route.fulfill({
          contentType: 'image/png',
          body: imageFile(0).buffer,
          headers: { 'Cache-Control': 'no-store' },
        })
    })
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(origin)
      const labels = sessionImageCopy(locale)
      const url = 'https://images.hbar.invalid/plain.png?signature=original#view'
      await render(page, {
        locale,
        text: `${url}\n\n[Named image](https://images.hbar.invalid/named.webp)\n\n![Reference](https://images.hbar.invalid/download?id=1)`,
      })
      const images = page.locator('main img')
      await expect(images).toHaveCount(3)
      await expect.poll(() => images.first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(480)
      await expect(page.getByRole('link', { name: url, exact: true })).toHaveAttribute('href', url)
      const opened = context.waitForEvent('page')
      await page.getByRole('link', { name: labels.open('plain.png'), exact: true }).focus()
      await page.keyboard.press('Enter')
      const popup = await opened
      await popup.waitForLoadState('domcontentloaded')
      await expect(popup).toHaveURL(url)
      await popup.close()
      await page.screenshot({ path: `artifacts/message-image-preview/links-${locale}-${width}.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      const original = `Exact output\nhttps://images.hbar.invalid/tool.png\nSOURCE-END`
      await render(page, { locale, mode: 'tool', text: original })
      await expect(images).toHaveCount(1)
      await expect.poll(() => images.first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(480)
      await page
        .getByRole('button', { name: getShellCopy(locale).session.messageBlocks.toolResultCopy.copy, exact: true })
        .click()
      expect(await page.evaluate(() => window.imagePreviewFixture.writes.at(-1))).toBe(original)
      await render(page, { locale, mode: 'literal', text: 'https://images.hbar.invalid/literal.png' })
      await expect(images).toHaveCount(1)
      await render(page, { locale, text: 'https://images.hbar.invalid/stream.png', streaming: true })
      await expect(images).toHaveCount(0)
      await render(page, { locale, text: 'https://images.hbar.invalid/stream.png', streaming: false })
      await expect(images).toHaveCount(1)
      await render(page, {
        locale,
        text: '`https://images.hbar.invalid/inline.png`\n\n```md\n![code](https://images.hbar.invalid/code.png)\n```',
      })
      await expect(images).toHaveCount(0)
      expect(requests.some((item) => /\/(?:inline|code)\.png/.test(item.url))).toBe(false)
      for (const count of [0, 1, 4, 12, 13]) {
        await render(page, {
          locale,
          text: Array.from(
            { length: count },
            (_, index) => `https://images.hbar.invalid/boundary.png?index=${index}`,
          ).join('\n\n'),
        })
        await expect(images).toHaveCount(Math.min(count, 12))
        if (count === 13)
          await expect(
            page.getByRole('link', { name: 'https://images.hbar.invalid/boundary.png?index=12', exact: true }),
          ).toBeVisible()
      }
      await render(page, { locale, text: '![Original](https://images.hbar.invalid/late.png)' })
      await expect.poll(() => lateSeen).toBe(true)
      await render(page, { locale, text: '![Replacement](https://images.hbar.invalid/replacement.png)' })
      held.resolve()
      await released.promise
      await expect(images).toHaveCount(1)
      await expect(images).toHaveAttribute('alt', 'Replacement')
      await expect.poll(() => images.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(480)
      await render(page, { locale, text: '![Reference](https://images.hbar.invalid/bad.png)', longLabels: true })
      await expect(page.getByRole('alert')).toHaveText(labels.error('READ_FAILED').repeat(8))
      await expect(page.getByText('private-failure-body')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      bad = false
      await page.getByRole('button', { name: labels.retry.repeat(8), exact: true }).click()
      await expect(images).toBeVisible()
      await expect.poll(() => images.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(480)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.screenshot({ path: `artifacts/message-image-preview/recovered-${locale}-${width}.png` })
      expect(requests.every((item) => item.referrer === undefined)).toBe(true)
      expect(errors).toEqual([])
    } finally {
      held.resolve()
      await context.close()
    }
  })
