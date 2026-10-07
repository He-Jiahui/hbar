import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { resolveSettings } from '@hbar/settings-core'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SettingsWorkspaceFixtureInput } from '../tests/fixtures/settings-workspace-browser'

const output = resolve('artifacts/desktop-elements/settings-workspace')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/settings-workspace-browser.tsx'),
      name: 'SettingsWorkspace',
      formats: ['iife'],
      fileName: 'settings',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/settings.css')).text()
const script = await Bun.file(resolve(output, 'bundle/settings.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors: string[] = []
let scenarios = 0
try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = getShellCopy(locale).settings
    const suffix = locale === 'zh-CN' ? '原始设置完整说明'.repeat(16) : ' Complete original settings caption'.repeat(16)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        for (const fixedScope of [false, true]) {
          const input: SettingsWorkspaceFixtureInput = {
            locale,
            mode,
            suffix,
            fixedScope,
            error: width === 320,
            description: HBAR_SETTINGS_DESCRIPTION,
            snapshot: settingsCommands['settings.get'].output.parse({
              schemaVersion: 1,
              scope: { kind: 'global' },
              revisions: { 'settings:global': 1 },
              resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, [
                { id: 'settings:global', kind: 'global', revision: 1, values: {} },
              ]),
            }),
          }
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;background:var(--lumen-canvas);color:var(--lumen-ink)}.settings-workspace-fixture{block-size:100dvh;min-inline-size:0}</style><div id="settings-workspace-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountSettingsWorkspace(value), input)
          const title = page.locator('.hbar-app-react-settings-group-title')
          await expect(title.getByRole('heading', { level: 2 })).toHaveText(
            copy.resolve('i18n:settings.groups.model') + suffix,
          )
          await title.focus()
          for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => title.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          if (fixedScope) {
            const scope = page.locator('.hbar-app-react-settings-fixed-scope')
            await expect(scope).toHaveText(copy.hostScope + suffix)
            await scope.focus()
            for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
            await expect.poll(() => scope.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          }
          if (input.error) {
            const retry = page.getByRole('button', { name: copy.contentRecovery.retry + suffix, exact: true })
            await expect(retry).toHaveCount(1)
            await page.evaluate(() => window.clearSettingsFixtureReadError())
            await retry.click()
            await expect(retry).toHaveCount(0)
          }
          const toolbar = page.getByRole('toolbar', { name: copy.pageTitle, exact: true })
          await toolbar.focus()
          for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight')
          await expect.poll(() => toolbar.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
          expect(await page.evaluate(() => window.settingsFixtureWrites)).toEqual([])
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320 && mode === 'dark')
            await page.screenshot({ path: resolve(output, `${locale}-${fixedScope}-320.png`) })
          scenarios++
          await page.evaluate(() => window.releaseSettingsWorkspace())
        }
      }
  }
  expect(errors).toEqual([])
  await Bun.write(resolve(output, 'results.json'), JSON.stringify({ scenarios, errors }, null, 2))
  console.log(`${scenarios} actual settings workspace scenarios passed.`)
} finally {
  await browser.close()
  await server.stop(true)
}
