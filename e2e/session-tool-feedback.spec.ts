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
  const failed = {
    type: 'tool_result' as const,
    callId: 'call-2',
    name: 'read_file',
    text: 'Controlled failure',
    isError: true,
    outcome: { kind: 'failed' as const, executionStarted: true },
  }
  const messages = [{ ...message, content: [...calls, completed, failed] }]
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
    test(`thin progress bars show four proportional states below tools and freeze: ${locale} ${width}`, async ({
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
        const pending = page.locator('[data-tool-call-id="call-3"].hbar-session-tool')
        await expect(active.locator('[data-tool-progress]')).toHaveAttribute('data-tool-progress', '25')
        await expect(active.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
        await expect(active.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4')
        await expect(active.getByRole('progressbar')).toHaveText('')
        await expect(pending.locator('.hbar-session-disclosure-status-text')).toHaveText(
          locale === 'zh-CN' ? '待执行' : 'Pending',
        )
        const batch = page.locator('.hbar-tool-batch-feedback').first()
        await expect(batch.getByRole('progressbar')).toHaveAttribute(
          'aria-valuetext',
          locale === 'zh-CN'
            ? '25% · 已结束 2 · 进行中 1 · 待执行 5 · 成功 1 · 失败 1'
            : '25% · 2 settled · 1 running · 5 pending · 1 succeeded · 1 failed',
        )
        await expect(page.locator('.hbar-tool-batch-counts')).toHaveCount(0)
        const segments = await batch.getByRole('progressbar').evaluate((bar) => {
          const width = bar.getBoundingClientRect().width
          return [...bar.children].map((segment) => ({
            state: segment.getAttribute('data-progress-state'),
            fraction: segment.getBoundingClientRect().width / width,
            color: getComputedStyle(segment).backgroundColor,
          }))
        })
        expect(segments.map((segment) => segment.state)).toEqual(['succeeded', 'failed', 'running', 'pending'])
        for (const [index, fraction] of [0.125, 0.125, 0.125, 0.625].entries())
          expect(segments[index]?.fraction).toBeCloseTo(fraction, 2)
        expect(segments.map((segment) => segment.color)).toEqual(
          locale === 'zh-CN'
            ? ['rgb(238, 238, 238)', 'rgb(255, 150, 155)', 'rgb(239, 209, 122)', 'rgb(170, 170, 170)']
            : ['rgb(23, 23, 23)', 'rgb(183, 53, 72)', 'rgb(153, 101, 0)', 'rgb(102, 102, 102)'],
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
          const progress = row.querySelector('[role="progressbar"]')?.getBoundingClientRect()
          const trigger = row.querySelector('.hbar-session-disclosure-trigger')?.getBoundingClientRect()
          return {
            left: status?.left,
            right: identity?.right,
            progressTop: progress?.top,
            progressHeight: progress?.height,
            triggerBottom: trigger?.bottom,
          }
        })
        expect(geometry.left).toBeGreaterThanOrEqual(geometry.right ?? 0)
        expect(geometry.progressHeight).toBe(2)
        expect(geometry.progressTop).toBeGreaterThanOrEqual(geometry.triggerBottom ?? 0)
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
          batch: {
            total: 3,
            settled: 2,
            running: 0,
            pending: 0,
            skipped: 1,
            unknown: 0,
            outcomes: { succeeded: 1, failed: 1 },
          },
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
        await expect(active.getByRole('progressbar')).toHaveAttribute(
          'aria-valuetext',
          new RegExp(locale === 'zh-CN' ? '跳过 1' : '1 skipped'),
        )
        await expect(active.locator('[data-tool-progress]')).toHaveAttribute('data-tool-progress', '66.6')
        await expect(active.locator('[data-progress-state="succeeded"]')).toHaveCount(1)
        await expect(active.locator('[data-progress-state="failed"]')).toHaveCount(1)
        await expect(active.locator('[data-progress-state="running"]')).toHaveCount(0)
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
        await page.evaluate((data) => window.toolOutcomeFixture.render({ ...data, longLabels: true }), data)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
