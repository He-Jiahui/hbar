import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { SchemaPresentationInput } from '../tests/fixtures/schema-presentation-browser'
import { schemaPresentationCopies } from '../tests/fixtures/schema-presentation'

const output = resolve('artifacts/desktop-elements/schema-presentation')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/schema-presentation-browser.tsx'),
      name: 'SchemaPresentation',
      formats: ['iife'],
      fileName: 'schema',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/schema.css')).text()
const script = await Bun.file(resolve(output, 'bundle/schema.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  const mount = async (input: SchemaPresentationInput, width: number) => {
    await page.setViewportSize({ width, height: 900 })
    await page.setContent(
      `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;background:var(--lumen-canvas);color:var(--lumen-ink)}.schema-presentation-fixture{padding:1rem}</style><div id="schema-presentation-fixture"></div>`,
    )
    await page.addScriptTag({ content: script })
    await page.evaluate((value) => window.mountSchemaPresentation(value), input)
    await expect(page.locator('[data-schema-form]')).toHaveCount(input.duplicateForm ? 2 : 1)
  }
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = schemaPresentationCopies[locale]
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        for (const layout of ['rows', 'stacked'] as const) {
          await mount({ locale, mode, layout, count: 3 }, width)
          const field = page.locator('[data-field="field_1"]')
          const input = field.getByRole('textbox', { name: copy.label('field_1'), exact: true })
          await expect(input).toHaveValue('8')
          const id = await input.getAttribute('id')
          if (!id) throw new Error('Missing registered control ID')
          await field.locator('label').click()
          await expect(input).toBeFocused()
          await input.fill('-')
          await expect(input).toHaveValue('-')
          await expect(input).toHaveAttribute('aria-invalid', 'true')
          await expect(input).toHaveAttribute('aria-describedby', `${id}-description ${id}-issue`)
          const feedback = field.getByRole('alert')
          await expect(feedback).toHaveText(copy.error)
          expect(await feedback.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          const rail = field.getByRole('region', { name: copy.label('field_1'), exact: true })
          expect(await rail.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
          await rail.focus()
          for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          await field.getByRole('button', { name: copy.reset, exact: true }).click()
          await expect(input).toHaveValue('8')
          await expect(feedback).toHaveCount(0)
          expect(await page.evaluate(() => window.schemaFixtureIntents)).toEqual([
            { kind: 'set', field: 'field_1', value: '-' },
            { kind: 'reset', field: 'field_1' },
          ])
          await page.evaluate(() => window.setSchemaFixtureVisible(['field_2', 'field_0', 'field_2', 'missing']))
          await expect(page.locator('[data-field]')).toHaveCount(2)
          const original = page.locator('[data-field="field_2"]')
          await original.getByRole('textbox', { name: copy.label('field_2'), exact: true }).fill('later draft 后续草稿')
          await original.getByRole('button', { name: copy.action, exact: true }).click()
          expect(await page.evaluate(() => window.schemaFixtureIntents.at(-1))).toEqual({
            kind: 'set',
            field: 'field_2',
            value: 'later draft 后续草稿',
          })
          expect(await page.evaluate(() => window.schemaFixtureActions)).toEqual(['field_2'])
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320 && mode === 'dark')
            await page.screenshot({ path: resolve(output, `${locale}-${layout}-320.png`), fullPage: true })
          scenarios++
        }
      }
    }
    for (const count of [1, 64]) {
      await mount({ locale, mode: 'dark', layout: 'rows', count, duplicateForm: true }, 320)
      await expect(page.locator('[data-field]')).toHaveCount(count * 2)
      const ids = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id))
      expect(new Set(ids).size).toBe(ids.length)
      const last = page
        .locator('[data-schema-form]')
        .last()
        .locator(`[data-field="field_${count - 1}"]`)
      const lastInput = last.getByRole('textbox', { name: copy.label(`field_${count - 1}`), exact: true })
      await lastInput.fill('capacity draft 容量边界草稿')
      expect(await page.evaluate(() => window.schemaFixtureIntents.at(-1))).toEqual({
        kind: 'set',
        field: `field_${count - 1}`,
        value: 'capacity draft 容量边界草稿',
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      scenarios++
    }
    await mount({ locale, mode: 'light', layout: 'stacked', count: 3, visible: [] }, 320)
    await expect(page.locator('[data-field]')).toHaveCount(0)
    expect(await page.evaluate(() => window.schemaFixtureIntents)).toEqual([])
    scenarios++
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual Desktop Schema presentation scenarios passed.`)
} finally {
  await browser.close()
}
