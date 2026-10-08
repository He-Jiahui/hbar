import { expect, test } from '@playwright/test'
import { build, preview, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-experience/markdown-diagram/controlled')
const base = 'http://127.0.0.1:45545'
let server: PreviewServer | undefined
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>.diagram-fixture{display:flex;flex-direction:column;min-inline-size:0;padding:1rem}.diagram-fixture-controls{display:flex;flex-wrap:wrap;gap:.5rem}.diagram-fixture-controls button{white-space:normal}</style></head><body><div id="root"></div><script type="module" src="../../../../tests/fixtures/markdown-diagram-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45545, strictPort: true },
  })
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
test('Mermaid reading follows the reference path and retains source/Find/owner recovery', async ({ browser }, info) => {
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const forbidden: string[] = []
  const errors: string[] = []
  try {
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== base) {
        forbidden.push(route.request().url())
        return route.abort()
      }
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const labels = getShellCopy('en-US').session.messageBlocks.codeBlock
    const block = page.locator('.hbar-markdown-diagram')
    await expect(block.locator('.hbar-diagram-inline svg')).toBeVisible()
    await expect(block.locator('pre')).toBeHidden()
    await page.screenshot({ path: info.outputPath('hbar-mermaid-inline-en-US-1440.png') })
    await block.getByRole('button', { name: labels.copy, exact: true }).click()
    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
      .toBe('flowchart TD\n  Start[Open document] --> Parse[Parse Markdown]\n  Parse --> Render[Render Mermaid]')
    const preview = block.getByRole('button', { name: labels.diagram.preview, exact: true }).first()
    await preview.focus()
    await preview.press('Enter')
    const dialog = page.getByRole('dialog', { name: labels.diagram.previewTitle, exact: true })
    await expect(dialog).toBeVisible()
    expect(
      await page.evaluate(() => {
        const ids = [...document.querySelectorAll('.hbar-diagram-svg [id]')].map((element) => element.id)
        return new Set(ids).size === ids.length
      }),
    ).toBe(true)
    await dialog.getByRole('button', { name: labels.diagram.zoomIn, exact: true }).click()
    await expect(dialog.getByRole('button', { name: labels.diagram.resetZoom, exact: true })).toHaveText('125%')
    await dialog.getByRole('button', { name: labels.diagram.resetZoom, exact: true }).click()
    await expect(dialog.getByRole('button', { name: labels.diagram.resetZoom, exact: true })).toHaveText('100%')
    await page.screenshot({ path: info.outputPath('hbar-mermaid-preview-en-US-1440.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(preview).toBeFocused()
    await page.locator('[data-action="find"]').click()
    await expect(page.locator('[data-find-result]')).toHaveText('Parse Markdown')
    await expect(block.locator('pre')).toBeVisible()
    await block.getByRole('button', { name: labels.diagram.diagram, exact: true }).click()
    await expect(block.locator('pre')).toBeHidden()
    await page.locator('[data-action="stream"]').click()
    await expect(block.getByRole('status')).toHaveText(labels.diagram.generating)
    await expect(block.locator('.hbar-diagram-svg svg')).toHaveCount(0)
    await page.locator('[data-action="stream"]').click()
    await expect(block.locator('.hbar-diagram-inline svg')).toBeVisible()
    await page.locator('[data-action="invalid"]').click()
    await expect(block.getByRole('status')).toHaveText(labels.diagram.failure('invalid'))
    await block.getByRole('button', { name: labels.diagram.source, exact: true }).click()
    await expect(block.locator('pre')).toHaveText('flowchart TD\n A[unfinished\n')
    await page.locator('[data-action="restricted"]').click()
    await expect(block.getByRole('status')).toHaveText(labels.diagram.failure('restricted'))
    await expect(block.locator('.hbar-diagram-svg svg,img,iframe')).toHaveCount(0)
    await page.locator('[data-action="valid"]').click()
    await page.locator('[data-action="replacement"]').click()
    await page.locator('[data-action="owner"]').click()
    await expect(block.locator('.hbar-diagram-inline svg')).toContainText('Replacement source')
    await page.locator('[data-action="large"]').click()
    await expect(block.getByRole('status')).toHaveText(labels.diagram.failure('too_large'))
    await page.locator('[data-action="wide"]').click()
    await expect(block.locator('.hbar-diagram-inline svg')).toBeVisible()
    await block.getByRole('button', { name: labels.diagram.preview, exact: true }).first().click()
    await dialog.getByRole('button', { name: labels.diagram.resetZoom, exact: true }).click()
    const pane = dialog.locator('.hbar-diagram-preview-viewport')
    expect(await pane.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    const bounds = await pane.boundingBox()
    if (!bounds) throw new Error('Missing diagram viewport')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 40, bounds.y + 30)
    await page.mouse.up()
    expect(await pane.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: labels.diagram.fit, exact: true }).click()
    await expect.poll(() => pane.evaluate((element) => element.scrollLeft)).toBe(0)
    await page.keyboard.press('Escape')
    expect(errors).toEqual([])
    expect(forbidden).toEqual([])
    expect(await page.locator('.hbar-diagram-measure-overlay').count()).toBe(0)
  } finally {
    await context.close()
  }
})
test('diagram titles wrap and original source readers stay scoped at every width', async ({ browser }, info) => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
    try {
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base}/?long-labels`)
      const labels = getShellCopy(locale).session.messageBlocks.codeBlock.diagram
      const block = page.locator('.hbar-markdown-diagram')
      await expect(block.locator('.hbar-diagram-inline svg')).toBeVisible()
      let lightFill: string | undefined
      for (const mode of ['light', 'dark'] as const) {
        await page.goto(`${base}/?long-labels&mode=${mode}&large-text`)
        await page.evaluate(() => {
          document.documentElement.style.zoom = '1.25'
        })
        await expect(block.locator('.hbar-diagram-inline svg')).toBeVisible()
        const shape = block.locator('.hbar-diagram-inline svg .node rect').first()
        await expect(shape).toBeVisible()
        if (mode === 'light') lightFill = await shape.evaluate((node) => getComputedStyle(node).fill)
        else await expect.poll(() => shape.evaluate((node) => getComputedStyle(node).fill)).not.toBe(lightFill)
        for (const width of [1440, 1100, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 })
          const heading = block.getByRole('heading', { name: labels.title.repeat(8), exact: true })
          await expect(heading).toBeVisible()
          const flow = await heading.evaluate((node) => ({
            wrap: getComputedStyle(node).whiteSpace,
            overflow: getComputedStyle(node).textOverflow,
            fits: node.scrollWidth <= node.clientWidth + 1,
          }))
          expect(flow).toEqual({ wrap: 'normal', overflow: 'clip', fits: true })
          const actions = block.locator('.hbar-diagram-actions')
          await expect(actions).toHaveAttribute('role', 'group')
          await actions.focus()
          if (await actions.evaluate((node) => node.scrollWidth > node.clientWidth)) {
            await actions.press('ArrowRight')
            await expect.poll(() => actions.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 1440 || width === 320)
            await block.screenshot({ path: info.outputPath(`diagram-title-${locale}-${mode}-${width}.png`) })
        }
      }
      const sourceLabel =
        locale === 'zh-CN' ? '查看当前图示未经改写的完整原始源码' : 'View the complete original source of this diagram'
      await block.getByRole('button', { name: sourceLabel, exact: true }).click()
      const source = block.locator('pre[data-text-context="code.block"]')
      await source.focus()
      await expect(source).toBeFocused()
      await expect(source).toHaveAttribute('aria-label', sourceLabel)
      await expect(source).toHaveText(
        'flowchart TD\n  Start[Open document] --> Parse[Parse Markdown]\n  Parse --> Render[Render Mermaid]\n',
      )
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  }
})

test('file Mermaid uses localized nearby actions and natural narrow flow', async ({ browser }, info) => {
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 320, height: 900 } })
  try {
    const page = await context.newPage()
    await page.goto(`${base}/?long-labels`)
    await page.locator('[data-action="file"]').click()
    const labels = getShellCopy('zh-CN').files.markdownCode
    const block = page.locator('.hbar-markdown-diagram')
    await expect(block.locator('.hbar-diagram-inline svg')).toBeVisible()
    await block.getByRole('button', { name: labels.diagram.preview, exact: true }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('hbar-mermaid-preview-zh-CN-320.png') })
    await page.keyboard.press('Escape')
    await block.getByRole('button', { name: '查看当前图示未经改写的完整原始源码', exact: true }).click()
    await expect(block.locator('pre')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('hbar-mermaid-source-zh-CN-320.png') })
  } finally {
    await context.close()
  }
})
