import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SandboxFixtureInput } from '../tests/fixtures/sandbox-settings-browser'

const output = resolve('artifacts/desktop-elements/sandbox-settings')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/sandbox-settings-browser.tsx'),
      name: 'SandboxSettings',
      formats: ['iife'],
      fileName: 'sandbox-settings',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/sandbox-settings.css')).text()
const script = await Bun.file(resolve(output, 'bundle/sandbox-settings.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let scenarios = 0
const errors: string[] = []
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const copy = getShellCopy(locale).sandbox
        const suffix =
          locale === 'zh-CN'
            ? '完整沙盒字段与操作标签'.repeat(12)
            : ' Original full Sandbox field and action caption'.repeat(12)
        const cases: readonly Pick<SandboxFixtureInput, 'count' | 'rows' | 'failure'>[] =
          width === 320 && mode === 'dark'
            ? [
                { count: 3, rows: 3, failure: 'none' },
                { count: 3, rows: 0, failure: 'none' },
                { count: 3, rows: 1, failure: 'none' },
                { count: 0, rows: 0, failure: 'none' },
                { count: 1, rows: 1, failure: 'none' },
                { count: 66, rows: 256, failure: 'none' },
                ...(['duplicates', 'list-error', 'missing', 'save-failed', 'save-unknown', 'invalid'] as const).map(
                  (failure) => ({
                    count: 3,
                    rows: 3,
                    failure,
                  }),
                ),
              ]
            : [{ count: 3, rows: 3, failure: 'none' }]
        for (const scenario of cases) {
          await page.setViewportSize({ width, height: 1000 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0}*{box-sizing:border-box}.sandbox-fixture-pane{block-size:100dvh;min-inline-size:0;overflow:auto}</style><div id="sandbox-settings-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((input) => window.mountSandboxSettings(input), { locale, mode, suffix, ...scenario })
          const panel = page.locator('.hbar-sandbox-profiles')
          await expect(panel).toBeVisible()
          const title = panel.getByRole('group', { name: copy.title + suffix, exact: true })
          await title.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => title.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const create = panel.getByRole('group', { name: copy.create + suffix, exact: true })
          await create.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => create.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const list = panel.locator('.hbar-sandbox-profiles-items')
          await expect(list.getByRole('listitem')).toHaveCount(scenario.failure === 'list-error' ? 0 : scenario.count)
          if (scenario.failure === 'duplicates')
            await expect(panel.getByText('Rejected duplicate source', { exact: true })).toHaveCount(0)
          if (scenario.failure === 'list-error')
            await expect(panel.getByRole('alert')).toHaveText(copy.listError('TIMEOUT'))
          else if (scenario.failure === 'missing') await expect(panel.getByRole('alert')).toHaveText(copy.missing)
          else if (scenario.count < 3) await expect(panel.getByText(copy.noSelection, { exact: true })).toBeVisible()
          else {
            const rail = panel.getByRole('region', { name: copy.fields.name + suffix, exact: true })
            await rail.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            for (const [section, count] of [
              ['grants', scenario.rows],
              ['commands', Math.min(scenario.rows, 128)],
              ['tools', Math.min(scenario.rows, 64)],
              ['environment', Math.min(scenario.rows, 64)],
            ] as const) {
              await expect(panel.locator(`[data-section="${section}"] .hbar-sandbox-profiles-row`)).toHaveCount(count)
            }
            expect(await page.evaluate(() => window.sandboxBoundaryAccepted(256))).toBe(true)
            expect(await page.evaluate(() => window.sandboxBoundaryAccepted(257))).toBe(false)
            const name = panel.getByRole('textbox', { name: copy.fields.name + suffix, exact: true })
            await name.fill('Edited original profile — 原始目标')
            await page.evaluate(() => window.reverseSandboxProfiles())
            await expect(name).toHaveValue('Edited original profile — 原始目标')
            const save = panel.getByRole('button', { name: copy.save + suffix, exact: true })
            if (scenario.failure === 'invalid') {
              await expect(save).toBeDisabled()
              const grant = panel.getByRole('textbox', { name: copy.grants.path, exact: true }).first()
              await expect(grant).toHaveAttribute('aria-invalid', 'true')
              await expect(grant).toHaveValue('')
              expect(await page.evaluate(() => window.sandboxFixtureSnapshot().targets)).toEqual([])
            } else {
              await save.click()
              if (scenario.failure === 'save-failed') {
                await expect(panel.getByRole('alert')).toHaveText(copy.error('INVALID_INPUT'))
                expect(await page.evaluate(() => window.sandboxFixtureSnapshot().targets)).toEqual([])
                await expect(name).toHaveValue('Edited original profile — 原始目标')
              } else {
                if (scenario.failure === 'save-unknown') {
                  await expect(panel.getByRole('alert')).toHaveText(copy.unknown('save'))
                  await expect(name).toBeDisabled()
                  expect(await page.evaluate(() => window.sandboxFixtureSnapshot().targets)).toEqual([
                    'original-profile-2',
                  ])
                  await panel.getByRole('button', { name: copy.reconcile, exact: true }).click()
                }
                await expect(panel.getByText(copy.saved, { exact: true })).toBeVisible()
                const snapshot = await page.evaluate(() => window.sandboxFixtureSnapshot())
                expect(snapshot.targets).toEqual(['original-profile-2'])
                expect(snapshot.writeKeys).toHaveLength(1)
                expect(snapshot.writeKeys[0]).not.toBe('missing-key')
                expect(snapshot.profileId).toBe('original-profile-2')
              }
            }
          }
          const geometry = await panel.evaluate((node) => ({
            width: innerWidth,
            page: document.documentElement.scrollWidth,
            content: node.scrollWidth,
            available: node.clientWidth,
          }))
          if (geometry.page > geometry.width + 1 || geometry.content > geometry.available + 1) {
            await page.screenshot({ path: resolve(output, 'overflow.png') })
            console.log({
              locale,
              mode,
              width,
              scenario,
              geometry,
              overflow: await panel.evaluate((node) =>
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
                  .slice(0, 20),
              ),
            })
          }
          expect(geometry.page).toBeLessThanOrEqual(geometry.width + 1)
          expect(geometry.content).toBeLessThanOrEqual(geometry.available + 1)
          if (width === 320)
            await page.screenshot({
              path: resolve(output, `${locale}-${mode}-${scenario.count}-${scenario.failure}.png`),
            })
          await page.evaluate(() => window.releaseSandboxSettings())
          scenarios++
        }
      }
  expect(errors).toEqual([])
  console.log(
    `Sandbox settings verified: ${scenarios} actual Chrome scenarios, original revision/target/key, profile/rule limits, long copy, two locales/themes and five widths.`,
  )
} finally {
  await browser.close()
  await server.stop(true)
}
