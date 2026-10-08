import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { FileTabsContentInput } from '../tests/fixtures/file-tabs-content-browser'
import type { HbarFilePreviewItem } from '../packages/app-react/src/file-preview-tabs'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/file-tabs-content/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/file-tabs-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned file tabs preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/file-tabs-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const) {
    test(`full file identities and shared captured menu ${locale} ${mode}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const labels = getShellCopy(locale).files.previews
      const name = (locale === 'zh-CN' ? '完整文件名称' : 'Complete file name ').repeat(200).slice(0, 1021) + '.ts'
      expect(name.length).toBe(1024)
      const items: readonly HbarFilePreviewItem[] = Array.from({ length: 33 }, (_, index) => ({
        id: `file-${index}`,
        path: `folder-${index}/${name}`,
        kind: index % 3 === 0 ? 'document' : index % 3 === 1 ? 'working' : 'staged',
        protection: index === 0 ? 'dirty' : null,
      }))
      try {
        await page.goto(url)
        for (const count of [0, 1, 4, 32, 33]) {
          const input: FileTabsContentInput = {
            locale,
            mode,
            items: items.slice(0, count),
            activeId: 'file-0',
            long: true,
          }
          await page.evaluate((input) => window.mountFileTabsContent(input), input)
          await expect(page.getByRole('tab')).toHaveCount(count)
        }
        const input: FileTabsContentInput = { locale, mode, items: items.slice(0, 4), activeId: 'missing', long: true }
        await page.evaluate((input) => window.mountFileTabsContent(input), input)
        await expect(page.getByRole('tab', { selected: true })).toHaveCount(0)
        await page.evaluate((input) => {
          const duplicate = input.items[0]
          if (!duplicate) throw new Error('Missing original fixture identity')
          window.updateFileTabsContent({ ...input, items: [...input.items, duplicate] })
        }, input)
        await expect(page.getByRole('tab')).toHaveCount(4)
        const tab = page.getByRole('tab').nth(1)
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          await tab.focus()
          const title = tab.locator('[data-text-context="collection.title"]')
          await expect(title).toHaveText(name)
          expect(await title.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          const rail = page.getByRole('tablist')
          if (await rail.evaluate((node) => node.scrollHeight > node.clientHeight)) {
            await rail.evaluate((node) => {
              node.scrollTop = 0
            })
            await tab.press('ArrowDown')
            await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
          }
          expect(
            await rail.evaluate(
              (node) =>
                node.getBoundingClientRect().height <=
                innerHeight * 0.4 * Number.parseFloat(getComputedStyle(document.body).zoom) + 1,
            ),
          ).toBe(true)
          expect(await page.getByRole('region').evaluate((node) => node.getBoundingClientRect().height > 0)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await tab.press('Shift+F10')
          const menu = page.getByRole('menu')
          await expect(menu).toBeVisible()
          expect(await menu.evaluate((node) => node.parentElement === document.body)).toBe(true)
          expect(await menu.evaluate((node) => getComputedStyle(node).backdropFilter)).not.toBe('none')
          const bounds = await menu.boundingBox()
          expect(
            bounds &&
              bounds.x >= 0 &&
              bounds.x + bounds.width <= width + 1 &&
              bounds.y >= 0 &&
              bounds.y + bounds.height <= 1001,
          ).toBe(true)
          expect(
            await menu.evaluate((node) => {
              const bounds = node.getBoundingClientRect()
              return Array.from(node.querySelectorAll('[role="menuitem"]')).every((item) => {
                const row = item.getBoundingClientRect()
                return row.top >= bounds.top && row.bottom <= bounds.bottom
              })
            }),
          ).toBe(true)
          await page.keyboard.press('End')
          await expect(menu.getByRole('menuitem').last()).toBeFocused()
          await menu.focus()
          await menu.evaluate((node) => {
            node.scrollLeft = 0
          })
          if (await menu.evaluate((node) => node.scrollWidth > node.clientWidth)) {
            await menu.press('ArrowRight')
            await expect.poll(() => menu.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          }
          if (width === 320) await menu.screenshot({ path: info.outputPath(`file-menu-${locale}-${mode}-320.png`) })
          await page.keyboard.press('Escape')
          await expect(tab).toBeFocused()
        }
        await tab.press('Shift+F10')
        await page.evaluate(
          (input) =>
            window.updateFileTabsContent({
              ...input,
              items: input.items.map((item, index) => (index === 0 ? { ...item, id: 'reopened-0' } : item)),
            }),
          input,
        )
        const capturedAction = page.getByRole('menuitem', { name: labels.action('left').repeat(8), exact: true })
        await capturedAction.click({ timeout: 3000 })
        expect((await page.evaluate(() => window.fileTabsContentEvents())).at(-1)).toEqual({
          kind: 'close',
          ids: ['file-0'],
        })
        await tab.press('Shift+F10')
        await page.locator('[data-tabs-other]').click()
        await expect(page.getByRole('menu')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await tab.press('Shift+F10')
        await page.locator('[data-tabs-outside]').click()
        await expect(page.getByRole('menu')).toHaveCount(0)
        await tab.press('Shift+F10')
        await page.evaluate(
          (input) =>
            window.updateFileTabsContent({ ...input, items: input.items.filter((item) => item.id !== 'file-1') }),
          input,
        )
        await expect(page.getByRole('menu')).toHaveCount(0)
        await expect(page.getByRole('tab').first()).toBeFocused()
        await page.evaluate((input) => window.updateFileTabsContent({ ...input, items: [] }), input)
        await expect(page.getByRole('tab')).toHaveCount(0)
        await page.evaluate((input) => window.updateFileTabsContent(input), input)
        await expect(page.getByRole('menu')).toHaveCount(0)
        await page.screenshot({ path: info.outputPath(`file-titles-${locale}-${mode}-320.png`) })
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
