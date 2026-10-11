import { expect, test, type Browser, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { build, preview, type PreviewServer } from 'vite'
import { createServer } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getSessionStopCopy } from '../apps/web/src/session-stop-copy'
import type { ShellLocale } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/session-stop-shortcut/lifecycle')
const evidence = join(root, 'evidence')
const port = 45554
const base = `http://127.0.0.1:${port}`
let server: PreviewServer | undefined
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, '127.0.0.1', () => probe.close((error) => (error ? reject(error) : resolve())))
  })
  await mkdir(evidence, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>.stop-fixture{display:flex;flex-direction:column;min-inline-size:0;block-size:100%;gap:.5rem}.stop-fixture h1{font-size:1rem;margin:0}.stop-fixture-controls{display:flex;flex-wrap:wrap;gap:.25rem}.stop-fixture-controls button{font-size:.7rem;white-space:normal}.stop-fixture>.lumen-app-shell{flex:1;min-block-size:0}.stop-fixture-body{display:flex;flex-direction:column;gap:1rem;padding:.5rem;min-inline-size:0}.stop-fixture input{max-inline-size:100%;box-sizing:border-box}dialog,[popover]{color:CanvasText;background:Canvas;max-inline-size:80vw}</style></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/session-stop-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    // Production React skips StrictMode effect replay; use the actual development runtime for this lifecycle fixture.
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { target: 'esnext', outDir: join(root, 'web'), emptyOutDir: true },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port, strictPort: true },
  })
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
async function open(browser: Browser, locale: ShellLocale, longLabels = false) {
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  const errors: string[] = []
  const forbidden: string[] = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== base || /^\/(api|auth|rpc)(\/|$)/.test(url.pathname)) {
      forbidden.push(url.href)
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text())
  })
  await page.goto(`${base}/${longLabels ? '?long-labels' : ''}`)
  await ready(page, 'a')
  await expect(page.locator('[data-effect-setup]')).toHaveAttribute('data-effect-setup', '2')
  await expect(page.locator('[data-effect-cleanup]')).toHaveAttribute('data-effect-cleanup', '1')
  return { page, context, errors, forbidden }
}
const callSchema = z.array(z.object({ owner: z.number(), name: z.string(), operationId: z.string() }))
const calls = async (page: Page) =>
  callSchema.parse(JSON.parse((await page.locator('[data-log]').getAttribute('data-log')) ?? 'null'))
