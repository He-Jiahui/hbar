import { expect, test, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { FileContextContentInput } from '../tests/fixtures/file-context-content-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/file-context-content/controlled')
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
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/file-context-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned file context preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/file-context-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
async function selectSource(page: Page) {
  const preview = page.locator('.hbar-file-source-surface')
  await preview.evaluate((element) => {
    const start = element.querySelector('[data-source-code="0"]')?.firstChild
    const end = element.querySelector('[data-source-code="1"]')?.firstChild
    if (!start || !end) throw new Error('Missing original source range')
    const range = document.createRange()
    range.setStart(start, 2)
    range.setEnd(end, 4)
    const selection = document.getSelection()
    if (!selection) throw new Error('Missing source selection')
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await preview.dispatchEvent('mouseup', { button: 0 })
}
for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`semantic comment title and bounded draft recovery ${locale}`, async ({ browser }, info) => {
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy(locale).files.context
    try {
      await page.goto(url)
      for (const mode of ['light', 'dark'] as const) {
        const input: FileContextContentInput = {
          locale,
          mode,
          sourceId: 'original.ts',
          value: '  alpha\n  beta\n',
          long: true,
        }
        await page.evaluate((input) => window.mountFileContextContent(input), input)
        const line = page.getByRole('button', { name: copy.commentLine(input.sourceId, 1), exact: true })
        await line.click()
        const comment = page.locator('.hbar-file-comment-editor')
        const note = comment.getByRole('textbox', { name: copy.note, exact: true })
        await note.fill('Original note — 原批注')
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          const title = comment.getByRole('heading', { name: copy.commentTitle.repeat(10), exact: true })
          expect(await title.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
          expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          for (const name of [copy.range(1, 1).repeat(16), copy.commentTitle.repeat(10)]) {
            const reader = comment.getByRole('group', { name, exact: true })
            await reader.focus()
            await expect(reader).toBeFocused()
            await reader.evaluate((node) => {
              node.scrollLeft = 0
            })
            if (await reader.evaluate((node) => node.scrollWidth > node.clientWidth)) {
              await reader.press('ArrowRight')
              await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            }
          }
          await expect(note).toHaveValue('Original note — 原批注')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320)
            await comment.screenshot({ path: info.outputPath(`comment-${locale}-${mode}-${width}.png`) })
        }
        await note.fill('n'.repeat(4001))
        await expect(note).toHaveValue('n'.repeat(4000))
        await note.press('Control+Enter')
        await expect(note).toBeDisabled()
        await note.press('Control+Enter')
        expect(await page.evaluate(() => window.fileContextContentTargets())).toEqual([
          {
            sourceId: input.sourceId,
            selection: {
              kind: 'source-comment',
              sha256: 'a'.repeat(64),
              startOffset: 0,
              endOffset: 7,
              note: 'n'.repeat(4000),
            },
          },
        ])
        await page.evaluate(() => window.resolveFileContextContent(false))
        await expect(note).toBeEnabled()
        await expect(note).toHaveValue('n'.repeat(4000))
        await note.fill('  Recovered original note — 恢复原批注  ')
        await note.press('Control+Enter')
        await page.evaluate(() => window.resolveFileContextContent(true))
        await expect(comment).toHaveCount(0)
        await expect(line).toBeFocused()
        expect((await page.evaluate(() => window.fileContextContentTargets())).at(-1)?.selection).toMatchObject({
          note: 'Recovered original note — 恢复原批注',
        })
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
  test(`shared selection surface preserves original offsets and scope ${locale}`, async ({ browser }, info) => {
    const context = await browser.newContext({ locale, viewport: { width: 320, height: 1000 } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const input: FileContextContentInput = {
      locale,
      mode: 'dark',
      sourceId: 'original.ts',
      value: '  alpha\n  beta\n',
      long: true,
    }
    try {
      await page.goto(url)
      await page.evaluate((input) => window.mountFileContextContent(input), input)
      const menu = page.locator('.hbar-file-selection-menu')
      await selectSource(page)
      await expect(menu).toBeVisible()
      expect(await menu.evaluate((node) => node.parentElement === document.body)).toBe(true)
      const bounds = await menu.boundingBox()
      expect(bounds).not.toBeNull()
      expect(
        bounds && bounds.x >= 0 && bounds.x + bounds.width <= 321 && bounds.y >= 0 && bounds.y + bounds.height <= 1001,
      ).toBe(true)
      expect(await page.evaluate(() => getSelection()?.toString())).toBe('alpha\n  be')
      await menu.screenshot({ path: info.outputPath(`selection-${locale}-320.png`) })
      const action = menu.getByRole('button')
      await action.click()
      expect(await page.evaluate(() => window.fileContextContentTargets())).toEqual([
        {
          sourceId: input.sourceId,
          selection: { kind: 'source-selection', sha256: 'a'.repeat(64), startOffset: 2, endOffset: 12 },
        },
      ])
      await page.evaluate(() => window.resolveFileContextContent(false))
      await expect(menu).toBeVisible()
      await page.locator('[data-context-other]').click()
      await expect(menu).toHaveCount(0)
      await page.keyboard.press('Escape')
      await selectSource(page)
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await selectSource(page)
      await page.locator('[data-context-outside]').click()
      await expect(menu).toHaveCount(0)
      await selectSource(page)
      await page.setViewportSize({ width: 390, height: 1000 })
      await expect(menu).toHaveCount(0)
      await selectSource(page)
      await page.locator('.hbar-file-source-surface').dispatchEvent('scroll')
      await expect(menu).toHaveCount(0)
      await selectSource(page)
      await menu.getByRole('button').click()
      await page.evaluate((input) => window.updateFileContextContent({ ...input, sourceId: 'new.ts' }), input)
      await expect(menu).toHaveCount(0)
      await page.evaluate(() => window.resolveFileContextContent(true))
      expect((await page.evaluate(() => window.fileContextContentTargets())).at(-1)?.sourceId).toBe('original.ts')
      await page.evaluate(
        (input) => window.updateFileContextContent({ ...input, sourceId: 'new.ts', hashed: false }),
        input,
      )
      await selectSource(page)
      await expect(menu).toHaveCount(0)
      await page.evaluate(
        (input) => window.updateFileContextContent({ ...input, sourceId: 'new.ts', disabled: true }),
        input,
      )
      await selectSource(page)
      await expect(menu).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}
