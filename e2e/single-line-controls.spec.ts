import { expect, test, type Locator, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { SingleLineFixtureInput } from '../tests/fixtures/single-line-controls-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

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

/** Check the actual text range, not just nowrap or an unabridged tooltip. */
async function completeLine(elements: Locator) {
  const metrics = await elements.evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const box = node.getBoundingClientRect()
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        const rects: DOMRect[] = []
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim() || walker.currentNode.parentElement?.closest('svg')) continue
          const range = document.createRange()
          range.selectNodeContents(walker.currentNode)
          rects.push(...range.getClientRects())
        }
        const centers = rects.map((rect) => rect.top + rect.height / 2)
        return {
          text: node.textContent,
          width: box.width,
          height: box.height,
          ellipsis: getComputedStyle(node).textOverflow === 'ellipsis',
          clipped: rects.some((rect) => rect.left < box.left - 1 || rect.right > box.right + 1),
          spread: centers.length ? Math.max(...centers) - Math.min(...centers) : 0,
        }
      }),
  )
  expect(metrics.length).toBeGreaterThan(0)
  for (const metric of metrics) {
    expect(metric.ellipsis, String(metric.text)).toBe(false)
    expect(metric.clipped, String(metric.text)).toBe(false)
    expect(metric.spread, String(metric.text)).toBeLessThanOrEqual(6)
  }
  return metrics
}

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
