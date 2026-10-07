import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { ChoiceFixtureCopy, ChoiceFixtureInput } from '../tests/fixtures/pre-session-choice-browser'

const copyByLocale = {
  'en-US': {
    title: 'Model choices',
    trigger: 'Choose model',
    search: 'Search models',
    clearSearch: 'Clear model search',
    empty: 'No models',
    noMatches: 'No matching models',
    more: 'More models',
    close: 'Close choices',
    error: 'The model choice could not be saved. Open the choices to try again.',
    other: 'Other choices',
  },
  'zh-CN': {
    title: '模型选择',
    trigger: '选择模型',
    search: '搜索模型',
    clearSearch: '清除模型搜索',
    empty: '没有模型',
    noMatches: '没有匹配模型',
    more: '更多模型',
    close: '关闭选择',
    error: '模型选择保存失败。重新打开选项后可以重试，原始选择和内容保持可读。',
    other: '其他选项',
  },
} as const satisfies { readonly 'en-US': ChoiceFixtureCopy; readonly 'zh-CN': ChoiceFixtureCopy }
const output = resolve('artifacts/desktop-elements/pre-session-choices')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/pre-session-choice-browser.tsx'),
      name: 'ChoiceFixture',
      formats: ['iife'],
      fileName: 'choice-fixture',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const stylesheet = await Bun.file(resolve(output, 'bundle/choice-fixture.css')).text()