const act = (page: Page, action: string) => page.locator(`[data-action="${action}"]`).click()
const notice = (page: Page) => page.locator('[data-session-stop]')
async function ready(page: Page, session: string) {
  await expect(page.locator('[data-fixture-ready]')).toHaveAttribute('data-session', session)
  await expect(page.locator('[data-fixture-ready]')).toHaveAttribute('data-fixture-ready', 'ready')
}
const status = (page: Page, value: string) => expect(notice(page)).toHaveAttribute('data-stop-state', value)
async function stop(page: Page) {
  await page.locator('[data-prompt]').focus()
  await page.keyboard.press('Control+.')
  await test.info().attach('stop-key-state', {
    contentType: 'application/json',
    body: JSON.stringify(
      await page.evaluate(() => {
        const rect = (element: Element | null) => {
          const value = element?.getBoundingClientRect()
          return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null
        }
        return {
          state: document.querySelector('[data-fixture-ready]')?.outerHTML,
          calls: document.querySelector('[data-log]')?.getAttribute('data-log'),
          main: rect(document.querySelector('main')),
          active: document.activeElement?.outerHTML,
          overlays: [
            ...document.querySelectorAll<HTMLElement>('[role="menu"],[role="listbox"],[aria-modal="true"]'),
          ].map((element) => ({
            html: element.outerHTML,
            rect: rect(element),
            visible: element.checkVisibility(),
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
            detailsOpen: element.closest('details')?.open,
          })),
        }
      }),
    ),
  })
  await status(page, 'sending')
}
async function clean(page: Page, errors: string[], forbidden: string[]) {
  await expect(page.locator('[data-fixture-error]')).toHaveAttribute('data-fixture-error', '')
  expect(errors).toEqual([])
  expect(forbidden).toEqual([])
  expect((await calls(page)).every((call) => call.name === 'operation.cancel' || call.name === 'operation.get')).toBe(
    true,
  )
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`StrictMode Stop captures original Run across ABA, tab and runtime lifetimes: ${locale}`, async ({
    browser,
  }) => {
    const f = await open(browser, locale)
    try {
      const page = f.page
      const prompt = page.locator('[data-prompt]')
      await prompt.fill('keep draft with caret')
      await page.locator('[data-save-pointer]').click()
      await act(page, 'b')
      await ready(page, 'b')
      await act(page, 'a')
      await ready(page, 'a')
      await page.locator('[data-old-pointer]').click()
      expect(await calls(page)).toEqual([])
      await stop(page)
      await page.keyboard.press('Control+.')
      await page.keyboard.press('Meta+.')
      expect(await calls(page)).toEqual([{ owner: 1, name: 'operation.cancel', operationId: 'a-run' }])
      await expect(prompt).toBeFocused()
      await act(page, 'b')
      await ready(page, 'b')
      await expect(notice(page)).toHaveCount(0)
      await act(page, 'cancelled')
      await expect(page.locator('[data-action="cancelled"]')).toBeFocused()
      await expect(notice(page)).toHaveCount(0)
      await act(page, 'a')
      await ready(page, 'a')
      await expect(prompt).toHaveValue('keep draft with caret')
      await expect(notice(page)).toHaveCount(0)

      await act(page, 'owner')
      await expect(page.locator('[data-fixture-ready]')).toHaveAttribute('data-owner', 'stop-fixture-2')
      await stop(page)
      const oldTab = await page.locator('[data-fixture-ready]').getAttribute('data-tab')
      await act(page, 'reopen')
      await ready(page, 'a')
      await expect(page.locator('[data-fixture-ready]')).not.toHaveAttribute('data-tab', oldTab ?? '')
      await act(page, 'completed')
      await expect(page.locator('[data-action="completed"]')).toBeFocused()
      await expect(notice(page)).toHaveCount(0)

      await act(page, 'owner')
      await expect(page.locator('[data-fixture-ready]')).toHaveAttribute('data-owner', 'stop-fixture-3')
      await stop(page)
      await act(page, 'owner')
      await expect(page.locator('[data-fixture-ready]')).toHaveAttribute('data-owner', 'stop-fixture-4')
      await act(page, 'ack')
      await expect(notice(page)).toHaveCount(0)
      await expect(page.locator('[data-action="ack"]')).toBeFocused()
      await stop(page)
      await act(page, 'unmount')
      await act(page, 'interrupted')
      await act(page, 'mount')
      await ready(page, 'a')
      await expect(notice(page)).toHaveCount(0)
      expect((await calls(page)).map((call) => call.operationId)).toEqual(['a-run', 'a-run', 'a-run', 'a-run'])
      await act(page, 'owner')
      await expect(page.locator('[data-fixture-ready]')).toHaveAttribute('data-owner', 'stop-fixture-5')
      await page.locator('[data-save-pointer]').click()
      await act(page, 'unmount')
      await act(page, 'stale')
      expect(await calls(page)).toHaveLength(4)
      await act(page, 'mount')
      await ready(page, 'a')
      await act(page, 'stale')
      expect(await calls(page)).toHaveLength(4)
      await stop(page)
      await act(page, 'cancelled')
      await status(page, 'cancelled')
      await page.screenshot({ path: join(evidence, `lifetimes-${locale}-1440.png`) })
      await clean(page, f.errors, f.forbidden)
    } finally {
      await f.context.close()
    }
  })

  test(`unknown Stop stays read-only through failures, physical holds, offline and safe retry: ${locale}`, async ({
    browser,
  }) => {
    const f = await open(browser, locale)
    const labels = getSessionStopCopy(locale)
    try {
      const page = f.page
      await stop(page)
      await act(page, 'lost')
      await status(page, 'unknown')
      const check = notice(page).getByRole('button', { name: labels.check, exact: true })
      await check.click()
      await status(page, 'checking')
      await expect(notice(page).getByRole('button', { name: labels.checking, exact: true })).toBeDisabled()
      await expect(notice(page).getByRole('button', { name: labels.checking, exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Space')
      expect((await calls(page)).map((call) => call.name)).toEqual(['operation.cancel', 'operation.get'])
      await page.locator('[data-prompt]').focus()
      await page.keyboard.press('Control+.')
      expect((await calls(page)).map((call) => call.name)).toEqual(['operation.cancel', 'operation.get'])
      await act(page, 'wrong-session')
      await status(page, 'unknown')
      await expect(notice(page)).toContainText(labels.failure('INVALID_OUTPUT'))
      await check.click()
      await act(page, 'read-error')
      await status(page, 'unknown')
      const beforeOffline = await calls(page)
      await act(page, 'offline')
      // The shell owns offline connection feedback; this local notice resumes from its original action.
      await expect(notice(page)).toHaveCount(0)
      await page.locator('[data-prompt]').focus()
      await page.keyboard.press('Control+.')
      expect(await calls(page)).toEqual(beforeOffline)
      await act(page, 'online')
      await status(page, 'unknown')
      expect(await calls(page)).toEqual(beforeOffline)
      await check.click()
      await act(page, 'running')
      await status(page, 'unknown')
      await check.click()
      await act(page, 'cancelled')
      await status(page, 'cancelled')
      await expect(notice(page)).toContainText(labels.cancelled)
      await notice(page).getByRole('button', { name: labels.dismiss }).click()
      await expect(notice(page)).toHaveCount(0)
      expect((await calls(page)).filter((call) => call.name === 'operation.cancel')).toHaveLength(1)

      await act(page, 'owner')
      await expect(page.locator('[data-fixture-ready]')).toHaveAttribute('data-owner', 'stop-fixture-2')
      await page.locator('[data-pointer-stop]').click()
      await status(page, 'sending')
      await act(page, 'reject')
      await status(page, 'failed')
      await expect(notice(page)).toContainText(labels.failure('FORBIDDEN'))
      await notice(page).getByRole('button', { name: labels.retry }).click()
      await status(page, 'sending')
      await act(page, 'ack')
      await status(page, 'requested')
      await expect(notice(page)).toContainText(labels.requested)
      await expect(notice(page)).not.toContainText(labels.cancelled)
      await notice(page).getByRole('button', { name: labels.check }).click()
      await act(page, 'failed')
      await status(page, 'run-failed')
      await expect(notice(page)).toContainText(labels.runFailed)
      expect((await calls(page)).filter((call) => call.name === 'operation.cancel')).toHaveLength(3)
      await page.screenshot({ path: join(evidence, `recovery-${locale}-1440.png`) })
      await clean(page, f.errors, f.forbidden)
    } finally {
      await f.context.close()
    }
  })

  test(`Stop respects key/overlay ownership and visible narrow tool feedback: ${locale}`, async ({ browser }) => {
    const f = await open(browser, locale, true)
    try {
      const page = f.page
      const prompt = page.locator('[data-prompt]')
      await prompt.focus()
      await page.keyboard.press('.')
      await expect(prompt).toHaveValue('original draft A.')
      const denied = await prompt.evaluate((element) => {
        const results: boolean[] = []
        for (const extra of [
          { repeat: true },
          { isComposing: true },
          { keyCode: 229 },
          { altKey: true },
          { shiftKey: true },
          { metaKey: true },
        ]) {
          const event = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: '.',
            ctrlKey: true,
            ...extra,
          })
          element.dispatchEvent(event)
          results.push(event.defaultPrevented)
        }
        const prevented = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: '.', ctrlKey: true })
        prevented.preventDefault()
        element.dispatchEvent(prevented)
        return results
      })
      expect(denied).toEqual([false, false, false, false, false, false])
      expect(await calls(page)).toEqual([])
      for (const overlay of ['modal', 'popover'] as const) {
        await page.locator(`[data-overlay-open="${overlay}"]`).click()
        const input = page.locator(`[data-overlay-input="${overlay}"]`)
        await input.focus()
        await page.keyboard.press('Control+.')
        expect(await calls(page)).toEqual([])
        await expect(input).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(input).toBeHidden()
      }
      await page.locator('[data-overlay-menu] summary').click()
      await page.locator('[data-overlay-input="menu"]').focus()
      await page.keyboard.press('Control+.')
      expect(await calls(page)).toEqual([])
      await page.locator('[data-overlay-menu] summary').click()
      await act(page, 'settings')
      await prompt.focus()
      await page.keyboard.press('Control+.')
      expect(await calls(page)).toEqual([])
      await act(page, 'a')
      await ready(page, 'a')
      await act(page, 'files')
      await page.setViewportSize({ width: 320, height: 960 })
      await expect(page.locator('[data-lumen-shell]')).toHaveAttribute('data-tool-presentation', 'page')
      const file = page.locator('[data-file]')
      await file.fill('dirty file retained')
      await page.keyboard.press('Meta+.')
      await status(page, 'sending')
      await expect(file).toBeFocused()
      await act(page, 'lost')
      await status(page, 'unknown')
      await expect(notice(page)).toBeVisible()
      await expect(file).toHaveValue('dirty file retained')
      await page.emulateMedia({ forcedColors: 'active' })
      expect(
        await notice(page).evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return rect.left >= 0 && rect.right <= innerWidth && element.scrollWidth <= element.clientWidth
        }),
      ).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: join(evidence, `long-forced-colors-${locale}-320.png`) })
      expect((await calls(page)).map((call) => call.operationId)).toEqual(['a-run'])
      await clean(page, f.errors, f.forbidden)
    } finally {
      await f.context.close()
    }
  })
}
