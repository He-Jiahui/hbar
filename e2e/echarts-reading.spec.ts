import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { EchartsReadingInput } from '../tests/fixtures/echarts-reading-browser'
import { echartsReadingLabel } from '../tests/fixtures/echarts-reading-data'

const root = join(process.cwd(), 'artifacts/desktop-elements/echarts-reading/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/echarts-reading.html') },
    },
  })
  server = await preview({
    configFile: false,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned chart preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/echarts-reading.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`chart owned reading and live appearance ${locale} ${mode}`, async ({ browser }, info) => {
      test.setTimeout(90_000)
      const context = await browser.newContext({
        locale,
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'no-preference',
      })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let input: EchartsReadingInput = { locale, mode, count: 3, seriesCount: 3, textSize: 'l', motion: true }
      const snapshot = () => page.evaluate(() => window.echartsReadingSnapshot())
      const update = async (next: EchartsReadingInput) => {
        input = next
        await page.evaluate((value) => window.updateEchartsReading(value), input)
      }
      try {
        await page.goto(url)
        await page.evaluate((value) => window.mountEchartsReading(value), input)
        await expect.poll(async () => (await snapshot())?.option.series?.filter(Boolean).length).toBe(3)
        const id = (await snapshot())?.id
        const chart = page.getByRole('img', { name: echartsReadingLabel(locale), exact: true })
        const heading = page.getByRole('heading', { name: echartsReadingLabel(locale), exact: true })
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          await expect(chart.locator('canvas')).toBeVisible()
          await expect(heading).toHaveText(echartsReadingLabel(locale))
          expect(await heading.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          const bounds = await heading.boundingBox()
          expect(bounds?.x).toBeGreaterThanOrEqual(0)
          expect((bounds?.x ?? width) + (bounds?.width ?? width)).toBeLessThanOrEqual(width + 1)
          await expect
            .poll(async () => {
              const value = await snapshot()
              return value?.width === (await chart.evaluate((node) => node.clientWidth))
            })
            .toBe(true)
          const value = await snapshot()
          expect(value?.option.textStyle.color).toBe(value?.ownColor)
          expect(value?.ownColor).not.toBe(value?.outerColor)
          expect(value?.option.textStyle.fontSize).toBe(value?.ownFontSize)
          expect(value?.option.xAxis?.[0]?.axisLabel.color).toBe(value?.ownMuted)
          expect(value?.id).toBe(id)
          if (width === 320) await page.screenshot({ path: info.outputPath(`${locale}-${mode}-320.png`) })
        }
        for (const count of [0, 1, 3, 500]) {
          expect(await page.evaluate((count) => window.canRenderEchartsBuckets(count), count)).toBe(true)
          await update({ ...input, count, seriesCount: 1 })
          await expect.poll(async () => (await snapshot())?.option.series?.filter(Boolean).length).toBe(1)
          await expect.poll(async () => (await snapshot())?.option.series?.[0]?.data.length).toBe(count)
          expect((await snapshot())?.id).toBe(id)
        }
        expect(await page.evaluate(() => window.canRenderEchartsBuckets(501))).toBe(false)
        await update({ ...input, mode: mode === 'light' ? 'dark' : 'light', textSize: 's' })
        await expect
          .poll(async () => {
            const value = await snapshot()
            return (
              value?.option.textStyle.color === value?.ownColor &&
              value?.option.textStyle.fontSize === value?.ownFontSize
            )
          })
          .toBe(true)
        expect((await snapshot())?.id).toBe(id)
        await expect.poll(async () => (await snapshot())?.option.animation).toBe(true)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await expect.poll(async () => (await snapshot())?.option.animation).toBe(false)
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await expect.poll(async () => (await snapshot())?.option.animation).toBe(true)
        await update({ ...input, motion: false, seriesCount: 0 })
        await expect.poll(async () => (await snapshot())?.option.animation).toBe(false)
        await expect.poll(async () => (await snapshot())?.option.series?.filter(Boolean).length ?? 0).toBe(0)
        expect(await page.evaluate(() => window.releaseEchartsReading())).toBe(true)
        await expect(chart).toHaveCount(0)
        await page.setViewportSize({ width: 390, height: 1000 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        expect(await snapshot()).toBeNull()
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
