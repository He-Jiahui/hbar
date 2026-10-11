import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'

let bundle: { code: string; css: string } | undefined
async function mount(page: Page) {
  const executable =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules/bun/bin/bun.exe')])
          .find(existsSync)
      : 'bun'
  if (!executable) throw new Error('Bun is unavailable for the ECharts fixture')
  bundle ??= z.object({ code: z.string().min(1), css: z.string() }).parse(
    JSON.parse(
      execFileSync(executable, ['tests/fixtures/build-echarts-chart.ts'], {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 12 * 1024 * 1024,
      }),
    ),
  )
  await page.setContent('<html><head></head><body><div id="fixture-root"></div></body></html>')
  await page.addStyleTag({
    content: `${bundle.css}\n:root{--lumen-ink:#18304b;--lumen-muted:#51647a;--lumen-edge:#b8c6d6;--lumen-accent:#3462a9}:root[data-lumen-mode=dark]{--lumen-ink:#dee8f5;--lumen-accent:#de8149}body{margin:0;font:16px system-ui}`,
  })
  await page.addScriptTag({ content: bundle.code })
  await expect(page.locator('[role="img"][aria-label="Fixture chart"]')).toHaveCount(1)
}
const optionSchema = z.object({
  animation: z.boolean(),
  series: z.array(z.object({ name: z.string(), animation: z.boolean() }).nullable()),
  xAxis: z.array(z.unknown()),
  yAxis: z.array(z.unknown()),
  legend: z.array(z.object({ selected: z.record(z.string(), z.boolean()) })),
  color: z.array(z.string()),
})
async function snapshot(page: Page) {
  const value = await page.evaluate(() => window.hbarEchartsFixture.snapshot())
  if (!value) throw new Error('Expected a live chart')
  return { ...value, option: optionSchema.parse(value.option) }
}
async function show(page: Page) {
  await page.evaluate(() => window.hbarEchartsFixture.render({ hidden: false }))
  await expect.poll(() => page.evaluate(() => window.hbarEchartsFixture.snapshot()?.width ?? 0)).toBeGreaterThan(0)
}

test('hidden mounts defer initialization and StrictMode remounts release the old chart', async ({ page }, testInfo) => {
  const warnings: string[] = []
  const errors: string[] = []
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) warnings.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await mount(page)
  expect(await page.evaluate(() => window.hbarEchartsFixture.snapshot())).toBeNull()
  await page.evaluate(() => window.hbarEchartsFixture.render({ variant: 'one' }))
  await show(page)
  const initial = await snapshot(page)
  expect(initial.option.series.filter(Boolean).map((series) => series?.name)).toEqual(['Writer'])
  await page.setViewportSize({ width: 320, height: 700 })
  await expect.poll(async () => (await snapshot(page)).width).toBe(320)
  expect((await snapshot(page)).id).toBe(initial.id)
  await page.evaluate(() => window.hbarEchartsFixture.render({ mounted: false }))
  await expect.poll(() => page.evaluate(() => window.hbarEchartsFixture.snapshot())).toBeNull()
  expect(await page.evaluate((id) => window.hbarEchartsFixture.isRegistered(id), initial.id)).toBe(false)
  await page.evaluate(() => window.hbarEchartsFixture.render({ mounted: true }))
  await expect.poll(() => page.evaluate(() => window.hbarEchartsFixture.snapshot()?.width ?? 0)).toBeGreaterThan(0)
  await expect.poll(async () => (await snapshot(page)).id).not.toBe(initial.id)
  await page.screenshot({ path: testInfo.outputPath('chart-narrow.png') })
  expect(warnings).toEqual([])
  expect(errors).toEqual([])
})

