import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SettingsUsageContentInput } from '../tests/fixtures/settings-usage-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/settings-usage-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
    lib: {
      entry: resolve('tests/fixtures/settings-usage-content-browser.tsx'),
      name: 'SettingsUsageContent',
      formats: ['iife'],
      fileName: 'settings-usage-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/settings-usage-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/settings-usage-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/settings-usage-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/settings-usage-content')
const suffix = ' 完整用量标题 Full usage heading'.repeat(4)
let current: (SettingsUsageContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: SettingsUsageContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeSettingsUsageContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#settings-usage-content-fixture{inline-size:100%;min-inline-size:0}</style><div id="settings-usage-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountSettingsUsageContent(value), input)
  const root = page.locator('.hbar-settings-usage')
  await expect(root).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.settingsUsageContentState().entry?.status)).not.toBe('loading')
  return root
}
const read = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  expect(await reader.evaluate((node) => node.scrollWidth > node.clientWidth && node.clientWidth > 0)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).settingsUsage
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ locale, mode, count: 9, buckets: 24, suffix }, width)
        await expect.poll(() => page.evaluate(() => window.settingsUsageContentState().entry?.status)).toBe('ready')
        for (const text of [labels.title, labels.summary, labels.activity, labels.models]) {
          await verifyReadableText(
            root.getByRole('heading', { name: text + suffix, exact: true }),
            text + suffix,
            width < 400,
          )
        }
        for (const text of [labels.tokens, labels.input, labels.output, labels.cost])
          await verifyReadableText(
            root.locator('.lumen-usage-metrics').getByText(text + suffix, { exact: true }),
            text + suffix,
            width < 400,
          )
        const name = `provider: Complete model name 完整模型名称 0 ${'LongIdentityWithoutSpaces'.repeat(4)}`
        await verifyReadableText(root.locator('.lumen-usage-model-row').first().locator('strong'), name, width < 400)
        await expect(root.locator('.lumen-usage-model-row')).toHaveCount(8)
        await expect(root.locator('.hbar-settings-usage-windows button')).toHaveCount(4)
        await expect(
          root.locator('.lumen-usage-table-heading').getByText(labels.cost + suffix, { exact: true }),
        ).toHaveCount(1)
        const bucket = root.locator('.lumen-bar-series > button').first()
        await bucket.focus()
        await page.keyboard.press('Enter')
        await expect(bucket).toHaveAttribute('aria-pressed', 'true')
        await expect(
          root.getByRole('status').filter({ hasText: (await bucket.getAttribute('title')) ?? '' }),
        ).toBeVisible()
        if (width < 400) {
          await read(root.locator('.hbar-settings-usage-windows'))
          await read(root.locator('.hbar-settings-usage-pagination'))
        }
        const next = root.getByRole('button', { name: labels.next + suffix, exact: true })
        await next.focus()
        await page.keyboard.press('Enter')
        await expect(root.locator('.lumen-usage-model-row')).toHaveCount(1)
        await expect(root.locator('.lumen-usage-model-row').first()).toContainText('完整模型名称 8')
        await page.evaluate(() => window.reorderSettingsUsageContent())
        await expect(root.locator('.lumen-usage-model-row')).toHaveCount(8)
        await expect(root.locator('.lumen-usage-model-row').first()).toContainText('完整模型名称 8')
        await expect(root.locator('.lumen-bar-series > button[aria-pressed="true"]')).toHaveCount(0)
        expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await root.getByRole('heading', { name: labels.models + suffix, exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    for (const count of [0, 1, 7, 8, 9, 1024]) {
      const root = await mount({ locale, mode: 'light', count, buckets: 1, suffix: '' })
      await expect.poll(() => page.evaluate(() => window.settingsUsageContentState().entry?.status)).toBe('ready')
      await expect(root.locator('.lumen-usage-model-row')).toHaveCount(Math.min(count, 8))
      await expect(root.locator('.hbar-settings-usage-pagination')).toHaveCount(count > 8 ? 1 : 0)
      if (count === 0) await expect(root.getByText(labels.noModels, { exact: true })).toBeVisible()
      scenarios++
    }
    for (const buckets of [0, 1, 24, 120]) {
      const root = await mount({ locale, mode: 'light', count: 1, buckets, suffix: '' })
      await expect.poll(() => page.evaluate(() => window.settingsUsageContentState().entry?.status)).toBe('ready')
      await expect(root.locator('.lumen-bar-series > button')).toHaveCount(buckets)
      scenarios++
    }
    for (const invalid of [{ count: 1025 }, { buckets: 121 }, { duplicate: true }, { wrongScope: true }]) {
      const root = await mount({ locale, mode: 'light', count: 2, buckets: 1, suffix: '', ...invalid })
      await expect(root.getByRole('alert')).toHaveText(labels.error('INVALID_OUTPUT'))
      await expect(root.locator('.lumen-usage-model-row')).toHaveCount(0)
      scenarios++
    }
    const failure = await mount({ locale, mode: 'light', count: 1, buckets: 1, suffix: '', failure: true })
    await expect(failure.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
    await page.evaluate(() => window.repairSettingsUsageContent())
    await page.evaluate(() => window.refreshSettingsUsageContent())
    await expect(failure.getByRole('alert')).toHaveCount(0)
    await expect(failure.locator('.lumen-usage-model-row')).toHaveCount(1)
    scenarios++
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'result.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`Settings usage content: ${scenarios} Chrome scenarios passed`)
} catch (error) {
  console.error('Current owned usage scenario', current)
  await page.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeSettingsUsageContent?.())
  await browser.close()
}
