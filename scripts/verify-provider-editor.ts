import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { HBAR_PROVIDER_EDITOR_DESCRIPTION } from '@hbar/kernel'
import { getShellCopy } from '../apps/web/src/shell-copy'

const output = resolve('artifacts/desktop-elements/provider-editor')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/provider-editor-browser.tsx'),
      name: 'ProviderEditor',
      formats: ['iife'],
      fileName: 'provider-editor',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/provider-editor.css')).text()
const script = await Bun.file(resolve(output, 'bundle/provider-editor.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320])
        for (const count of width === 320 && mode === 'dark' ? [0, 1, 3, 256] : [3]) {
          const copy = getShellCopy(locale).providers.dialog
          const suffix =
            locale === 'zh-CN'
              ? '完整字段标签与章节标题'.repeat(12)
              : ' Original full field label and section title'.repeat(12)
          await page.setViewportSize({ width, height: 1000 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0}</style><div id="provider-editor-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((input) => window.mountProviderEditor(input), {
            locale,
            mode,
            count,
            suffix,
            description: HBAR_PROVIDER_EDITOR_DESCRIPTION,
          })
          const editor = page.locator('.hbar-app-react-provider-dialog')
          await expect(editor).toBeVisible()
          const title = editor.locator('.hbar-app-react-provider-page-header .hbar-provider-title-reading')
          await title.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => title.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const connection = editor.locator('.hbar-app-react-provider-primary-column')
          const labelRail = connection.getByRole('region', { name: copy.provider.name + suffix, exact: true })
          await labelRail.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => labelRail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const disclosure = editor.locator('.hbar-lumen-disclosure-trigger-reading').first()
          await disclosure.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => disclosure.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          await disclosure.getByRole('button').click()
          await expect(disclosure.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
          const help = connection
            .locator('.hbar-provider-advanced-content [data-text-context="form.description"]')
            .first()
          expect(await help.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          await disclosure.getByRole('button').click()
          await expect(
            connection.getByRole('textbox', { name: copy.provider.name + suffix, exact: true }),
          ).toHaveAttribute('id', 'provider-name')
          const actions = editor.getByRole('toolbar', { name: copy.save + suffix, exact: true })
          await actions.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => actions.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const list = editor.locator('.hbar-app-react-provider-model-list-items')
          await expect(list.getByRole('button')).toHaveCount(count)
          if (count === 0) await expect(editor.getByText(copy.models.empty, { exact: true })).toHaveCount(2)
          else {
            const last = list.getByRole('button').last()
            await last.click()
            await expect(editor.locator('#provider-model-id')).toHaveValue(`original-model-${count - 1}`)
            const expected = `original-model-${count - 1}`
            await editor.locator('#provider-model-name').fill('Edited original model — 原目标')
            await expect
              .poll(() => page.evaluate(() => window.providerEditorSnapshot().models.at(-1)?.name))
              .toBe('Edited original model — 原目标')
            expect(await page.evaluate(() => window.providerEditorAdd('original-model-0'))).toBe(
              count === 256 ? 'INPUT_TOO_LARGE' : 'COMMAND_CONFLICT',
            )
            if (count > 1) {
              expect(await page.evaluate((id) => window.providerEditorRename(id, 'original-model-0'), expected)).toBe(
                'COMMAND_CONFLICT',
              )
              expect(await page.evaluate(() => window.providerEditorRemove('original-model-0'))).toBeNull()
              await expect(list.getByRole('button')).toHaveCount(count - 1)
              await list.getByRole('button').last().click()
              await expect(editor.locator('#provider-model-id')).toHaveValue(expected)
            }
            if (count === 256) {
              expect(await page.evaluate(() => window.providerEditorAdd('accepted-replacement'))).toBeNull()
              expect(await page.evaluate(() => window.providerEditorAdd('rejected-overflow'))).toBe('INPUT_TOO_LARGE')
              expect(await page.evaluate(() => window.providerEditorSnapshot().models.length)).toBe(256)
            }
          }
          const geometry = await editor.evaluate((node) => ({
            page: document.documentElement.scrollWidth,
            viewport: innerWidth,
            scroll: node.querySelector('main')?.scrollWidth,
            width: node.querySelector('main')?.clientWidth,
          }))
          expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1)
          if (geometry.scroll === undefined || geometry.width === undefined)
            throw new Error('Missing Provider body reading geometry')
          if (geometry.scroll > geometry.width + 1) {
            await page.screenshot({ path: resolve(output, 'overflow.png') })
            console.log({
              locale,
              mode,
              width,
              count,
              geometry,
              overflow: await editor.evaluate((node) =>
                [...node.querySelectorAll('main *')]
                  .filter((element) => {
                    const rect = element.getBoundingClientRect()
                    const body = node.querySelector('main')?.getBoundingClientRect()
                    let ancestor: Element | null = element
                    while (ancestor && ancestor !== node.querySelector('main')) {
                      if (getComputedStyle(ancestor).overflowX === 'auto') return false
                      ancestor = ancestor.parentElement
                    }
                    return body && rect.right > body.right + 1
                  })
                  .map((element) => ({
                    tag: element.tagName,
                    id: element.id,
                    class: element.className,
                    width: element.getBoundingClientRect().width,
                  }))
                  .slice(0, 18),
              ),
            })
          }
          expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1)
          if (width === 320) await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}-${count}.png`) })
          await page.evaluate(() => window.releaseProviderEditor())
          scenarios++
        }
  expect(errors).toEqual([])
  console.log(
    `Provider editor verified: ${scenarios} real Chrome scenarios, both locales/themes, five widths, 125% narrow text, original drafts and model boundaries.`,
  )
} finally {
  await browser.close()
  await server.stop(true)
}
