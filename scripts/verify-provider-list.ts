import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ProviderListFixtureInput } from '../tests/fixtures/provider-list-browser'

const output = resolve('artifacts/desktop-elements/provider-list')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/provider-list-browser.tsx'),
      name: 'ProviderList',
      formats: ['iife'],
      fileName: 'provider-list',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/provider-list.css')).text()
const script = await Bun.file(resolve(output, 'bundle/provider-list.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let scenarios = 0
const errors: string[] = []
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const copy = getShellCopy(locale).providers.list
        const suffix =
          locale === 'zh-CN' ? '原始供应商列表完整标签'.repeat(16) : ' Original complete Provider list label'.repeat(16)
        const cases: readonly Pick<ProviderListFixtureInput, 'count' | 'failure'>[] =
          width === 320 && mode === 'dark'
            ? [
                { count: 3, failure: 'none' },
                { count: 0, failure: 'none' },
                { count: 1, failure: 'none' },
                { count: 256, failure: 'none' },
                ...(['duplicates', 'read-error', 'failed', 'unknown', 'missing'] as const).map((failure) => ({
                  count: 3,
                  failure,
                })),
              ]
            : [{ count: 3, failure: 'none' }]
        for (const scenario of cases) {
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;background:var(--lumen-canvas);color:var(--lumen-ink)}.provider-list-fixture{display:flex;block-size:100dvh;box-sizing:border-box;padding:1rem}.provider-list-fixture-pane{flex:1 1 auto;min-inline-size:0;min-block-size:0;overflow:auto}</style><div id="provider-list-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((input) => window.mountProviderList(input), { locale, mode, suffix, ...scenario })
          const list = page.getByTestId('provider-settings-list')
          const heading = list.getByRole('group', { name: copy.title + suffix, exact: true })
          await expect(heading.getByRole('heading', { level: 2 })).toHaveText(copy.title + suffix)
          await heading.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => heading.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const descriptionBounds = await list.locator('[data-text-context="section.description"]').boundingBox()
          const listBounds = await list.boundingBox()
          if (!descriptionBounds || !listBounds) throw new Error('Missing Provider description reading bounds')
          expect(descriptionBounds.x).toBeGreaterThanOrEqual(listBounds.x - 1)
          expect(descriptionBounds.x + descriptionBounds.width).toBeLessThanOrEqual(listBounds.x + listBounds.width + 1)
          const header = list.getByRole('toolbar', { name: copy.title + suffix, exact: true })
          await header.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => header.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          await list.getByRole('button', { name: copy.add + suffix, exact: true }).click()
          await list.getByRole('button', { name: copy.refresh, exact: true }).click()
          expect(await page.evaluate(() => window.providerListActions)).toEqual([
            { kind: 'add', providerId: null },
            { kind: 'refresh', providerId: null },
          ])
          await expect(list.getByRole('listitem')).toHaveCount(scenario.count)
          if (scenario.failure === 'duplicates')
            await expect(list.getByText('Rejected duplicate source')).toHaveCount(0)
          if (scenario.count === 0) {
            await expect(list.getByText(copy.empty, { exact: true })).toBeVisible()
            await expect(list.getByRole('list')).toHaveCount(0)
          } else {
            const last = list.getByTestId('provider-row').last()
            await last.scrollIntoViewIfNeeded()
            const reading = last.getByRole('group')
            await reading.focus()
            for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight')
            await expect
              .poll(() => reading.evaluate((node) => node.scrollLeft), {
                message: `${locale} ${mode} ${width} ${scenario.count} row reading`,
              })
              .toBeGreaterThan(0)
            if (scenario.count === 256) {
              expect(await page.evaluate(() => window.providerListBoundaryAccepted(256))).toBe(true)
              expect(await page.evaluate(() => window.providerListBoundaryAccepted(257))).toBe(false)
              expect(
                await page.locator('.provider-list-fixture-pane').evaluate((node) => node.scrollTop),
              ).toBeGreaterThan(0)
              await last
                .getByRole('button', { name: copy.edit(`Original provider 255 — 原始供应商 `.repeat(3)), exact: true })
                .click()
              expect((await page.evaluate(() => window.providerListActions)).at(-1)).toEqual({
                kind: 'edit',
                providerId: 'original-provider-255',
              })
            } else {
              const targetId = scenario.count === 1 ? 'original-provider-0' : 'original-provider-1'
              const target = list.locator(`[data-provider-id="${targetId}"]`)
              await target.getByTestId('provider-default-action').click()
              expect((await page.evaluate(() => window.providerListActions)).at(-1)).toEqual({
                kind: 'default',
                providerId: targetId,
              })
              if (scenario.failure === 'failed' || scenario.failure === 'unknown') {
                const targetReading = target.getByRole('group')
                await targetReading.focus()
                for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight')
                await expect.poll(() => targetReading.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
                const rowBounds = await target.boundingBox()
                const alertBounds = await target.getByRole('alert').boundingBox()
                if (!rowBounds || !alertBounds) throw new Error('Missing owned Provider feedback bounds')
                expect(alertBounds.x).toBeGreaterThanOrEqual(rowBounds.x - 1)
                expect(alertBounds.x + alertBounds.width).toBeLessThanOrEqual(rowBounds.x + rowBounds.width + 1)
              }
              if (scenario.failure === 'failed')
                await expect(target.getByRole('alert')).toHaveText(copy.setDefaultError('EXECUTION_FAILED'))
              else if (scenario.failure === 'unknown' || scenario.failure === 'missing') {
                const owner =
                  scenario.failure === 'missing' ? list.locator('.hbar-provider-list-view-missing-action') : target
                if (scenario.failure === 'missing') await expect(target).toHaveCount(0)
                await expect(owner.getByRole('alert')).toHaveText(copy.setDefaultError('RESULT_UNKNOWN'))
                await expect(list.getByRole('button', { name: copy.add + suffix, exact: true })).toBeDisabled()
                const reconcileName =
                  scenario.failure === 'missing'
                    ? copy.reconcileDefault
                    : copy.reconcileDefaultFor(
                        `Original provider 1 — 原始供应商 `.repeat(3),
                        'Original primary model 1 — 原始模型',
                      )
                await owner.getByRole('button', { name: reconcileName, exact: true }).click()
                expect((await page.evaluate(() => window.providerListActions)).at(-1)).toEqual({
                  kind: 'reconcile',
                  providerId: targetId,
                })
                expect(
                  (await page.evaluate(() => window.providerListActions)).filter((action) => action.kind === 'default'),
                ).toHaveLength(1)
              } else if (scenario.failure !== 'read-error')
                await expect(target.getByTestId('provider-global-default')).toHaveText(
                  copy.globalDefault(`Original primary model ${scenario.count === 1 ? 0 : 1} — 原始模型`),
                )
              if (scenario.failure === 'read-error')
                await expect(list.getByRole('alert')).toHaveText(copy.error('DISCONNECTED'))
              const survivor = list.locator('[data-provider-id="original-provider-0"]')
              const name = `Original provider 0 — 原始供应商 `.repeat(3)
              await page.evaluate(() => window.reverseProviderList())
              await expect(survivor).toBeVisible()
              await survivor.getByRole('button', { name: copy.edit(name), exact: true }).click()
              expect((await page.evaluate(() => window.providerListActions)).at(-1)).toEqual({
                kind: 'edit',
                providerId: 'original-provider-0',
              })
              await survivor.getByRole('button', { name: copy.actions(name), exact: true }).click()
              await page.getByRole('menuitem', { name: copy.remove(name), exact: true }).click()
              expect((await page.evaluate(() => window.providerListActions)).at(-1)).toEqual({
                kind: 'remove',
                providerId: 'original-provider-0',
              })
            }
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
          if (width === 320 && mode === 'dark')
            await page.screenshot({ path: resolve(output, `${locale}-${scenario.count}-${scenario.failure}-320.png`) })
          scenarios++
          await page.evaluate(() => window.releaseProviderList())
        }
      }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual Provider list scenarios passed.`)
} finally {
  await browser.close()
  await server.stop(true)
}
