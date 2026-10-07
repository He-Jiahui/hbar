import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import type { ThinkingFixtureInput, ThinkingFixtureCopy } from '../tests/fixtures/pre-session-thinking-browser'
import { verifyReadableText } from './support/verify-readable-text'

const copies = {
  'en-US': {
    title: 'Thinking choices',
    other: 'Other choices',
    close: 'Close choices',
    error: 'The thinking choice could not be saved. Reopen it to try again.',
    longSuffix: ' — complete original option label 保留完整原文'.repeat(3),
  },
  'zh-CN': {
    title: '推理级别选择',
    other: '其他选项',
    close: '关闭选项',
    error: '推理级别保存失败，重新打开原始选择后可以重试。'.repeat(30),
    longSuffix: ' — 保留完整原始选项名称 complete original label'.repeat(3),
  },
} as const satisfies { readonly 'en-US': ThinkingFixtureCopy; readonly 'zh-CN': ThinkingFixtureCopy }
const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const model: ModelDescriptor = {
  id: 'original-model',
  providerId: 'provider',
  providerName: '原始提供商',
  modelId: 'original',
  modelName: '原始模型',
  contextWindow: 128000,
  maxOutput: 8000,
  imageInput: false,
  reasoning: true,
  thinkingLevels: [...levels],
  defaultThinkingLevel: 'low',
  hasKey: true,
}
const output = resolve('artifacts/desktop-elements/pre-session-thinking')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/pre-session-thinking-browser.tsx'),
      name: 'ThinkingFixture',
      formats: ['iife'],
      fileName: 'thinking-fixture',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/thinking-fixture.css')).text()
