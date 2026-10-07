import { mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { FileWorkspaceContentInput } from '../tests/fixtures/file-workspace-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/file-workspace-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/file-workspace-content-browser.tsx'),
      name: 'FileWorkspaceContent',
      formats: ['iife'],
      fileName: 'file-workspace-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/file-workspace-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/file-workspace-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
await page.route('http://localhost/file-workspace-content', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
)
await page.goto('http://localhost/file-workspace-content')
const path = '完整原始文件 Complete original source document '.repeat(3).trim() + '.md'
const source = '# Original source 原始内容'
const suffix = ' 完整本地说明 Complete host explanation '.repeat(4)
let scenarios = 0
let current: unknown
const mount = async (input: FileWorkspaceContentInput, width: number) => {
  current = { ...input, width }
  await page.evaluate(() => window.disposeFileWorkspaceContent?.())
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#file-workspace-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.file-workspace-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="file-workspace-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountFileWorkspaceContent(value), input)
  const root = page.locator('.hbar-app-react-file-workspace')
  await expect(root).toBeVisible()
  return root
}
const readActions = async (reader: Locator) => {
  await reader.scrollIntoViewIfNeeded()
  await reader.focus()
  expect(await reader.evaluate((node) => node.scrollWidth > node.clientWidth && node.clientWidth > 0)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).files
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        const input = { locale, mode, path, source, sha256: createHash('sha256').update(source).digest('hex'), suffix }
        const root = await mount({ ...input, state: 'dirty' }, width)
        await verifyReadableText(root.locator('.lumen-file-document-title > :first-child'), path, width < 400)
        await expect(root.getByRole('textbox', { name: path, exact: true })).toHaveValue(
          'Original preserved draft 原始草稿',
        )
        await expect(root.locator('[data-text-context="control.status"]')).toHaveText(labels.dirty + suffix)
        if (width < 400) await readActions(root.getByRole('group', { name: labels.edit, exact: true }))
        await root.getByRole('button', { name: labels.reload, exact: true }).click()
        const dialog = page.getByRole('dialog')
        await verifyReadableText(
          dialog.locator('[data-text-context="dialog.title"]'),
          labels.reloadTitle(path) + suffix,
          true,
        )
        await verifyReadableText(
          dialog.locator('[data-text-context="dialog.body"]'),
          labels.reloadDescription + suffix,
          width < 400,
        )
        const target = dialog.getByRole('group', { name: path, exact: true })
        await expect(target.locator('[data-text-context="resource.path"]')).toHaveText(path)
        if (width < 400) await readActions(target)
        await dialog.getByRole('contentinfo').getByRole('button', { name: labels.keepDraft, exact: true }).click()
        await expect(dialog).toBeHidden()
        await expect(root.getByRole('textbox', { name: path, exact: true })).toHaveValue(
          'Original preserved draft 原始草稿',
        )
        await root.getByRole('button', { name: labels.reload, exact: true }).click()
        await page.getByRole('dialog').getByRole('button', { name: labels.discardAndReload, exact: true }).click()
        await expect.poll(() => page.evaluate(() => window.fileWorkspaceContentState().reads)).toBe(2)
        await expect(root.getByRole('textbox', { name: path, exact: true })).toHaveValue(source)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-reload.png`) })
        scenarios++
      }
    }
    for (const width of [1440, 320]) {
      const reading = Array.from({ length: 220 }, (_, index) => `Original line ${index + 1} 原始正文`).join('\n')
      const root = await mount(
        {
          locale,
          mode: 'light',
          state: 'reading',
          path,
          source: reading,
          sha256: createHash('sha256').update(reading).digest('hex'),
          suffix,
        },
        width,
      )
      await root.getByRole('button', { name: labels.source, exact: true }).click()
      await expect(root.locator('[data-source-code]')).toHaveText(reading.split('\n'))
      await root.getByRole('button', { name: labels.edit, exact: true }).click()
      await expect(root.getByRole('textbox', { name: path, exact: true })).toHaveValue(reading)
      scenarios++
    }
    for (const state of ['failed', 'unknown', 'oversize', 'action-error'] as const) {
      const root = await mount(
        {
          locale,
          mode: 'dark',
          state,
          path,
          source,
          sha256: createHash('sha256').update(source).digest('hex'),
          suffix,
        },
        320,
      )
      const feedback = root.locator('[data-text-context="feedback.paragraph"]')
      if (state === 'oversize')
        await verifyReadableText(
          feedback.filter({ hasText: labels.markdownTooLarge }),
          labels.markdownTooLarge + suffix,
          true,
        )
      if (state === 'action-error') await verifyReadableText(feedback.filter({ hasText: suffix }).first(), suffix, true)
      if (state === 'unknown') {
        await verifyReadableText(
          root.getByRole('alert').filter({ hasText: labels.error('CONNECTION_CLOSED') }),
          labels.error('CONNECTION_CLOSED') + suffix,
          true,
        )
        await expect(root.getByRole('button', { name: labels.reconcile, exact: true })).toBeVisible()
        await expect(root.getByRole('button', { name: labels.save, exact: true })).toHaveCount(0)
      }
      if (state === 'failed' || state === 'unknown') {
        expect((await page.evaluate(() => window.fileWorkspaceContentState())).writes).toEqual([
          { workspaceId: 'original-workspace', path, text: 'Original preserved draft 原始草稿' },
        ])
        await expect(root.getByRole('textbox', { name: path, exact: true })).toHaveValue(
          'Original preserved draft 原始草稿',
        )
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: resolve(output, `${locale}-${state}-320.png`) })
      scenarios++
    }
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual file workspace Chrome scenarios passed.`)
} catch (error) {
  console.error('Failed owned file workspace case', current)
  throw error
} finally {
  await page.evaluate(() => window.disposeFileWorkspaceContent?.()).catch(() => {})
  await browser.close()
}
