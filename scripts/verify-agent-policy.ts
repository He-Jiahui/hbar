import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { AgentPolicyFixtureInput } from '../tests/fixtures/agent-policy-browser'

const output = resolve('artifacts/desktop-elements/agent-policy')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/agent-policy-browser.tsx'),
      name: 'AgentPolicy',
      formats: ['iife'],
      fileName: 'agent-policy',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/agent-policy.css')).text()
const script = await Bun.file(resolve(output, 'bundle/agent-policy.iife.js')).text()
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
  page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const copy = getShellCopy(locale).agents.policy
        const suffix =
          locale === 'zh-CN'
            ? '完整原始候选策略标签'.repeat(12)
            : ' Original complete candidate policy label'.repeat(12)
        const cases: readonly Pick<AgentPolicyFixtureInput, 'count' | 'failure'>[] =
          width === 320 && mode === 'dark'
            ? [
                { count: 3, failure: 'none' },
                { count: 0, failure: 'none' },
                { count: 1, failure: 'none' },
                { count: 32, failure: 'none' },
                { count: 3, failure: 'unknown' },
                { count: 3, failure: 'invalid' },
                { count: 3, failure: 'duplicate' },
              ]
            : [{ count: 3, failure: 'none' }]
        for (const scenario of cases) {
          await page.setViewportSize({ width, height: 1000 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0}*{box-sizing:border-box}.agent-policy-fixture-pane{block-size:100dvh;min-inline-size:0;overflow:auto}</style><div id="agent-policy-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((input) => window.mountAgentPolicy(input), { locale, mode, suffix, ...scenario })
          const editor = page.locator('.hbar-agent-policy-editor')
          const title = editor.locator('.hbar-lumen-disclosure-trigger-reading')
          await title.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => title.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          await title.getByRole('button').click()
          await expect(editor.locator('.hbar-agent-policy-row')).toHaveCount(scenario.count)
          const toolbar = editor.getByRole('toolbar', { name: copy.title + suffix, exact: true })
          await toolbar.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => toolbar.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          expect(await page.evaluate(() => window.agentPolicyBoundaryAccepted(32))).toBe(true)
          expect(await page.evaluate(() => window.agentPolicyBoundaryAccepted(33))).toBe(false)
          if (scenario.count === 0) await expect(editor.getByText(copy.empty, { exact: true })).toBeVisible()
          else {
            const rows = editor.locator('.hbar-agent-policy-row')
            const first = rows.first()
            const rail = first.getByRole('region', { name: copy.weight + suffix, exact: true })
            await rail.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            const weight = first.getByRole('spinbutton', { name: copy.weight + suffix, exact: true })
            await weight.fill(scenario.failure === 'invalid' ? '1.5' : '199')
            const original = await page.evaluate(() => window.agentPolicySnapshot().rows[0]?.id)
            const removeReading = first.getByRole('group', { name: copy.remove(1) + suffix, exact: true })
            await removeReading.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => removeReading.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            if (scenario.count === 32) {
              await expect(editor.getByRole('button', { name: copy.add + suffix, exact: true })).toBeDisabled()
              expect(await page.evaluate(() => window.agentPolicyAdd())).toBe('CAPACITY_EXCEEDED')
            }
            if (scenario.count > 1) {
              await rows
                .last()
                .getByRole('button', { name: copy.remove(scenario.count) + suffix, exact: true })
                .click()
              await expect(rows).toHaveCount(scenario.count - 1)
              expect(await page.evaluate(() => window.agentPolicySnapshot().rows[0]?.id)).toBe(original)
              await expect(weight).toHaveValue(scenario.failure === 'invalid' ? '1.5' : '199')
            }
            await editor.getByRole('button', { name: copy.save + suffix, exact: true }).click()
            if (scenario.failure === 'invalid' || scenario.failure === 'duplicate') {
              await expect(editor.getByRole('alert')).toHaveText(copy.error('INVALID_INPUT'))
              await expect(weight).toHaveValue(scenario.failure === 'invalid' ? '1.5' : '199')
              expect(await page.evaluate(() => window.agentPolicySnapshot().writes)).toBe(0)
            } else {
              if (scenario.failure === 'unknown') {
                await expect(editor.getByRole('alert')).toHaveText(copy.error('DISCONNECTED'))
                await expect(weight).toBeDisabled()
                await editor.getByRole('button', { name: copy.retry, exact: true }).click()
              }
              await expect(editor.getByText(copy.saved, { exact: true })).toBeVisible()
              const state = await page.evaluate(() => window.agentPolicySnapshot())
              expect(state.writes).toBe(1)
              expect(new Set(state.writeKeys).size).toBe(1)
              expect(new Set(state.targets)).toEqual(new Set(['original-parent']))
            }
          }
          const geometry = await editor.evaluate((node) => ({
            page: document.documentElement.scrollWidth,
            width: innerWidth,
            content: node.scrollWidth,
            available: node.clientWidth,
          }))
          if (geometry.content > geometry.available + 1 || geometry.page > geometry.width + 1) {
            await page.screenshot({ path: resolve(output, 'overflow.png') })
            console.log({
              scrolling: await editor.evaluate((node) =>
                [...node.querySelectorAll('*')]
                  .filter((element) => element.scrollWidth > element.clientWidth + 1)
                  .map((element) => ({
                    class: element.className,
                    width: element.clientWidth,
                    scroll: element.scrollWidth,
                    left: element.getBoundingClientRect().left,
                    right: element.getBoundingClientRect().right,
                  }))
                  .slice(0, 16),
              ),
            })
            console.log({
              locale,
              mode,
              width,
              scenario,
              geometry,
              overflow: await editor.evaluate((node) =>
                [...node.querySelectorAll('*')]
                  .filter((element) => {
                    let ancestor: Element | null = element
                    while (ancestor && ancestor !== node) {
                      if (getComputedStyle(ancestor).overflowX === 'auto') return false
                      ancestor = ancestor.parentElement
                    }
                    return element.getBoundingClientRect().right > innerWidth + 1
                  })
                  .map((element) => ({ class: element.className, width: element.getBoundingClientRect().width }))
                  .slice(0, 15),
              ),
            })
          }
          expect(geometry.page).toBeLessThanOrEqual(geometry.width + 1)
          expect(geometry.content).toBeLessThanOrEqual(geometry.available + 1)
          if (width === 320)
            await page.screenshot({
              path: resolve(output, `${locale}-${mode}-${scenario.count}-${scenario.failure}.png`),
            })
          await page.evaluate(() => window.releaseAgentPolicy())
          scenarios++
        }
      }
  expect(errors).toEqual([])
  console.log(
    `Agent policy verified: ${scenarios} actual Chrome scenarios, two locales/themes/five widths, raw invalid drafts, 0/1/3/32/33 bounds and original parent/row/key.`,
  )
} finally {
  await browser.close()
  await server.stop(true)
}
