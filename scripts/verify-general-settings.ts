import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { generalSettingsCopy } from '../apps/web/src/general-settings-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import type { GeneralSettingsFixtureInput } from '../tests/fixtures/general-settings-browser'
const output = resolve('artifacts/desktop-elements/general-settings')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/general-settings-browser.tsx'),
      name: 'GeneralSettings',
      formats: ['iife'],
      fileName: 'general',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/general.css')).text()
const script = await Bun.file(resolve(output, 'bundle/general.iife.js')).text()
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
        const copy = generalSettingsCopy(locale)
        const suffix =
          locale === 'zh-CN' ? '原始通用设置完整名称'.repeat(16) : ' Original full general setting label'.repeat(16)
        const failures: readonly GeneralSettingsFixtureInput['failure'][] =
          width === 320 && mode === 'dark' ? ['none', 'language-save', 'send-unknown', 'zoom-save'] : ['none']
        for (const failure of failures) {
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;background:var(--lumen-canvas);color:var(--lumen-ink)}.general-settings-fixture{padding:1rem}</style><div id="general-settings-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountGeneralSettings(value), { locale, mode, suffix, failure })
          const title = page.getByRole('region', { name: copy.title + suffix, exact: true })
          await expect(title.getByRole('heading', { level: 2 })).toHaveText(copy.title + suffix)
          await title.focus()
          for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => title.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          for (const name of [copy.language, copy.sending.title, copy.zoom.title]) {
            const legend = page.getByRole('region', { name: name + suffix, exact: true })
            await legend.focus()
            for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => legend.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          }
          const radio = page.getByRole('radio', { name: copy.options[locale] + suffix, exact: true })
          await expect(page.getByRole('radio')).toHaveCount(3)
          await radio.focus()
          await page.keyboard.press(locale === 'en-US' ? 'ArrowRight' : 'ArrowLeft')
          const targetLocale = locale === 'en-US' ? 'zh-CN' : 'en-US'
          const targetCopy = generalSettingsCopy(targetLocale)
          await expect(
            page.getByRole('radio', { name: targetCopy.options[targetLocale] + suffix, exact: true }),
          ).toHaveAttribute('aria-checked', 'true')
          const selectedRadio = page.getByRole('radio', {
            name: targetCopy.options[targetLocale] + suffix,
            exact: true,
          })
          expect(
            await selectedRadio.evaluate(
              (node) => getComputedStyle(node).color !== getComputedStyle(node).backgroundColor,
            ),
          ).toBe(true)
          if (failure === 'language-save') {
            await expect(page.getByRole('alert')).toHaveText(targetCopy.saveError)
            expect(await page.evaluate(() => window.generalLanguageWrites)).toEqual([])
            await page.evaluate(() => window.clearGeneralFailure())
            await page.getByRole('button', { name: targetCopy.retrySave, exact: true }).click()
            await expect(selectedRadio).toBeFocused()
          }
          expect(await page.evaluate(() => window.generalLanguageWrites)).toEqual([
            { key: WEB_LANGUAGE_STORAGE_KEY, value: targetLocale },
          ])
          const sendGroup = page.locator('.hbar-web-general-send-choices')
          await expect(sendGroup.getByRole('button')).toHaveCount(2)
          await page.mouse.move(0, 0)
          const borders = await sendGroup.getByRole('button').evaluateAll((nodes) =>
            nodes.map((node) => ({
              selected: node.getAttribute('aria-pressed') === 'true',
              color: getComputedStyle(node).borderColor,
            })),
          )
          expect(borders.find((item) => item.selected)?.color).not.toBe(borders.find((item) => !item.selected)?.color)
          await sendGroup.getByRole('button').nth(1).click()
          if (failure === 'send-unknown') {
            await expect(page.getByRole('alert')).toHaveText(targetCopy.sending.unknown)
            await page.evaluate(() => window.clearGeneralFailure())
            await page.getByRole('button', { name: targetCopy.sending.retryOriginal, exact: true }).click()
          }
          await expect(sendGroup.getByRole('button').nth(1)).toHaveAttribute('aria-pressed', 'true')
          const writes = await page.evaluate(() => window.generalSendWrites)
          expect(writes[0]).toMatchObject({ behavior: 'modifierEnter', baselineRevision: 4 })
          expect(writes.length).toBe(failure === 'send-unknown' ? 2 : 1)
          if (failure === 'send-unknown') expect(writes[1]).toEqual(writes[0])
          const slider = page.getByRole('slider', { name: targetCopy.zoom.title + suffix, exact: true })
          await slider.focus()
          await page.keyboard.press('End')
          await expect(slider).toHaveValue('2')
          if (failure === 'zoom-save') {
            await expect(page.getByRole('alert')).toHaveText(targetCopy.zoom.saveError)
            await page.evaluate(() => window.clearGeneralFailure())
            await page.getByRole('button', { name: targetCopy.zoom.retrySave, exact: true }).click()
          }
          await expect.poll(() => page.evaluate(() => window.generalZoomWrites.at(-1))).toBe(2)
          await page.getByRole('button', { name: targetCopy.zoom.reset, exact: true }).click()
          await expect(slider).toHaveValue('1')
          await slider.focus()
          await page.keyboard.press('Home')
          await expect(slider).toHaveValue('0.5')
          await expect.poll(() => page.evaluate(() => window.generalZoomWrites.at(-1))).toBe(0.5)
          const overflow = await page.evaluate(() => ({
            width: innerWidth,
            page: document.documentElement.scrollWidth,
            nodes: [...document.querySelectorAll('.hbar-web-general-settings *')]
              .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 12)
              .map((node) => ({
                tag: node.tagName,
                class: node.className,
                width: node.getBoundingClientRect().width,
                min: getComputedStyle(node).minInlineSize,
                overflow: getComputedStyle(node).overflowX,
              })),
          }))
          await Bun.write(resolve(output, 'last-overflow.json'), JSON.stringify(overflow, null, 2))
          expect(overflow.page <= overflow.width + 1).toBe(true)
          if (width === 320 && mode === 'dark')
            await page.screenshot({ path: resolve(output, `${locale}-${failure}-320.png`), fullPage: true })
          scenarios++
          await page.evaluate(() => window.releaseGeneralSettings())
        }
      }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual General settings scenarios passed.`)
} finally {
  await browser.close()
  await server.stop(true)
}
