import { expect, test, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { SingleLineFixtureInput } from '../tests/fixtures/single-line-controls-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { completeLine } from './support/single-line-layout'

const root = join(process.cwd(), 'artifacts/single-line-controls')
const origin = 'http://127.0.0.1:45625'
let server: PreviewServer | undefined

async function render(page: Page, input: SingleLineFixtureInput) {
  await page.evaluate((value) => window.singleLineFixture.render(value), input)
}

test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="../../tests/fixtures/single-line-controls-browser.tsx"></script></body></html>',
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
    preview: { host: '127.0.0.1', port: 45625, strictPort: true },
  })
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`complete composer labels retain natural width through state changes ${locale} ${theme}`, async ({
      page,
    }, info) => {
      await page.goto(origin)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const form = page.locator('.hbar-prompt-composer')
      const toolbar = form.locator('.lumen-composer-toolbar')
      const rail = toolbar.locator('.lumen-composer-control-rail')
      for (const width of [1024, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 600 })
        let height: number | undefined
        for (const state of [
          { status: 'ready', branch: 'master' },
          { status: 'loading', branch: null },
          { status: 'ready', branch: `hbar/session-launch/${'a7'.repeat(32)}` },
          { status: 'ready', branch: 'feature/中文分支与完整路径'.repeat(18), long: true },
          { status: 'error', branch: null },
          { status: 'ready', branch: null, connected: false },
        ] satisfies Partial<SingleLineFixtureInput>[]) {
          await render(page, {
            locale,
            theme,
            workspaceName: 'hbar',
            ...state,
          })
          await completeLine(form.locator('button:not([popover] button, dialog button)'))
          await completeLine(page.locator('.hbar-session-project-context:visible'))
          const size = await toolbar.boundingBox()
          if (!size) throw new Error('Composer toolbar has no visible bounds')
          if (height !== undefined) expect(size.height).toBeCloseTo(height, 1)
          height = size.height
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          const stop = toolbar.getByRole('button', { name: getShellCopy(locale).session.prompt.stop, exact: true })
          await expect(stop).toBeInViewport()
          if ('long' in state && state.long) {
            expect(await rail.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
            const queue = toolbar.locator('.lumen-composer-queue-action')
            await queue.focus()
            expect(await rail.evaluate((node) => node.scrollLeft > 0)).toBe(true)
            await stop.click()
            expect(await page.evaluate(() => window.singleLineFixture.actions())).toContain('stop')
          }
        }
        await render(page, {
          locale,
          theme,
          workspaceName: 'hbar',
          status: 'loading',
          branch: null,
        })
        await rail.evaluate((node) => {
          node.scrollLeft = 0
        })
        await page.screenshot({ path: info.outputPath(`loading-${width}.png`) })
      }
      await render(page, {
        locale,
        theme,
        workspaceName: '完整工程名称'.repeat(12),
        status: 'ready',
        branch: 'master',
        long: true,
        textSize: 'l',
      })
      await page.locator('html').evaluate((node) => {
        node.style.fontSize = '200%'
      })
      await completeLine(form.locator('button:not([popover] button, dialog button)'))
      await completeLine(page.locator('.hbar-session-project-context:visible'))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(errors).toEqual([])
    })
  }

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`primitive labels, tabs and tree use complete intrinsic text ${locale}`, async ({ page }, info) => {
    await page.goto(origin)
    const input: SingleLineFixtureInput = {
      locale,
      theme: 'dark',
      workspaceName: 'hbar',
      branch: 'master',
      status: 'ready',
      gallery: true,
    }
    const gallery = page.locator('[data-fixture-gallery]')
    await page.setViewportSize({ width: 900, height: 950 })
    await render(page, input)
    const short = await completeLine(gallery.locator('[data-fixture-actions] button').first())
    await render(page, { ...input, long: true })
    const long = await completeLine(gallery.locator('[data-fixture-actions] button').first())
    expect(long[0]?.width).toBeGreaterThan((short[0]?.width ?? 0) * 2)
    expect(long[0]?.height).toBe(short[0]?.height)
    for (const width of [900, 390, 320]) {
      await page.setViewportSize({ width, height: 950 })
      for (const count of [0, 1, 7, 32, 33]) {
        await render(page, { ...input, long: true, count })
        await expect(gallery.locator('.hbar-workspace-tab-title')).toHaveCount(count)
        await expect(gallery.locator('.hbar-file-preview-tab')).toHaveCount(count)
        await expect(gallery.getByRole('treeitem')).toHaveCount(count)
        await completeLine(gallery.locator('[data-fixture-actions] button, .lumen-popup-select-trigger'))
        if (count) {
          await completeLine(gallery.locator('.hbar-workspace-tab-title, .hbar-file-preview-select, .lumen-tree-row'))
          const strip = gallery.locator('.hbar-workspace-tab-strip')
          expect(await strip.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
          await gallery.locator('.hbar-workspace-tab-select').last().focus()
          if (count === 1) {
            await strip.evaluate((node) => {
              node.scrollLeft = 0
            })
            const right = gallery
              .locator('.hbar-workspace-tabs > button')
              .filter({ has: page.locator('svg.lucide-chevron-right') })
            await right.focus()
            await right.press('Enter')
          }
          await expect.poll(() => strip.evaluate((node) => node.scrollLeft > 0)).toBe(true)
          const tree = gallery.getByRole('treeitem').last()
          await tree.focus()
          await tree.press('Enter')
          expect(await page.evaluate(() => window.singleLineFixture.actions())).toContain(`tree:tab-${count - 1}`)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      await page.screenshot({ path: info.outputPath(`gallery-${width}.png`) })
    }
    await render(page, { ...input, long: true, count: 1, textSize: 'l' })
    await page.locator('html').evaluate((node) => {
      node.style.fontSize = '200%'
    })
    await completeLine(
      gallery.locator(
        '[data-fixture-actions] button, .lumen-popup-select-trigger, .hbar-workspace-tab-title, .hbar-file-preview-select',
      ),
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}
