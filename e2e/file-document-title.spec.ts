import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { FileDocumentTitleInput } from '../tests/fixtures/file-document-title-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/file-document-title/controlled')
let server: PreviewServer | undefined
let url = ''
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await build({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(root, 'web'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/file-document-title.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned file title preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/file-document-title.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`complete document title preserves its content pane ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const name =
        (locale === 'zh-CN' ? '完整原文标题自然换行' : 'CompleteOriginalDocumentTitle').repeat(120).slice(0, 1021) +
        '.ts'
      const input: FileDocumentTitleInput = {
        locale,
        mode,
        name,
        path: `original/${name}`,
        body: 'Original confirmed content 原始完整正文',
        scene: 'ready',
      }
      const labels = getShellCopy(locale).files
      try {
        await page.goto(url)
        await page.evaluate((value) => window.mountFileDocumentTitle(value), input)
        const doc = page.locator('.lumen-file-document')
        const title = doc.getByRole('heading', { name, exact: true })
        const body = doc.locator('.lumen-file-document-body')
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          await expect(title).toHaveText(name)
          expect(await title.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          expect((await body.boundingBox())?.height ?? 0).toBeGreaterThan(80)
          await expect(body.getByText(input.body, { exact: true })).toBeVisible()
          const reader = doc.getByRole('group', { name, exact: true })
          await expect(reader).toHaveAttribute('tabindex', '0')
          if (await reader.evaluate((node) => node.scrollHeight > node.clientHeight + 1)) {
            await reader.focus()
            await page.keyboard.press('End')
            await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
            await expect
              .poll(() =>
                title.evaluate((node) => {
                  const text = node.firstChild
                  const owner = node.closest('.lumen-file-document-title')
                  if (!text || !owner) return false
                  const range = document.createRange()
                  range.setStart(text, Math.max(0, (text.textContent?.length ?? 0) - 1))
                  range.setEnd(text, text.textContent?.length ?? 0)
                  const bounds = range.getBoundingClientRect()
                  const pane = owner.getBoundingClientRect()
                  return (
                    bounds.top >= pane.top - 1 &&
                    bounds.bottom <= pane.bottom + 1 &&
                    bounds.left >= pane.left - 1 &&
                    bounds.right <= pane.right + 1
                  )
                }),
              )
              .toBe(true)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320) {
            const comparison = await reader.evaluate((element) => {
              const body = element.closest('.lumen-file-document')?.querySelector('.lumen-file-document-body')
              if (!(element instanceof HTMLElement) || !body) throw new Error('Missing owned title capacity comparison')
              const boundedBodyHeight = body.getBoundingClientRect().height
              const previous = element.style.maxBlockSize
              element.style.maxBlockSize = 'none'
              const unboundedBodyHeight = body.getBoundingClientRect().height
              element.style.maxBlockSize = previous
              return { boundedBodyHeight, unboundedBodyHeight, restoredBodyHeight: body.getBoundingClientRect().height }
            })
            await info.attach('prior-unbounded-title-policy', {
              body: JSON.stringify(comparison),
              contentType: 'application/json',
            })
            expect(comparison.unboundedBodyHeight).toBe(0)
            expect(comparison.restoredBodyHeight).toBe(comparison.boundedBodyHeight)
            await page.screenshot({ path: info.outputPath(`${locale}-${mode}-320.png`) })
          }
        }
        expect(await page.evaluate(() => window.canRenderFileDocumentName('a'.repeat(1024)))).toBe(true)
        expect(await page.evaluate(() => window.canRenderFileDocumentName('a'.repeat(1025)))).toBe(false)
        expect(await page.evaluate(() => window.canRenderFileDocumentName(''))).toBe(false)
        for (const scene of ['loading', 'error', 'ready'] as const) {
          await page.evaluate((value) => window.updateFileDocumentTitle(value), { ...input, scene })
          await expect(body.getByText(input.body, { exact: true })).toBeVisible()
          if (scene === 'loading') await expect(doc).toHaveAttribute('aria-busy', 'true')
          else await expect(doc).not.toHaveAttribute('aria-busy', 'true')
        }
        await page.evaluate((value) => window.updateFileDocumentTitle(value), {
          ...input,
          scene: 'unavailable' as const,
        })
        await expect(body).toHaveCount(0)
        await doc.getByRole('button', { name: labels.retry, exact: true }).click()
        await expect(body.getByText(input.body, { exact: true })).toBeVisible()
        expect(await page.evaluate(() => window.fileDocumentTitleActions())).toEqual([
          { kind: 'refresh', path: input.path },
        ])
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
