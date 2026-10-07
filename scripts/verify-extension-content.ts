import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ExtensionContentInput } from '../tests/fixtures/extension-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/extension-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/extension-content-browser.tsx'),
      name: 'ExtensionContent',
      formats: ['iife'],
      fileName: 'extension-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/extension-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/extension-content.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
let currentCase: unknown
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (reason) => errors.push(reason.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320])
        for (const collection of ['plugins', 'skills'] as const) {
          const labels = getShellCopy(locale).extensions
          const suffix =
            locale === 'zh-CN'
              ? ' 完整原始扩展操作与栏目标题'.repeat(8)
              : ' Complete original extension action and section heading'.repeat(8)
          const normal: ExtensionContentInput = { locale, mode, suffix, collection, count: 3, state: 'ready' }
          const cases = [normal]
          if (width === 320 && mode === 'dark')
            cases.push(
              ...[0, 1, 20, 21, collection === 'plugins' ? 4096 : 10000].map((count) => ({ ...normal, count })),
              ...(['read-error', 'stale-error', 'duplicates', 'offline'] as const).map((state) => ({
                ...normal,
                state,
              })),
              ...(collection === 'plugins' ? [{ ...normal, state: 'unknown' as const }] : []),
            )
          for (const input of cases) {
            currentCase = { locale, mode, width, collection, count: input.count, state: input.state }
            await page.setViewportSize({ width, height: 900 })
            await page.setContent(
              `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width <= 390 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#extension-content-fixture{min-inline-size:0;block-size:100dvh;overflow:auto;padding:1rem}</style><div id="extension-content-fixture"></div>`,
            )
            await page.addScriptTag({ content: script })
            await page.evaluate((value) => window.mountExtensionContent(value), input)
            const panel = page.locator('.hbar-app-react-extension-workspace')
            const title = panel.getByRole('heading', {
              name: labels.navigation[collection].title + suffix,
              exact: true,
            })
            await verifyReadableText(title, labels.navigation[collection].title + suffix, width <= 900)
            const filter = panel.getByRole('textbox', {
              name: labels.navigation[collection].filter + suffix,
              exact: true,
            })
            await expect(filter).toHaveAttribute('maxlength', '200')
            const labelReader = panel.locator('.lumen-form-field-label-rail')
            await labelReader.scrollIntoViewIfNeeded()
            await labelReader.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => labelReader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            const section = panel.locator(`[data-extension-collection="${collection}"]`)
            const feedback = section.locator('.hbar-app-react-extension-collection-feedback')
            const rows = section.locator(collection === 'plugins' ? '[data-plugin-id]' : '[data-skill-id]')
            if (input.state === 'read-error' || input.state === 'stale-error' || input.state === 'duplicates') {
              await expect(feedback).toHaveAttribute('data-collection-status', 'error')
              await expect(feedback.getByRole('alert')).toHaveText(
                labels.collections[collection].error(input.state === 'duplicates' ? 'INVALID_OUTPUT' : 'DISCONNECTED'),
              )
              await expect(rows).toHaveCount(input.state === 'stale-error' ? 3 : 0)
              if (input.state !== 'duplicates') {
                await page.evaluate(() => window.repairExtensionContent())
                await feedback
                  .getByRole('button', { name: labels.collections[collection].retry + suffix, exact: true })
                  .click()
                await expect(feedback).toHaveAttribute('data-collection-status', 'ready')
                await expect(title).toBeFocused()
              }
            }
            if (input.state !== 'duplicates') {
              await expect(rows).toHaveCount(Math.min(20, input.count))
              if (!input.count)
                await expect(
                  section.getByText(collection === 'plugins' ? labels.noPlugins : labels.noSkills, { exact: true }),
                ).toBeVisible()
              else {
                const first = rows.first()
                await verifyReadableText(
                  first.locator('[data-text-context="collection.title"]'),
                  collection === 'plugins'
                    ? '原始插件 0 Complete original Plugin record name '.repeat(6)
                    : 'original-skill-0-' + '完整技能标识-original-name-'.repeat(4),
                  width <= 390,
                )
                if (input.state === 'offline')
                  await expect(first.locator('.hbar-app-react-extension-open')).toBeDisabled()
                else {
                  const compact =
                    collection === 'plugins'
                      ? first.locator('header > .hbar-extension-reading')
                      : first.locator(':scope > .hbar-extension-reading')
                  await compact.focus()
                  for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
                  await expect.poll(() => compact.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
                  if (input.state === 'unknown') {
                    await expect(first.getByRole('status')).toContainText(labels.detail.actions.unknown)
                    await expect(first.getByRole('button', { name: labels.enable, exact: true })).toHaveCount(0)
                    await first
                      .getByRole('button', { name: labels.detail.actions.readCurrent + suffix, exact: true })
                      .click()
                    await expect(first.getByRole('status')).toContainText(labels.detail.actions.unknown)
                    expect(
                      (await page.evaluate(() => window.extensionContentState().calls)).filter(
                        (call) => call.name === 'plugin.disable',
                      ),
                    ).toHaveLength(1)
                  } else if (input.count === 3 && input.state === 'ready') {
                    const originalId = await first.getAttribute(
                      collection === 'plugins' ? 'data-plugin-id' : 'data-skill-id',
                    )
                    if (!originalId) throw new Error('Missing original extension ID')
                    await page.evaluate(() => window.mutateExtensionContent('reverse'))
                    await expect(rows.first()).not.toHaveAttribute(
                      collection === 'plugins' ? 'data-plugin-id' : 'data-skill-id',
                      originalId,
                    )
                    const originalRow = section.locator(
                      `[${collection === 'plugins' ? 'data-plugin-id' : 'data-skill-id'}="${originalId}"]`,
                    )
                    await expect(originalRow).toHaveCount(1)
                    await originalRow.locator('.hbar-app-react-extension-open').click()
                    await expect(
                      panel.locator(
                        collection === 'plugins' ? '.hbar-app-react-plugin-detail' : '.hbar-app-react-skill-detail',
                      ),
                    ).toBeVisible()
                    const calls = await page.evaluate(() => window.extensionContentState().calls)
                    expect(
                      calls.findLast(
                        (call) => call.name === (collection === 'plugins' ? 'plugin.inspect' : 'skill.inspect'),
                      )?.input,
                    ).toEqual({ id: originalId })
                    await panel
                      .getByRole('button', {
                        name: collection === 'plugins' ? labels.detail.back : labels.skillDetail.back,
                        exact: true,
                      })
                      .click()
                    await expect(originalRow.locator('.hbar-app-react-extension-open')).toBeFocused()
                    await page.evaluate(() => window.mutateExtensionContent('drop-active'))
                    await expect(originalRow).toHaveCount(0)
                  }
                }
                if (input.count > 20) {
                  await section.getByRole('button', { name: labels.pagination.next + suffix, exact: true }).click()
                  await expect(rows).toHaveCount(Math.min(20, input.count - 20))
                  await page.evaluate(() => window.mutateExtensionContent('shrink'))
                  await expect(rows).toHaveCount(1)
                  await expect(section.locator('.hbar-app-react-extension-pagination')).toHaveCount(0)
                }
                await filter.fill('no-such-original-record')
                await expect(rows).toHaveCount(0)
                await expect(
                  panel.getByText(collection === 'plugins' ? labels.noMatchingPlugins : labels.noMatchingSkills, {
                    exact: true,
                  }),
                ).toBeVisible()
                await panel
                  .getByRole('button', { name: labels.clearSearch + suffix, exact: true })
                  .last()
                  .click()
                await expect(filter).toHaveValue('')
                await expect(filter).toBeFocused()
              }
              const calls = await page.evaluate(() => window.extensionContentState().calls)
              expect(
                calls.filter((call) => call.name === (collection === 'plugins' ? 'skill.list' : 'plugin.list')),
              ).toHaveLength(0)
              expect((await panel.textContent())?.includes('owned-private-config-never-displayed')).toBe(false)
              if (width === 320 && input.count === 3 && input.state === 'ready') {
                await title.scrollIntoViewIfNeeded()
                await page.screenshot({ path: resolve(output, `${locale}-${mode}-${collection}-320.png`) })
                expect(await page.evaluate(() => window.extensionContentBounds())).toEqual({
                  plugins4096: true,
                  plugins4097: false,
                  skills10000: true,
                  skills10001: false,
                })
              }
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
            await page.evaluate(() => window.releaseExtensionContent())
            scenarios++
          }
        }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual extension collection Chrome scenarios passed.`)
} catch (reason) {
  console.error({ currentCase, errors })
  throw reason
} finally {
  await browser.close()
  await server.stop(true)
}
