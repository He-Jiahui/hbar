import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { ComposerModelState, SessionControlsState } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SessionModelFixtureInput } from '../tests/fixtures/session-model-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/session-model')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/session-model-browser.tsx'),
      name: 'SessionModelFixture',
      formats: ['iife'],
      fileName: 'session-model',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/session-model.css')).text()
const script = await Bun.file(resolve(output, 'bundle/session-model.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } }),
})
const model: ComposerModelState['models'][number] = {
  id: 'original/one',
  providerId: 'original',
  providerName: '原始供应商 Original provider',
  modelId: 'one',
  modelName: '原始模型 Original model',
  contextWindow: 100000,
  maxOutput: 8000,
  imageInput: true,
  reasoning: true,
  thinkingLevels: ['low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: true,
}
const alternative = {
  ...model,
  id: 'original/alternative',
  modelId: 'alternative',
  modelName: 'Alternative 可用替代模型',
}
function inputFor(locale: 'en-US' | 'zh-CN', mode: 'light' | 'dark' = 'light'): SessionModelFixtureInput {
  const controls: SessionControlsState = {
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
  }
  return {
    locale,
    mode,
    sessionId: 'a',
    controls,
    catalog: {
      sessionId: 'a',
      status: 'ready',
      models: [model, alternative],
      error: null,
      action: { status: 'idle', error: null },
    },
    presentation: 'web',
    copy: {
      outside: locale === 'zh-CN' ? '会话原草稿' : 'Original session draft',
      draft: '原始未发送草稿 — complete draft',
      suffix: '',
    },
  }
}
async function mount(page: Page, input: SessionModelFixtureInput, width = 1440): Promise<void> {
  await page.goto(server.url.href)
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
    html { font-size: ${width < 400 ? 20 : 16}px; }
    body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
    .session-model-fixture { display:flex; flex-direction:column; min-inline-size:0; min-block-size:100dvh; padding:1rem; box-sizing:border-box; }
    .session-model-fixture-main { min-inline-size:0; flex:1 1 auto; }
    .session-model-fixture-main > [data-text-context] { white-space:normal; }
    .session-model-fixture-rail { display:flex; min-inline-size:0; overflow-x:auto; }
  </style><div id="session-model-fixture"></div>`)
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountSessionModelFixture(value), input)
}
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
let scenarios = 0
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.modelPicker
    for (const mode of ['light', 'dark'] as const) {
      for (const coarse of [false, true]) {
        const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
        try {
          const page = await context.newPage()
          page.setDefaultTimeout(10000)
          const errors: string[] = []
          page.on('pageerror', (error) => errors.push(error.message))
          for (const presentation of ['native', 'web'] as const) {
            for (const width of [1440, 1100, 900, 390, 320]) {
              const base = inputFor(locale, mode)
              if (!base.controls.model) throw new Error('Missing original confirmed model fixture')
              const fullName = '模型完整原始名称 Complete original reasoning model name '.repeat(6).slice(0, 160)
              const initial = {
                ...base,
                presentation,
                controls: {
                  ...base.controls,
                  model: { ...base.controls.model, model: { ...model, modelName: fullName } },
                },
                catalog: {
                  ...base.catalog,
                  models: [
                    { ...model, modelName: fullName },
                    { ...alternative, modelName: fullName },
                  ],
                },
              }
              await mount(page, initial, width)
              const trigger = page.locator('.hbar-composer-model-trigger')
              await verifyReadableText(trigger.locator('[data-text-context="choice.title"]'), fullName, width < 400)
              const menu = page.getByRole('dialog', { name: labels.title, exact: true })
              await trigger.click()
              await expect(menu).toBeVisible()
              await expect(menu).toHaveAttribute('data-presentation', presentation)
              expect(await menu.evaluate((element) => element.parentElement === document.body)).toBe(true)
              expect(await menu.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain('blur')
              await expect(menu.getByRole('option')).toHaveCount(2)
              const first = menu.getByRole('option').first()
              await verifyReadableText(first.locator('[data-text-context="choice.title"]'), fullName, true)
              await verifyReadableText(first.locator('[data-text-context="code.inline"]'), model.modelId)
              const search = menu.getByRole('searchbox', { name: labels.search })
              if (coarse && width <= 640 && presentation === 'web') await expect(menu).toBeFocused()
              else await expect(search).toBeFocused()
              const box = await menu.boundingBox()
              if (!box) throw new Error('Missing model menu bounds')
              expect(box.x).toBeGreaterThanOrEqual(0)
              expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
              expect(box.y).toBeGreaterThanOrEqual(0)
              expect(box.y + box.height).toBeLessThanOrEqual(901)
              if (width > 640 || presentation === 'native') {
                const group = await page.locator('.hbar-composer-model-picker').boundingBox()
                if (!group) throw new Error('Missing original geometry group')
                expect(box.y + box.height).toBeLessThan(group.y)
              }
              const option = menu.getByRole('option').first()
              await option.focus()
              await page.keyboard.press('End')
              await expect(menu.getByRole('option').last()).toBeFocused()
              await page.keyboard.press('Home')
              await expect(option).toBeFocused()
              await page.keyboard.press('Escape')
              await expect(menu).toBeHidden()
              await expect(trigger).toBeFocused()
              await trigger.click()
              // A sheet deliberately covers the composer rail; its Close action
              // precedes switching entries. Anchored menus permit a direct switch.
              if (width <= 640 && presentation === 'web')
                await menu.getByRole('button', { name: labels.close, exact: true }).click()
              await page.locator('.hbar-composer-thinking-trigger').click()
              await expect(menu).toBeHidden()
              await expect(page.getByRole('dialog', { name: labels.thinking, exact: true })).toBeVisible()
              await page.keyboard.press('Escape')
              await trigger.click()
              const outside = page.getByRole('textbox', { name: initial.copy.outside })
              const outsideBounds = await outside.boundingBox()
              const menuBounds = await menu.boundingBox()
              if (!outsideBounds || !menuBounds) throw new Error('Missing open menu and original input bounds')
              const inputCenter = {
                x: outsideBounds.x + outsideBounds.width / 2,
                y: outsideBounds.y + outsideBounds.height / 2,
              }
              if (
                await menu.evaluate(
                  (node, point) => node.contains(document.elementFromPoint(point.x, point.y)),
                  inputCenter,
                )
              ) {
                const point = await menu.evaluate((node, bounds) => {
                  const candidates = [
                    { x: bounds.x / 2, y: innerHeight / 2 },
                    { x: (bounds.x + bounds.width + innerWidth) / 2, y: innerHeight / 2 },
                    { x: innerWidth / 2, y: bounds.y / 2 },
                    { x: innerWidth / 2, y: (bounds.y + bounds.height + innerHeight) / 2 },
                  ]
                  return (
                    candidates.find((candidate) => {
                      const hit = document.elementFromPoint(candidate.x, candidate.y)
                      return hit !== null && !node.contains(hit)
                    }) ?? null
                  )
                }, menuBounds)
                if (!point) throw new Error('Open model menu has no exposed outside click area')
                await page.mouse.click(point.x, point.y)
                await expect(menu).toBeHidden()
              }
              try {
                await outside.click()
              } catch (error) {
                console.error({
                  locale,
                  mode,
                  coarse,
                  presentation,
                  width,
                  trigger: await trigger.boundingBox(),
                  outside: await outside.boundingBox(),
                  menu: await menu.boundingBox(),
                })
                await page.screenshot({ path: resolve(output, 'caption-failure.png') })
                throw error
              }
              await expect(menu).toBeHidden()
              await expect(outside).toBeFocused()
              await expect(outside).toHaveValue(initial.copy.draft)
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
              expect(
                (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter((call) =>
                  call.name.startsWith('session.set'),
                ),
              ).toEqual([])
              if (width === 320 && mode === 'dark' && !coarse)
                await page.screenshot({ path: resolve(output, `${locale}-${presentation}-320.png`) })
              await page.evaluate(() => window.releaseSessionModelFixture())
              scenarios++
            }
          }
          expect(errors).toEqual([])
        } finally {
          await context.close()
        }
      }
    }
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      for (const count of [0, 1, 12, 60, 61, 4096]) {
        const base = inputFor(locale)
        const rows = Array.from({ length: count }, (_, index) => ({
          ...model,
          id: `original/${index}`,
          modelId: `${index}`,
          modelName: `Original ${index} 原始模型`,
        }))
        const value = { ...base, catalog: { ...base.catalog, models: rows } }
        await mount(page, value, 320)
        await page.locator('.hbar-composer-model-trigger').click()
        const menu = page.getByRole('dialog', { name: labels.title, exact: true })
        await expect(menu.getByRole('option')).toHaveCount(Math.min(60, count))
        if (!count) await expect(menu.getByText(labels.empty, { exact: true })).toBeVisible()
        if (count > 60) {
          const list = menu.getByRole('listbox')
          expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
          await menu.getByRole('button', { name: labels.more(count - 60), exact: true }).click()
          await expect.poll(() => menu.getByRole('option').count()).toBeGreaterThan(60)
          await menu.getByRole('searchbox').fill(`Original ${count - 1} 原始模型`)
          await expect(menu.getByRole('option')).toHaveCount(1)
        }
        await page.evaluate(() => window.releaseSessionModelFixture())
        scenarios++
      }
      // Every open-content assertion previously rendered by native Popover SSR
      // now targets a visible body portal with the same Host data.
      const base = inputFor(locale)
      const missing = {
        ...base,
        controls: {
          ...base.controls,
          model: {
            ...base.controls.model!,
            status: 'unavailable' as const,
            modelId: 'removed/provider-model',
            model: null,
            thinkingLevel: null,
          },
        },
      }
      await mount(page, missing)
      await page.locator('.hbar-composer-model-trigger').click()
      let menu = page.getByRole('dialog', { name: labels.title, exact: true })
      await expect(menu.getByText(labels.unavailable('removed/provider-model'), { exact: true })).toBeVisible()
      await expect(menu.getByRole('button', { name: labels.providers, exact: true })).toBeEnabled()
      await expect(menu.getByRole('option').first()).toBeEnabled()
      await expect(menu.locator('[aria-selected="true"]')).toHaveCount(0)
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      const unknown = {
        ...base,
        disabled: true,
        canSelect: false,
        catalog: { ...base.catalog, action: { status: 'unknown' as const, error: 'RESULT_UNKNOWN' } },
      }
      await mount(page, unknown)
      await expect(page.locator('.hbar-composer-model-trigger')).toBeEnabled()
      await page.locator('.hbar-composer-model-trigger').click()
      menu = page.getByRole('dialog', { name: labels.title, exact: true })
      await expect(menu.getByRole('button', { name: labels.reconcile, exact: true })).toBeEnabled()
      await expect(menu.getByRole('option')).toHaveCount(2)
      for (const option of await menu.getByRole('option').all()) await expect(option).toBeDisabled()
      await expect(page.locator('.hbar-composer-thinking-trigger')).toBeDisabled()
      await expect(menu.getByText(labels.unknown, { exact: true })).toBeVisible()
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      const longReason = labels.readFailed.repeat(40)
      const readFailed = {
        ...base,
        readBehavior: 'fail' as const,
        catalog: { ...base.catalog, status: 'error' as const, error: 'PRIVATE_FAILURE' },
        copy: { ...base.copy, suffix: ' — 原标题 Original title'.repeat(15), readFailed: longReason },
      }
      await mount(page, readFailed, 320)
      await page.locator('.hbar-composer-model-trigger').click()
      menu = page.getByRole('dialog', { name: labels.title + readFailed.copy.suffix, exact: true })
      const retry = menu.getByRole('button', { name: labels.retry, exact: true })
      await expect(retry).toBeEnabled()
      await expect(menu).not.toContainText('PRIVATE_FAILURE')
      const reading = menu.locator('.hbar-composer-model-reading')
      await expect(reading.getByText(longReason, { exact: true })).toHaveText(longReason)
      expect(await reading.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      await reading.focus()
      await page.keyboard.press('End')
      await expect
        .poll(() => reading.evaluate((element) => element.scrollTop), {
          message: 'Complete recovery paragraph remains keyboard scrollable',
        })
        .toBeGreaterThan(0)
      const title = menu.locator('.hbar-composer-model-title')
      await verifyReadableText(title, labels.title + readFailed.copy.suffix, true)
      await page.screenshot({ path: resolve(output, `${locale}-long-recovery-320.png`) })
      await menu.getByRole('button', { name: labels.close, exact: true }).click()
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      // A pending selection remains directed at its original ID after collection
      // mutation; closing and editing later must preserve the new focus/draft.
      const deferred = { ...base, writeBehavior: 'defer' as const }
      await mount(page, deferred)
      await page.locator('.hbar-composer-model-trigger').click()
      menu = page.getByRole('dialog', { name: labels.title, exact: true })
      await menu.getByRole('option').last().click()
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
              (call) => call.name === 'session.setModel',
            ).length,
        )
        .toBe(1)
      await menu.getByRole('button', { name: labels.close, exact: true }).click()
      const editor = page.getByRole('textbox', { name: base.copy.outside })
      await editor.fill('后续完整草稿 Later draft')
      await page.evaluate((value) => window.updateSessionModelFixture(value), {
        ...deferred,
        catalog: { ...base.catalog, models: [model] },
      })
      await page.evaluate(() => window.settleSessionModelFixture(true))
      await expect(editor).toBeFocused()
      await expect(editor).toHaveValue('后续完整草稿 Later draft')
      await expect(menu).toBeHidden()
      expect(
        (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
          (call) => call.name === 'session.setModel',
        ),
      ).toEqual([{ name: 'session.setModel', sessionId: 'a', modelId: alternative.id }])
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      const rejected = { ...base, writeBehavior: 'fail' as const }
      await mount(page, rejected)
      await page.locator('.hbar-composer-model-trigger').click()
      menu = page.getByRole('dialog', { name: labels.title, exact: true })
      await menu.getByRole('option').last().click()
      await expect(menu.getByRole('alert')).toHaveText(labels.error('INVALID_INPUT'))
      await menu.getByRole('button', { name: labels.close, exact: true }).click()
      await expect(page.locator('.hbar-composer-model-closed-feedback').getByRole('alert')).toHaveText(
        labels.error('INVALID_INPUT'),
      )
      await expect(page.getByRole('textbox', { name: base.copy.outside })).toHaveValue(base.copy.draft)
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      const retryInput = {
        ...base,
        readBehavior: 'fail' as const,
        catalog: { ...base.catalog, status: 'error' as const, error: 'PRIVATE_FAILURE' },
      }
      await mount(page, retryInput)
      await page.locator('.hbar-composer-model-trigger').click()
      menu = page.getByRole('dialog', { name: labels.title, exact: true })
      const retryDeferred: SessionModelFixtureInput = { ...retryInput, readBehavior: 'defer' }
      await page.evaluate((value) => window.updateSessionModelFixture(value), retryDeferred)
      const reload = menu.getByRole('button', { name: labels.retry, exact: true })
      await reload.click()
      await expect(reload).toHaveAttribute('aria-busy', 'true')
      await expect(reload).toHaveAttribute('aria-disabled', 'true')
      await expect(reload).toBeFocused()
      const reads = (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
        (call) => call.name === 'model.list',
      ).length
      await page.keyboard.press('Enter')
      expect(
        (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter((call) => call.name === 'model.list')
          .length,
      ).toBe(reads)
      const retryReady: SessionModelFixtureInput = { ...base, readBehavior: 'resolve' }
      await page.evaluate((value) => window.updateSessionModelFixture(value), retryReady)
      await page.evaluate(() => window.settleSessionModelFixture(true))
      await expect(reload).toHaveCount(0)
      await expect(menu.getByRole('searchbox', { name: labels.search })).toBeFocused()
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
      await mount(page, deferred)
      await page.locator('.hbar-composer-model-trigger').click()
      menu = page.getByRole('dialog', { name: labels.title, exact: true })
      await menu.getByRole('option').last().click()
      if (!base.controls.model) throw new Error('Missing configured fixture model')
      const nextSession: SessionModelFixtureInput = {
        ...base,
        sessionId: 'b',
        controls: {
          ...base.controls,
          sessionId: 'b',
          model: { ...base.controls.model, sessionId: 'b', revisions: { 'settings:session:b': 1 } },
        },
        catalog: { ...base.catalog, sessionId: 'b' },
      }
      await page.evaluate((value) => window.updateSessionModelFixture(value), nextSession)
      const nextEditor = page.getByRole('textbox', { name: base.copy.outside })
      await nextEditor.fill('另一会话完整草稿 — Later session draft')
      await page.evaluate(() => window.settleSessionModelFixture(false))
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      )
      await expect(nextEditor).toBeFocused()
      await expect(nextEditor).toHaveValue('另一会话完整草稿 — Later session draft')
      await expect(page.locator('.hbar-composer-model-closed-feedback')).toHaveCount(0)
      expect(
        (await page.evaluate(() => window.readSessionModelFixtureCalls())).filter(
          (call) => call.name === 'session.setModel',
        ),
      ).toEqual([{ name: 'session.setModel', sessionId: 'a', modelId: alternative.id }])
      await page.evaluate(() => window.releaseSessionModelFixture())
      scenarios++
    } finally {
      await context.close()
    }
  }
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios }, null, 2))
  console.log(`${scenarios} actual session model browser scenarios passed.`)
} finally {
  await browser.close()
  await server.stop(true)
}
