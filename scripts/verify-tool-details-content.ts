import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ToolDetailsContentInput } from '../tests/fixtures/tool-details-content-browser'
import { toolDetailsOutput, toolDetailsCommand } from '../tests/fixtures/tool-details-content-data'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/tool-details-content')
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
      entry: resolve('tests/fixtures/tool-details-content-browser.tsx'),
      name: 'ToolDetailsContent',
      formats: ['iife'],
      fileName: 'tool-details-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/tool-details-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/tool-details-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
page.setDefaultTimeout(10_000)
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/tool-details-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/tool-details-content')
const suffix = ' 完整工具详情标题 Complete tool details heading'.repeat(3)
let current: (ToolDetailsContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: ToolDetailsContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeToolDetailsContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;overflow:hidden;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#tool-details-content-fixture,.owned-tool-details-pane{display:flex;flex-direction:column;inline-size:100%;block-size:100dvh;min-inline-size:0;min-block-size:0;overflow-y:auto;gap:1rem}.owned-tool-details-pane>*{flex:0 0 auto}</style><div id="tool-details-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountToolDetailsContent(value), input)
  const root = page.locator('.owned-tool-details-pane')
  await expect(root.getByRole('heading').first()).toBeVisible()
  return root
}
const read = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  await expect(reader).toBeFocused()
  const size = await reader.evaluate((node) => ({
    x: node.scrollWidth - node.clientWidth,
    y: node.scrollHeight - node.clientHeight,
  }))
  if (size.x > 1) {
    await reader.press('ArrowRight')
    await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
  }
  if (size.y > 1) {
    await reader.press('ArrowDown')
    await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  }
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.messageBlocks
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320])
        for (const kind of ['command', 'generic'] as const) {
          const root = await mount({ locale, mode, length: 12001, suffix, kind }, width)
          await verifyReadableText(
            root.getByRole('heading', {
              name: (kind === 'command' ? labels.command : labels.input) + suffix,
              exact: true,
            }),
            (kind === 'command' ? labels.command : labels.input) + suffix,
            width < 400,
          )
          await verifyReadableText(
            root.getByRole('heading', { name: labels.output + suffix, exact: true }),
            labels.output + suffix,
            width < 400,
          )
          await read(
            root.getByRole('region', {
              name: (kind === 'command' ? labels.command : labels.input) + suffix,
              exact: true,
            }),
          )
          if (kind === 'command') {
            const original = root.getByRole('button', { name: labels.originalInput + suffix, exact: true })
            await original.scrollIntoViewIfNeeded()
            await original.focus()
            await original.press('Enter')
            await verifyReadableText(
              original.locator('[data-text-context="collection.title"]'),
              labels.originalInput + suffix,
              width < 400,
            )
            await read(root.getByRole('region', { name: labels.originalInput + suffix, exact: true }))
          }
          const full = root.getByRole('button', { name: labels.showFullContent + suffix, exact: true })
          if (await full.count()) {
            await full.focus()
            await full.press('Enter')
          }
          await read(root.getByRole('region', { name: labels.output + suffix, exact: true }))
          await read(root.locator('.hbar-session-tool-result-copy-action'))
          await root.getByRole('button', { name: labels.toolResultCopy.copy + suffix, exact: true }).click()
          await expect
            .poll(() => page.evaluate(() => window.toolDetailsContentWrites()))
            .toEqual([toolDetailsOutput(12001)])
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-${kind}.png`) })
          scenarios++
        }
    for (const kind of ['command', 'generic'] as const)
      for (const length of [0, 1, 7, 11999, 12000, 12001, 1_000_000, 1_000_001]) {
        const root = await mount({ locale, mode: 'light', kind, length, suffix: '' })
        if (!length) await expect(root.getByText(labels.emptyOutput, { exact: true })).toBeVisible()
        else if (length <= 1_000_000) {
          await root.getByRole('button', { name: labels.toolResultCopy.copy, exact: true }).click()
          await expect
            .poll(() => page.evaluate(() => window.toolDetailsContentWrites()))
            .toEqual([toolDetailsOutput(length)])
        } else {
          await expect(root.locator('.hbar-session-tool-result-copy')).toBeDisabled()
          expect(await page.evaluate(() => window.toolDetailsContentWrites())).toEqual([])
        }
        scenarios++
      }
    for (const outcome of ['failed', 'unknown', 'pending'] as const) {
      const root = await mount({ locale, mode: 'dark', length: 12001, outcome, suffix: '' })
      await expect(root.locator('[data-command-output]')).toHaveCount(outcome === 'pending' ? 0 : 1)
      if (outcome !== 'pending') {
        expect(await root.locator('[data-command-output]').textContent()).toBe(toolDetailsOutput(12001))
        await expect(root.locator('[data-command-output-tail]')).toHaveCount(0)
      }
      scenarios++
    }
    {
      const root = await mount({ locale, mode: 'light', length: 12001, suffix: '', clipboardFailure: true })
      await root.getByRole('button', { name: labels.toolResultCopy.copy, exact: true }).click()
      await expect(root.getByRole('alert')).toHaveText(labels.toolResultCopy.failed)
      await page.evaluate(() => window.repairToolDetailsClipboard())
      await root.getByRole('button', { name: labels.toolResultCopy.retry, exact: true }).click()
      await expect
        .poll(() => page.evaluate(() => window.toolDetailsContentWrites()))
        .toEqual([toolDetailsOutput(12001)])
      expect(await root.getByRole('region', { name: labels.command, exact: true }).textContent()).toBe(
        toolDetailsCommand,
      )
      scenarios++
    }
  }
  expect(errors).toEqual([])
  console.log(`Tool details content: ${scenarios} Chrome scenarios passed`)
} catch (error) {
  console.error('Owned tool details scenario', JSON.stringify(current))
  await page.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await browser.close()
}