const script = await Bun.file(resolve(output, 'bundle/thinking-fixture.iife.js')).text()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const outcomes: {
  readonly case: string
  readonly locale: string
  readonly width: number
  readonly mode: string
  readonly coarse: boolean
}[] = []
async function mount(page: Page, input: ThinkingFixtureInput, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
    html { font-size: ${width < 400 ? 20 : 16}px; }
    body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
    .thinking-fixture { display: flex; min-inline-size: 0; min-block-size: 100dvh; flex-direction: column; padding: 1rem; box-sizing: border-box; }
    .thinking-fixture-main { min-inline-size: 0; flex: 1 1 auto; }
    .thinking-fixture-rail { display: flex; min-inline-size: 0; overflow-x: auto; }
  </style><div id="pre-session-thinking-fixture"></div>`)
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.renderThinkingFixture(value), input)
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = copies[locale]
    const labels = getShellCopy(locale).session.modelPicker
    for (const mode of ['light', 'dark'] as const) {
      for (const coarse of [false, true]) {
        const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
        try {
          const page = await context.newPage()
          page.setDefaultTimeout(10000)
          const errors: string[] = []
          page.on('pageerror', (error) => errors.push(error.message))
          await page.route('**/*', (route) => route.abort())
          for (const width of [1440, 1100, 900, 390, 320]) {
            console.log(`Checking ${locale} ${mode} ${coarse ? 'coarse' : 'fine'} ${width}`)
            const input: ThinkingFixtureInput = { locale, copy, model, level: 'low', mode, behavior: 'resolve' }
            await mount(page, input, width)
            const trigger = page.locator('.hbar-pre-session-thinking-picker > button')
            const picker = page.getByRole('dialog', { name: labels.thinking, exact: true })
            const slider = picker.getByRole('slider', { name: labels.thinking, exact: true })
            await trigger.click()
            await expect(slider).toBeFocused()
            await expect(slider).toHaveAttribute('max', '6')
            await expect(picker.locator('.hbar-composer-thinking-stop')).toHaveCount(7)
            const geometry = await picker.evaluate((element) => {
              const rect = element.getBoundingClientRect()
              const style = getComputedStyle(element)
              return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: innerWidth,
                height: innerHeight,
                portal: element.parentElement === document.body,
                blur: style.backdropFilter,
                layer: Number(style.zIndex),
                alignment: [...element.querySelectorAll('[data-text-context]')].map(
                  (text) => getComputedStyle(text).textAlign,
                ),
              }
            })
            expect(geometry.portal).toBe(true)
            expect(geometry.layer).toBeGreaterThanOrEqual(10000)
            expect(geometry.blur).toMatch(/blur\(/)
            expect(geometry.left).toBeGreaterThanOrEqual(0)
            expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1)
            expect(geometry.top).toBeGreaterThanOrEqual(0)
            expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1)
            expect(geometry.alignment.every((value) => ['left', 'start'].includes(value))).toBe(true)
            await expect(slider).toBeInViewport()
            await expect
              .poll(
                async () => {
                  const hit = await slider.evaluate((element) => {
                    const box = element.getBoundingClientRect()
                    return (
                      element.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element
                    )
                  })
                  return hit
                },
                { message: 'Native thinking range must remain the actual pointer target' },
              )
              .toBe(true)
            const reading = picker.getByRole('region', {
              name: labels.thinkingLevel('low') + copy.longSuffix,
              exact: true,
            })
            if (await reading.evaluate((element) => element.scrollHeight > element.clientHeight)) {
              await reading.focus()
              await page.keyboard.press('End')
              await expect
                .poll(() =>
                  reading.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
                )
                .toBeLessThanOrEqual(1)
            }
            const lastGlyph = await reading.evaluate((element) => {
              const title = element.querySelector('[data-text-context="choice.title"]')
              if (!title) throw new Error('Missing original option text')
              const text = title.lastChild
              const length = text?.textContent?.length ?? 0
              if (!text || text.nodeType !== Node.TEXT_NODE || length === 0)
                throw new Error('Missing original option text node')
              const range = element.ownerDocument.createRange()
              range.setStart(text, length - 1)
              range.setEnd(text, length)
              const end = range.getBoundingClientRect()
              const bounds = element.getBoundingClientRect()
              return {
                top: end.top,
                bottom: end.bottom,
                start: bounds.top,
                end: bounds.bottom,
                scroll: element.scrollTop,
                height: element.clientHeight,
                full: element.scrollHeight,
              }
            })
            expect(lastGlyph.top, `Original option last glyph: ${JSON.stringify(lastGlyph)}`).toBeGreaterThanOrEqual(
              lastGlyph.start - 1,
            )
            expect(lastGlyph.bottom, `Original option last glyph: ${JSON.stringify(lastGlyph)}`).toBeLessThanOrEqual(
              lastGlyph.end + 1,
            )
            await slider.focus()
            await slider.press('End')
            await expect(slider).toHaveAttribute('aria-valuetext', labels.thinkingLevel('max') + copy.longSuffix)
            await expect(picker.locator('[data-text-context="choice.title"]')).toHaveText(
              labels.thinkingLevel('max') + copy.longSuffix,
            )
            await slider.press('Escape')
            await expect(picker).toBeHidden()
            await expect(trigger).toBeFocused()
            expect(await page.evaluate(() => window.readThinkingFixtureActions())).toEqual([])
            await trigger.click()
            await slider.press('End')
            await slider.press('Enter')
            await expect(picker).toBeHidden()
            await expect(trigger).toBeFocused()
            expect(await page.evaluate(() => window.readThinkingFixtureActions())).toEqual([
              { level: 'max', modelId: model.id },
            ])
            const confirmed: ThinkingFixtureInput = { ...input, level: 'max' }
            await page.evaluate((value) => window.renderThinkingFixture(value), confirmed)
            await trigger.click()
            await trigger.click()
            await expect(picker).toBeHidden()
            await trigger.click()
            await page.locator('body').click({ position: { x: 2, y: 2 } })
            await expect(picker).toBeHidden()
            await trigger.click()
            await page.getByRole('button', { name: copy.other, exact: true }).click()
            await expect(picker).toBeHidden()
            const other = page.getByRole('dialog', { name: copy.other, exact: true })
            await expect(other).toBeVisible()
            await expect(page.locator('[data-lumen-floating-surface]:visible')).toHaveCount(1)
            await other.getByRole('button', { name: copy.close, exact: true }).click()
            if ((width === 1440 || width === 320) && !coarse) {
              await trigger.click()
              await picker
                .getByRole('region', { name: labels.thinkingLevel('max') + copy.longSuffix, exact: true })
                .focus()
              await page.keyboard.press('End')
              await expect
                .poll(() =>
                  picker
                    .getByRole('region', { name: labels.thinkingLevel('max') + copy.longSuffix, exact: true })
                    .evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
                )
                .toBeLessThanOrEqual(1)
              await expect(slider).toBeInViewport()
              await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
            expect(errors).toEqual([])
            outcomes.push({ case: 'long-option-focus-keyboard-surfaces', locale, width, mode, coarse })
            await page.evaluate(() => window.releaseThinkingFixture())
          }
        } finally {
          await context.close()
        }
      }
    }
  }
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.route('**/*', (route) => route.abort())
    const locale = 'zh-CN'
    const copy = copies[locale]
    const labels = getShellCopy(locale).session.modelPicker
    for (const count of [0, 1, 3, 7]) {
      const input: ThinkingFixtureInput = {
        locale,
        copy,
        model: { ...model, thinkingLevels: levels.slice(0, count) },
        level: null,
        mode: 'dark',
        behavior: 'resolve',
      }
      await mount(page, input, 320)
      const trigger = page.locator('.hbar-pre-session-thinking-picker > button')
      if (count < 2) await expect(trigger).toHaveCount(0)
      else {
        await trigger.click()
        const picker = page.getByRole('dialog', { name: labels.thinking, exact: true })
        await expect(picker.getByRole('slider')).toHaveAttribute('max', String(count - 1))
        await expect(picker.locator('.hbar-composer-thinking-stop')).toHaveCount(count)
      }
      outcomes.push({ case: `capacity-${count}`, locale, width: 320, mode: 'dark', coarse: false })
      await page.evaluate(() => window.releaseThinkingFixture())
    }
    for (const result of ['success', 'failure'] as const) {
      console.log(`Checking original target ${result}`)
      const input: ThinkingFixtureInput = { locale, copy, model, level: 'low', mode: 'dark', behavior: 'defer' }
      await mount(page, input, 320)
      const trigger = page.locator('.hbar-pre-session-thinking-picker > button')
      const picker = page.getByRole('dialog', { name: labels.thinking, exact: true })
      await trigger.click()
      await picker.getByRole('slider').press('End')
      await picker.getByRole('slider').press('Enter')
      await expect(trigger).toHaveAttribute('aria-busy', 'true')
      const replacement: ThinkingFixtureInput = {
        ...input,
        model: { ...model, id: 'replacement-model', thinkingLevels: ['low', 'high'] },
      }
      await page.evaluate((value) => window.renderThinkingFixture(value), replacement)
      await expect(picker).toBeHidden()
      expect(await page.evaluate(() => window.readThinkingFixtureActions())).toEqual([
        { level: 'max', modelId: 'original-model' },
      ])
      await page.getByRole('button', { name: copy.other, exact: true }).click()
      const other = page.getByRole('dialog', { name: copy.other, exact: true })
      await other.getByRole('button', { name: copy.close, exact: true }).focus()
      await page.evaluate((value) => window.settleThinkingFixture(value), result)
      await expect(trigger).not.toHaveAttribute('aria-busy', 'true')
      await expect(other).toBeVisible()
      await expect(other.getByRole('button', { name: copy.close, exact: true })).toBeFocused()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await other.getByRole('button', { name: copy.close, exact: true }).click()
      const retry: ThinkingFixtureInput = { ...input, behavior: 'resolve' }
      await page.evaluate((value) => window.renderThinkingFixture(value), retry)
      if (result === 'failure') await expect(page.getByRole('alert')).toHaveText(copy.error)
      await trigger.click()
      await picker.getByRole('slider').press('End')
      await picker.getByRole('slider').press('Enter')
      await expect(picker).toBeHidden()
      await expect(page.getByRole('alert')).toHaveCount(0)
      outcomes.push({
        case: `original-id-${result}-later-focus-retry`,
        locale,
        width: 320,
        mode: 'dark',
        coarse: false,
      })
      await page.evaluate(() => window.releaseThinkingFixture())
    }
    const thrown: ThinkingFixtureInput = { locale, copy, model, level: 'low', mode: 'light', behavior: 'throw' }
    await mount(page, thrown, 320)
    await page.locator('.hbar-pre-session-thinking-picker > button').click()
    const picker = page.getByRole('dialog', { name: labels.thinking, exact: true })
    await picker.getByRole('slider').press('End')
    await picker.getByRole('slider').press('Enter')
    await expect(picker.getByRole('alert')).toHaveText(copy.error)
    const reading = picker.getByRole('region', { name: labels.thinking, exact: true })
    expect(await reading.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await reading.focus()
    await page.keyboard.press('End')
    await expect.poll(() => reading.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alert')).toHaveText(copy.error)
    outcomes.push({ case: 'synchronous-failure-full-reading', locale, width: 320, mode: 'light', coarse: false })
    await page.evaluate(() => window.releaseThinkingFixture())
  } finally {
    await context.close()
  }
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.modelPicker
    const copy = {
      ...copies[locale],
      pickerTitleSuffix: ' 完整原始推理标题 Complete original thinking heading '.repeat(12),
    }
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      const input: ThinkingFixtureInput = { locale, copy, model, level: 'low', mode: 'dark', behavior: 'resolve' }
      await mount(page, input, 320)
      await page.locator('.hbar-pre-session-thinking-picker > button').click()
      const picker = page.getByRole('dialog', { name: labels.thinking + copy.pickerTitleSuffix, exact: true })
      await verifyReadableText(
        picker.locator('[data-text-context="popover.title"]'),
        labels.thinking + copy.pickerTitleSuffix,
        true,
      )
      const slider = picker.getByRole('slider')
      await expect(slider).toBeInViewport()
      await slider.focus()
      await slider.press('End')
      await slider.press('Enter')
      await expect(picker).toBeHidden()
      expect(await page.evaluate(() => window.readThinkingFixtureActions())).toEqual([
        { level: 'max', modelId: model.id },
      ])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.evaluate(() => window.releaseThinkingFixture())
      outcomes.push({ case: 'complete-multiline-thinking-title', locale, width: 320, mode: 'dark', coarse: false })
    } finally {
      await context.close()
    }
  }
  await Bun.write(resolve(output, 'verification.json'), JSON.stringify(outcomes, null, 2) + '\n')
  console.log(`${outcomes.length} real browser pre-session thinking scenarios passed.`)
} finally {
  await browser.close()
}
