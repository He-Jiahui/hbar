import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { MonitoringContentInput } from '../tests/fixtures/session-monitoring-content-browser'
import { monitoringModelName } from '../tests/fixtures/session-monitoring-content-data'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/monitoring-content')
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
      entry: resolve('tests/fixtures/session-monitoring-content-browser.tsx'),
      name: 'MonitoringContent',
      formats: ['iife'],
      fileName: 'monitoring-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/monitoring-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/monitoring-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
page.setDefaultTimeout(10_000)
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/monitoring-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/monitoring-content')
let current: (MonitoringContentInput & { readonly width: number }) | undefined
let scenarios = 0
const suffix = ' 完整监控标题 Complete monitoring heading'.repeat(3)
const mount = async (input: MonitoringContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeMonitoringContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;overflow:hidden;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#monitoring-content-fixture,.owned-monitoring-pane{display:flex;inline-size:100%;block-size:100dvh;min-inline-size:0;min-block-size:0}.hbar-app-react-session-monitoring{flex:1}</style><div id="monitoring-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountMonitoringContent(value), input)
  const root = page.locator('.hbar-app-react-session-monitoring')
  await expect(root).toBeVisible()
  return root
}
const read = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  await expect(reader).toBeFocused()
  const size = await reader.evaluate((node) => ({ client: node.clientWidth, total: node.scrollWidth }))
  if (size.total > size.client + 1) {
    await reader.press('ArrowRight')
    await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
  }
}
const open = async (root: Locator, label: string) => {
  const trigger = root.getByRole('button', { name: label, exact: true })
  await trigger.scrollIntoViewIfNeeded()
  await trigger.focus()
  await trigger.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  return trigger
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).monitoring
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ locale, mode, count: 9, buckets: 120, suffix }, width)
        await verifyReadableText(
          root.getByRole('heading', { name: labels.title + suffix, exact: true }),
          labels.title + suffix,
          width < 400,
        )
        await verifyReadableText(root.locator('[data-text-context="tool.description"]'), labels.description + suffix)
        await verifyReadableText(root.locator('.hbar-app-react-monitoring-gap'), labels.gap + suffix)
        await read(
          root
            .locator('.lumen-compact-metrics')
            .first()
            .getByRole('group', { name: labels.totals.tokens + suffix, exact: true }),
        )
        await verifyReadableText(
          root.getByRole('heading', { name: labels.series + suffix, exact: true }),
          labels.series + suffix,
          width < 400,
        )
        await expect(root.getByRole('img', { name: labels.series + suffix, exact: true })).toBeVisible()
        for (const section of [labels.latency.title, labels.execution.title, labels.models]) {
          const trigger = await open(root, section + suffix)
          await verifyReadableText(
            trigger.locator('[data-text-context="collection.title"]'),
            section + suffix,
            width < 400,
          )
        }
        const rows = root.locator('ul > li')
        await expect(rows).toHaveCount(8)
        await verifyReadableText(
          rows.first().locator('[data-text-context="collection.title"]'),
          monitoringModelName(0),
          width < 400,
        )
        await read(rows.first().getByRole('group', { name: monitoringModelName(0), exact: true }))
        await read(root.locator('.hbar-monitoring-pagination'))
        await root.getByRole('button', { name: labels.next + suffix, exact: true }).click()
        await expect(rows).toHaveCount(1)
        await verifyReadableText(
          rows.first().locator('[data-text-context="collection.title"]'),
          monitoringModelName(8),
          width < 400,
        )
        await expect(root.getByRole('button', { name: labels.next + suffix, exact: true })).toBeDisabled()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    for (const count of [0, 1, 7, 8, 9, 1024, 1025]) {
      const root = await mount({ locale, mode: 'light', count, suffix: '' })
      if (count > 1024) {
        await expect(root.getByRole('alert')).toHaveText(labels.error('INVALID_OUTPUT'))
        expect(await page.evaluate(() => window.monitoringContentState().controls.usage)).toBeNull()
      } else {
        await open(root, labels.models)
        await expect(root.locator('ul > li')).toHaveCount(Math.min(count, 8))
        if (count > 8) {
          const next = root.getByRole('button', { name: labels.next, exact: true })
          for (let index = 1; index < Math.ceil(count / 8); index++) await next.click()
          await expect(next).toBeDisabled()
          expect(
            await root.locator('ul > li').last().locator('[data-text-context="collection.title"]').textContent(),
          ).toBe(monitoringModelName(count - 1))
        }
      }
      scenarios++
    }
    for (const buckets of [0, 1, 120, 500, 501]) {
      const root = await mount({ locale, mode: 'dark', count: 1, buckets, suffix: '' })
      expect(await page.evaluate(() => window.monitoringContentState().controls.usage?.series.length ?? null)).toBe(
        buckets <= 500 ? buckets : null,
      )
      if (buckets > 500) await expect(root.getByRole('alert')).toHaveText(labels.error('INVALID_OUTPUT'))
      scenarios++
    }
    for (const state of ['error', 'loading', 'offline'] as const) {
      const root = await mount({ locale, mode: 'dark', count: 1, suffix: '', state })
      if (state === 'error') {
        await expect(root.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
        await page.evaluate(() => window.repairMonitoringContent())
        await root.getByRole('button', { name: labels.refresh, exact: true }).click()
        await expect(root.getByRole('alert')).toHaveCount(0)
      } else if (state === 'loading') {
        await expect(root.getByRole('button', { name: labels.refresh, exact: true })).toBeDisabled()
        await expect(root.getByRole('status')).toHaveText(labels.loading)
        await page.evaluate(() => window.repairMonitoringContent())
        await expect.poll(() => page.evaluate(() => window.monitoringContentState().controls.usage !== null)).toBe(true)
      } else {
        await expect(root.getByRole('button', { name: labels.refresh, exact: true })).toBeDisabled()
        await expect(root.getByText(labels.oldResult, { exact: true })).toBeVisible()
      }
      scenarios++
    }
    for (const option of ['duplicate', 'wrongScope', 'reorder', 'retained'] as const) {
      const root = await mount({
        locale,
        mode: 'light',
        count: 9,
        suffix: '',
        duplicate: option === 'duplicate',
        wrongScope: option === 'wrongScope',
      })
      if (option === 'wrongScope') await expect(root.getByRole('alert')).toHaveText(labels.error('INVALID_OUTPUT'))
      else {
        await open(root, labels.models)
        if (option === 'reorder') {
          await root.getByRole('button', { name: labels.next, exact: true }).click()
          await page.evaluate(() => window.reorderMonitoringContent())
          expect(await root.locator('ul > li').first().textContent()).toContain(monitoringModelName(8))
        } else if (option === 'retained') {
          await page.evaluate(() => window.failMonitoringContent())
          await expect(root.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
          await expect(root.getByText(labels.oldResult, { exact: true })).toBeVisible()
          expect(await root.locator('ul > li').first().textContent()).toContain(monitoringModelName(0))
          await page.evaluate(() => window.repairMonitoringContent())
          await root.getByRole('button', { name: labels.refresh, exact: true }).click()
          await expect(root.getByRole('alert')).toHaveCount(0)
        } else {
          await expect(root.locator('ul > li')).toHaveCount(8)
          await expect(root.getByText('Foreign duplicate should not replace original', { exact: true })).toHaveCount(0)
        }
        await root.getByRole('button', { name: labels.close, exact: true }).click()
        expect(await page.evaluate(() => window.monitoringContentState().panels)).toBe(0)
      }
      scenarios++
    }
  }
  expect(errors).toEqual([])
  console.log(`Session monitoring content: ${scenarios} Chrome scenarios passed`)
} catch (error) {
  console.error('Owned monitoring scenario', JSON.stringify(current))
  await page.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await browser.close()
}
