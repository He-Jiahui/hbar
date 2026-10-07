import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'
import type { ChatSearchContentInput } from '../tests/fixtures/chat-search-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/chat-search-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/chat-search-content-browser.tsx'),
      name: 'ChatSearchContent',
      formats: ['iife'],
      fileName: 'chat-search-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/chat-search-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/chat-search-content.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/*', (route) => route.abort())
let scenarios = 0
let current: unknown
const title = (index: number) => `原始会话 ${index} Complete original session title `.repeat(3).trim()
const snippet = 'Original <img src=x onerror=alert(1)> needle 原始搜索片段 '.repeat(4)
const mount = async (input: ChatSearchContentInput, width: number, keepPointer = false) => {
  current = { ...input, width }
  await page.setViewportSize({ width, height: 900 })
  if (!keepPointer) await page.mouse.move(0, 0)
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#chat-search-content-fixture{display:flex;min-inline-size:0;min-block-size:0;block-size:100dvh}#chat-search-content-fixture>.chat-search-fixture-provider{display:flex;min-inline-size:0;min-block-size:0;flex:1}</style><div id="chat-search-content-fixture"></div>`,
  )
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.mountChatSearchContent(value), input)
  await expect(page.getByRole('combobox')).toBeVisible()
  return page.locator('.hbar-chat-search-view')
}
const reader = async (owner: Locator, narrow: boolean) => {
  await owner.scrollIntoViewIfNeeded()
  const content = await owner.evaluate((node) => ({
    available: node.clientWidth,
    content: node.scrollWidth,
    owner: node.getAttribute('class'),
  }))
  expect(content.available).toBeGreaterThan(0)
  if (narrow) {
    expect(content.content, JSON.stringify(content)).toBeGreaterThan(content.available)
    await owner.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => owner.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
  }
}
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = chatSearchCopy(locale)
    const suffix = ' 完整说明 Complete host copy '.repeat(3)
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        const root = await mount(
          { locale, mode, suffix, count: 5, status: 'ready', selected: 'first', feedback: 'idle' },
          width,
        )
        const option = root.locator('[data-result-id="original-result-0"]')
        await expect(root.getByRole('option')).toHaveCount(5)
        await verifyReadableText(option.locator('[data-text-context="collection.title"]'), title(0), width < 400)
        await verifyReadableText(option.locator('.hbar-chat-search-source'), base.sources.title + suffix, width < 400)
        await verifyReadableText(option.locator('.hbar-chat-search-snippet-text').first(), snippet, width < 400)
        await expect(option.locator('.hbar-chat-search-snippet')).toHaveCount(3)
        await expect(option.locator('[role="mark"]').first()).toHaveText('needle')
        await expect(option.locator('img')).toHaveCount(0)
        await expect(option).toContainText(base.matches(999, true))
        await reader(option.locator('.hbar-chat-search-metadata-reading'), width < 400)
        await reader(root.locator('.hbar-chat-search-scopes'), width < 400)
        await verifyReadableText(
          root.locator('.hbar-chat-search-footer [data-text-context="inline.text"]').last(),
          base.closeHint + suffix,
          width < 400,
        )
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        expect(await root.locator('.hbar-chat-search-pane').evaluate((node) => node.clientHeight)).toBeGreaterThan(0)
        await page.screenshot({ path: resolve(output, `${locale}-${mode}-${width}.png`) })
        scenarios++
      }
    }
    for (const [status, count, expected] of [
      ['recent', 0, 0],
      ['recent', 1, 1],
      ['recent', 8, 8],
      ['recent', 9, 8],
      ['ready', 50, 50],
      ['ready', 51, 50],
    ] as const) {
      const root = await mount(
        { locale, mode: 'light', suffix: '', count, status, selected: 'stale', feedback: 'idle', duplicates: true },
        320,
      )
      await expect(root.getByRole('option')).toHaveCount(expected)
      await expect(root.getByRole('option', { selected: true })).toHaveCount(0)
      await expect(root.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant')
      if (expected) {
        const last = root.getByRole('option').last()
        await last.scrollIntoViewIfNeeded()
        await last.click()
        expect(
          (await page.evaluate(() => window.chatSearchContentState())).calls.filter((call) => call.action === 'open'),
        ).toEqual([
          {
            action: 'open',
            value: `original-result-${expected - 1}`,
            workspaceId: `original-workspace-${expected - 1}`,
          },
        ])
      }
      if (count > 50) await verifyReadableText(root.locator('.hbar-chat-search-truncated'), base.truncated)
      scenarios++
    }
    for (const status of ['loading', 'indexing', 'empty', 'error', 'disconnected'] as const) {
      const root = await mount(
        {
          locale,
          mode: 'dark',
          suffix,
          count: status === 'indexing' ? 1 : 0,
          status,
          selected: 'none',
          feedback: 'idle',
        },
        320,
      )
      const expected =
        status === 'loading'
          ? base.loading
          : status === 'indexing'
            ? base.indexing
            : status === 'empty'
              ? base.empty
              : status === 'error'
                ? base.searchFailed
                : base.disconnected
      await verifyReadableText(
        root.locator('.hbar-chat-search-feedback [data-text-context="feedback.paragraph"]'),
        expected + suffix,
        true,
      )
      if (status === 'error' || status === 'indexing' || status === 'disconnected') {
        await reader(root.locator('.hbar-chat-search-actions-reading'), true)
        await root.getByRole('button', { name: base.retry + suffix, exact: true }).click()
        expect((await page.evaluate(() => window.chatSearchContentState())).calls).toContainEqual({
          action: 'retry',
          value: '',
        })
      }
      scenarios++
    }
    for (const feedback of ['opening', 'failed'] as const) {
      const root = await mount(
        { locale, mode: 'light', suffix, count: 1, status: 'ready', selected: 'first', feedback },
        320,
      )
      const option = root.getByRole('option')
      await verifyReadableText(
        option.locator('[data-text-context="feedback.detail"]'),
        (feedback === 'opening' ? base.opening(title(0)) : base.searchFailed) + suffix,
        true,
      )
      const input = root.getByRole('combobox')
      await input.press('Enter')
      if (feedback === 'opening')
        expect(
          (await page.evaluate(() => window.chatSearchContentState())).calls.some((call) => call.action === 'open'),
        ).toBe(false)
      scenarios++
    }
    const root = await mount(
      { locale, mode: 'light', suffix: '', count: 4, status: 'ready', selected: 'first', feedback: 'idle' },
      900,
    )
    const input = root.getByRole('combobox')
    await input.focus()
    await input.dispatchEvent('compositionstart')
    await input.press('ArrowDown')
    await input.press('Enter')
    await input.press('Escape')
    const composing = (await page.evaluate(() => window.chatSearchContentState())).calls
    expect(composing.filter((call) => ['move', 'open', 'close'].includes(call.action))).toEqual([])
    expect(composing.filter((call) => call.action === 'composition-start')).toHaveLength(1)
    await input.dispatchEvent('compositionend')
    await input.press('ArrowDown')
    await input.press('Enter')
    expect((await page.evaluate(() => window.chatSearchContentState())).calls).toContainEqual({
      action: 'open',
      value: 'original-result-1',
      workspaceId: 'original-workspace-1',
    })
    await page.evaluate(() => window.reverseChatSearchContent())
    await expect(root.locator('[data-result-id="original-result-1"]')).toHaveAttribute('aria-selected', 'true')
    await input.press('Enter')
    expect(
      (await page.evaluate(() => window.chatSearchContentState())).calls.filter((call) => call.action === 'open'),
    ).toHaveLength(2)
    await input.fill('q'.repeat(161))
    await expect(input).toHaveValue('q'.repeat(160))
    await expect(input).toHaveAttribute('maxlength', '160')
    await root.getByRole('radio', { name: base.scopes.patch, exact: true }).click()
    expect((await page.evaluate(() => window.chatSearchContentState())).calls).toContainEqual({
      action: 'source',
      value: 'patch',
    })
    await input.press('Escape')
    expect((await page.evaluate(() => window.chatSearchContentState())).calls).toContainEqual({
      action: 'close',
      value: '',
    })
    scenarios++
    const stationaryInput: ChatSearchContentInput = {
      locale,
      mode: 'light',
      suffix: '',
      count: 2,
      status: 'recent',
      selected: 'first',
      feedback: 'idle',
    }
    const pointerRoot = await mount(stationaryInput, 900)
    await pointerRoot.getByRole('option').nth(1).hover()
    await expect(pointerRoot.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    const reopened = await mount(stationaryInput, 900, true)
    await expect(reopened.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    await reopened.getByRole('combobox').press('ArrowDown')
    await expect(reopened.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    await reopened.getByRole('combobox').press('Enter')
    expect((await page.evaluate(() => window.chatSearchContentState())).calls).toContainEqual({
      action: 'open',
      value: 'original-result-1',
      workspaceId: 'original-workspace-1',
    })
    scenarios++
  }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual chat search Chrome scenarios passed.`)
} catch (error) {
  console.error('Failed owned chat search case', current)
  throw error
} finally {
  await browser.close()
}
