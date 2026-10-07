import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect, type Locator } from '@playwright/test'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SessionArchiveContentInput } from '../tests/fixtures/session-archive-content-browser'
import { verifyReadableText } from './support/verify-readable-text'

const output = resolve('artifacts/desktop-elements/session-archive-content')
await mkdir(output, { recursive: true })
await build({
  configFile: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    lib: {
      entry: resolve('tests/fixtures/session-archive-content-browser.tsx'),
      name: 'SessionArchiveContent',
      formats: ['iife'],
      fileName: 'session-archive-content',
    },
    outDir: resolve(output, 'bundle'),
    emptyOutDir: true,
  },
})
const css = await Bun.file(resolve(output, 'bundle/session-archive-content.css')).text()
const script = await Bun.file(resolve(output, 'bundle/session-archive-content.iife.js')).text()
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
})
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors: string[] = []
let scenarios = 0
let currentCase: unknown
const originalTitle = (index: number) => `原始会话 ${index} Complete original session title `.repeat(3).trim()
const workspaceName = '原始工程 Original project '.repeat(5).trim()
const readCompact = async (reader: Locator, narrow: boolean) => {
  await reader.scrollIntoViewIfNeeded()
  const overflows = await reader.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
  if (narrow) expect(overflows).toBe(true)
  if (overflows) {
    await reader.focus()
    await page.keyboard.press('Home')
    const before = await reader.evaluate((node) => node.scrollLeft)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => reader.evaluate((node) => node.scrollLeft)).toBeGreaterThan(before)
  }
}
try {
  page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url.href)
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [1440, 1100, 900, 390, 320]) {
        const base = getShellCopy(locale).shell
        const suffix =
          locale === 'zh-CN'
            ? ' 完整原会话标题与所属操作'.repeat(4)
            : ' Complete original session heading and owned action'.repeat(4)
        const normal: SessionArchiveContentInput = { locale, mode, suffix, count: 3, view: 'list', state: 'ready' }
        const cases: SessionArchiveContentInput[] = [
          normal,
          { ...normal, view: 'batch' },
          { ...normal, view: 'feedback' },
        ]
        if (width === 320 && mode === 'dark')
          cases.push(
            ...[0, 1, 100, 101, 250].map((count) => ({ ...normal, count })),
            ...(['read-error', 'duplicate', 'offline'] as const).map((state) => ({ ...normal, state })),
            { ...normal, state: 'oversize', count: 101 },
            ...[0, 1, 100].map((count) => ({ ...normal, view: 'batch' as const, count })),
            ...[0, 1, 100].map((count) => ({ ...normal, view: 'selection' as const, count })),
            ...(['unknown', 'failure', 'pending', 'offline'] as const).map((state) => ({
              ...normal,
              view: 'feedback' as const,
              state,
            })),
            ...(['unknown', 'failure', 'offline'] as const).map((state) => ({
              ...normal,
              view: 'batch' as const,
              state,
            })),
          )
        for (const input of cases) {
          currentCase = { locale, mode, width, view: input.view, count: input.count, state: input.state }
          await page.setViewportSize({ width, height: 900 })
          await page.setContent(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>html{font-size:${width < 400 ? 20 : 16}px}body{margin:0;color:var(--lumen-ink);background:var(--lumen-canvas)}*{box-sizing:border-box}#session-archive-content-fixture{min-inline-size:0;min-block-size:0;block-size:100dvh;overflow:auto;display:flex;flex-direction:column}.archive-fixture-toolbar{display:flex;min-inline-size:0;overflow-x:auto;flex:0 0 auto}.archive-fixture-toolbar>button{min-inline-size:max-content;flex:0 0 auto}</style><div id="session-archive-content-fixture"></div>`,
          )
          await page.addScriptTag({ content: script })
          await page.evaluate((value) => window.mountSessionArchiveContent(value), input)
          const root = page.locator('#session-archive-content-fixture')
          if (input.view === 'list') {
            const list = root.locator('.hbar-app-react-archived-sessions')
            await verifyReadableText(
              list.locator('[data-text-context="section.title"]'),
              base.archive.listTitle(workspaceName) + suffix,
              width < 400,
            )
            const rows = list.locator('[data-archived-session-id]')
            await expect(rows).toHaveCount(Math.min(100, input.count))
            await readCompact(
              list.getByRole('group', { name: base.archive.page(1) + suffix, exact: true }).first(),
              width < 400,
            )
            if (input.state === 'read-error' || input.state === 'duplicate' || input.state === 'oversize') {
              const failure = input.state === 'read-error' ? 'DISCONNECTED' : 'INVALID_OUTPUT'
              await verifyReadableText(list.getByRole('alert'), base.archive.error(failure), false)
              await page.evaluate(() => window.repairSessionArchiveContent())
              await list.getByRole('button', { name: base.archive.firstPage + suffix, exact: true }).click()
              await expect(list.getByRole('alert')).toHaveCount(0)
              await expect(rows).toHaveCount(Math.min(100, input.count))
            }
            if (input.count === 0)
              await verifyReadableText(list.locator('[data-text-context="empty.description"]'), base.archive.empty)
            if (input.count > 100 && input.state === 'ready') {
              await list.getByRole('button', { name: base.archive.nextPage + suffix, exact: true }).click()
              await expect(rows).toHaveCount(Math.min(100, input.count - 100))
              await expect(rows.first()).toHaveAttribute('data-archived-session-id', 'original-100')
              await list.getByRole('button', { name: base.archive.firstPage + suffix, exact: true }).click()
              await expect(rows.first()).toHaveAttribute('data-archived-session-id', 'original-000')
            }
            if (input.state === 'offline') {
              await expect(
                list.getByRole('button', { name: base.archive.firstPage + suffix, exact: true }),
              ).toBeDisabled()
              await expect(rows.first().getByRole('button')).toBeDisabled()
            } else if (input.count > 0) {
              if (input.count === 3) await page.evaluate(() => window.reverseSessionArchiveContent())
              const original = list.locator('[data-archived-session-id="original-000"]')
              await verifyReadableText(
                original.locator('[data-text-context="collection.title"]'),
                originalTitle(0),
                width < 400,
              )
              await original
                .getByRole('button', { name: base.archive.restoreSession(originalTitle(0)), exact: true })
                .click()
              const restored = root.locator('.hbar-app-react-session-archive-feedback')
              await verifyReadableText(
                restored.locator('[data-text-context="feedback.title"]'),
                base.archive.restoreTitle(originalTitle(0)) + suffix,
                width < 400,
              )
              await expect(original).toHaveCount(0)
              await verifyReadableText(restored.getByRole('status'), base.archive.restored(originalTitle(0)))
              const writes = await page.evaluate(() =>
                window
                  .sessionArchiveContentState()
                  .calls.filter((call) => call.name === 'session.archive')
                  .map((call) => call.input),
              )
              expect(writes).toEqual([expect.objectContaining({ sessionId: 'original-000', archived: false })])
              await restored.getByRole('button', { name: base.archive.dismiss + suffix, exact: true }).click()
            }
            if (input.count > 0)
              expect(await page.evaluate(() => window.sessionArchiveContentBounds())).toEqual({
                page200: true,
                page201: false,
                title160: true,
                title161: false,
              })
          } else if (input.view === 'feedback') {
            const feedback = root.locator('.hbar-app-react-session-archive-feedback')
            await expect(
              root.getByRole('group', { name: base.archive.confirmTitle(originalTitle(0)) + suffix, exact: true }),
            ).toHaveCount(1)
            await verifyReadableText(
              feedback.locator('[data-text-context="feedback.title"]'),
              base.archive.confirmTitle(originalTitle(0)) + suffix,
              width < 400,
            )
            await verifyReadableText(
              feedback.locator('[data-text-context="section.description"]'),
              base.archive.description,
            )
            if (width === 320 && input.state === 'ready')
              await page.screenshot({ path: resolve(output, `${locale}-${mode}-feedback-320.png`) })
            const confirm = feedback.getByRole('button', { name: base.archive.confirm + suffix, exact: true })
            if (input.state === 'offline') await expect(confirm).toBeDisabled()
            else {
              await confirm.click()
              if (input.state === 'pending') {
                await expect(feedback.getByRole('button', { name: base.archive.archiving, exact: true })).toBeDisabled()
                await page.evaluate(() => window.repairSessionArchiveContent())
              } else if (input.state === 'unknown') {
                await verifyReadableText(feedback.getByRole('alert'), base.archive.unknown)
                await feedback.getByRole('button', { name: base.archive.reconcile + suffix, exact: true }).click()
              } else if (input.state === 'failure') {
                await verifyReadableText(feedback.getByRole('alert'), base.archive.error('BUSY'))
                await page.evaluate(() => window.repairSessionArchiveContent())
                await confirm.click()
              }
              await verifyReadableText(feedback.getByRole('status'), base.archive.archived(originalTitle(0)))
              const writes = await page.evaluate(() =>
                window
                  .sessionArchiveContentState()
                  .calls.filter((call) => call.name === 'session.archive')
                  .map((call) => call.input),
              )
              expect(writes.length).toBe(input.state === 'failure' ? 2 : 1)
              for (const write of writes)
                expect(write).toEqual(
                  expect.objectContaining({
                    sessionId: 'original-000',
                    archived: true,
                  }),
                )
              await feedback.getByRole('button', { name: base.archive.dismiss + suffix, exact: true }).click()
              await expect(feedback).toHaveCount(0)
            }
          } else {
            const batch = root.locator('.hbar-app-react-session-archive-batch')
            const hasPreview = input.view === 'batch' && input.count > 0
            const heading = hasPreview
              ? base.archiveBatch.previewTitle(input.count) + suffix
              : base.archiveBatch.selectionTitle + suffix
            await verifyReadableText(batch.locator('[data-text-context="section.title"]'), heading, width < 400)
            if (hasPreview) {
              const rows = batch.locator('.hbar-app-react-session-archive-batch-list>li')
              await expect(rows).toHaveCount(input.count)
              const target =
                input.count > 1 ? base.archiveBatch.target(workspaceName, originalTitle(0)) : originalTitle(0)
              await verifyReadableText(
                rows.first().locator('[data-text-context="collection.title"]'),
                target,
                width < 400,
              )
              await readCompact(
                rows.first().getByRole('group', { name: base.archiveBatch.pending + suffix, exact: true }),
                width < 400,
              )
              if (input.count === 100) {
                const reader = batch.locator('.hbar-app-react-session-archive-batch-reading')
                expect(await reader.evaluate((node) => node.scrollHeight > node.clientHeight + 1)).toBe(true)
                await reader.focus()
                await page.keyboard.press('ArrowDown')
                await expect.poll(() => reader.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
                await verifyReadableText(
                  rows.last().locator('[data-text-context="collection.title"]'),
                  base.archiveBatch.target('另一个工程 Other project', originalTitle(99)),
                  true,
                )
              }
              const confirm = batch.getByRole('button', { name: base.archiveBatch.confirm + suffix, exact: true })
              if (input.state === 'offline') await expect(confirm).toBeDisabled()
              else if (input.count <= 3) {
                await page.evaluate(() => window.reverseSessionArchiveContent())
                await confirm.click()
                if (input.state === 'unknown') {
                  await batch.getByRole('button', { name: base.archiveBatch.reconcile + suffix, exact: true }).click()
                  await page.evaluate(() => window.repairSessionArchiveContent())
                  await batch.getByRole('button', { name: base.archiveBatch.continue + suffix, exact: true }).click()
                }
                await expect(
                  batch.getByRole('button', { name: base.archiveBatch.dismiss + suffix, exact: true }),
                ).toBeVisible()
                const result =
                  input.state === 'failure'
                    ? base.archiveBatch.partial(input.count, input.count)
                    : base.archiveBatch.succeeded(input.count)
                await expect(batch).toContainText(result)
                const writes = await page.evaluate(() =>
                  window
                    .sessionArchiveContentState()
                    .calls.filter((call) => call.name === 'session.archive')
                    .map((call) => call.input),
                )
                expect(writes).toHaveLength(input.count)
                writes.forEach((write, index) =>
                  expect(write).toEqual(
                    expect.objectContaining({
                      sessionId: `original-${String(index).padStart(3, '0')}`,
                      archived: true,
                    }),
                  ),
                )
              }
            } else {
              const review = batch.getByRole('button', {
                name: base.archiveBatch.archiveSelected + suffix,
                exact: true,
              })
              if (!input.count) await expect(review).toBeDisabled()
              else {
                await batch
                  .getByRole('button', { name: base.archiveBatch.clearSelection + suffix, exact: true })
                  .click()
                await expect(review).toBeDisabled()
                await expect(batch).toContainText(base.archiveBatch.selectedCount(0, 100))
              }
            }
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (width === 320 && input.state === 'ready' && input.count === 3 && input.view !== 'feedback')
            await page.screenshot({ path: resolve(output, `${locale}-${mode}-${input.view}-320.png`) })
          if (input.view === 'list') {
            const close = root.getByRole('button', { name: base.archive.close + suffix, exact: true })
            await close.focus()
            await close.click()
            await expect(root.locator('.hbar-app-react-archived-sessions')).toHaveCount(0)
            await expect(root.getByRole('button', { name: base.archiveBatch.enter, exact: true })).toBeFocused()
          }
          await page.evaluate(() => window.releaseSessionArchiveContent())
          scenarios += 1
        }
      }
  expect(errors).toEqual([])
  console.log(`${scenarios} actual session archive Chrome scenarios passed.`)
} catch (reason) {
  console.error(
    JSON.stringify({ currentCase, fixture: await page.evaluate(() => window.sessionArchiveContentState()), errors }),
  )
  throw reason
} finally {
  await browser.close()
  await server.stop(true)
}
