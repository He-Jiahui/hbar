import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { FileChangesContentInput } from '../tests/fixtures/file-changes-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/file-changes-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/file-changes-content-browser.tsx'),
      name: 'FileChangesContent',
      formats: ['iife'],
      fileName: 'file-changes-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/file-changes-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/file-changes-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
const path = (index: number) => `原始目录/${'Complete original directory 完整原始目录/'.repeat(10)}original-${index}.ts`
let scenarios = 0
let current: unknown
const mount = async (input: FileChangesContentInput, width = 320) => {
  current = { ...input, width }
  await page.setViewportSize({ width, height: 900 })
  await page.mouse.move(0, 0)
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#file-changes-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}.file-changes-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="file-changes-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountFileChangesContent(value), input)
  const root = page.locator(input.view === 'changes' ? '.hbar-file-changes' : '.hbar-file-diff')
  await expect(root).toBeVisible()
  return root
}
const horizontal = async (owner: Locator, overflow = true) => {
  await owner.scrollIntoViewIfNeeded()
  const geometry = await owner.evaluate((node) => ({
    width: node.clientWidth,
    content: node.scrollWidth,
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
    viewport: innerWidth,
  }))
  expect(geometry.width).toBeGreaterThan(0)
  expect(geometry.left).toBeGreaterThanOrEqual(-1)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1)
  if (overflow) {
    expect(geometry.content).toBeGreaterThan(geometry.width)
    await owner.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => owner.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
  }
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = getShellCopy(locale).files
    const suffix = ' 完整说明 Complete host copy '.repeat(3)
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount({ locale, mode, suffix, count: 1, view: 'changes', state: 'ready' }, width)
        const list = root.getByRole('list')
        await expect(list.getByRole('listitem')).toHaveCount(1)
        await expect(list.locator('[data-text-context="resource.path"]')).toHaveText(path(0))
        await expect(list.locator('[data-text-context="choice.description"]')).toHaveText(
          base.changes.renamedFrom('Original rename source 原始重命名路径/0.ts'),
        )
        await horizontal(list)
        await list.getByRole('button', { name: base.changes.open(path(0)), exact: true }).click()
        expect((await page.evaluate(() => window.fileChangesContentState())).calls).toContainEqual({
          action: 'open-change',
          path: path(0),
        })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-changes.png`) })
        scenarios++
        const diff = await mount({ locale, mode, suffix, count: 5, view: 'diff', state: 'ready' }, width)
        await verifyReadableText(
          diff.locator('.hbar-file-diff-caption'),
          base.changes.readOnlyDiff + suffix,
          width < 400,
        )
        await expect(diff.locator('.hbar-file-diff-path')).toHaveText(path(0))
        await horizontal(diff.locator('.hbar-file-diff-path-reading'))
        await horizontal(diff.locator('.hbar-file-diff-toolbar > .hbar-file-diff-actions-reading'), width < 400)
        const content = diff.locator('.hbar-file-diff-content')
        await horizontal(content)
        const state = await page.evaluate(() => window.fileChangesContentState())
        expect(await diff.locator('[data-diff-code]').allTextContents()).toEqual(state.source.split('\n'))
        expect(await diff.locator('[data-diff-code="1"]').evaluate((node) => getComputedStyle(node).whiteSpace)).toBe(
          'pre',
        )
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-diff.png`) })
        scenarios++
      }
    }
    for (const count of [0, 1, 100, 101, 5000]) {
      const root = await mount({ locale, mode: 'light', suffix: '', count, view: 'changes', state: 'ready' })
      await expect(root.getByRole('listitem')).toHaveCount(Math.min(count, 100))
      if (count > 100) {
        await horizontal(root.locator('.hbar-file-changes-pagination'), false)
        await root.getByRole('button', { name: base.changes.next, exact: true }).click()
        await expect(root.getByRole('listitem')).toHaveCount(Math.min(count - 100, 100))
        await expect(root.getByRole('listitem').first().getByRole('button')).toHaveAttribute(
          'aria-label',
          base.changes.open(path(100)),
        )
        await root.getByRole('button', { name: base.changes.previous, exact: true }).click()
      }
      if (count === 5000) {
        await verifyReadableText(root.locator('[data-text-context="feedback.paragraph"]'), base.changes.limit)
        expect(await page.evaluate(() => window.fileChangesContentBounds())).toEqual({
          list5000: true,
          list5001: false,
          path4000: true,
          path4001: false,
          diff512000: true,
          diff512001: false,
          filtered5000: true,
        })
      }
      scenarios++
    }
    for (const count of [0, 1, 400, 401, 1200]) {
      const root = await mount({ locale, mode: 'dark', suffix: '', count, view: 'diff', state: 'ready' })
      await expect(root.locator('[data-diff-code]')).toHaveCount(Math.min(count, 400))
      if (count > 400) {
        await root.getByRole('button', { name: base.changes.nextLines, exact: true }).click()
        await expect(root.locator('[data-diff-code]').first()).toHaveAttribute('data-diff-code', '400')
        await expect(root.locator('[data-diff-code]')).toHaveCount(Math.min(count - 400, 400))
        const copy = locale === 'zh-CN' ? '复制完整原始差异' : 'Copy complete original diff'
        await root.getByRole('button', { name: copy, exact: true }).click()
        const state = await page.evaluate(() => window.fileChangesContentState())
        expect(state.calls).toContainEqual({ action: 'copy', source: state.source })
        await root.getByRole('button', { name: base.changes.previousLines, exact: true }).click()
      }
      if (count === 0)
        await verifyReadableText(root.locator('[data-text-context="empty.description"]'), base.changes.noDiff)
      scenarios++
    }
    for (const state of ['loading', 'error', 'offline', 'non-repository', 'filtered-empty'] as const) {
      const root = await mount({
        locale,
        mode: 'light',
        suffix,
        count: state === 'non-repository' ? 0 : 1,
        view: 'changes',
        state,
      })
      if (state === 'loading' || state === 'error')
        await verifyReadableText(
          root.locator('[data-text-context="feedback.paragraph"]'),
          (state === 'loading' ? base.changes.loading : base.changes.error('EXECUTION_FAILED')) + suffix,
          true,
        )
      else if (state === 'non-repository' || state === 'filtered-empty')
        await verifyReadableText(
          root.locator('[data-text-context="empty.description"]'),
          (state === 'non-repository' ? base.changes.notRepository : base.changes.noMatches) + suffix,
          true,
        )
      if (state === 'offline' || state === 'loading' || state === 'error')
        await expect(root.getByRole('listitem').getByRole('button')).toBeDisabled()
      scenarios++
    }
    for (const state of ['loading', 'error', 'offline', 'truncated', 'add-success', 'add-error'] as const) {
      const root = await mount({ locale, mode: 'dark', suffix, count: 5, view: 'diff', state })
      const feedback =
        state === 'loading'
          ? root.getByRole('status').filter({ hasText: base.changes.loading })
          : state === 'error'
            ? root.getByRole('alert')
            : state === 'truncated'
              ? root.getByRole('status').filter({ hasText: base.changes.truncated })
              : root.locator('.hbar-file-add-feedback')
      if (state !== 'offline') {
        const text =
          state === 'loading'
            ? base.changes.loading
            : state === 'error' || state === 'add-error'
              ? base.changes.error('EXECUTION_FAILED')
              : state === 'truncated'
                ? base.changes.truncated
                : locale === 'zh-CN'
                  ? '添加原始差异到聊天'
                  : 'Add original diff to chat'
        await verifyReadableText(feedback, text + suffix, true)
      } else
        await expect(root.getByRole('button', { name: base.changes.openFile + suffix, exact: true })).toBeDisabled()
      scenarios++
    }
    const root = await mount({ locale, mode: 'light', suffix: '', count: 3, view: 'changes', state: 'ready' })
    await page.evaluate(() => window.reverseFileChangesContent())
    await root.getByRole('button', { name: base.changes.open(path(0)), exact: true }).click()
    expect((await page.evaluate(() => window.fileChangesContentState())).calls).toContainEqual({
      action: 'open-change',
      path: path(0),
    })
    await root.getByRole('textbox').fill('q'.repeat(4001))
    await expect(root.getByRole('textbox')).toHaveValue('q'.repeat(4000))
    scenarios++
    const diff = await mount({ locale, mode: 'dark', suffix: '', count: 5, view: 'diff', state: 'ready' })
    await diff.getByRole('button', { name: base.changes.staged, exact: true }).click()
    await expect(diff.getByRole('button', { name: base.changes.staged, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await diff.getByRole('button', { name: base.changes.workingTree, exact: true }).click()
    await diff.locator('.hbar-file-line-control').first().click()
    await diff.getByRole('textbox', { name: base.context.note, exact: true }).fill('Original note 原始行评论')
    await page.keyboard.press('Control+Enter')
    const state = await page.evaluate(() => window.fileChangesContentState())
    expect(state.calls).toContainEqual({ action: 'open-diff', path: path(0), cached: true })
    expect(state.calls).toContainEqual({ action: 'open-diff', path: path(0), cached: false })
    expect(state.calls.find((call) => call.action === 'comment')?.selection).toEqual({
      kind: 'diff-comment',
      cached: false,
      expectedText: state.source,
      rowStart: 1,
      rowEnd: 1,
      diffSide: 'new',
      note: 'Original note 原始行评论',
    })
    scenarios++
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual file changes Chrome scenarios passed.`)
} catch (error) {
  console.error('Failed owned file changes case', current)
  throw error
} finally {
  await browser.close()
}
