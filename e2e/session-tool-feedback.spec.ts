import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { Message, Run, SessionEvent } from '@hbar/contracts'
import type { ToolOutcomeFixtureInput } from '../tests/fixtures/session-tool-outcome-browser'

const root = join(process.cwd(), 'artifacts/ui-repair/tool-feedback-fixture')
let server: PreviewServer | undefined
let url = ''
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await build({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    logLevel: 'warn',
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(root, 'web'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/session-tool-feedback.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Preview server address missing')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/session-tool-feedback.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})
const calls = Array.from({ length: 8 }, (_, index) => ({
  type: 'tool_call' as const,
  callId: `call-${index}`,
  name: 'read_file',
  args: { path: `source-${index}.ts` },
  presentation: { version: 1 as const, kind: 'file-read' as const, pathField: 'path' },
}))
const run: Run = {
  id: 'run',
  sessionId: 'session',
  requestId: 'request',
  modelId: 'fixture',
  input: { text: 'test', images: [] },
  status: 'running',
  createdAt: 1,
  startedAt: 1,
  endedAt: null,
  error: null,
}
const message: Message = {
  id: 'message',
  sessionId: 'session',
  runId: 'run',
  role: 'assistant',
  content: calls,
  seq: 1,
  createdAt: 1,
}
function input(
  mode: 'light' | 'dark',
): ToolOutcomeFixtureInput & { toolTimeline: NonNullable<ToolOutcomeFixtureInput['toolTimeline']> } {
  const now = Date.now()
  const first = calls[0]
  if (!first) throw new Error('Missing call')
  const completed = {
    type: 'tool_result' as const,
    callId: first.callId,
    name: first.name,
    text: 'safe local test',
    isError: false,
    execution: { startedAt: now - 2000, endedAt: now - 1000, elapsedMs: 1000 },
  }
  const messages = [{ ...message, content: [...calls, completed] }]
  const events: SessionEvent[] = [
    {
      eventId: 'start',
      sessionId: 'session',
      runId: 'run',
      seq: 2,
      stepId: null,
      type: 'tool.execution',
      time: now,
      version: 1,
      data: {
        callId: 'call-1',
        name: 'read_file',
        execution: { startedAt: now - 1000, elapsedMs: 1000, progress: { completed: 1, total: 4 } },
      },
    },
  ]
  return {
    messages,
    streaming: true,
    presentTools: true,
    motion: true,
    mode,
    toolTimeline: {
      sessionId: 'session',
      messages,
      runs: [run],
      toolEvents: events,
      toolClock: { hostTime: now, receivedAt: now },
    },
  }
}

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const width of [1440, 320]) {
    test(`timing, authentic progress and eight-call counts remain readable and freeze: ${locale} ${width}`, async ({
      browser,
    }, info) => {
      const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(url)
        const data = input(locale === 'zh-CN' ? 'dark' : 'light')
        await page.evaluate((data) => window.toolOutcomeFixture.render(data), data)
        const active = page.locator('[data-tool-call-id="call-1"].hbar-session-tool')
        const pending = page.locator('[data-tool-call-id="call-2"].hbar-session-tool')
        await expect(active.locator('[data-tool-progress]')).toHaveText('25%')
        await expect(pending.locator('.hbar-session-disclosure-status-text')).toHaveText(
          locale === 'zh-CN' ? '待执行' : 'Pending',
        )
        const counts = page.locator('.hbar-tool-batch-counts').first()
        await expect(counts).toContainText(
          locale === 'zh-CN' ? '已结束 1 · 进行中 1 · 待执行 6' : '1 settled · 1 running · 6 pending',
        )
        const elapsed = active.locator('[data-tool-elapsed]')
        const before = Number(await elapsed.getAttribute('data-tool-elapsed'))
        await expect
          .poll(async () => Number(await elapsed.getAttribute('data-tool-elapsed')))
          .toBeGreaterThan(before + 700)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const geometry = await active.evaluate((row) => {
          const status = row.querySelector('.hbar-session-disclosure-status')?.getBoundingClientRect()
          const identity = row.querySelector('.hbar-session-disclosure-identity')?.getBoundingClientRect()
          return { status, identity }
        })
        if (!geometry.status || !geometry.identity) throw new Error('Missing owned feedback bounds')
        expect(geometry.status.left >= geometry.identity.right || geometry.status.top >= geometry.identity.bottom).toBe(
          true,
        )
        await page.screenshot({ path: info.outputPath(`active-${locale}-${width}.png`), fullPage: true })
        await page.evaluate((data) => window.toolOutcomeFixture.render({ ...data, connected: false }), data)
        const paused = Number(await elapsed.getAttribute('data-tool-elapsed'))
        await page.waitForTimeout(1100)
        expect(Number(await elapsed.getAttribute('data-tool-elapsed'))).toBe(paused)
        await expect(elapsed).toContainText(locale === 'zh-CN' ? '最后记录' : 'Last observed')
        // Reload-independent final metadata, including failed batches with genuinely skipped work.
        const current = data.messages[0]
        if (!current) throw new Error('Missing fixture message')
        const final = {
          type: 'tool_result' as const,
          callId: 'call-1',
          name: 'read_file',
          text: 'proof',
          isError: false,
          execution: { startedAt: 1000, endedAt: 6000, elapsedMs: 4321 },
          batch: { total: 3, settled: 2, running: 0, pending: 0, skipped: 1, unknown: 0 },
        }

        await page.evaluate((data) => window.toolOutcomeFixture.render(data), {
          ...data,
          streaming: false,
          toolTimeline: { ...data.toolTimeline, runs: [{ ...run, status: 'completed' as const, endedAt: Date.now() }] },
          messages: [{ ...current, content: [...current.content, final] }],
        })
        await page.locator('.hbar-session-activity-summary').click()
        expect(Number(await elapsed.getAttribute('data-tool-elapsed'))).toBe(4321)
        await page.waitForTimeout(600)
        expect(Number(await elapsed.getAttribute('data-tool-elapsed'))).toBe(4321)
        await expect(active.locator('.hbar-tool-batch-counts')).toContainText(
          locale === 'zh-CN' ? '跳过 1' : '1 skipped',
        )
        await expect(active.locator('[data-tool-progress]')).toHaveText('66.6%')
        await page.screenshot({ path: info.outputPath(`finished-${locale}-${width}.png`), fullPage: true })
        const unmeasured = {
          ...data,
          toolTimeline: {
            ...data.toolTimeline,
            toolEvents: [
              {
                ...data.toolTimeline.toolEvents?.[0],
                eventId: 'unmeasured',
                sessionId: 'session',
                runId: 'run',
                seq: 3,
                stepId: null,
                type: 'tool.execution',
                time: Date.now(),
                version: 1 as const,
                data: { callId: 'call-1', name: 'read_file', execution: { startedAt: Date.now(), elapsedMs: 0 } },
              },
            ],
          },
        }
        await page.evaluate((data) => window.toolOutcomeFixture.render(data), unmeasured)
        await expect(active.locator('[data-tool-progress]')).toHaveCount(0)
        const indicator = active.locator('.hbar-session-tool-status-indicator')
        await expect(indicator).toHaveCSS('animation-name', 'hbar-tool-active-pulse')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await expect(indicator).toHaveCSS('animation-name', 'none')
        await expect(indicator).toHaveCSS('opacity', '1')
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 1100, 900, 390, 320]) {
    test(`long tool feedback has an independent keyboard reader ${locale} ${width}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(url)
        await page.evaluate(() => {
          document.documentElement.style.zoom = '1.25'
        })
        for (const mode of ['light', 'dark'] as const) {
          const source = input(mode)
          const data = { ...source, longFeedback: true, largeText: true }
          await page.evaluate((data) => window.toolOutcomeFixture.render(data), data)
          const active = page.locator('[data-tool-call-id="call-1"].hbar-session-tool')
          const button = active.locator('.hbar-session-disclosure-trigger')
          const reader = active.locator('.hbar-session-disclosure-status-reading')
          await expect(button.locator('[tabindex]')).toHaveCount(0)
          const descriptionId = await button.getAttribute('aria-describedby')
          expect(descriptionId).toBeTruthy()
          await expect(reader).toHaveAttribute('aria-labelledby', descriptionId ?? '')
          await expect(active.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '1')
          await expect(active.locator('[role="progressbar"]')).toHaveAttribute('aria-valuemax', '4')
          for (const target of [reader, page.locator('.hbar-tool-batch-metrics').first()]) {
            await target.focus()
            await expect(target).toBeFocused()
            expect(await target.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
            await target.press('ArrowRight')
            await expect.poll(() => target.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
            await expect(button).toHaveAttribute('aria-expanded', 'false')
          }
          const counts = page.locator('.hbar-tool-batch-counts').first()
          expect(await counts.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          await button.focus()
          await button.press('Enter')
          await expect(button).toHaveAttribute('aria-expanded', 'true')
          await expect(active).toHaveAttribute('data-tool-call-id', 'call-1')
          await page.screenshot({ path: info.outputPath(`long-feedback-${mode}-${width}.png`), fullPage: true })
          await button.press('Enter')
          await expect(button).toHaveAttribute('aria-expanded', 'false')
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
