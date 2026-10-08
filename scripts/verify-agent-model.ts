import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { AgentModelFixtureInput } from '../tests/fixtures/agent-model-browser'
import { verifyReadableText } from './support/verify-readable-text'
const output = resolve('artifacts/desktop-elements/agent-model')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/agent-model-browser.tsx'),
      name: 'AgentModel',
      formats: ['iife'],
      fileName: 'agent-model',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/agent-model.css')).text()
const script = await Bun.file(resolve(output, 'bundle/agent-model.iife.js')).text()
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
  for (const touch of [false, true]) {
    const context = await browser.newContext({ hasTouch: touch, isMobile: touch })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(server.url.href)
    for (const locale of ['en-US', 'zh-CN'] as const)
      for (const mode of ['light', 'dark'] as const)
        for (const width of [1440, 1100, 900, 390, 320]) {
          const copy = getShellCopy(locale).agents.modelPicker
          const suffix =
            locale === 'zh-CN'
              ? '原始模型标题与恢复文案'.repeat(12)
              : ' Original full model heading and recovery caption'.repeat(12)
          const cases: readonly Pick<AgentModelFixtureInput, 'count' | 'failure'>[] =
            width === 320 && mode === 'dark'
              ? [
                  { count: 3, failure: 'none' },
                  { count: 0, failure: 'none' },
                  { count: 1, failure: 'none' },
                  { count: 60, failure: 'none' },
                  { count: 61, failure: 'none' },
                  { count: 4096, failure: 'none' },
                  ...(['duplicates', 'error', 'stale', 'offline'] as const).map((failure) => ({ count: 3, failure })),
                ]
              : [{ count: 3, failure: 'none' }]
          for (const scenario of cases) {
            currentCase = { locale, mode, width, touch, scenario }
            await page.setViewportSize({ width, height: 900 })
            await page.setContent(
              `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0}*{box-sizing:border-box}.agent-model-fixture-pane{display:flex;min-inline-size:0;flex-direction:column;gap:1rem;padding:1rem}</style><div id="agent-model-fixture"></div>`,
            )
            await page.addScriptTag({ content: script })
            await page.evaluate((input) => window.mountAgentModel(input), { locale, mode, suffix, ...scenario })
            const trigger = page.locator('#owned-agent-model')
            await expect(trigger).toBeVisible()
            if (scenario.failure === 'stale')
              await expect(trigger).toHaveText(copy.unavailable('removed-original-model'))
            await trigger.click()
            const dialog = page.getByRole('dialog', { name: copy.title + suffix, exact: true })
            await expect(dialog).toBeVisible()
            await expect(dialog).toHaveAttribute('data-positioned', 'true')
            const search = dialog.getByRole('searchbox', { name: copy.search, exact: true })
            if (touch && width <= 640) await expect(search).not.toBeFocused()
            await verifyReadableText(dialog.locator('.hbar-agent-model-title-reading'), copy.title + suffix, true)
            await expect(dialog.getByRole('button', { name: copy.close, exact: true })).toBeVisible()
            await expect(dialog.getByRole('option')).toHaveCount(Math.min(scenario.count, 60))
            if (scenario.count === 0) await expect(dialog.getByText(copy.empty, { exact: true })).toBeVisible()
            else {
              const first = dialog.getByRole('option').first()
              await verifyReadableText(
                first.locator('[data-text-context="choice.title"]'),
                'Model 0 with a deliberately long bilingual name — 很长的模型名称',
                width <= 390,
              )
              await verifyReadableText(first.locator('[data-text-context="code.inline"]'), 'original-0')
              const geometry = await first.evaluate((node) => ({
                height: node.clientHeight,
                content: node.scrollHeight,
                text: [...node.querySelectorAll('[data-text-context]')].map((text) => ({
                  role: text.getAttribute('data-text-context'),
                  top: text.getBoundingClientRect().top,
                  bottom: text.getBoundingClientRect().bottom,
                })),
                top: node.getBoundingClientRect().top,
                bottom: node.getBoundingClientRect().bottom,
              }))
              if (geometry.content > geometry.height + 1) console.log(JSON.stringify({ currentCase, geometry }))
              expect(geometry.content).toBeLessThanOrEqual(geometry.height + 1)
              await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(
                'Provider with a deliberately long bilingual name — 很长的供应商名称',
              )
              if (scenario.failure === 'duplicates')
                await expect(dialog.getByText('Rejected duplicate source', { exact: true })).toHaveCount(0)
              if (scenario.failure !== 'stale')
                await expect(dialog.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
            }
            if (scenario.failure === 'error') {
              await expect(dialog.getByRole('alert')).toHaveText(copy.error('DISCONNECTED') + suffix)
              const retry = dialog.getByRole('button', { name: copy.retry + suffix, exact: true })
              await retry.focus()
              await retry.press('Enter')
              await expect(search).toBeFocused()
              await page.evaluate(() => window.finishAgentModelRetry())
              await expect(dialog.getByRole('alert')).toHaveCount(0)
              expect(await page.evaluate(() => window.agentModelActions)).toEqual([
                { kind: 'retry', target: 'original-model-0' },
              ])
            }
            if (scenario.failure === 'offline') await expect(dialog.getByRole('option').first()).toBeDisabled()
            else if (scenario.count) {
              if (scenario.failure === 'none' && scenario.count === 3) {
                const original = await dialog.getByRole('option').first().elementHandle()
                if (!original) throw new Error('Missing original Agent option target')
                await page.evaluate(() => window.reverseAgentModels())
                await original.click()
                await expect(dialog).toHaveCount(0)
                expect((await page.evaluate(() => window.agentModelActions)).at(-1)).toEqual({
                  kind: 'select',
                  target: 'original-model-0',
                })
                await trigger.click()
                await expect(dialog).toBeVisible()
              }
              if (scenario.count > 60) {
                await dialog.getByRole('button', { name: copy.more(scenario.count - 60), exact: true }).click()
                await expect(dialog.getByRole('option')).toHaveCount(Math.min(120, scenario.count))
              }
              await search.fill(`original-${scenario.count - 1}`)
              await expect(dialog.getByRole('option')).toHaveCount(1)
              await expect(dialog.getByRole('option')).toHaveAccessibleName(
                copy.optionLabel(
                  `Model ${scenario.count - 1} with a deliberately long bilingual name — 很长的模型名称`,
                  `original-${scenario.count - 1}`,
                ),
              )
              await search.dispatchEvent('keydown', { key: 'ArrowDown', keyCode: 229 })
              await expect(search).toBeFocused()
              await search.press('ArrowDown')
              await expect(dialog.getByRole('option')).toBeFocused()
              await page.keyboard.press('Enter')
              await expect(dialog).toHaveCount(0)
              await expect(trigger).toBeFocused()
              expect((await page.evaluate(() => window.agentModelActions)).at(-1)).toEqual({
                kind: 'select',
                target: `original-model-${scenario.count - 1}`,
              })
              await trigger.click()
              await expect(dialog).toBeVisible()
              await expect(dialog.getByRole('option', { selected: true })).toHaveAccessibleName(
                copy.optionLabel(
                  `Model ${scenario.count - 1} with a deliberately long bilingual name — 很长的模型名称`,
                  `original-${scenario.count - 1}`,
                ),
              )
            }
            const geometry = await dialog.evaluate((node) => {
              const r = node.getBoundingClientRect()
              return {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
                width: innerWidth,
                height: innerHeight,
                body: node.parentElement === document.body,
                blur: getComputedStyle(node).backdropFilter,
              }
            })
            expect(geometry.body, JSON.stringify({ currentCase, geometry })).toBe(true)
            expect(geometry.blur).not.toBe('none')
            expect(geometry.left).toBeGreaterThanOrEqual(-1)
            expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1)
            expect(geometry.top).toBeGreaterThanOrEqual(-1)
            expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1)
            if (scenario.count) {
              const reading = dialog.getByRole('listbox', { name: copy.title + suffix, exact: true })
              const listGeometry = await reading.evaluate((node) => ({
                content: node.scrollWidth,
                width: node.clientWidth,
                overflow: [...node.querySelectorAll('*')]
                  .filter((child) => child.getBoundingClientRect().right > node.getBoundingClientRect().right + 1)
                  .map((child) => ({
                    tag: child.tagName,
                    role: child.getAttribute('role'),
                    text: child.textContent?.slice(0, 80),
                    width: child.getBoundingClientRect().width,
                  })),
              }))
              expect(listGeometry.content, JSON.stringify({ currentCase, listGeometry })).toBeLessThanOrEqual(
                listGeometry.width + 1,
              )
            }
            if (width === 320)
              await page.screenshot({
                path: resolve(output, `${locale}-${mode}-${touch}-${scenario.count}-${scenario.failure}-open.png`),
              })
            await dialog.getByRole('button', { name: copy.close, exact: true }).click()
            await expect(dialog).toHaveCount(0)
            await expect(trigger).toBeFocused()
            if (width === 320 && scenario.count && scenario.failure !== 'stale') {
              await verifyReadableText(
                trigger.locator('[data-text-context="choice.title"]'),
                `Model ${scenario.failure === 'offline' ? 0 : scenario.count - 1} with a deliberately long bilingual name — 很长的模型名称`,
                true,
              )
            }
            if (width === 320 && scenario.count === 0) {
              const reading = page.locator('.hbar-agent-model-trigger-reading')
              await reading.focus()
              await page.keyboard.press('ArrowRight')
              await expect.poll(() => reading.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            }
            await trigger.click()
            await page.locator('.agent-model-fixture-outside').click()
            await expect(dialog).toHaveCount(0)
            await expect(page.locator('.agent-model-fixture-outside')).toBeFocused()
            await trigger.click()
            await page.keyboard.press('Escape')
            await expect(dialog).toHaveCount(0)
            await expect(trigger).toBeFocused()
            expect(await page.evaluate(() => window.agentModelBoundaryAccepted(4096))).toBe(true)
            expect(await page.evaluate(() => window.agentModelBoundaryAccepted(4097))).toBe(false)
            const pageGeometry = await page.evaluate(() => ({
              content: document.documentElement.scrollWidth,
              width: innerWidth,
            }))
            expect(pageGeometry.content, JSON.stringify({ currentCase, pageGeometry })).toBeLessThanOrEqual(
              pageGeometry.width + 1,
            )
            if (width === 320)
              await page.screenshot({
                path: resolve(output, `${locale}-${mode}-${touch}-${scenario.count}-${scenario.failure}.png`),
              })
            await page.evaluate(() => window.releaseAgentModel())
            scenarios++
          }
        }
    await context.close()
  }
  expect(errors).toEqual([])
  console.log(
    `Agent model verified: ${scenarios} actual Chrome scenarios, two locales/themes/pointers/five widths, 0/1/3/60/61/4096/4097, full names/IDs, retry and original selection.`,
  )
} catch (error) {
  console.log(JSON.stringify({ currentCase }))
  throw error
} finally {
  await browser.close()
  await server.stop(true)
}
