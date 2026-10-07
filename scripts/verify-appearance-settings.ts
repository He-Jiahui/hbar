import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { selectLumenOption } from '../e2e/support/lumen-controls'
import type { AppearanceSettingsFixtureInput } from '../tests/fixtures/appearance-settings-browser'

const output = resolve('artifacts/desktop-elements/appearance-settings')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/appearance-settings-browser.tsx'),
      name: 'AppearanceSettings',
      formats: ['iife'],
      fileName: 'appearance',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/appearance.css')).text()
const script = await Bun.file(resolve(output, 'bundle/appearance.iife.js')).text()
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
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const copy = getShellCopy(locale).appearance
        const suffix =
          locale === 'zh-CN' ? '原始外观设置完整名称'.repeat(12) : ' Original full appearance setting label'.repeat(12)
        const failures: readonly AppearanceSettingsFixtureInput['failure'][] =
          width === 320 && mode === 'dark'
            ? ['none', 'loading', 'restore-error', 'save-conflict', 'save-unknown', 'reset-conflict']
            : ['none']
        for (const failure of failures) {
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;background:var(--lumen-canvas);color:var(--lumen-ink)}.appearance-settings-fixture{padding:1rem}</style><div id="appearance-settings-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((input) => window.mountAppearanceSettings(input), { locale, mode, suffix, failure })
          const form = page.locator('.hbar-web-appearance-settings')
          const title = form.getByRole('region', { name: copy.title + suffix, exact: true })
          const legend = form.getByRole('region', { name: copy.theme.label + suffix, exact: true })
          const preview = form.getByRole('region', { name: copy.preview.title + suffix, exact: true })
          const previewTitle = preview.getByRole('group', { name: copy.preview.title + suffix, exact: true })
          for (const reading of [title, legend, previewTitle]) {
            await expect(reading).toBeVisible()
            await reading.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
            await expect
              .poll(() => reading.evaluate((node) => node.scrollLeft), {
                message: `${locale} ${mode} ${width} ${failure}: reading ${await reading.getAttribute('role')}`,
              })
              .toBeGreaterThan(0)
          }
          await expect(title.getByRole('heading', { level: 2 })).toHaveText(copy.title + suffix)
          await expect(preview.getByRole('heading', { level: 3 })).toHaveText(copy.preview.title + suffix)
          const themes = form.getByRole('radiogroup', { name: copy.theme.label + suffix, exact: true })
          await expect(themes.getByRole('radio')).toHaveCount(3)
          await expect(form.getByRole('combobox')).toHaveCount(4)
          const save = form.getByRole('button', { name: copy.save + suffix, exact: true })
          const reset = form.getByRole('button', { name: copy.reset + suffix, exact: true })
          if (failure === 'loading' || failure === 'restore-error') {
            await expect(save).toBeDisabled()
            await expect(reset).toBeDisabled()
            await expect(themes.getByRole('radio').nth(0)).toBeDisabled()
            expect((await page.evaluate(() => window.appearanceSettingsSnapshot())).writes).toEqual([])
            if (failure === 'loading') await page.evaluate(() => window.resolveAppearanceLoading())
            else {
              await expect(form.getByRole('alert')).toHaveText(copy.restoreError('INVALID_PERSISTED_STATE'))
              await form.getByRole('button', { name: copy.check, exact: true }).click()
            }
            await expect(themes.getByRole('radio').nth(0)).toBeEnabled()
          }
          const targetTheme = mode === 'dark' ? 'light' : 'dark'
          await themes.getByRole('radio', { name: copy.theme.system + suffix, exact: true }).focus()
          await page.keyboard.press(targetTheme === 'dark' ? 'End' : 'ArrowRight')
          const selected = themes.getByRole('radio', { name: copy.theme[targetTheme] + suffix, exact: true })
          await expect(selected).toBeFocused()
          await expect(selected).toHaveAttribute('aria-checked', 'true')
          await expect(preview).toHaveAttribute('data-lumen-mode', targetTheme)
          const control = form.getByRole('combobox', { name: copy.controlSize.label + suffix, exact: true })
          await selectLumenOption(control, 'l')
          await expect(preview).toHaveAttribute('data-lumen-control-size', 'l')
          const actions = form.getByRole('toolbar', { name: copy.title + suffix, exact: true })
          await actions.focus()
          for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
          await expect
            .poll(() => actions.evaluate((node) => node.scrollLeft), {
              message: `${locale} ${mode} ${width} ${failure}: save toolbar`,
            })
            .toBeGreaterThan(0)
          await save.click()
          if (failure === 'save-conflict' || failure === 'save-unknown') {
            await expect(form.getByRole('alert')).toHaveText(failure === 'save-unknown' ? copy.unknown : copy.conflict)
            await expect(selected).toBeDisabled()
            const original = await page.evaluate(() => window.appearanceSettingsSnapshot())
            expect(original.writes).toEqual([
              { operation: 'set', key: 'theme', value: targetTheme, expectedRevision: 4 },
            ])
            await form.getByRole('button', { name: copy.check, exact: true }).click()
            expect((await page.evaluate(() => window.appearanceSettingsSnapshot())).writes).toEqual(original.writes)
            await expect(form.getByText(copy.partial(1, 2), { exact: true })).toBeVisible()
            const recovery = form.getByRole('toolbar', { name: copy.continueDraft + suffix, exact: true })
            await recovery.focus()
            for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
            await expect
              .poll(() => recovery.evaluate((node) => node.scrollLeft), {
                message: `${locale} ${mode} ${width} ${failure}: recovery toolbar`,
              })
              .toBeGreaterThan(0)
            await recovery.getByRole('button', { name: copy.continueDraft + suffix, exact: true }).click()
            await save.click()
          }
          await expect(form.getByText(copy.saved, { exact: true })).toBeVisible()
          const saved = await page.evaluate(() => window.appearanceSettingsSnapshot())
          expect(saved.preferences.values).toMatchObject({
            theme: targetTheme,
            'appearance.controlSize': 'l',
            otherModule: 'original-unrelated-value',
          })
          expect(saved.writes.map((write) => write.key)).toEqual(['theme', 'appearance.controlSize'])
          await reset.click()
          if (failure === 'reset-conflict') {
            await expect(form.getByRole('alert')).toHaveText(copy.conflict)
            const original = await page.evaluate(() => window.appearanceSettingsSnapshot())
            await form.getByRole('button', { name: copy.check, exact: true }).click()
            expect((await page.evaluate(() => window.appearanceSettingsSnapshot())).writes).toEqual(original.writes)
            await expect(form.getByText(copy.resetConflict, { exact: true })).toBeVisible()
            await form.getByRole('button', { name: copy.acceptCurrent + suffix, exact: true }).click()
            await reset.click()
          }
          await expect(themes.getByRole('radio', { name: copy.theme.system + suffix, exact: true })).toHaveAttribute(
            'aria-checked',
            'true',
          )
          const final = await page.evaluate(() => window.appearanceSettingsSnapshot())
          expect(final.preferences.values).toEqual({ otherModule: 'original-unrelated-value' })
          expect(final.writes.map((write) => write.key)).toEqual([
            'theme',
            'appearance.controlSize',
            'theme',
            'appearance.controlSize',
          ])
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
          if (width === 320 && mode === 'dark')
            await page.screenshot({ path: resolve(output, `${locale}-${failure}-320.png`), fullPage: true })
          scenarios++
          await page.evaluate(() => window.releaseAppearanceSettings())
        }
      }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual Appearance settings scenarios passed.`)
} finally {
  await browser.close()
  await server.stop(true)
}
