import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runBoardCopy } from '../apps/web/src/run-board-copy'
import type { RunBoardContentInput } from '../tests/fixtures/run-board-content-browser'
import {
  runBoardContentName,
  runBoardContentWorkspace,
  runBoardContentStep,
} from '../tests/fixtures/run-board-content-data'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/run-board-content')
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
      entry: resolve('tests/fixtures/run-board-content-browser.tsx'),
      name: 'RunBoardContent',
      formats: ['iife'],
      fileName: 'run-board-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/run-board-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/run-board-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/run-board-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/run-board-content')
const suffix = ' 完整运行标题 Complete run heading'.repeat(3)
let current: (RunBoardContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: RunBoardContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeRunBoardContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;overflow:hidden;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#run-board-content-fixture{display:flex;block-size:100dvh;inline-size:100%;min-inline-size:0;min-block-size:0}.owned-board-provider{display:flex;flex:1;min-inline-size:0;min-block-size:0}.owned-board-pane{display:flex;flex:1;flex-direction:column;min-inline-size:0;min-block-size:0;overflow:auto}</style><div id="run-board-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountRunBoardContent(value), input)
  const root = page.locator('.hbar-web-run-board')
  await expect(root).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.runBoardContentState().board.status)).not.toBe('loading')
  return root
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = runBoardCopy(locale)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ locale, mode, count: 2, suffix }, width)
        await expect.poll(() => page.evaluate(() => window.runBoardContentState().board.status)).toBe('ready')
        await verifyReadableText(
          root.locator(':scope > header').getByRole('heading'),
          labels.title + suffix,
          width < 400,
        )
        await verifyReadableText(
          root.locator(':scope > header [data-text-context="workspace.context"]'),
          labels.description + suffix,
          width < 400,
        )
        await verifyReadableText(
          root.locator('.lumen-kanban-header').getByRole('heading'),
          labels.title + suffix,
          width < 400,
        )
        const card = root.locator('.lumen-kanban-card').filter({ hasText: 'original-run-0' })
        await verifyReadableText(card.locator('strong'), runBoardContentName(0), true)
        await verifyReadableText(
          card.getByText(runBoardContentWorkspace, { exact: true }),
          runBoardContentWorkspace,
          true,
        )
        if (width < 400) {
          const reader = card.getByRole('region', { name: runBoardContentName(0), exact: true })
          await reader.scrollIntoViewIfNeeded()
          await reader.focus()
          expect(await reader.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
          await page.keyboard.press('ArrowRight')
          await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
        }
        await card.getByRole('button').first().focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog', { name: runBoardContentName(0), exact: true })
        await expect(dialog).toBeVisible()
        await verifyReadableText(dialog.getByRole('heading'), runBoardContentName(0), width < 400)
        await verifyReadableText(
          dialog.getByText(labels.detailWorkspace(runBoardContentWorkspace), { exact: true }),
          labels.detailWorkspace(runBoardContentWorkspace),
          width < 400,
        )
        await verifyReadableText(
          dialog.getByText(labels.cardLabel(runBoardContentStep(0), labels.statusLabel('pending')), { exact: true }),
          labels.cardLabel(runBoardContentStep(0), labels.statusLabel('pending')),
          true,
        )
        await dialog.getByRole('button', { name: labels.closeDetails, exact: true }).click()
        await expect(dialog).toHaveCount(0)
        expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    for (const count of [0, 1, 7, 100, 101, 400, 401]) {
      const root = await mount({ locale, mode: 'light', count, suffix: '' })
      await expect.poll(() => page.evaluate(() => window.runBoardContentState().board.status)).toBe('ready')
      while (await page.evaluate(() => window.runBoardContentState().board.nextCursor !== null))
        await page.evaluate(() => window.loadMoreRunBoardContent())
      await expect(root.locator('.lumen-kanban-card')).toHaveCount(Math.min(count, 400))
      await expect(
        root.getByRole('status').filter({ hasText: labels.capacityReached(Math.min(count, 400)) }),
      ).toHaveCount(count >= 400 ? 1 : 0)
      if (count >= 100) {
        const pane = page.locator('.owned-board-pane')
        const last = root.locator('.lumen-kanban-card').last()
        await last.scrollIntoViewIfNeeded()
        await expect(last).toBeInViewport()
        expect(await pane.evaluate((node) => node.scrollHeight > node.clientHeight && node.scrollTop > 0)).toBe(true)
      }
      if (count === 0)
        await expect(root.locator(':scope > [data-text-context="empty.description"]')).toHaveText(labels.empty)
      scenarios++
    }
    for (const steps of [0, 1, 100]) {
      const root = await mount({ locale, mode: 'light', count: 1, suffix: '', steps })
      await expect.poll(() => page.evaluate(() => window.runBoardContentState().board.status)).toBe('ready')
      await root.getByRole('button', { name: labels.openRun(runBoardContentName(0)), exact: true }).click()
      const dialog = page.getByRole('dialog', { name: runBoardContentName(0), exact: true })
      await expect(dialog.getByRole('listitem')).toHaveCount(steps)
      if (steps > 0)
        await verifyReadableText(
          dialog.getByRole('listitem').last().locator('[data-text-context="collection.detail"]'),
          labels.cardLabel(runBoardContentStep(steps - 1), labels.statusLabel('pending')),
          true,
        )
      scenarios++
    }
    {
      const root = await mount({
        locale,
        mode: 'light',
        count: 1,
        suffix: '',
        longId: true,
        longWorkspace: true,
        stepLength: 4000,
      })
      await expect.poll(() => page.evaluate(() => window.runBoardContentState().board.status)).toBe('ready')
      const id = await page.evaluate(() => window.runBoardContentState().board.items[0]?.run.id)
      if (!id) throw new Error('Missing authored bounded run ID')
      const reader = root.getByRole('region', { name: id, exact: true })
      await reader.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
      const card = root.locator('.lumen-kanban-card')
      await verifyReadableText(
        card.getByText(runBoardContentWorkspace.padEnd(4000, '原'), { exact: true }),
        runBoardContentWorkspace.padEnd(4000, '原'),
        true,
      )
      await card.getByRole('button', { name: labels.openRun(runBoardContentName(0)), exact: true }).click()
      const dialog = page.getByRole('dialog', { name: runBoardContentName(0), exact: true })
      await verifyReadableText(
        dialog.getByRole('listitem').locator('[data-text-context="collection.detail"]'),
        labels.cardLabel(runBoardContentStep(0).padEnd(4000, '原').slice(0, 4000), labels.statusLabel('pending')),
        true,
      )
      scenarios++
    }
    for (const invalid of [
      { duplicate: true, count: 2 },
      { foreign: true, count: 1 },
      { oversizedPage: true, count: 101 },
      { steps: 101, count: 1 },
    ]) {
      const root = await mount({ locale, mode: 'light', suffix: '', ...invalid })
      await expect(root.getByRole('alert')).toContainText('INVALID_OUTPUT')
      await expect(root.locator('.lumen-kanban-card')).toHaveCount(0)
      scenarios++
    }
    const root = await mount({ locale, mode: 'light', count: 2, suffix: '' })
    await expect.poll(() => page.evaluate(() => window.runBoardContentState().board.status)).toBe('ready')
    const original = root.locator('.lumen-kanban-card').filter({ hasText: 'original-run-0' })
    await original.getByRole('button').first().click()
    const dialog = page.getByRole('dialog', { name: runBoardContentName(0), exact: true })
    await page.evaluate(() => window.reorderRunBoardContent())
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: labels.closeDetails, exact: true }).click()
    await original.getByRole('button', { name: labels.cancelRun(runBoardContentName(0)), exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(root.getByRole('alert')).toHaveText(labels.operationFailed)
    expect(
      await page.evaluate(() => window.runBoardContentState().calls.filter((call) => call.name === 'operation.cancel')),
    ).toEqual([{ name: 'operation.cancel', input: { operationId: 'original-run-0' } }])
    await original.getByRole('button').first().click()
    await page.evaluate(() => window.reorderRunBoardContent(true))
    await expect(dialog).toHaveCount(0)
    scenarios++
    const failure = await mount({ locale, mode: 'light', count: 1, suffix: '', failure: true })
    await expect(failure.getByRole('alert')).toContainText('READ_FAILED')
    await page.evaluate(() => window.repairRunBoardContent())
    await page.evaluate(() => window.refreshRunBoardContent())
    await expect(failure.getByRole('alert')).toHaveCount(0)
    await expect(failure.locator('.lumen-kanban-card')).toHaveCount(1)
    scenarios++
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'result.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`Run board content: ${scenarios} Chrome scenarios passed`)
} catch (error) {
  console.error('Current owned run board scenario', current)
  await page.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeRunBoardContent?.())
  await browser.close()
}
