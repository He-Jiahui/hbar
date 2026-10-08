import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { CommandPaletteContentInput } from '../tests/fixtures/command-palette-content-browser'
import {
  commandContentTitle,
  commandContentDescription,
  commandContentSession,
} from '../tests/fixtures/command-palette-content-data'
import { verifyReadableText } from './support/verify-readable-text'
import { selectLumenOption } from '../e2e/support/lumen-controls'

const output = resolve('artifacts/desktop-elements/command-palette-content')
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
      entry: resolve('tests/fixtures/command-palette-content-browser.tsx'),
      name: 'CommandPaletteContent',
      formats: ['iife'],
      fileName: 'command-palette-content',
    },
  },
})
const css = await Bun.file(resolve(output, 'bundle/command-palette-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/command-palette-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
page.setDefaultTimeout(10000)
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/command-palette-content', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/command-palette-content')
const suffix = ' 完整命令标题 Complete command heading'.repeat(3)
let current: (CommandPaletteContentInput & { readonly width: number }) | undefined
let scenarios = 0
const mount = async (input: CommandPaletteContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeCommandPaletteContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;overflow:hidden;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#command-palette-content-fixture,.owned-command-pane{display:flex;inline-size:100%;block-size:100dvh;min-inline-size:0;min-block-size:0}.hbar-app-react-command-palette{flex:1}</style><div id="command-palette-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountCommandPaletteContent(value), input)
  const root = page.locator('.hbar-app-react-command-palette')
  await expect(root).toBeVisible()
  if (!input.view || input.view === 'search') await root.getByRole('searchbox').fill('owned.command')
  if (input.failure !== 'loading')
    await expect.poll(() => page.evaluate(() => window.commandPaletteContentState().palette.status)).not.toBe('loading')
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
    const labels = getShellCopy(locale).commandPalette
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320])
        for (const view of ['search', 'parameters', 'result'] as const) {
          const root = await mount({ locale, mode, count: 1, suffix, view }, width)
          const heading =
            view === 'search'
              ? labels.title + suffix
              : view === 'parameters'
                ? commandContentTitle(0)
                : labels.result + suffix
          await verifyReadableText(root.getByRole('heading', { name: heading, exact: true }), heading, width < 400)
          if (view === 'search') {
            await verifyReadableText(
              root.locator('.lumen-command-option [data-text-context="choice.title"]'),
              commandContentTitle(0),
              width < 400,
            )
            await verifyReadableText(
              root.locator('.lumen-command-option [data-text-context="choice.description"]'),
              commandContentDescription,
              width < 400,
            )
          } else if (view === 'parameters') {
            await verifyReadableText(
              root.locator('#hbar-command-sessionId [data-text-context="choice.title"]'),
              labels.sessionOption(commandContentSession, 'Original workspace'),
              width < 400,
            )
            if (width < 400) {
              await read(root.getByRole('region', { name: labels.parameters + suffix, exact: true }))
              await read(root.locator('footer.hbar-command-reader'))
            }
            await expect(root.locator('#hbar-command-caption')).toHaveValue('原始未保存参数 Original parameter draft')
          } else {
            await verifyReadableText(
              root.locator('[data-text-context="feedback.title"]'),
              labels.succeeded + suffix,
              width < 400,
            )
            await verifyReadableText(
              root.locator('.hbar-app-react-command-result-summary [data-text-context="feedback.paragraph"]'),
              labels.resultSummary(commandContentTitle(0)),
              width < 400,
            )
            const disclosure = root.getByRole('button', { name: labels.technicalDetails + suffix, exact: true })
            await disclosure.scrollIntoViewIfNeeded()
            await disclosure.click()
            await expect(root.getByRole('region', { name: labels.technicalDetails + suffix, exact: true })).toHaveText(
              JSON.stringify('完整原命令结果 Complete original result '.repeat(1000).slice(0, 80)),
            )
            if (width < 400) await read(root.locator('footer.hbar-command-reader'))
          }
          expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-${view}.png`) })
          scenarios++
        }
    for (const count of [0, 1, 7, 40, 41, 200, 201, 1000, 1001]) {
      const root = await mount({ locale, mode: 'light', count, suffix: '' })
      const state = await page.evaluate(() => window.commandPaletteContentState().palette)
      const expected = state.visibleIds.length
      if (count <= 40) await expect(root.getByRole('option')).toHaveCount(count)
      else {
        expect(expected).toBeGreaterThan(0)
        expect(expected).toBeLessThanOrEqual(1000)
        await expect(root.locator('.lumen-command-list')).toHaveAttribute('data-list-strategy', 'virtual')
        expect(await root.getByRole('option').count()).toBeLessThan(expected)
        const last = state.visibleIds.at(-1)
        if (!last) throw new Error('Missing original last command')
        await root.getByRole('searchbox').fill(last)
        await expect(root.getByRole('option')).toHaveCount(1)
        await expect(root.getByRole('option')).toContainText(
          commandContentTitle(Number(last.replace('owned.command', ''))),
        )
      }
      if (count === 0) await expect(root.getByText(labels.empty, { exact: true })).toBeVisible()
      if (state.truncated) await expect(root.getByText(labels.truncated, { exact: true })).toBeVisible()
      scenarios++
    }
    for (const failure of ['read', 'loading', 'write', 'unknown'] as const) {
      const root = await mount({
        locale,
        mode: 'light',
        count: 1,
        suffix: '',
        failure,
        view: failure === 'write' || failure === 'unknown' ? 'result' : 'search',
      })
      if (failure === 'read') await expect(root.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
      else if (failure === 'loading')
        await expect.poll(() => page.evaluate(() => window.commandPaletteContentState().palette.status)).toBe('loading')
      else
        await expect(root.getByRole('alert')).toContainText(
          labels.error(failure === 'write' ? 'WRITE_FAILED' : 'RESULT_UNKNOWN'),
        )
      await page.evaluate(() => window.repairCommandPaletteContent())
      if (failure === 'read') await page.evaluate(() => window.refreshCommandPaletteContent())
      if (failure === 'write' || failure === 'unknown') {
        await root.getByRole('button', { name: labels.backToParameters, exact: true }).click()
        await expect(root.locator('#hbar-command-caption')).toHaveValue('原始未保存参数 Original parameter draft')
        if (failure === 'unknown') {
          await expect(root.getByRole('button', { name: labels.execute, exact: true })).toBeDisabled()
          expect((await page.evaluate(() => window.commandPaletteContentState().writes)).length).toBe(1)
        } else {
          await root.getByRole('button', { name: labels.execute, exact: true }).click()
          await expect(root.getByRole('status')).toContainText(labels.succeeded)
        }
      } else
        await expect.poll(() => page.evaluate(() => window.commandPaletteContentState().palette.status)).toBe('ready')
      scenarios++
    }
    {
      const root = await mount({ locale, mode: 'dark', count: 2, suffix: '' })
      await root.getByRole('searchbox').focus()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(root.getByRole('heading', { name: commandContentTitle(1), exact: true })).toBeVisible()
      await root.locator('#hbar-command-caption').fill('原命令参数')
      await selectLumenOption(root.locator('#hbar-command-enabled'), 'false')
      await selectLumenOption(root.locator('#hbar-command-sessionId'), 'original-session')
      await root.getByRole('button', { name: labels.execute, exact: true }).click()
      const writes = await page.evaluate(() => window.commandPaletteContentState().writes)
      expect(writes.at(-1)).toEqual({
        id: 'owned.command0001',
        input: { caption: '原命令参数', enabled: false, sessionId: 'original-session' },
      })
      scenarios++
    }
    {
      const root = await mount({ locale, mode: 'light', count: 2, suffix: '' })
      await page.evaluate(() => window.refreshCommandPaletteContent(true))
      await expect(root.getByText(labels.unavailable, { exact: true })).toBeVisible()
      await expect(root.getByRole('option')).toHaveCount(1)
      await root.getByRole('searchbox').fill('x'.repeat(256))
      await root.getByRole('searchbox').press('End')
      await root.getByRole('searchbox').press('x')
      expect((await page.evaluate(() => window.commandPaletteContentState().palette.query)).length).toBe(256)
      scenarios++
    }
    for (const resultLength of [0, 1, 16384, 16385]) {
      const root = await mount({ locale, mode: 'dark', count: 1, suffix: '', view: 'result', resultLength })
      await root.getByRole('button', { name: labels.technicalDetails, exact: true }).click()
      const result = root.getByRole('region', { name: labels.technicalDetails, exact: true })
      const serialized = JSON.stringify('完整原命令结果 Complete original result '.repeat(1000).slice(0, resultLength))
      expect(await result.textContent()).toBe(serialized.length > 16384 ? serialized.slice(0, 16384) + '…' : serialized)
      if (resultLength > 100) {
        await result.focus()
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => result.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
      }
      scenarios++
    }
    {
      const root = await mount({ locale, mode: 'light', count: 1, suffix, view: 'parameters', noParameters: true })
      await verifyReadableText(
        root.getByText(labels.noParameters + suffix, { exact: true }),
        labels.noParameters + suffix,
        true,
      )
      scenarios++
    }
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'result.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`Command palette content: ${scenarios} Chrome scenarios passed`)
} catch (error) {
  console.error('Current owned command scenario', current)
  console.error(
    await page
      .locator('#hbar-command-sessionId')
      .evaluate((node) => {
        const parents = []
        for (let current: Element | null = node; current && parents.length < 9; current = current.parentElement) {
          const css = getComputedStyle(current)
          const bounds = current.getBoundingClientRect()
          parents.push({
            tag: current.tagName,
            className: current.className,
            width: bounds.width,
            minWidth: css.minInlineSize,
            maxWidth: css.maxInlineSize,
            flex: css.flex,
            overflowX: css.overflowX,
          })
        }
        return parents
      })
      .catch(() => null),
  )
  await page.screenshot({ path: resolve(output, 'failure.png') })
  throw error
} finally {
  await page.evaluate(() => window.disposeCommandPaletteContent?.())
  await browser.close()
}
