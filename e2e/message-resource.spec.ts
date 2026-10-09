import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import { resourceCopy } from '../apps/web/src/resource-copy'
import { imageResourceFixtures } from '../tests/fixtures/image-resource-fixtures'
import { resourceImageFixtures, resourceSvgFixture } from '../tests/fixtures/resource-image-fixtures'
const root = join(process.cwd(), 'artifacts/resource-references/browser')
let server: PreviewServer
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/message-resource-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45269, strictPort: true },
  })
})
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    )
})
test('resource image leases decode every advertised raster format and preserve native dimensions', async ({ page }) => {
  await page.goto('http://127.0.0.1:45269/?locale=en-US')
  for (const fixture of [...imageResourceFixtures, ...resourceImageFixtures, resourceSvgFixture]) {
    const dimensions = await page.evaluate((input) => window.resourceImageFixture(input), fixture)
    expect(dimensions, fixture.name).toEqual({ width: fixture.width, height: fixture.height })
  }
})
test('failed image preview offers a one-time system open without reading image bytes again', async ({ page }) => {
  const labels = resourceCopy('en-US')
  let reads = 0
  await page.route('**/media.svg', async (route) => {
    reads++
    await route.fulfill({ status: 503, contentType: 'text/html', body: 'unavailable' })
  })
  await page.goto('http://127.0.0.1:45269/?locale=en-US')
  await page.getByRole('link', { name: labels.open({ kind: 'file', path: 'photo.png' }), exact: true }).click()
  const dialog = page.getByRole('dialog', { name: labels.gallery.title })
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByRole('button', { name: labels.system, exact: true }).click()
  await expect(page.locator('[data-opened]')).toHaveText('system:photo.png')
  await expect(dialog).not.toBeVisible()
  expect(reads).toBe(1)
})
for (const [locale, width] of [
  ['en-US', 1440],
  ['zh-CN', 360],
] as const)
  test(`resource references preserve code, select candidates and load images only after a click: ${locale}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => {
      throw error
    })
    const labels = resourceCopy(locale)
    let mediaRequests = 0
    await page.route('**/media.svg', async (route) => {
      mediaRequests++
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>',
      })
    })
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 404 }))
    await page.goto(`http://127.0.0.1:45269/?locale=${locale}`)
    await expect(page.locator('.hbar-message-resource-link')).toHaveCount(6)
    await expect(page.locator('pre .hbar-message-resource-link')).toHaveCount(0)
    await expect(page.locator('code').filter({ hasText: 'console.log' })).not.toHaveClass(/hbar-message-resource-link/)
    expect(mediaRequests).toBe(0)
    await page
      .getByRole('link', { name: labels.open({ kind: 'file', path: 'src/main.ts', line: 12 }), exact: true })
      .click()
    await expect(page.locator('[data-opened]')).toHaveText('0/src/main.ts:12')
    const ambiguous = page.getByRole('link', { name: labels.open({ kind: 'file', path: 'same.ts' }), exact: true })
    await ambiguous.click()
    const dialog = page.getByRole('dialog', { name: labels.choose })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.hbar-resource-candidate')).toHaveCount(100)
    await page.screenshot({ path: `artifacts/resource-references/chooser-${locale}-${width}.png` })
    expect(
      await dialog
        .locator('.hbar-resource-candidates')
        .evaluate((node) => node.scrollHeight > node.clientHeight && node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true)
    await dialog.locator('.hbar-resource-candidate').nth(2).click()
    await expect(page.locator('[data-opened]')).toHaveText('2/same.ts:')
    await expect(dialog).not.toBeVisible()
    const image = page.getByRole('link', { name: labels.open({ kind: 'file', path: 'photo.png' }), exact: true })
    await image.click()
    await expect(page.getByRole('dialog', { name: labels.gallery.title }).locator('img')).toBeVisible()
    await page.screenshot({ path: `artifacts/resource-references/image-${locale}-${width}.png` })
    expect(mediaRequests).toBe(1)
    await page.keyboard.press('Escape')
    await image.click({ button: 'right' })
    await page.getByRole('menuitem', { name: labels.system }).click()
    await expect(page.locator('[data-opened]')).toHaveText('system:photo.png')
    expect(mediaRequests).toBe(1)
    await page.getByRole('link', { name: labels.open({ kind: 'file', path: 'missing.ts' }), exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText(labels.error('NOT_FOUND'))
    await page.screenshot({ path: `artifacts/resource-references/resources-${locale}-${width}.png` })
    await context.close()
  })