test('structural updates remove obsolete series and axes while preserving the legend and instance', async ({
  page,
}) => {
  await mount(page)
  await show(page)
  await expect.poll(async () => (await snapshot(page)).option.series.filter(Boolean).length).toBe(2)
  const initial = await snapshot(page)
  await page.evaluate(() => window.hbarEchartsFixture.selectLegend('Writer'))
  await page.evaluate(() => window.hbarEchartsFixture.render({ variant: 'one' }))
  await expect
    .poll(async () => (await snapshot(page)).option.series.filter(Boolean).map((series) => series?.name))
    .toEqual(['Writer'])
  const updated = await snapshot(page)
  expect(updated.id).toBe(initial.id)
  expect(updated.option.legend[0]?.selected.Writer).toBe(false)
  await page.evaluate(() => window.hbarEchartsFixture.render({ variant: 'empty' }))
  await expect.poll(async () => (await snapshot(page)).option.series.filter(Boolean)).toEqual([])
  const empty = await snapshot(page)
  expect(empty.option.xAxis).toEqual([])
  expect(empty.option.yAxis).toEqual([])
  expect(empty.id).toBe(initial.id)
})

test('reduced motion overrides explicit chart and series animations and changes live without reinitialization', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount(page)
  await show(page)
  await expect.poll(async () => (await snapshot(page)).option.animation).toBe(false)
  const initial = await snapshot(page)
  expect(initial.option.series.filter(Boolean).every((series) => series?.animation === false)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(async () => (await snapshot(page)).option.animation).toBe(true)
  expect((await snapshot(page)).option.series.filter(Boolean).every((series) => series?.animation === true)).toBe(true)
  expect((await snapshot(page)).id).toBe(initial.id)
  await page.evaluate(() => window.hbarEchartsFixture.render({ explicitAnimation: false }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect
    .poll(async () => (await snapshot(page)).option.series.every((series) => series?.animation === false))
    .toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect
    .poll(async () => (await snapshot(page)).option.series.every((series) => series?.animation === true))
    .toBe(true)
})

test('live Lumen mode changes repaint Canvas on the same instance and default tooltip labels remain inert text', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount(page)
  await show(page)
  await expect.poll(async () => (await snapshot(page)).option.color[0]).toBe('rgb(52, 98, 169)')
  const initial = await snapshot(page)
  await page.evaluate(() => window.hbarEchartsFixture.selectLegend('Writer'))
  const pixels = (rgb: readonly [number, number, number]) =>
    page.locator('canvas').evaluate((element, target) => {
      const canvas = element as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Missing chart Canvas context')
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let index = 0; index < data.length; index += 4)
        if (
          data[index] === target[0] &&
          data[index + 1] === target[1] &&
          data[index + 2] === target[2] &&
          data[index + 3] === 255
        )
          count++
      return count
    }, rgb)
  await expect.poll(() => pixels([52, 98, 169])).toBeGreaterThan(0)
  await page.evaluate(() => document.documentElement.setAttribute('data-lumen-mode', 'dark'))
  await expect.poll(() => pixels([222, 129, 73])).toBeGreaterThan(0)
  const themed = await snapshot(page)
  expect(themed.id).toBe(initial.id)
  expect(themed.option.legend[0]?.selected.Writer).toBe(false)
  await page.evaluate(() => window.hbarEchartsFixture.showTooltip())
  await expect(page.getByText('A <img src=x data-audit-marker=tooltip>', { exact: true })).toBeVisible()
  await expect(page.locator('img[data-audit-marker=tooltip]')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('chart-theme-tooltip.png') })
})

test('the Lumen application motion switch overrides explicit animations and restores them on the same chart', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await mount(page)
  await show(page)
  const initial = await snapshot(page)
  await page.evaluate(() => document.documentElement.setAttribute('data-lumen-motion', 'off'))
  await expect.poll(async () => (await snapshot(page)).option.animation).toBe(false)
  expect((await snapshot(page)).option.series.every((series) => series?.animation === false)).toBe(true)
  await page.evaluate(() => document.documentElement.setAttribute('data-lumen-motion', 'on'))
  await expect.poll(async () => (await snapshot(page)).option.animation).toBe(true)
  expect((await snapshot(page)).option.series.every((series) => series?.animation === true)).toBe(true)
  expect((await snapshot(page)).id).toBe(initial.id)
})
