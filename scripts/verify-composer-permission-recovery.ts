import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { chromium, expect, type Page } from '@playwright/test'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { PermissionRecoverySnapshot } from '../e2e/fixtures/composer-permission-recovery/main'

const repository = resolve(import.meta.dirname, '..')
const phase = process.env.HBAR_PERMISSION_RECOVERY_PHASE ?? 'current'
if (!['red', 'fixed', 'current'].includes(phase)) throw new Error('Unsupported permission recovery evidence phase')
const output = resolve(repository, 'artifacts/composer-permission-recovery', phase)
await mkdir(output, { recursive: true })
const server = await createServer({
  configFile: false,
  root: resolve(repository, 'e2e/fixtures/composer-permission-recovery'),
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  cacheDir: resolve(output, 'vite-cache'),
  server: { host: '127.0.0.1', port: 45153, strictPort: true },
})
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
const errors: string[] = []
const failures: string[] = []
const observations: {
  readonly locale: string
  readonly width: number
  readonly scenario: string
  readonly snapshots: Record<string, PermissionRecoverySnapshot>
}[] = []
const snapshot = (page: Page) => page.evaluate(() => window.composerPermissionRecovery.snapshot())

try {
  await server.listen()
  browser = await chromium.launch({ channel: process.env.HBAR_BROWSER_CHANNEL ?? 'msedge', headless: true })
  for (const locale of ['en-US', 'zh-CN'] as const) {
    for (const width of [1440, 320]) {
      for (const scenario of ['escape', 'tab-to-close'] as const) {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        const values: Record<string, PermissionRecoverySnapshot> = {}
        const businessRequests: string[] = []
        const name = `${scenario}-${locale}-${width}`
        page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
        page.on('request', (request) => {
          const url = new URL(request.url())
          if (url.origin !== 'http://127.0.0.1:45153' || /^\/(?:rpc|api(?:\/|$)|auth(?:\/|$))/.test(url.pathname))
            businessRequests.push(request.url())
        })
        try {
          const labels = getShellCopy(locale).session.permissionPicker
          await page.goto(`http://127.0.0.1:45153/?locale=${locale}`)
          await page.waitForFunction(() => Boolean(window.composerPermissionRecovery))
          const trigger = page.getByRole('button', { name: labels.trigger(labels.options.inherit.label), exact: true })
          await trigger.click()
          const popup = page.getByRole('dialog', { name: labels.title, exact: true })
          await expect(popup).toBeVisible()
          await popup.getByRole('button', { name: labels.plan.cancelGoalPreparation, exact: true }).click()
          await expect.poll(async () => (await snapshot(page)).pending).toBe(true)
          values.pending = await snapshot(page)
          expect(values.pending.strictSetups).toBeGreaterThanOrEqual(2)
          expect(values.pending.strictCleanups).toBeGreaterThanOrEqual(1)
          if (scenario === 'escape') {
            await page.keyboard.press('Escape')
            await expect(popup).not.toBeVisible()
          } else {
            // Disabled controls can leave Chromium's sequential focus start at
            // a scrollable menu container. Reach Close with bounded real keys;
            // retain every intermediate stop instead of assuming one keypress.
            for (let step = 1; step <= 6; step++) {
              await page.keyboard.press('Shift+Tab')
              const value = await snapshot(page)
              values[`keyboardStep${step}`] = value
              await expect(popup).toBeVisible()
              if (value.focus.close) break
            }
            await expect(popup.getByRole('button', { name: labels.close, exact: true })).toBeFocused()
          }
          values.beforeSettle = await snapshot(page)
          await page.screenshot({ path: resolve(output, `${name}-pending.png`) })
          await page.evaluate(() => window.composerPermissionRecovery.settle())
          await expect.poll(async () => (await snapshot(page)).pending).toBe(false)
          await expect.poll(async () => (await snapshot(page)).prepared).toBe(false)
          try {
            await expect
              .poll(
                async () => {
                  const focus = (await snapshot(page)).focus
                  return scenario === 'escape' ? focus.trigger : focus.close
                },
                { timeout: 1200 },
              )
              .toBe(true)
          } catch (error) {
            failures.push(`${name}: ${String(error)}`)
          }
          values.settled = await snapshot(page)
          expect(values.settled.cancelCalls).toBe(1)
          expect(values.settled.targets).toEqual([{ sessionId: 'session-a', expectedRevision: 7 }])
          expect(values.settled.modeWrites).toBe(0)
          expect(values.settled.selectionWrites).toBe(0)
          expect(values.settled.draft).toBe(values.pending.draft)
          expect(values.settled.attachmentId).toBe(values.pending.attachmentId)
          expect(businessRequests).toEqual([])
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
          await page.screenshot({ path: resolve(output, `${name}-settled.png`) })
        } catch (error) {
          failures.push(`${name} setup/invariant: ${String(error)}`)
          await page.screenshot({ path: resolve(output, `${name}-failure.png`) })
        } finally {
          observations.push({ locale, width, scenario, snapshots: values })
          await page.close()
        }
      }
    }
  }
  expect(errors).toEqual([])
  if (failures.length) throw new Error(`${failures.length} permission recovery assertions failed; see ${output}`)
  console.log(
    'PASS: actual permission picker StrictMode; 4 locale/viewport pairs, 2 pending-focus paths; 0 Host writes',
  )
} finally {
  await browser?.close()
  await server.close()
  await writeFile(
    resolve(output, 'observations.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        scope:
          'Actual HbarComposerPermissionPicker + LumenProvider in Edge development StrictMode. Controlled cancellation Promise, fixed local draft facts; no Host, business HTTP, provider, production App or native claim.',
        observations,
        errors,
        failures,
      },
      null,
      2,
    ),
  )
}
