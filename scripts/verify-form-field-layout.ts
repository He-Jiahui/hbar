import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { FormLayoutFixtureInput } from '../tests/fixtures/form-field-layout-browser'

const copies = {
  'zh-CN': {
    label: '完整原始字段标签'.repeat(18),
    help: '说明保持自然换行并属于此字段。'.repeat(8),
    context: '来自原会话设置与版本。'.repeat(5),
    error: '保留原始无效草稿，错误属于本字段。'.repeat(5),
    reset: '恢复保存值',
    value: '完整原始草稿',
  },
  'en-US': {
    label: 'Complete original field caption '.repeat(18),
    help: 'The full description belongs to this field and wraps in normal flow. '.repeat(8),
    context: 'Owned by original session settings and revision. '.repeat(5),
    error: 'Preserve the original invalid draft and its local error. '.repeat(5),
    reset: 'Use saved value',
    value: 'Complete original draft',
  },
}
const output = resolve('artifacts/desktop-elements/form-field-layout')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/form-field-layout-browser.tsx'),
      name: 'FormLayoutFixture',
      formats: ['iife'],
      fileName: 'field',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/field.css')).text()
const script = await Bun.file(resolve(output, 'bundle/field.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      const context = await browser.newContext({ reducedMotion: 'reduce' })
      try {
        const page = await context.newPage()
        page.on('pageerror', (reason) => errors.push(reason.message))
        for (const width of [1440, 1100, 900, 390, 320]) {
          for (const layout of ['rows', 'stacked'] as const) {
            await page.setViewportSize({ width, height: 900 })
            await page.setContent(
              `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;background:var(--lumen-canvas);color:var(--lumen-ink)}.form-layout-fixture{padding:1rem}.form-layout-controls{display:flex;min-inline-size:0;flex-direction:column;gap:.375rem;align-items:flex-start}.form-layout-controls > .lumen-field{inline-size:100%}</style><div id="form-layout-fixture"></div>`,
            )
            const input: FormLayoutFixtureInput = { layout, mode, copy: copies[locale] }
            await page.addScriptTag({ content: script })
            await page.evaluate((value) => window.mountFormLayoutFixture(value), input)
            const control = page.getByRole('textbox', { name: input.copy.label, exact: true })
            await expect(control).toHaveValue(input.copy.value)
            await expect(control).toHaveAttribute(
              'aria-describedby',
              'registered-original-control-description registered-original-control-error',
            )
            await expect(control).toHaveAttribute('aria-invalid', 'true')
            const rail = page.getByRole('region', { name: input.copy.label, exact: true })
            expect(await rail.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
            await rail.focus()
            for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            await control.fill('later original draft 后续原草稿')
            await expect(control).toHaveValue('later original draft 后续原草稿')
            await page.getByRole('button', { name: input.copy.reset, exact: true }).click()
            await expect(control).toHaveValue(input.copy.value)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
            for (const id of ['registered-original-control-description', 'registered-original-control-error']) {
              const text = page.locator(`[id="${id}"]`)
              expect(
                await text.evaluate(
                  (node) => node.scrollWidth <= node.clientWidth + 1 && getComputedStyle(node).whiteSpace !== 'nowrap',
                ),
              ).toBe(true)
            }
            const copy = page.locator('[data-lumen-field-region="copy"]')
            const controls = page.locator('[data-lumen-field-region="controls"]')
            const a = await copy.boundingBox()
            const b = await controls.boundingBox()
            if (!a || !b) throw new Error('Field regions are not visible')
            if (layout === 'rows' && width >= 900) expect(b.x).toBeGreaterThan(a.x + a.width - 1)
            else expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1)
            if (width === 320 && mode === 'dark')
              await page.screenshot({ path: resolve(output, `${locale}-${layout}-320.png`), fullPage: true })
            scenarios++
          }
        }
      } finally {
        await context.close()
      }
    }
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual public form layout scenarios passed.`)
} finally {
  await browser.close()
}
