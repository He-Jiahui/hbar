import { expect, test, type Locator, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { SingleLineFixtureInput } from '../tests/fixtures/single-line-controls-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { completeLine } from './support/single-line-layout'

const root = join(process.cwd(), 'artifacts/single-line-controls')
const origin = 'http://127.0.0.1:45625'
let server: PreviewServer | undefined

async function render(page: Page, input: SingleLineFixtureInput) {
  await page.evaluate((value) => window.singleLineFixture.render(value), input)
}

/** Reading text wraps inside its own surface; a CSS declaration alone cannot prove it is readable. */
async function readableParagraph(text: Locator, requiresWrapping = true) {
  const metrics = await text.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    const bounds = node.getBoundingClientRect()
    const rects = [...range.getClientRects()]
    const lines = new Set(rects.map((rect) => Math.round(rect.top)))
    return {
      lines: lines.size,
      fits: rects.every((rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1),
      horizontalOverflow: node.scrollWidth > node.clientWidth + 1,
      ellipsis: getComputedStyle(node).textOverflow === 'ellipsis',
    }
  })
  if (requiresWrapping) expect(metrics.lines).toBeGreaterThan(1)
  expect(metrics.fits).toBe(true)
  expect(metrics.horizontalOverflow).toBe(false)
  expect(metrics.ellipsis).toBe(false)
}

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`reading popovers wrap prose while action captions stay single-line ${locale} ${theme}`, async ({
      page,
    }, info) => {
      await page.goto(origin)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale).session.permissionPicker
      const title =
        locale === 'zh-CN'
          ? '帮我优化一下 hbar desktop 布局，要求你视觉检查，将持续改进弹窗与工具栏的阅读体验'
          : 'Improve the hbar desktop layout and visually check readable dialogs and stable toolbar controls'
      const form = page.locator('.hbar-prompt-composer')
      const trigger = form.locator('.hbar-composer-permission-trigger')
      const popup = page.locator('.hbar-composer-permission-popover')
      const body = popup.locator('.hbar-composer-permission-body')
      for (const width of [1100, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        for (const sessionName of [title, `${title} D:/workspace/${'long-unbroken-path-'.repeat(24)}.tsx`]) {
          await render(page, { locale, theme, status: 'ready', branch: 'master', workspaceName: sessionName })
          const toolbarHeight = await form.locator('.lumen-composer-toolbar').evaluate((node) => node.clientHeight)
          await trigger.click()
          await expect(popup).toBeVisible()
          await readableParagraph(popup.locator('.hbar-composer-permission-hint'), false)
          await popup.locator('[data-choice="allow"]').click()
          await expect(popup).toHaveAccessibleName(copy.confirmTitle)
          await expect(body.locator('p')).toHaveText(copy.confirmBody(sessionName))
          await readableParagraph(body.locator('p'))
          expect(await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          await completeLine(popup.locator('.hbar-composer-permission-actions button'))
          expect(await form.locator('.lumen-composer-toolbar').evaluate((node) => node.clientHeight)).toBe(
            toolbarHeight,
          )
          if (width === 900 && sessionName === title && locale === 'zh-CN' && theme === 'dark') {
            await popup.screenshot({ path: join(root, 'permission-confirmation-wrapped.png') })
            await page.screenshot({ path: info.outputPath('permission-confirmation-context.png') })
          }
          const before = await page.evaluate(() => window.singleLineFixture.actions())
          await popup.getByRole('button', { name: copy.cancel, exact: true }).click()
          await expect(popup.locator('[data-choice="allow"]')).toBeVisible()
          expect(await page.evaluate(() => window.singleLineFixture.actions())).toEqual(before)
          await popup.locator('[data-choice="allow"]').click()
          await popup.getByRole('button', { name: copy.confirmAllow, exact: true }).click()
          await expect(popup).not.toBeVisible()
          expect(await page.evaluate(() => window.singleLineFixture.actions())).toContain(
            'permission:session:allow:true',
          )
          await expect(trigger).toBeFocused()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        await render(page, {
          locale,
          theme,
          status: 'ready',
          branch: 'master',
          workspaceName: title,
          choiceDetail: copy.confirmBody(title),
        })
        await form.locator('.hbar-pre-session-choice-picker > button').click()
        const modelPopup = page.locator('.hbar-pre-session-choice-popover')
        await expect(modelPopup).toBeVisible()
        await readableParagraph(modelPopup.locator('.hbar-pre-session-choice-row small'))
        expect(
          await modelPopup
            .locator('.hbar-pre-session-choice-list')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        ).toBe(true)
        await page.keyboard.press('Escape')
        await expect(modelPopup).not.toBeVisible()
        await render(page, {
          locale,
          theme,
          status: 'ready',
          branch: 'master',
          workspaceName: `${title} ${'long-unbroken-title-'.repeat(12)}`,
          readingDialog: true,
        })
        const dialog = page.locator('.lumen-dialog[data-open]')
        await expect(dialog).toBeVisible()
        await readableParagraph(dialog.locator('h2'))
        await readableParagraph(dialog.locator('[data-fixture-reading-body]'))
        expect(
          await dialog.locator('.lumen-dialog-body').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        ).toBe(true)
        await completeLine(dialog.locator('footer button'))
        await expect(dialog.getByRole('button', { name: copy.close, exact: true })).toBeInViewport()
        const before = await page.evaluate(() => window.singleLineFixture.actions())
        await page.keyboard.press('Escape')
        expect((await page.evaluate(() => window.singleLineFixture.actions())).slice(before.length)).toEqual([
          'dialog:close',
        ])
        await render(page, { locale, theme, status: 'ready', branch: 'master', workspaceName: title })
        await expect(dialog).not.toBeVisible()
      }
      expect(errors).toEqual([])
    })
  }

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`data captions and atomic mentions retain complete single lines ${locale}`, async ({ page }, info) => {
    await page.goto(origin)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const gallery = page.locator('[data-fixture-data]')
    const input: SingleLineFixtureInput = {
      locale,
      theme: 'dark',
      workspaceName: 'hbar',
      branch: 'master',
      status: 'ready',
      dataGallery: true,
      count: 1,
    }
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1024, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await render(page, { ...input, theme })
        const shortHeight = await gallery
          .locator('.hbar-activity-agent-row')
          .first()
          .evaluate((node) => node.getBoundingClientRect().height)
        for (const count of [0, 1, 100]) {
          await render(page, { ...input, theme, count, long: true })
          await completeLine(
            gallery.locator(
              '.hbar-activity-agent-row strong, .hbar-activity-task-row > span, .hbar-agent-model-current, .hbar-composer-workspace-context-location > span, .hbar-composer-workspace-context-range, .hbar-queued-user-run-text, .hbar-queued-user-run-status',
            ),
          )
          expect(await gallery.locator('.hbar-activity-task-row').count()).toBe(count)
          expect(await gallery.locator('.hbar-activity-agent-row').count()).toBe(Math.min(count, 50))
          if (count) {
            expect(
              await gallery
                .locator('.hbar-activity-agent-row')
                .first()
                .evaluate((node) => node.getBoundingClientRect().height),
            ).toBeCloseTo(shortHeight, 1)
            const rail = gallery.locator('.hbar-activity-agent-list')
            expect(await rail.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
            await rail.focus()
            await rail.press('ArrowRight')
            await expect.poll(() => rail.evaluate((node) => node.scrollLeft > 0)).toBe(true)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        const picker = gallery.locator('.hbar-agent-model-trigger')
        await picker.click()
        const option = page.locator('.hbar-agent-model-list [role="option"]')
        await completeLine(option.locator('.hbar-agent-model-option-text > *'))
        await option.click()
        expect(await page.evaluate(() => window.singleLineFixture.actions())).toContain('model:provider:model')
      }
    }
    const editor = gallery.getByRole('textbox', { name: 'fixture mention editor' })
    await editor.fill('@fixture')
    const option = page.locator('.hbar-composer-mention-choice').first()
    await expect(option).toBeVisible()
    await completeLine(option)
    await option.click()
    const pill = gallery.locator('.hbar-composer-mention-pill')
    await expect(pill).toBeVisible()
    await completeLine(pill)
    const caption = await gallery.locator('.hbar-agent-model-current').textContent()
    await expect(pill).toHaveText(`@${caption?.replaceAll(' ', '-')}.tsx`)
    expect(await pill.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(256)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await editor.press('ControlOrMeta+z')
    await expect(pill).toHaveCount(0)
    await editor.press('ControlOrMeta+y')
    await expect(pill).toHaveCount(1)
    await page.screenshot({ path: info.outputPath(`data-and-mention-${locale}.png`) })
    expect(errors).toEqual([])
  })
}

