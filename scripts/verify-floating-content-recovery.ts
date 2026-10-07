import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import type { RecoveryFixtureInput } from '../tests/fixtures/floating-content-recovery-browser'

const copies = {
  'zh-CN': {
    title: '执行选项',
    open: '打开选项',
    search: '初次焦点',
    remove: '移除当前操作',
    next: '继续 Plan 操作',
    outside: '后续草稿',
    draft: '完整原始草稿',
  },
  'en-US': {
    title: 'Execution choices',
    open: 'Open choices',
    search: 'Initial focus',
    remove: 'Remove current action',
    next: 'Continue Plan action',
    outside: 'Later draft',
    draft: 'Complete original draft',
  },
} as const
const output = resolve('artifacts/desktop-elements/floating-content-recovery')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/floating-content-recovery-browser.tsx'),
      name: 'RecoveryFixture',
      formats: ['iife'],
      fileName: 'recovery',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/recovery.css')).text()
const script = await Bun.file(resolve(output, 'bundle/recovery.iife.js')).text()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
let scenarios = 0
try {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = copies[locale]
    for (const mode of ['light', 'dark'] as const) {
      for (const coarse of [false, true]) {
        const context = await browser.newContext({ hasTouch: coarse, reducedMotion: 'reduce' })
        try {
          const page = await context.newPage()
          for (const width of [1440, 1100, 900, 390, 320]) {
            for (const scenario of ['recovery', 'later', 'preserve'] as const) {
              await page.setViewportSize({ width, height: 900 })
              await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
                html { font-size:${width < 400 ? 20 : 16}px; } body { margin:0; background:var(--lumen-canvas); }
                .recovery-fixture { display:flex; flex-direction:column; gap:1rem; padding:1rem; }
              </style><div id="floating-recovery-fixture"></div>`)
              await page.addScriptTag({ content: script })
              const input: RecoveryFixtureInput = { copy, mode, preserve: scenario === 'preserve' }
              await page.evaluate((value) => window.mountFloatingRecovery(value), input)
              const trigger = page.getByRole('button', { name: copy.open, exact: true })
              await trigger.click()
              const menu = page.getByRole('dialog', { name: copy.title, exact: true })
              await expect(menu).toBeVisible()
              if (scenario === 'preserve') await expect(trigger).toBeFocused()
              else if (coarse && width <= 640) await expect(menu).toBeFocused()
              else await expect(menu.getByRole('textbox', { name: copy.search })).toBeFocused()
              const action = menu.getByRole('button', { name: copy.remove, exact: true })
              await action.focus()
              if (scenario === 'recovery') {
                await action.click()
                await expect(menu.getByRole('button', { name: copy.next, exact: true })).toBeFocused()
              } else if (scenario === 'preserve') {
                await action.click()
                await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)
                await expect(menu.getByRole('button', { name: copy.next, exact: true })).not.toBeFocused()
              } else {
                const outside = page.getByRole('textbox', { name: copy.outside, exact: true })
                await outside.focus()
                await page.evaluate(() => window.removeFloatingRecoveryControl())
                await expect(outside).toBeFocused()
                await expect(outside).toHaveValue(copy.draft)
              }
              await expect(action).toHaveCount(0)
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
              await page.evaluate(() => window.releaseFloatingRecovery())
              scenarios++
            }
          }
        } finally {
          await context.close()
        }
      }
    }
  }
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios }, null, 2))
  console.log(`${scenarios} actual floating content recovery scenarios passed.`)
} finally {
  await browser.close()
}
