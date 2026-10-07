import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { PluginContentInput } from '../tests/fixtures/plugin-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/plugin-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/plugin-content-browser.tsx'),
      name: 'PluginContent',
      formats: ['iife'],
      fileName: 'plugin-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/plugin-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/plugin-content.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
let currentCase: unknown
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (reason) => errors.push(reason.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const labels = getShellCopy(locale).extensions.detail
        const suffix =
          locale === 'zh-CN'
            ? ' 完整原始插件操作与栏目标题'.repeat(8)
            : ' Complete original Plugin action and section heading'.repeat(8)
        const normal: PluginContentInput = { locale, mode, suffix, count: 3, state: 'ready' }
        const cases: PluginContentInput[] = [normal]
        if (width === 320 && mode === 'dark')
          cases.push(
            ...[0, 1, 20, 21, 1000].map((count) => ({ ...normal, count })),
            ...(['read-error', 'missing', 'failed', 'unknown', 'required', 'offline', 'duplicates'] as const).map(
              (state) => ({ ...normal, state }),
            ),
          )
        for (const input of cases) {
          currentCase = { locale, mode, width, count: input.count, state: input.state }
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width <= 390 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#plugin-content-fixture{min-inline-size:0;block-size:100dvh;overflow:auto;padding:1rem}</style><div id="plugin-content-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountPluginContent(value), input)
          const detail = page.locator('.hbar-app-react-plugin-detail')
          await expect(detail).toBeVisible()
          if (input.state === 'read-error') {
            await expect(detail.getByRole('alert')).toHaveText(labels.error('DISCONNECTED'))
            await page.evaluate(() => window.repairPluginContent())
            await detail.getByRole('button', { name: labels.retry + suffix, exact: true }).click()
            await expect(detail.getByRole('alert')).toHaveCount(0)
          }
          if (input.state === 'missing') {
            await expect(detail.getByRole('status')).toHaveText(labels.missing)
          } else {
            await verifyReadableText(
              detail.locator('.hbar-app-react-plugin-detail-summary [data-text-context="section.title"]'),
              '完整原始插件名称 Complete original extension name '.repeat(6),
              width <= 900,
            )
            const source = detail.locator('[data-text-context="detail.value"]').first()
            await expect(source).toHaveText('D:/original-plugin/' + 'original-parent-folder/'.repeat(25))
            await source.scrollIntoViewIfNeeded()
            await source.focus()
            for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => source.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            expect((await detail.textContent())?.includes('owned-secret-never-display')).toBe(false)
            expect((await detail.textContent())?.includes('private-declaration-never-display')).toBe(false)
            const collections = detail.locator('.hbar-app-react-plugin-capability')
            await expect(collections).toHaveCount(input.count ? 5 : 0)
            if (input.count) {
              const commands = collections.first()
              await verifyReadableText(commands.getByRole('heading'), labels.commands + suffix, width <= 900)
              const total = input.count + (input.state === 'duplicates' ? 1 : 0)
              const commandCount = input.state === 'duplicates' ? input.count : total
              await expect(commands.locator('li')).toHaveCount(Math.min(20, commandCount))
              if (input.state === 'duplicates')
                await expect(commands.locator('[data-text-context="collection.title"]').first()).toHaveText(
                  'Original last duplicate command record — 原有最后一条同 ID 记录',
                )
              else
                await verifyReadableText(
                  commands.locator('[data-text-context="collection.title"]').first(),
                  '原始命令 0 Complete original command name '.repeat(5).slice(0, 120),
                  width <= 390,
                )
              const usage = commands.locator('[data-text-context="code.block"]').first()
              await expect(usage).toHaveText(
                '/original.command-0 --original-option=' + 'original-full-command-argument'.repeat(12).slice(0, 260),
              )
              await expect(usage).toHaveCSS('white-space', 'pre')
              await usage.focus()
              for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
              await expect.poll(() => usage.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
              if (input.count > 20) {
                const more = commands.getByRole('button', { name: labels.pagination.next + suffix, exact: true })
                await more.focus()
                await more.press('Enter')
                await expect(commands.locator('[data-text-context="code.inline"]').first()).toHaveText(
                  'original.command-20',
                )
                await expect(commands.locator('li')).toHaveCount(Math.min(20, input.count - 20))
                await page.evaluate(() => window.shrinkPluginContent())
                await expect(commands.locator('li')).toHaveCount(1)
                await expect(commands.locator('[data-text-context="code.inline"]').first()).toHaveText(
                  'original.command-0',
                )
                await expect(commands.locator('.hbar-app-react-extension-pagination')).toHaveCount(0)
              }
            } else await expect(detail.getByText(labels.emptyCommands, { exact: true })).toBeVisible()
            const action = detail.getByRole('button', { name: labels.actions.disable + suffix, exact: true })
            if (input.state === 'required') await expect(action).toHaveCount(0)
            else if (input.state === 'offline') await expect(action).toBeDisabled()
            else {
              await action.focus()
              await action.press('Enter')
              if (input.state === 'failed') {
                await expect(detail.getByRole('alert')).toHaveText(labels.actions.error('PLUGIN_DEPENDENCY'))
                await page.evaluate(() => window.repairPluginContent())
                await action.focus()
                await action.press('Enter')
                await expect(detail.getByRole('alert')).toHaveCount(0)
              }
              if (input.state === 'unknown') {
                await expect(detail.getByText(labels.actions.unknown, { exact: true })).toBeVisible()
                await expect(action).toHaveCount(0)
                await page.evaluate(() => window.repairPluginContent())
                await detail.getByRole('button', { name: labels.actions.readCurrent + suffix, exact: true }).click()
                await expect(detail.getByText(labels.actions.unknown, { exact: true })).toBeVisible()
                await expect(
                  detail.getByRole('button', { name: labels.actions.enable + suffix, exact: true }),
                ).toHaveCount(0)
              }
              if (input.state !== 'unknown')
                await expect(
                  detail.getByRole('button', { name: labels.actions.enable + suffix, exact: true }),
                ).toBeVisible()
              const writes = (await page.evaluate(() => window.pluginContentState())).calls.filter((call) =>
                ['plugin.enable', 'plugin.disable'].includes(call.name),
              )
              expect(writes).toEqual(
                Array.from({ length: input.state === 'failed' ? 2 : 1 }, () => ({
                  name: 'plugin.disable',
                  input: { id: 'original-plugin' },
                })),
              )
            }
            expect((await page.evaluate(() => window.pluginContentState())).selected).toBe('original-plugin')
            expect(await page.evaluate(() => window.pluginContentTextBounds())).toEqual({
              title120: true,
              title121: false,
              description500: true,
              description501: false,
              usage300: true,
              usage301: false,
            })
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320 && input.state === 'ready' && input.count === 3) {
            await detail.getByRole('heading').first().scrollIntoViewIfNeeded()
            await page.screenshot({ path: resolve(output, `${locale}-${mode}-title-320.png`) })
          }
          await page.evaluate(() => window.releasePluginContent())
          scenarios++
        }
      }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual Plugin detail Chrome scenarios passed.`)
} catch (reason) {
  console.error({ currentCase, scenarios, reason })
  throw reason
} finally {
  await browser.close()
  await server.stop(true)
}