test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="../../tests/fixtures/single-line-controls-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45625, strictPort: true },
  })
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`complete composer labels retain natural width through state changes ${locale} ${theme}`, async ({
      page,
    }, info) => {
      await page.goto(origin)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const form = page.locator('.hbar-prompt-composer')
      const toolbar = form.locator('.lumen-composer-toolbar')
      const rail = toolbar.locator('.lumen-composer-control-rail')
      for (const width of [1024, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 600 })
        let height: number | undefined
        for (const state of [
          { status: 'ready', branch: 'master' },
          { status: 'loading', branch: null },
          { status: 'ready', branch: `hbar/session-launch/${'a7'.repeat(32)}` },
          { status: 'ready', branch: 'feature/中文分支与完整路径'.repeat(18), long: true },
          { status: 'error', branch: null },
          { status: 'ready', branch: null, connected: false },
        ] satisfies Partial<SingleLineFixtureInput>[]) {
          await render(page, {
            locale,
            theme,
            workspaceName: 'hbar',
            ...state,
          })
          await completeLine(form.locator('button:not([popover] button, dialog button)'))
          await completeLine(page.locator('.hbar-session-project-context:visible'))
          const size = await toolbar.boundingBox()
          if (!size) throw new Error('Composer toolbar has no visible bounds')
          if (height !== undefined) expect(size.height).toBeCloseTo(height, 1)
          height = size.height
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          const stop = toolbar.getByRole('button', { name: getShellCopy(locale).session.prompt.stop, exact: true })
          await expect(stop).toBeInViewport()
          if ('long' in state && state.long) {
            expect(await rail.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
            const queue = toolbar.locator('.lumen-composer-queue-action')
            await queue.focus()
            expect(await rail.evaluate((node) => node.scrollLeft > 0)).toBe(true)
            await stop.click()
            expect(await page.evaluate(() => window.singleLineFixture.actions())).toContain('stop')
          }
        }
        await render(page, {
          locale,
          theme,
          workspaceName: 'hbar',
          status: 'loading',
          branch: null,
        })
        await rail.evaluate((node) => {
          node.scrollLeft = 0
        })
        await page.screenshot({ path: info.outputPath(`loading-${width}.png`) })
        if (locale === 'zh-CN' && theme === 'dark' && width === 900) {
          await form.screenshot({ path: join(root, 'composer-loading-after.png') })
          await render(page, { locale, theme, workspaceName: 'hbar', status: 'ready', branch: 'master' })
          await form.screenshot({ path: join(root, 'composer-master-after.png') })
        }
      }
      await render(page, {
        locale,
        theme,
        workspaceName: '完整工程名称'.repeat(12),
        status: 'ready',
        branch: 'master',
        long: true,
        textSize: 'l',
      })
      await page.locator('html').evaluate((node) => {
        node.style.fontSize = '200%'
      })
      await completeLine(form.locator('button:not([popover] button, dialog button)'))
      await completeLine(page.locator('.hbar-session-project-context:visible'))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(errors).toEqual([])
    })
  }

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`primitive labels, tabs and tree use complete intrinsic text ${locale}`, async ({ page }, info) => {
    await page.goto(origin)
    const input: SingleLineFixtureInput = {
      locale,
      theme: 'dark',
      workspaceName: 'hbar',
      branch: 'master',
      status: 'ready',
      gallery: true,
    }
    const gallery = page.locator('[data-fixture-gallery]')
    await page.setViewportSize({ width: 900, height: 950 })
    await render(page, input)
    const short = await completeLine(gallery.locator('[data-fixture-actions] button').first())
    await render(page, { ...input, long: true })
    const long = await completeLine(gallery.locator('[data-fixture-actions] button').first())
    expect(long[0]?.width).toBeGreaterThan((short[0]?.width ?? 0) * 2)
    expect(long[0]?.height).toBe(short[0]?.height)
    for (const width of [900, 390, 320]) {
      await page.setViewportSize({ width, height: 950 })
      for (const count of [0, 1, 7, 32, 33]) {
        await render(page, { ...input, long: true, count })
        await expect(gallery.locator('.hbar-workspace-tab-title')).toHaveCount(count)
        await expect(gallery.locator('.hbar-file-preview-tab')).toHaveCount(count)
        await expect(gallery.getByRole('treeitem')).toHaveCount(count)
        await completeLine(
          gallery.locator(
            '[data-fixture-actions] button, .lumen-popup-select-trigger, .lumen-page-heading > *, .lumen-tool-pane-heading > *, .lumen-settings-list-copy > strong, .lumen-settings-list > header h2, .lumen-form-field > label > span, .lumen-checkbox-copy > span, .lumen-toggle-copy > span',
          ),
        )
        if (count) {
          await completeLine(gallery.locator('.hbar-workspace-tab-title, .hbar-file-preview-select, .lumen-tree-row'))
          const strip = gallery.locator('.hbar-workspace-tab-strip')
          expect(await strip.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
          await gallery.locator('.hbar-workspace-tab-select').last().focus()
          if (count === 1) {
            await strip.evaluate((node) => {
              node.scrollLeft = 0
            })
            const right = gallery
              .locator('.hbar-workspace-tabs > button')
              .filter({ has: page.locator('svg.lucide-chevron-right') })
            await right.focus()
            await right.press('Enter')
          }
          await expect.poll(() => strip.evaluate((node) => node.scrollLeft > 0)).toBe(true)
          const tree = gallery.getByRole('treeitem').last()
          await tree.focus()
          await tree.press('Enter')
          expect(await page.evaluate(() => window.singleLineFixture.actions())).toContain(`tree:tab-${count - 1}`)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      await page.screenshot({ path: info.outputPath(`gallery-${width}.png`) })
    }
    await render(page, { ...input, long: true, count: 1, textSize: 'l' })
    await page.locator('html').evaluate((node) => {
      node.style.fontSize = '200%'
    })
    await completeLine(
      gallery.locator(
        '[data-fixture-actions] button, .lumen-popup-select-trigger, .hbar-workspace-tab-title, .hbar-file-preview-select, .lumen-page-heading > *, .lumen-tool-pane-heading > *, .lumen-settings-list-copy > strong, .lumen-settings-list > header h2, .lumen-form-field > label > span, .lumen-checkbox-copy > span, .lumen-toggle-copy > span',
      ),
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}
