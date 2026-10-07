import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SessionModelFixtureInput } from '../tests/fixtures/session-model-browser'
import { verifyReadableText } from './support/verify-readable-text'

const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const model: ModelDescriptor = {
  id: 'original/model',
  providerId: 'original',
  providerName: 'Original provider 原始供应商',
  modelId: 'model',
  modelName: 'Original model 原始模型',
  contextWindow: 100000,
  maxOutput: 8000,
  reasoning: true,
  imageInput: false,
  thinkingLevels: [...levels],
  defaultThinkingLevel: 'low',
  hasKey: true,
}
function fixture(locale: 'en-US' | 'zh-CN', mode: 'light' | 'dark' = 'light'): SessionModelFixtureInput {
  return {
    locale,
    mode,
    sessionId: 'a',
    presentation: 'native',
    controls: {
      sessionId: 'a',
      status: 'ready',
      model: {
        sessionId: 'a',
        status: 'configured',
        modelId: model.id,
        model,
        thinkingLevel: 'low',
        revisions: { 'settings:session:a': 1 },
        sources: { model: 'session', thinkingLevel: 'session' },
      },
      usage: null,
      budget: null,
      errors: { model: null, usage: null, budget: null },
    },
    catalog: { sessionId: 'a', status: 'ready', models: [model], error: null, action: { status: 'idle', error: null } },
    copy: {
      outside: locale === 'zh-CN' ? '会话原草稿' : 'Original session draft',
      draft: '原始未发送草稿 — complete original draft',
      suffix: '',
    },
  }
}
const output = resolve('artifacts/desktop-elements/session-thinking')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/session-model-browser.tsx'),
      name: 'SessionThinkingFixture',
      formats: ['iife'],
      fileName: 'thinking',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/thinking.css')).text()
