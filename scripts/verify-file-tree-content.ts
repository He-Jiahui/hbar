import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { FileTreeContentInput } from '../tests/fixtures/file-tree-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/file-tree-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/file-tree-content-browser.tsx'),
      name: 'FileTreeContent',
      formats: ['iife'],
      fileName: 'file-tree-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/file-tree-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/file-tree-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
const title = (index: number) => `原始条目 ${index} Complete original file name `.repeat(3).trim() + '.md'
const folderName = '原始目录 Complete original directory name '.repeat(3).trim()
let scenarios = 0
let current: unknown
const mount = async (input: FileTreeContentInput, width = 320) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeFileTreeContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#file-tree-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.file-tree-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="file-tree-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountFileTreeContent(value), input)
  const root = page.locator('.hbar-file-tree')
  await expect(root).toBeVisible()
  if (input.view === 'search' && input.state !== 'search-error')
    await expect.poll(() => page.evaluate(() => window.fileTreeContentState().entry?.tree.search.status)).toBe('ready')
  return root
}
const readActions = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  const size = await reader.evaluate((node) => ({ width: node.clientWidth, content: node.scrollWidth }))
  expect(size.width).toBeGreaterThan(0)
  expect(size.content).toBeGreaterThan(size.width)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = getShellCopy(locale).files.tree
    const suffix = ' 完整说明 Complete host copy '.repeat(3)
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        for (const view of ['root', 'search'] as const) {
          const root = await mount({ locale, mode, suffix, view, count: 1, state: 'ready' }, width)
          await verifyReadableText(root.locator('[data-text-context="collection.title"]'), title(0), width < 400)
          await verifyReadableText(
            root.locator('.hbar-file-tree-scope'),
            (view === 'search' ? base.searchScope : base.filterScope) + suffix,
            width < 400,
          )
          if (view === 'search')
            await verifyReadableText(root.locator('[data-text-context="collection.detail"]'), folderName, width < 400)
          await root.locator('.hbar-file-tree-row').click()
          expect((await page.evaluate(() => window.fileTreeContentState())).calls).toEqual([
            { action: 'open-file', path: view === 'search' ? `${folderName}/${title(0)}` : title(0) },
          ])
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          expect(await root.locator('.hbar-file-tree-scroll').evaluate((node) => node.clientHeight)).toBeGreaterThan(0)
          await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-${view}.png`) })
          scenarios++
        }
      }
    }
    for (const view of ['root', 'folder'] as const) {
      for (const count of [0, 1, 200, 201, 500, 501]) {
        const root = await mount({ locale, mode: 'light', suffix: '', view, count, state: 'ready' })
        const area =
          view === 'folder' ? root.locator('.hbar-file-tree-children') : root.locator('.hbar-file-tree-scroll')
        await expect(area.locator('.hbar-file-tree-row')).toHaveCount(Math.min(count, 200))
        for (let loaded = 200; loaded < Math.min(count, 500); loaded += 200) {
          await area.getByRole('button', { name: base.loadMore, exact: true }).click()
          await expect(area.locator('.hbar-file-tree-row')).toHaveCount(Math.min(count, loaded + 200, 500))
        }
        if (count > 500)
          await expect(root.getByRole('status')).toContainText(view === 'folder' ? base.folderLimit : base.rootLimit)
        if (count) {
          const row = area.locator('.hbar-file-tree-row').last()
          await row.scrollIntoViewIfNeeded()
          await row.click()
          expect((await page.evaluate(() => window.fileTreeContentState())).calls.at(-1)?.action).toBe('open-file')
        }
        scenarios++
      }
    }
    for (const count of [0, 1, 100, 101]) {
      const root = await mount({
        locale,
        mode: 'dark',
        suffix: '',
        view: 'search',
        count,
        state: count === 0 ? 'search-empty' : 'ready',
      })
      await expect(root.locator('.hbar-file-search-row')).toHaveCount(Math.min(count, 100))
      if (count > 100) await expect(root.getByRole('status')).toContainText(base.searchLimit)
      scenarios++
    }
    for (const state of ['loading', 'error', 'offline', 'search-error', 'folder-error'] as const) {
      const view = state === 'search-error' ? 'search' : state === 'folder-error' ? 'folder' : 'root'
      const root = await mount({ locale, mode: 'light', suffix, view, count: 1, state })
      if (state === 'offline') await expect(root.locator('.hbar-file-tree-row')).toBeDisabled()
      else if (state === 'loading') await verifyReadableText(root.getByRole('status'), base.loading + suffix, true)
      else {
        await verifyReadableText(
          root.getByRole('alert'),
          (state === 'search-error' ? base.searchError('EXECUTION_FAILED') : base.error('EXECUTION_FAILED')) + suffix,
          true,
        )
        await page.evaluate(() => window.repairFileTreeContent())
        const reader = root.locator('.hbar-file-tree-actions-reading')
        await readActions(reader)
        await reader.getByRole('button').click()
        await expect(root.getByRole('alert')).toHaveCount(0)
      }
      scenarios++
    }
    const root = await mount({ locale, mode: 'dark', suffix: '', view: 'search', count: 3, state: 'ready' })
    const input = root.getByRole('textbox')
    await input.focus()
    await input.press('ArrowDown')
    await expect(root.locator('.hbar-file-search-row').first()).toBeFocused()
    await page.keyboard.press('End')
    await expect(root.locator('.hbar-file-search-row').last()).toBeFocused()
    await page.keyboard.press('Enter')
    expect((await page.evaluate(() => window.fileTreeContentState())).calls.at(-1)).toEqual({
      action: 'open-file',
      path: `${folderName}/${title(2)}`,
    })
    await page.evaluate(() => window.shrinkFileTreeContent())
    await expect(input).toBeFocused()
    await expect(root.locator('.hbar-file-search-row')).toHaveCount(1)
    await input.fill('q'.repeat(161))
    await expect(input).toHaveValue('q'.repeat(160))
    await input.press('Escape')
    await expect(input).toHaveValue('')
    await expect(input).toBeFocused()
    scenarios++
    const breadcrumb = await mount({ locale, mode: 'light', suffix, view: 'breadcrumb', count: 1, state: 'ready' })
    await readActions(breadcrumb.getByRole('navigation', { name: base.navigation, exact: true }))
    await breadcrumb.getByRole('button', { name: base.root + suffix, exact: true }).click()
    await expect(breadcrumb.getByRole('navigation')).toHaveCount(0)
    expect((await page.evaluate(() => window.fileTreeContentState())).calls.at(-1)).toEqual({
      action: 'open-folder',
      path: '.',
    })
    scenarios++
    const deep = await mount({ locale, mode: 'dark', suffix: '', view: 'deep', count: 1, state: 'ready' })
    const target = Array.from({ length: 7 }, (_, index) => title(index)).join('/')
    const drill = deep.getByRole('button', { name: base.openFolder(target), exact: true })
    await verifyReadableText(drill.locator('[data-text-context="collection.title"]'), title(6), true)
    await drill.click()
    expect((await page.evaluate(() => window.fileTreeContentState())).calls.at(-1)).toEqual({
      action: 'open-folder',
      path: target,
    })
    scenarios++
  }
  expect(errors).toEqual([])
  await page.evaluate(() => window.disposeFileTreeContent?.())
  console.log(`${scenarios} actual file tree Chrome scenarios passed.`)
} catch (error) {
  console.error('Failed owned file tree case', current)
  throw error
} finally {
  await browser.close()
}
