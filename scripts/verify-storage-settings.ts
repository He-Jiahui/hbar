import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { storageLocationCopy } from '../apps/web/src/storage-location-copy'
import type { StorageSettingsFixtureInput } from '../tests/fixtures/storage-settings-browser'

const output = resolve('artifacts/desktop-elements/storage-settings')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/storage-settings-browser.tsx'),
      name: 'StorageSettings',
      formats: ['iife'],
      fileName: 'storage',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/storage.css')).text()
const script = await Bun.file(resolve(output, 'bundle/storage.iife.js')).text()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const errors: string[] = []
let scenarios = 0
try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  expect(await page.evaluate(() => window.isSecureContext && typeof crypto.randomUUID === 'function')).toBe(true)
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = storageLocationCopy(locale)
    const suffix =
      locale === 'zh-CN' ? '原始存储设置完整说明'.repeat(12) : ' Original complete storage location caption'.repeat(12)
    for (const mode of ['light', 'dark'] as const) {
      for (const width of [1440, 1100, 900, 390, 320]) {
        const input: StorageSettingsFixtureInput = {
          locale,
          mode,
          suffix,
          failure: 'none',
          snapshot: {
            pointerFile: `C:/original/${'完整原始引导路径-original/'.repeat(20)}paths.json`,
            revision: 'original',
            active: {
              dataRoot: 'D:/original/data',
              cacheRoot: 'D:/original/cache',
              settingsRoot: 'D:/original/settings',
              sessionsRoot: 'D:/original/sessions',
              skillsRoot: 'D:/original/skills',
            },
            saved: {
              dataRoot: 'D:/original/data',
              cacheRoot: 'D:/original/cache',
              settingsRoot: 'D:/original/settings',
              sessionsRoot: 'D:/original/sessions',
              skillsRoot: 'D:/original/skills',
            },
            restartRequired: false,
            lastWrite: null,
            receipts: [],
          },
        }
        const variants: readonly Pick<StorageSettingsFixtureInput, 'failure' | 'readState'>[] =
          width === 320 && mode === 'dark'
            ? [
                { failure: 'none' },
                { failure: 'conflict' },
                { failure: 'unknown' },
                { failure: 'none', readState: 'loading' },
                { failure: 'none', readState: 'error' },
              ]
            : [{ failure: 'none' }]
        for (const variant of variants) {
          const { failure, readState } = variant
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;background:var(--lumen-canvas);color:var(--lumen-ink)}.storage-settings-fixture{padding:1rem}</style><div id="storage-settings-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountStorageSettings(value), { ...input, ...variant })
          const heading = page.locator('.hbar-storage-settings-title')
          await expect(heading.getByRole('heading', { level: 2 })).toHaveText(copy.title + suffix)
          await heading.focus()
          for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => heading.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          if (readState) {
            await expect(page.locator('[data-field]')).toHaveCount(0)
            if (readState === 'loading') await expect(page.getByRole('status')).toHaveText(copy.loading)
            else {
              await expect(page.getByRole('alert')).toHaveText(copy.error('STORAGE_READ_FAILED'))
              await page.getByRole('button', { name: copy.reload + suffix, exact: true }).click()
              await expect(page.locator('[data-field]')).toHaveCount(5)
              await expect(page.getByRole('alert')).toHaveCount(0)
            }
            expect(await page.evaluate(() => window.storageSettingsWrites)).toEqual([])
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
            scenarios++
            await page.evaluate(() => window.releaseStorageSettings())
            continue
          }
          const path = page.locator('.hbar-storage-settings-pointer')
          await expect(path.locator('[data-text-context="resource.path"]')).toHaveText(input.snapshot.pointerFile)
          await path.focus()
          for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => path.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          const sessions = page.locator('[data-field="sessionsRoot"]').getByRole('textbox')
          await expect(sessions).toHaveValue(input.snapshot.saved.sessionsRoot)
          const save = page.getByRole('button', { name: copy.save + suffix, exact: true })
          if (width === 320 && mode === 'dark' && failure === 'none') {
            const boundary = `E:/${'a'.repeat(3997)}`
            await sessions.fill(boundary)
            await expect(sessions).toHaveValue(boundary)
            await expect(save).toBeEnabled()
            await sessions.fill(`${boundary}a`)
            await expect(sessions).toHaveValue(`${boundary}a`)
            await expect(save).toBeDisabled()
            await expect(page.getByRole('alert')).toBeVisible()
            expect(await page.evaluate(() => window.storageSettingsWrites)).toEqual([])
          }
          await sessions.fill('E:/captured/sessions')
          await expect(save).toBeEnabled()
          await save.click()
          if (failure === 'conflict') {
            await expect(page.getByRole('alert')).toHaveText(copy.error('STORAGE_CONFLICT'))
            await expect(sessions).toHaveValue('E:/captured/sessions')
            await save.click()
          } else if (failure === 'unknown') {
            await expect(page.getByRole('status').filter({ hasText: copy.unknown })).toBeVisible()
            await sessions.fill('F:/later/sessions')
            await page.getByRole('button', { name: copy.retryOriginal + suffix, exact: true }).click()
            await expect(sessions).toHaveValue('F:/later/sessions')
          }
          await Bun.write(
            resolve(output, 'last-state.json'),
            JSON.stringify(await page.evaluate(() => window.readStorageSettingsState()), null, 2),
          )
          await expect(page.getByRole('status').filter({ hasText: copy.pending })).toBeVisible()
          const writes = await page.evaluate(() => window.storageSettingsWrites)
          expect(writes.length).toBe(failure === 'none' ? 1 : 2)
          expect(writes[0]?.roots.sessionsRoot).toBe('E:/captured/sessions')
          if (failure === 'unknown') expect(writes[1]).toEqual(writes[0])
          const toolbar = page.getByRole('toolbar', { name: copy.title + suffix, exact: true })
          await toolbar.focus()
          for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => toolbar.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320 && mode === 'dark')
            await page.screenshot({ path: resolve(output, `${locale}-${failure}-320.png`), fullPage: true })
          scenarios++
          await page.evaluate(() => window.releaseStorageSettings())
        }
      }
    }
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual Storage settings scenarios passed.`)
} finally {
  await browser.close()
  await server.stop(true)
}
