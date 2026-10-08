import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SystemDiagnosticsContentInput } from '../tests/fixtures/system-diagnostics-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/system-diagnostics-content')
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
      entry: resolve('tests/fixtures/system-diagnostics-content-browser.tsx'),
      name: 'SystemDiagnosticsContent',
      formats: ['iife'],
      fileName: 'system-diagnostics-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/system-diagnostics-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/system-diagnostics-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/system-diagnostics-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/system-diagnostics-content')
const suffix = ' 完整诊断标题 Complete diagnostic heading'.repeat(3)
let current: (SystemDiagnosticsContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: SystemDiagnosticsContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeSystemDiagnosticsContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;overflow:hidden;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#system-diagnostics-content-fixture{display:flex;block-size:100dvh;inline-size:100%;min-inline-size:0;min-block-size:0}.owned-diagnostics-provider{display:flex;flex:1;min-inline-size:0;min-block-size:0}.owned-diagnostics-pane{display:flex;flex:1;flex-direction:column;min-inline-size:0;min-block-size:0;overflow:auto}</style><div id="system-diagnostics-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountSystemDiagnosticsContent(value), input)
  const root = page.locator('.hbar-system-diagnostics')
  await expect(root).toBeVisible()
  if (input.state !== 'loading')
    await expect.poll(() => page.evaluate(() => window.systemDiagnosticsContentState().status)).not.toBe('loading')
  return root
}
const read = async (term: Locator) => {
  await term.scrollIntoViewIfNeeded()
  await term.focus()
  expect(await term.evaluate((node) => node.scrollWidth > node.clientWidth && node.clientWidth > 0)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => term.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).diagnostics
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ locale, mode, count: 13, suffix, state: 'ready' }, width)
        await expect.poll(() => page.evaluate(() => window.systemDiagnosticsContentState().status)).toBe('ready')
        for (const label of [labels.title, labels.host, labels.activity, labels.storage])
          await verifyReadableText(
            root.getByRole('heading', { name: label + suffix, exact: true }),
            label + suffix,
            width < 400,
          )
        await verifyReadableText(
          root.locator('.hbar-system-diagnostics-intro [data-text-context="section.description"]'),
          labels.description + suffix,
          width < 400,
        )
        await verifyReadableText(root.getByText('v'.repeat(64), { exact: true }), 'v'.repeat(64), width < 400)
        await verifyReadableText(root.getByText('p'.repeat(64), { exact: true }), 'p'.repeat(64), width < 400)
        const storage = root.getByRole('region', { name: labels.storage + suffix, exact: true })
        await expect(storage.getByRole('term')).toHaveCount(12)
        await expect(storage.getByText(labels.moreStorageEntries(1), { exact: true })).toBeVisible()
        if (width < 400) {
          await read(storage.locator('.hbar-system-diagnostics-term-reader').first())
          await read(root.getByRole('region', { name: labels.version + suffix, exact: true }))
          await read(root.locator('.hbar-system-diagnostics-reader'))
        }
        expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await root.getByRole('heading', { name: labels.storage + suffix, exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    for (const count of [0, 1, 7, 12, 13, 4096]) {
      const root = await mount({ locale, mode: 'light', count, suffix: '', state: 'ready' })
      const storage = root.getByRole('region', { name: labels.storage, exact: true })
      await expect(storage.getByRole('term')).toHaveCount(Math.min(count, 12))
      if (count === 0) await expect(storage.getByText(labels.noStorageEntries, { exact: true })).toBeVisible()
      if (count > 12)
        await expect(storage.getByText(labels.moreStorageEntries(count - 12), { exact: true })).toBeVisible()
      scenarios++
    }
    for (const tools of [0, 1, 4096, 4097]) {
      const root = await mount({ locale, mode: 'light', count: 1, suffix: '', state: 'ready', tools })
      if (tools > 4096) await expect(root.getByRole('alert')).toHaveText(labels.error('INVALID_OUTPUT'))
      else
        await expect(
          root
            .getByRole('region', { name: labels.activity, exact: true })
            .getByRole('region', { name: labels.tools, exact: true })
            .locator('..')
            .locator('..')
            .getByRole('definition'),
        ).toHaveText(labels.number(tools))
      scenarios++
    }
    for (const state of ['error', 'loading', 'offline'] as const) {
      const root = await mount({ locale, mode: 'light', count: 1, suffix: '', state })
      if (state === 'offline') {
        await expect(root.getByRole('button', { name: labels.refresh, exact: true })).toBeDisabled()
        await expect(root.getByText(labels.oldResult, { exact: true })).toBeVisible()
        await expect(root.getByText('v'.repeat(64), { exact: true })).toBeVisible()
      } else {
        if (state === 'error') await expect(root.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
        else await expect(root.getByText(labels.loading, { exact: true })).toBeVisible()
        await page.evaluate(() => window.repairSystemDiagnosticsContent())
        if (state === 'error') await page.evaluate(() => window.refreshSystemDiagnosticsContent())
        await expect.poll(() => page.evaluate(() => window.systemDiagnosticsContentState().status)).toBe('ready')
        await expect(root.getByRole('alert')).toHaveCount(0)
      }
      scenarios++
    }
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'result.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`System diagnostics content: ${scenarios} Chrome scenarios passed`)
} catch (error) {
  console.error('Current owned diagnostics scenario', current)
  await page.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeSystemDiagnosticsContent?.())
  await browser.close()
}
