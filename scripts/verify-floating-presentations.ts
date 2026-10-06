import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { FloatingResponsivePresentation } from '@lumen/app-ui'

const copyByLocale = {
  'en-US': {
    title: 'Model choices',
    open: 'Choose model',
    search: 'Search models',
    close: 'Close choices',
    other: 'Other choices',
    detail: 'Original model description and supporting content — 保留全文。'.repeat(70),
  },
  'zh-CN': {
    title: '模型选择',
    open: '选择模型',
    search: '搜索模型',
    close: '关闭选项',
    other: '其他选项',
    detail: '原始模型说明与宿主辅助内容 — Keep original content. '.repeat(70),
  },
} as const
const output = resolve('artifacts/desktop-elements/floating-presentations')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/floating-presentation-browser.tsx'),
      name: 'FloatingPresentationFixture',
      formats: ['iife'],
      fileName: 'floating-presentation',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const stylesheet = await Bun.file(resolve(output, 'bundle/floating-presentation.css')).text()
const browserScript = await Bun.file(resolve(output, 'bundle/floating-presentation.iife.js')).text()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const scenarios: {
  locale: string
  mode: string
  width: number
  coarse: boolean
  presentation: FloatingResponsivePresentation
  sheet: boolean
}[] = []
try {
  for (const [locale, copy] of Object.entries(copyByLocale)) {
    for (const mode of ['light', 'dark'] as const) {
      for (const coarse of [false, true]) {
        for (const presentation of ['auto', 'anchored', 'narrow-sheet'] as const) {
          const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
          try {
            const page = await context.newPage()
            const errors: string[] = []
            page.on('pageerror', (error) => errors.push(error.message))
            await page.route('**/*', (route) => route.abort())
            for (const width of [1440, 1100, 900, 390, 320]) {
              await page.setViewportSize({ width, height: 900 })
              await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style><style>
                html { font-size: ${width < 400 ? 20 : 16}px; }
                body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
                .floating-fixture { display: flex; min-inline-size: 0; min-block-size: 100dvh; flex-direction: column; padding: 1rem; box-sizing: border-box; }
                .floating-fixture-main { min-inline-size: 0; flex: 1 1 auto; }
                .floating-fixture-controls, .floating-fixture-heading { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
                .floating-fixture-popup { inline-size: min(22.5rem, calc(100vw - 2rem)); gap: .5rem; padding: .5rem; }
                .floating-fixture-heading { flex: 0 0 auto; }
                .floating-fixture-heading > [data-text-context] { flex: 1 1 auto; }
                .floating-fixture-popup > input { flex: 0 0 auto; }
                .floating-fixture-reading { min-block-size: 0; overflow: auto; }
              </style><div id="floating-presentation-fixture"></div>`)
              await page.addScriptTag({ content: browserScript })
              await page.evaluate((input) => window.renderFloatingPresentationFixture(input), {
                copy,
                presentation,
                mode,
              })
              expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse)
              const trigger = page.getByRole('button', { name: copy.open, exact: true })
              const popup = page.getByRole('dialog', { name: copy.title, exact: true })
              const search = page.getByRole('searchbox', { name: copy.search, exact: true })
              const sheet = width < 400 && (presentation === 'narrow-sheet' || (presentation === 'auto' && coarse))
              await trigger.click()
              await expect(popup).toBeVisible()
              if (sheet) await expect(popup).toHaveAttribute('data-mobile-sheet', 'true')
              else await expect(popup).not.toHaveAttribute('data-mobile-sheet', 'true')
              if (sheet && coarse) await expect(popup).toBeFocused()
              else await expect(search).toBeFocused()
              const geometry = await popup.evaluate((element) => {
                const box = element.getBoundingClientRect()
                const style = getComputedStyle(element)
                return {
                  left: box.left,
                  right: box.right,
                  top: box.top,
                  bottom: box.bottom,
                  viewportWidth: innerWidth,
                  viewportHeight: innerHeight,
                  portal: element.parentElement === document.body,
                  layer: Number(style.zIndex),
                  blur: style.backdropFilter,
                }
              })
              expect(geometry.portal).toBe(true)
              expect(geometry.layer).toBeGreaterThanOrEqual(10_000)
              expect(geometry.blur).toMatch(/blur\(/)
              expect(geometry.left).toBeGreaterThanOrEqual(0)
              expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1)
              expect(geometry.top).toBeGreaterThanOrEqual(0)
              expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
              if (sheet) expect(Math.abs(geometry.bottom - geometry.viewportHeight)).toBeLessThanOrEqual(1)
              else expect(geometry.bottom).toBeLessThan(geometry.viewportHeight - 1)
              const reading = popup.getByRole('region', { name: copy.detail, exact: true })
              await expect(reading.getByText(copy.detail, { exact: true })).toHaveText(copy.detail)
              expect(await reading.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
              await reading.focus()
              await page.keyboard.press('End')
              await expect.poll(() => reading.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
              await page.keyboard.press('Escape')
              await expect(popup).toBeHidden()
              await expect(trigger).toBeFocused()
              await trigger.click()
              if (sheet) await popup.getByRole('button', { name: copy.close, exact: true }).click()
              else await trigger.click()
              await expect(popup).toBeHidden()
              await trigger.click()
              await page.locator('body').click({ position: { x: 2, y: 2 } })
              await expect(popup).toBeHidden()
              await trigger.click()
              await page.getByRole('button', { name: copy.other, exact: true }).click()
              await expect(popup).toBeHidden()
              const second = page.getByRole('dialog', { name: copy.other, exact: true })
              await expect(second).toBeVisible()
              await expect(page.locator('[data-lumen-floating-surface]:visible')).toHaveCount(1)
              await second.getByRole('button', { name: copy.close, exact: true }).click()
              if (width === 1440 || width === 320) {
                await trigger.click()
                await page.screenshot({
                  path: resolve(output, `${locale}-${mode}-${coarse ? 'coarse' : 'fine'}-${presentation}-${width}.png`),
                })
              }
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
              expect(errors).toEqual([])
              scenarios.push({ locale, mode, width, coarse, presentation, sheet })
              await page.evaluate(() => window.releaseFloatingPresentationFixture())
            }
          } finally {
            await context.close()
          }
        }
      }
    }
  }
  await Bun.write(resolve(output, 'verification.json'), JSON.stringify(scenarios, null, 2) + '\n')
  console.log(`${scenarios.length} real browser floating presentation scenarios passed.`)
} finally {
  await browser.close()
}
