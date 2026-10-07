import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { ComposerControlFlowInput } from '../tests/fixtures/composer-control-flow-browser'

const copies = {
  'en-US': {
    labels: {
      input: 'Original prompt',
      placeholder: 'Enter original message',
      send: 'Send',
      submitTitle: 'Send original message',
      stop: 'Stop',
      uploading: 'Uploading',
      addAttachment: 'Add attachment',
      removeAttachment: 'Remove attachment',
    },
    title: 'Original session',
    control: 'Original model and execution choice — 保留完整原始名称 '.repeat(3),
    draft: 'Original editable draft — 原会话全文',
  },
  'zh-CN': {
    labels: {
      input: '原始消息',
      placeholder: '输入原始消息',
      send: '发送',
      submitTitle: '发送原始消息',
      stop: '停止',
      uploading: '上传中',
      addAttachment: '添加附件',
      removeAttachment: '移除附件',
    },
    title: '原始会话',
    control: '保留完整原始模型与执行方式 — original execution choice '.repeat(3),
    draft: '原会话可编辑全文 — original editable draft',
  },
} as const
const output = resolve('artifacts/desktop-elements/composer-control-flow')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/composer-control-flow-browser.tsx'),
      name: 'ComposerControlFlowFixture',
      formats: ['iife'],
      fileName: 'composer-control-flow',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/composer-control-flow.css')).text()
const script = await Bun.file(resolve(output, 'bundle/composer-control-flow.iife.js')).text()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const results: {
  readonly locale: string
  readonly mode: string
  readonly axis: string
  readonly width: number
  readonly count: number
  readonly fontSize: number
}[] = []
async function verify(
  page: Page,
  input: ComposerControlFlowInput,
  width: number,
  fontSize: number,
  locale: string,
): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
    html { font-size: ${fontSize}px; }
    body { margin: 0; background: var(--lumen-canvas); color: var(--lumen-ink); }
    .composer-control-flow-fixture { display: flex; flex-direction: column; box-sizing: border-box; min-inline-size: 0; min-block-size: 100dvh; padding: 1rem; justify-content: flex-end; }
    .composer-control-flow-fixture .lumen-prompt-composer-surface { inline-size: 100%; min-inline-size: 0; }
    .composer-control-flow-heading { min-inline-size: 0; overflow-x: auto; }
    .composer-control-flow-fixture .lumen-composer-toolbar { flex-direction: ${input.axis}; }
    .composer-control-flow-fixture[data-axis="column"] .lumen-composer-toolbar { align-items: stretch; }
    .composer-control-flow-fixture[data-axis="column"] .lumen-composer-toolbar > div { inline-size: 100%; max-inline-size: 100%; }
    .composer-control-flow-fixture .lumen-composer-toolbar > div { min-inline-size: 0; }
    .composer-control-flow-fixture .lumen-composer-primary-actions { justify-content: flex-end; }
  </style><div id="composer-control-flow-fixture"></div>`)
  await page.addScriptTag({ content: script })
  await page.evaluate((value) => window.renderComposerControlFlow(value), input)
  const rail = page.getByRole('toolbar', { name: input.labels.input, exact: true })
  const buttons = rail.getByRole('button')
  await expect(buttons).toHaveCount(input.count)
  const send = page.getByRole('button', { name: input.labels.send, exact: true })
  await expect(send).toBeInViewport()
  if (input.count > 0) {
    const first = buttons.first()
    const text = first.locator('[data-text-context="control.label"]')
    await expect(text).toHaveText(input.copy.control + '0')
    const reading = await text.evaluate((element) => {
      const rail = element.closest('[role="toolbar"]')
      if (!rail) throw new Error('Missing owning control rail')
      const range = element.ownerDocument.createRange()
      range.selectNodeContents(element)
      const glyph = range.getBoundingClientRect()
      const viewport = rail.getBoundingClientRect()
      return {
        glyphTop: glyph.top,
        glyphBottom: glyph.bottom,
        glyphHeight: glyph.height,
        top: viewport.top + rail.clientTop,
        bottom: viewport.top + rail.clientTop + rail.clientHeight,
        scrollWidth: rail.scrollWidth,
        clientWidth: rail.clientWidth,
      }
    })
    expect(reading.glyphHeight).toBeGreaterThan(0)
    expect(reading.glyphTop).toBeGreaterThanOrEqual(reading.top - 1)
    expect(reading.glyphBottom).toBeLessThanOrEqual(reading.bottom + 1)
    await first.focus()
    await page.keyboard.press('Enter')
    expect((await page.evaluate(() => window.readComposerControlFlowActions())).selected).toEqual([0])
    if (reading.scrollWidth > reading.clientWidth) {
      await rail.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    }
  }
  await page.getByRole('textbox', { name: input.labels.input, exact: true }).fill(input.copy.draft + ' — edited')
  await send.click()
  expect((await page.evaluate(() => window.readComposerControlFlowActions())).submitted).toEqual([
    input.copy.draft + ' — edited',
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  if (width === 320 && input.count === 3)
    await page.screenshot({ path: resolve(output, `${locale}-${input.mode}-${input.axis}-${fontSize}.png`) })
  results.push({ locale, mode: input.mode, axis: input.axis, width, count: input.count, fontSize })
  await page.evaluate(() => window.releaseComposerControlFlow())
}
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  page.setDefaultTimeout(10000)
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = copies[locale]
    const base: ComposerControlFlowInput = {
      labels: copy.labels,
      copy: { title: copy.title, control: copy.control, draft: copy.draft },
      axis: 'column',
      count: 3,
      mode: 'light',
    }
    for (const mode of ['light', 'dark'] as const) {
      for (const axis of ['column', 'row'] as const) {
        for (const font of ['default', '200%'] as const) {
          for (const width of [1440, 1100, 900, 390, 320]) {
            const fontSize = font === '200%' ? 32 : width < 400 ? 20 : 16
            console.log(`Checking ${locale} ${mode} ${axis} ${width} ${fontSize}px`)
            await verify(page, { ...base, mode, axis }, width, fontSize, locale)
          }
        }
      }
    }
  }
  const copy = copies['zh-CN']
  for (const axis of ['column', 'row'] as const) {
    for (const count of [0, 1, 3, 12]) {
      for (const width of [1440, 320]) {
        const input: ComposerControlFlowInput = {
          labels: copy.labels,
          copy: { title: copy.title, control: copy.control, draft: copy.draft },
          axis,
          count,
          mode: 'dark',
        }
        await verify(page, input, width, width < 400 ? 20 : 16, 'zh-CN')
      }
    }
  }
  await Bun.write(resolve(output, 'verification.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(`${results.length} actual Chrome composer control flow scenarios passed.`)
} finally {
  await browser.close()
}