const browserScript = await Bun.file(resolve(output, 'bundle/choice-fixture.iife.js')).text()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const outcomes: {
  readonly case: string
  readonly locale: string
  readonly width: number
  readonly mode: string
  readonly presentation: string
  readonly coarse: boolean
}[] = []
async function mount(page: Page, input: ChoiceFixtureInput, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style><style>
    html { font-size: ${width < 400 ? 20 : 16}px; }
    body { margin: 0; color: var(--lumen-ink); background: var(--lumen-canvas); }
    .choice-fixture { display: flex; min-inline-size: 0; min-block-size: 100dvh; flex-direction: column; padding: 1rem; box-sizing: border-box; }
    .choice-fixture-main { min-inline-size: 0; flex: 1 1 auto; }
    .choice-fixture-rail { display: flex; min-inline-size: 0; overflow-x: auto; }
  </style><div id="pre-session-choice-fixture"></div>`)
  await page.addScriptTag({ content: browserScript })
  await page.evaluate((value) => window.renderChoiceFixture(value), input)
}
try {
  for (const [locale, copy] of Object.entries(copyByLocale)) {
    const modelName = `${locale === 'zh-CN' ? '完整推理模型名称' : 'Complete reasoning model name'} — 保留原文 `.repeat(
      4,
    )
    const detail = `${locale === 'zh-CN' ? '宿主模型说明' : 'Host model detail'} — long supporting content `.repeat(8)
    const choices = Array.from({ length: 61 }, (_, index) => ({
      id: `original-model-${index}`,
      label: `${modelName} ${index}`,
      detail,
      searchText: `search-key-${index}`,
      group: {
        id: index < 30 ? 'provider-a' : 'provider-b',
        label: index < 30 ? '提供商甲 · Provider A' : '提供商乙 · Provider B',
      },
    }))
    for (const mode of ['light', 'dark'] as const) {
      for (const presentation of ['native', 'web'] as const) {
        for (const coarse of [false, true]) {
          const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
          try {
            const page = await context.newPage()
            page.setDefaultTimeout(10_000)
            const errors: string[] = []
            page.on('pageerror', (error) => errors.push(error.message))
            await page.route('**/*', (route) => route.abort())
            for (const width of [1440, 1100, 900, 390, 320]) {
              const input: ChoiceFixtureInput = {
                copy,
                choices,
                selectedId: 'original-model-60',
                mode,
                presentation,
                placement: 'composer',
                behavior: 'resolve',
              }
              console.log(`Checking ${locale} ${mode} ${presentation} ${coarse ? 'coarse' : 'fine'} ${width}`)
              await mount(page, input, width)
              const trigger = page.locator('.hbar-pre-session-choice-picker > button')
              const picker = page.getByRole('dialog', { name: copy.title, exact: true })
              const search = picker.getByRole('searchbox', { name: copy.search, exact: true })
              await trigger.click()
              await expect(picker).toBeVisible()
              const sheet = width < 400 && presentation === 'web'
              if (sheet) await expect(picker).toHaveAttribute('data-mobile-sheet', 'true')
              else await expect(picker).not.toHaveAttribute('data-mobile-sheet', 'true')
              if (sheet && coarse) await expect(picker).toBeFocused()
              else await expect(search).toBeFocused()
              const geometry = await picker.evaluate((element) => {
                const box = element.getBoundingClientRect()
                const style = getComputedStyle(element)
                return {
                  left: box.left,
                  right: box.right,
                  top: box.top,
                  bottom: box.bottom,
                  width: innerWidth,
                  height: innerHeight,
                  portal: element.parentElement === document.body,
                  layer: Number(style.zIndex),
                  blur: style.backdropFilter,
                }
              })
              expect(geometry.portal).toBe(true)
              expect(geometry.layer).toBeGreaterThanOrEqual(10_000)
              expect(geometry.blur).toMatch(/blur\(/)
              expect(geometry.left).toBeGreaterThanOrEqual(0)
              expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1)
              expect(geometry.top).toBeGreaterThanOrEqual(0)
              expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1)
              if (sheet) expect(Math.abs(geometry.bottom - geometry.height)).toBeLessThanOrEqual(1)
              else
                await expect
                  .poll(() =>
                    picker.evaluate((element) => {
                      const anchor = document.querySelector('.hbar-pre-session-choice-picker > button')
                      if (!anchor) throw new Error('Missing original choice anchor')
                      const box = element.getBoundingClientRect()
                      const trigger = anchor.getBoundingClientRect()
                      const gap = Math.max(
                        8,
                        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 2,
                      )
                      const expectedRight = Math.max(box.width + gap, Math.min(trigger.right, innerWidth - gap))
                      return Math.abs(box.right - expectedRight)
                    }),
                  )
                  .toBeLessThanOrEqual(1)
              const rows = picker.locator('.hbar-pre-session-choice-row')
              await expect(rows).toHaveCount(60)
              const selected = picker
                .getByRole('group', { name: '提供商乙 · Provider B', exact: true })
                .getByRole('button', { name: `${modelName} 60 ${detail}`.replace(/\s+/g, ' ').trim(), exact: true })
              await expect(selected).toHaveAttribute('aria-current', 'true')
              await expect(selected.locator('[data-text-context="choice.title"]')).toHaveText(`${modelName} 60`)
              await expect(selected.locator('[data-text-context="choice.description"]')).toHaveText(detail)
              await expect(selected.locator('svg')).toBeVisible()
              expect(
                await selected.evaluate((element) => ['start', 'left'].includes(getComputedStyle(element).textAlign)),
              ).toBe(true)
              expect(
                await selected.evaluate((element) =>
                  [...element.querySelectorAll('[data-text-context]')].every((text) =>
                    ['start', 'left'].includes(getComputedStyle(text).textAlign),
                  ),
                ),
              ).toBe(true)
              const list = picker.getByRole('region', { name: copy.title, exact: true })
              expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
              await list.focus()
              await page.keyboard.press('End')
              await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
              await expect(list.getByRole('button', { name: `${copy.more}: 1`, exact: true })).toBeInViewport()
              await search.fill('search-key-60')
              await expect(rows).toHaveCount(1)
              expect(await picker.textContent()).not.toContain('search-key-60')
              await picker.getByRole('button', { name: copy.clearSearch, exact: true }).click()
              await expect(search).toHaveValue('')
              await expect(search).toBeFocused()
              await search.fill('search-key-60')
              await search.press('ArrowDown')
              await expect(selected).toBeFocused()
              await selected.press('Enter')
              await expect(picker).toBeHidden()
              await expect(trigger).toBeFocused()
              expect((await page.evaluate(() => window.readChoiceFixtureEvents())).chosen).toEqual([
                'original-model-60',
              ])
              await trigger.click()
              await page.keyboard.press('Escape')
              await expect(picker).toBeHidden()
              await expect(trigger).toBeFocused()
              await trigger.click()
              if (sheet) await picker.getByRole('button', { name: copy.close, exact: true }).click()
              else await trigger.click()
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
                await page.screenshot({ path: resolve(output, `${locale}-${mode}-${presentation}-${width}.png`) })
              }
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
              expect(errors).toEqual([])
              outcomes.push({ case: 'surface-keyboard-original-id', locale, width, mode, presentation, coarse })
              await page.evaluate(() => window.releaseChoiceFixture())
            }
          } finally {
            await context.close()
          }
        }
      }
    }
  }
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.route('**/*', (route) => route.abort())
    const copy = copyByLocale['zh-CN']
    for (const count of [0, 1, 60, 61, 100, 101]) {
      console.log(`Checking capacity ${count}`)
      const choices = Array.from({ length: count }, (_, index) => ({
        id: `bounded-${index}`,
        label: `完整原始选择 ${index}`,
      }))
      const input: ChoiceFixtureInput = {
        copy,
        choices: [...choices, ...choices.slice(0, 1)],
        selectedId: 'missing',
        mode: 'dark',
        presentation: 'native',
        placement: 'composer',
        behavior: 'resolve',
        hasMore: true,
      }
      await mount(page, input, 320)
      await page.locator('.hbar-pre-session-choice-picker > button').click()
      const picker = page.getByRole('dialog', { name: copy.title, exact: true })
      const rows = picker.locator('.hbar-pre-session-choice-row')
      await expect(rows).toHaveCount(Math.min(count, 60))
      await expect(picker.locator('.hbar-pre-session-choice-row[aria-current="true"]')).toHaveCount(0)
      if (count === 0) await expect(picker.getByText(copy.empty, { exact: true })).toBeVisible()
      const more = picker.getByRole('button', { name: new RegExp(copy.more) })
      await more.click()
      await expect(rows).toHaveCount(count)
      if (count <= 60) expect((await page.evaluate(() => window.readChoiceFixtureEvents())).more).toBe(1)
      else {
        expect((await page.evaluate(() => window.readChoiceFixtureEvents())).more).toBe(0)
        await more.click()
        expect((await page.evaluate(() => window.readChoiceFixtureEvents())).more).toBe(1)
      }
      outcomes.push({
        case: `capacity-${count}-duplicate-stale-pagination`,
        locale: 'zh-CN',
        width: 320,
        mode: 'dark',
        presentation: 'native',
        coarse: false,
      })
      await page.evaluate(() => window.releaseChoiceFixture())
    }
    for (const placement of ['composer', 'dialog'] as const) {
      for (const result of ['success', 'failure'] as const) {
        console.log(`Checking pending ${placement} ${result}`)
        const pendingWidth = placement === 'dialog' ? 1440 : 320
        const input: ChoiceFixtureInput = {
          copy,
          choices: [{ id: 'original', label: '原始模型' }],
          selectedId: 'original',
          mode: 'light',
          presentation: 'native',
          placement,
          behavior: 'defer',
        }
        await mount(page, input, pendingWidth)
        const trigger = page.locator('.hbar-pre-session-choice-picker > button')
        const picker = page.getByRole('dialog', { name: copy.title, exact: true })
        await page.evaluate((value) => window.renderChoiceFixture(value), { ...input, openRequest: 1 })
        await expect(picker).toBeVisible()
        await picker.getByRole('button', { name: '原始模型', exact: true }).click()
        await expect(trigger).toHaveAttribute('aria-busy', 'true')
        await expect(picker.locator('.hbar-pre-session-choice-row')).toBeDisabled()
        await page.evaluate((value) => window.renderChoiceFixture(value), {
          ...input,
          openRequest: 1,
          choices: [{ id: 'replacement', label: '刷新后的模型' }],
        })
        await expect(picker.getByRole('button', { name: '刷新后的模型', exact: true })).toBeDisabled()
        expect((await page.evaluate(() => window.readChoiceFixtureEvents())).chosen).toEqual(['original'])
        await page.locator('body').click({ position: { x: 2, y: 2 } })
        await expect(picker).toBeHidden()
        await page.getByRole('button', { name: copy.other, exact: true }).click()
        const other = page.getByRole('dialog', { name: copy.other, exact: true })
        await expect(other).toBeVisible()
        await other.getByRole('button', { name: copy.close, exact: true }).focus()
        await page.evaluate((value) => window.settleChoiceFixture(value), result)
        await expect(trigger).not.toHaveAttribute('aria-busy', 'true')
        await expect(other).toBeVisible()
        await expect(other.getByRole('button', { name: copy.close, exact: true })).toBeFocused()
        if (result === 'failure') await expect(page.getByRole('alert')).toHaveText(copy.error)
        await other.getByRole('button', { name: copy.close, exact: true }).click()
        const retryInput: ChoiceFixtureInput = { ...input, openRequest: 1, behavior: 'resolve' }
        await page.evaluate((value) => window.renderChoiceFixture(value), retryInput)
        await trigger.click()
        await picker.getByRole('button', { name: '原始模型', exact: true }).click()
        await expect(picker).toBeHidden()
        await expect(page.getByRole('alert')).toHaveCount(0)
        expect((await page.evaluate(() => window.readChoiceFixtureEvents())).chosen).toEqual(['original', 'original'])
        outcomes.push({
          case: `pending-${placement}-${result}-original-id-focus-retry`,
          locale: 'zh-CN',
          width: pendingWidth,
          mode: 'light',
          presentation: 'native',
          coarse: false,
        })
        await page.evaluate(() => window.releaseChoiceFixture())
      }
    }
    const thrown: ChoiceFixtureInput = {
      copy,
      choices: [{ id: 'original', label: '原始模型' }],
      selectedId: null,
      mode: 'dark',
      presentation: 'native',
      placement: 'composer',
      behavior: 'throw',
    }
    await mount(page, thrown, 1440)
    await page.locator('.hbar-pre-session-choice-picker > button').click()
    const picker = page.getByRole('dialog', { name: copy.title, exact: true })
    await picker.getByRole('button', { name: '原始模型', exact: true }).click()
    await expect(picker.getByRole('alert')).toHaveText(copy.error)
    await expect(picker.getByRole('button', { name: '原始模型', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alert')).toHaveText(copy.error)
    outcomes.push({
      case: 'synchronous-failure-recovery',
      locale: 'zh-CN',
      width: 1440,
      mode: 'dark',
      presentation: 'native',
      coarse: false,
    })
    await page.evaluate(() => window.releaseChoiceFixture())
  } finally {
    await context.close()
  }
  await Bun.write(resolve(output, 'verification.json'), JSON.stringify(outcomes, null, 2) + '\n')
  console.log(`${outcomes.length} real browser pre-session choice scenarios passed.`)
} finally {
  await browser.close()
}