const script = await Bun.file(resolve(output, 'bundle/thinking.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
})
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
let scenarios = 0
async function mount(page: Page, value: SessionModelFixtureInput, width = 1440): Promise<void> {
  await page.goto(server.url.href)
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
    html { font-size:${width < 400 ? 20 : 16}px; } body { margin:0; color:var(--lumen-ink); background:var(--lumen-canvas); }
    .session-model-fixture { display:flex; flex-direction:column; min-inline-size:0; min-block-size:100dvh; padding:1rem; box-sizing:border-box; }
    .session-model-fixture-main { min-inline-size:0; flex:1 1 auto; } .session-model-fixture-main > [data-text-context] { white-space:normal; }
    .session-model-fixture-rail { display:flex; min-inline-size:0; overflow-x:auto; }
  </style><div id="session-model-fixture"></div>`)
  await page.addScriptTag({ content: script })
  await page.evaluate((input) => window.mountSessionModelFixture(input), value)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.modelPicker
    for (const mode of ['light', 'dark'] as const) {
      for (const coarse of [false, true]) {
        const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
        try {
          const page = await context.newPage()
          page.setDefaultTimeout(10000)
          for (const width of [1440, 1100, 900, 390, 320]) {
            const value = fixture(locale, mode)
            await mount(page, value, width)
            const trigger = page.locator('.hbar-composer-thinking-trigger')
            await trigger.click()
            const menu = page.getByRole('dialog', { name: labels.thinking, exact: true })
            const slider = menu.getByRole('slider', { name: labels.thinking, exact: true })
            await expect(menu).toBeVisible()
            await expect(slider).toBeFocused()
            expect(await menu.evaluate((element) => element.parentElement === document.body)).toBe(true)
            expect(await menu.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain('blur')
            await expect(menu.locator('.hbar-composer-thinking-stop')).toHaveCount(7)
            await expect(slider).toHaveValue('2')
            await page.keyboard.press('End')
            await expect(slider).toHaveValue('6')
            await expect(slider).toHaveAttribute('aria-valuetext', labels.thinkingLevel('max'))
            await page.keyboard.press('Escape')
            await expect(menu).toBeHidden()
            await expect(trigger).toBeFocused()
            expect(
              (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
                (call) => call.name === 'session.setThinkingLevel',
              ),
            ).toEqual([])
            await trigger.click()
            await slider.dispatchEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'touch' })
            await page.keyboard.press('Home')
            await expect(slider).toHaveValue('0')
            await page.keyboard.press('Enter')
            await expect
              .poll(
                async () =>
                  (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
                    (call) => call.name === 'session.setThinkingLevel',
                  ).length,
              )
              .toBe(1)
            await expect(slider).toHaveValue('2') // This fixture keeps the explicit original Host projection until updated.
            const bounds = await menu.boundingBox()
            const group = await page.locator('.hbar-composer-model-picker').boundingBox()
            if (!bounds || !group) throw new Error('Missing thinking geometry')
            expect(bounds.x).toBeGreaterThanOrEqual(0)
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
            expect(bounds.y).toBeGreaterThanOrEqual(0)
            expect(bounds.y + bounds.height).toBeLessThan(group.y)
            await page.locator('.hbar-composer-model-trigger').click()
            await expect(menu).toBeHidden()
            await expect(page.getByRole('dialog', { name: labels.title, exact: true })).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(page.getByRole('textbox', { name: value.copy.outside })).toHaveValue(value.copy.draft)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
            await page.evaluate(() => window.releaseSessionModelFixture())
            scenarios++
          }
        } finally {
          await context.close()
        }
      }
    }
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      for (const count of [0, 1, 2, 7]) {
        const value = fixture(locale)
        if (!value.controls.model) throw new Error('Missing configuration')
        const finite = { ...model, thinkingLevels: [...levels.slice(0, count)], defaultThinkingLevel: levels[0] }
        const input: SessionModelFixtureInput = {
          ...value,
          controls: { ...value.controls, model: { ...value.controls.model, model: finite, thinkingLevel: 'off' } },
          catalog: { ...value.catalog, models: [finite] },
        }
        await mount(page, input, 320)
        if (count < 2) await expect(page.locator('.hbar-composer-thinking-trigger')).toHaveCount(0)
        else {
          await page.locator('.hbar-composer-thinking-trigger').click()
          await expect(page.getByRole('slider')).toHaveAttribute('max', `${count - 1}`)
        }
        await page.evaluate(() => window.releaseSessionModelFixture())
        scenarios++
      }
      const value = fixture(locale)
      const longInput: SessionModelFixtureInput = {
        ...value,
        copy: {
          ...value.copy,
          thinkingTitle: labels.thinking.repeat(30),
          thinkingValueSuffix: ' — 完整原始档位 Complete original level'.repeat(20),
        },
      }
      await mount(page, longInput, 320)
      await page.locator('.hbar-composer-thinking-trigger').click()
      const longTitle = longInput.copy.thinkingTitle
      if (!longTitle) throw new Error('Missing long thinking title')
      let menu = page.getByRole('dialog', { name: longTitle, exact: true })
      let slider = menu.getByRole('slider')
      await expect(slider).toBeInViewport()
      const header = menu.getByRole('region')
      await verifyReadableText(header.locator('.hbar-composer-thinking-context'), longTitle, true)
      await verifyReadableText(
        header.locator('.hbar-composer-thinking-value'),
        labels.thinkingLevel('low') + (longInput.copy.thinkingValueSuffix ?? ''),
        true,
      )
      expect(
        await header
          .locator('.hbar-composer-thinking-value')
          .evaluate((element) => element.getBoundingClientRect().width),
      ).toBeGreaterThanOrEqual(await header.evaluate((element) => element.clientWidth / 2))
      await header.focus()
      await page.keyboard.press('End')
      await expect.poll(() => header.evaluate((element) => element.scrollTop + element.scrollLeft)).toBeGreaterThan(0)
      await expect(slider).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: resolve(output, `${locale}-long-label-320.png`) })
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      const deferred: SessionModelFixtureInput = { ...value, writeBehavior: 'defer' }
      await mount(page, deferred)
      await page.locator('.hbar-composer-thinking-trigger').click()
      menu = page.getByRole('dialog', { name: labels.thinking, exact: true })
      slider = menu.getByRole('slider')
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
              (call) => call.name === 'session.setThinkingLevel',
            ).length,
        )
        .toBe(1)
      const pending: SessionModelFixtureInput = {
        ...deferred,
        catalog: { ...deferred.catalog, action: { status: 'submitting', error: null } },
      }
      await page.evaluate((input) => window.updateSessionModelFixture(input), pending)
      await expect(slider).toBeFocused()
      await expect(slider).toHaveAttribute('aria-disabled', 'true')
      await page.keyboard.press('Enter')
      expect(
        (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
          (call) => call.name === 'session.setThinkingLevel',
        ),
      ).toEqual([{ name: 'session.setThinkingLevel', sessionId: 'a', thinkingLevel: 'max' }])
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      const editor = page.getByRole('textbox', { name: value.copy.outside })
      await editor.fill('后续完整草稿 Later complete draft')
      await page.evaluate(() => window.settleSessionModelFixture(true))
      await expect(editor).toBeFocused()
      await expect(editor).toHaveValue('后续完整草稿 Later complete draft')
      await expect(menu).toBeHidden()
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      await mount(page, value)
      await page.locator('.hbar-composer-thinking-trigger').click()
      menu = page.getByRole('dialog', { name: labels.thinking, exact: true })
      slider = menu.getByRole('slider')
      await page.keyboard.press('End')
      await slider.dispatchEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
        keyCode: 229,
        bubbles: true,
      })
      expect(
        (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
          (call) => call.name === 'session.setThinkingLevel',
        ),
      ).toEqual([])
      if (!value.controls.model) throw new Error('Missing original configuration')
      const revised: SessionModelFixtureInput = {
        ...value,
        controls: { ...value.controls, model: { ...value.controls.model, revisions: { 'settings:session:a': 2 } } },
      }
      await page.evaluate((input) => window.updateSessionModelFixture(input), revised)
      await page.keyboard.press('Enter')
      expect(
        (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
          (call) => call.name === 'session.setThinkingLevel',
        ),
      ).toEqual([])
      await expect(slider).toHaveValue('2')
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      await mount(page, value)
      await page.locator('.hbar-composer-thinking-trigger').click()
      await page.keyboard.press('End')
      const requested: SessionModelFixtureInput = {
        ...value,
        sessionId: 'b',
        openRequest: 1,
        controls: {
          ...value.controls,
          sessionId: 'b',
          model: { ...value.controls.model, sessionId: 'b', revisions: { 'settings:session:b': 1 } },
        },
        catalog: { ...value.catalog, sessionId: 'b' },
      }
      await page.evaluate((input) => window.updateSessionModelFixture(input), requested)
      await expect(page.getByRole('dialog', { name: labels.title, exact: true })).toBeVisible()
      await expect(page.getByRole('dialog', { name: labels.thinking, exact: true })).toBeHidden()
      expect(
        (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
          (call) => call.name === 'session.setThinkingLevel',
        ),
      ).toEqual([])
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
    } finally {
      await context.close()
    }
  }
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios }, null, 2))
  console.log(`${scenarios} actual session thinking scenarios passed.`)
} finally {
  await browser.close()
  await server.stop(true)
}
