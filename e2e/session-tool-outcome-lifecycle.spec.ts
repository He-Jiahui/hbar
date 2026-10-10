import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { ContentBlock, Message, ToolOutcome } from '@hbar/contracts'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import type { ToolOutcomeFixtureInput } from '../tests/fixtures/session-tool-outcome-browser'

// Production React components with controlled source props, not a Host/API bridge.
const root = join(process.cwd(), 'artifacts/tool-outcome/lifecycle')
const base = 'http://127.0.0.1:45562'
let server: PreviewServer | undefined

test.beforeAll(async () => {
  test.setTimeout(90_000)
  const probe = createServer()
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(45562, '127.0.0.1', () => probe.close((error) => (error ? reject(error) : resolve())))
  })
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/session-tool-outcome-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45562, strictPort: true },
  })
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

type Result = Extract<ContentBlock, { type: 'tool_result' }>
function call(callId = 'call-a', name = 'read_fixture'): Extract<ContentBlock, { type: 'tool_call' }> {
  return { type: 'tool_call', callId, name, args: { path: 'original/fixture.txt', sentinel: 'INPUT-ONLY' } }
}
function result(
  kind: ToolOutcome['kind'] | 'legacy-error' | 'legacy-result',
  text = 'Original full tool output',
  callId = 'call-a',
  name = 'read_fixture',
): Result {
  return {
    type: 'tool_result',
    callId,
    name,
    text,
    isError: kind !== 'succeeded' && kind !== 'legacy-result',
    ...(kind === 'legacy-error' || kind === 'legacy-result'
      ? {}
      : { outcome: { kind, executionStarted: kind !== 'denied' && kind !== 'cancelled' } }),
  }
}
function message(content: ContentBlock[], overrides: Partial<Omit<Message, 'content'>> = {}): Message {
  return {
    id: 'message-a',
    sessionId: 'session-a',
    runId: 'run-a',
    role: 'assistant',
    content,
    seq: 1,
    createdAt: 1,
    ...overrides,
  }
}
async function render(page: Page, input: ToolOutcomeFixtureInput): Promise<void> {
  await page.evaluate((input) => window.toolOutcomeFixture.render(input), input)
}
function row(page: Page, callId = 'call-a', name = 'read_fixture'): Locator {
  return page.locator(`.hbar-session-tool[data-tool-call-id="${callId}"][data-tool-name="${name}"]`)
}
function trigger(tool: Locator): Locator {
  return tool.locator(':scope > .hbar-session-disclosure-trigger')
}
async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
async function open(browser: Browser, locale: ShellLocale, width: number) {
  const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
  const errors: string[] = []
  const requests: string[] = []
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (entry) => {
    if (entry.type() === 'error' || entry.type() === 'warning') errors.push(entry.text())
  })
  page.on('websocket', () => requests.push('Unexpected WebSocket'))
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== base || /^\/(?:rpc|api|auth)(?:\/|$)/.test(url.pathname)) {
      requests.push(`${url.origin}${url.pathname}`)
      await route.abort()
    } else await route.continue()
  })
  await page.goto(base)
  await expect(page.locator('[data-fixture-outside]')).toBeVisible()
  return { page, context, errors, requests }
}
async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath(`${name}.png`) })
}
async function copyOutput(page: Page, tool: Locator, locale: ShellLocale, text: string): Promise<void> {
  const before = await page.evaluate(() => window.toolOutcomeFixture.clipboardWrites().length)
  await tool
    .getByRole('button', { name: getShellCopy(locale).session.messageBlocks.toolResultCopy.copy, exact: true })
    .click()
  expect(await page.evaluate(() => window.toolOutcomeFixture.clipboardWrites())).toHaveLength(before + 1)
  expect(await page.evaluate(() => window.toolOutcomeFixture.clipboardWrites().at(-1))).toBe(text)
}

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 320]) {
    test(`controlled outcome/disclosure/identity lifecycle ${locale} ${width}`, async ({ browser }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      const labels = getShellCopy(locale).session.messageBlocks
      try {
        await render(page, { messages: [message([call()])], streaming: true })
        const original = row(page)
        await expect(original).toHaveAttribute('data-outcome', 'pending')
        await expect(trigger(original)).toHaveAttribute('aria-expanded', 'false')
        await original.evaluate((element) => element.setAttribute('data-original-dom', 'true'))
        await page.locator('[data-fixture-outside]').focus()
        const full = `${'ERROR-FIRST-LINE '.repeat(9)}\r\n${'output only 雪 🐙\r\n'.repeat(1100)}LAST-OUTPUT-LINE`
        await render(page, { messages: [message([call(), result('failed', full)])], streaming: false })
        await expect(original).toHaveAttribute('data-original-dom', 'true')
        await expect(original).toHaveAttribute('data-outcome', 'failed')
        await expect(original).toHaveAttribute('data-failed', 'true')
        await expect(trigger(original)).toHaveAttribute('aria-expanded', 'false')
        await expect(page.locator('[data-fixture-outside]')).toBeFocused()
        // The public preview bound is 72 graphemes plus one truncation marker.
        await expect(original.locator('.hbar-session-disclosure-preview')).toHaveText(
          `${'ERROR-FIRST-LINE '.repeat(9).slice(0, 72)}…`,
        )
        await expect(original.locator('.hbar-session-disclosure-status')).toHaveText(labels.failed)
        await capture(page, info, `error-arrival-closed-${locale}-${width}`)
        await trigger(original).focus()
        await page.keyboard.press('Enter')
        await expect(trigger(original)).toBeFocused()
        await expect(trigger(original)).toHaveAttribute('aria-expanded', 'true')
        const output = original.locator('.hbar-session-tool-section').last().locator('pre')
        expect((await output.textContent())?.length).toBe(12_001)
        await copyOutput(page, original, locale, full)
        await original.getByRole('button', { name: labels.showFullContent, exact: true }).click()
        expect(await output.textContent()).toBe(full)
        await capture(page, info, `complete-output-${locale}-${width}`)
        await trigger(original).focus()
        await page.keyboard.press('Escape')
        await expect(trigger(original)).toHaveAttribute('aria-expanded', 'true')
        await expect(trigger(original)).toBeFocused()
        await page.keyboard.press('Space')
        await expect(trigger(original)).toHaveAttribute('aria-expanded', 'false')
        await expect(trigger(original)).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(trigger(original)).toHaveAttribute('aria-expanded', 'false')
        await expect(trigger(original)).toBeFocused()
        await page.keyboard.press('Enter')
        await render(page, {
          messages: [message([call(), result('succeeded', 'Replacement success')])],
          streaming: false,
        })
        await expect(original).toHaveAttribute('data-original-dom', 'true')
        await expect(trigger(original)).toHaveAttribute('aria-expanded', 'true')
        await expect(trigger(original)).toBeFocused()
        await copyOutput(page, original, locale, 'Replacement success')

        for (const identity of ['session', 'message', 'call', 'name'] as const) {
          await render(page, { messages: [message([call(), result('succeeded')])], streaming: false })
          if ((await trigger(row(page)).getAttribute('aria-expanded')) !== 'true') await trigger(row(page)).click()
          const callId = identity === 'call' ? 'call-b' : 'call-a'
          const name = identity === 'name' ? 'other_fixture' : 'read_fixture'
          const other = message([call(callId, name), result('succeeded', 'New identity', callId, name)], {
            ...(identity === 'session' ? { sessionId: 'session-b' } : {}),
            ...(identity === 'message' ? { id: 'message-b' } : {}),
          })
          await render(page, { messages: [other], streaming: false })
          await expect(trigger(row(page, callId, name))).toHaveAttribute('aria-expanded', 'false')
          await trigger(row(page, callId, name)).click()
          await render(page, { messages: [message([call(), result('succeeded')])], streaming: false })
          await expect(trigger(row(page))).toHaveAttribute('aria-expanded', 'false')
        }
        const colors: { readonly kind: string; readonly color: string }[] = []
        for (const kind of [
          'succeeded',
          'failed',
          'denied',
          'cancelled',
          'interrupted',
          'unknown',
          'legacy-error',
          'legacy-result',
        ] as const) {
          // A different source identity ensures this assertion is genuinely initial disclosure.
          await render(page, {
            messages: [
              message([call(), result(kind, 'cancelled denied USER_CANCELLED words do not decide outcome')], {
                id: kind,
              }),
            ],
            streaming: false,
            longLabels: true,
          })
          const tool = row(page)
          await expect(tool).toHaveAttribute('data-outcome', kind)
          await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'false')
          expect(await tool.getAttribute('data-failed')).toBe(kind === 'failed' ? 'true' : null)
          const expected =
            kind === 'succeeded' || kind === 'legacy-result'
              ? labels.resultAvailable
              : kind === 'legacy-error'
                ? labels.incomplete
                : labels[kind]
          await expect(tool.locator('.hbar-session-disclosure-status')).toHaveText(expected)
          colors.push({ kind, color: await trigger(tool).evaluate((element) => getComputedStyle(element).color) })
          await capture(page, info, `${kind}-${locale}-${width}`)
        }
        const failedColor = colors.find((entry) => entry.kind === 'failed')?.color
        expect(failedColor).toBeDefined()
        expect(colors.filter((entry) => entry.kind !== 'failed').every((entry) => entry.color !== failedColor)).toBe(
          true,
        )
        await render(page, { messages: [message([call()])], streaming: false })
        await expect(row(page)).toHaveAttribute('data-outcome', 'pending')
        await expect(row(page).locator('.hbar-session-disclosure-status')).toHaveText(labels.awaitingResult)
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
        await info.attach('scope', {
          contentType: 'application/json',
          body: JSON.stringify({
            host: false,
            runCount: 0,
            controlledClipboard: true,
            errors: f.errors,
            unexpectedRequests: f.requests,
          }),
        })
      } finally {
        await f.context.close()
      }
    })

    test(`controlled group reader pin and normal-flow capacity ${locale} ${width}`, async ({ browser }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      const labels = getShellCopy(locale).session.messageBlocks
      const group = (count: number): ContentBlock[] =>
        Array.from({ length: count }, (_, index) =>
          call(`group-${index}`, index % 2 ? 'write_fixture' : 'read_fixture'),
        )
      try {
        const blocks = group(3)
        await render(page, { messages: [message(blocks)], streaming: true })
        const summary = page.locator('.hbar-session-activity-summary')
        await expect(summary).toHaveAttribute('aria-expanded', 'true')
        await expect(page.locator('.hbar-session-tool')).toHaveCount(3)
        await summary.click()
        await expect(summary).toHaveAttribute('aria-expanded', 'false')
        await render(page, {
          messages: [
            message([
              ...blocks,
              result('failed', 'Failure', 'group-0'),
              result('cancelled', 'Cancelled', 'group-1', 'write_fixture'),
              result('denied', 'Denied', 'group-2'),
            ]),
          ],
          streaming: true,
        })
        await expect(summary).toHaveAttribute('aria-expanded', 'false')
        const activityText = labels.activity({
          thinkingCount: 0,
          toolCounts: [
            { name: 'read_fixture', count: 2 },
            { name: 'write_fixture', count: 1 },
          ],
          failedCount: 1,
          outcomeCounts: {
            succeeded: 0,
            failed: 1,
            denied: 1,
            cancelled: 1,
            interrupted: 0,
            unknown: 0,
            'legacy-error': 0,
            'legacy-result': 0,
            pending: 0,
          },
        })
        // Activity labels may be returned as semantic parts so the renderer
        // can style each segment. Playwright's text matcher accepts a string;
        // compare the same flattened text that the DOM exposes.
        await expect(summary).toHaveText(
          typeof activityText === 'string' ? activityText : activityText.map((part) => part.text).join(''),
        )
        await summary.focus()
        await page.keyboard.press('Enter')
        await expect(summary).toHaveAttribute('aria-expanded', 'true')
        await render(page, { messages: [message(blocks)], streaming: false })
        await expect(summary).toHaveAttribute('aria-expanded', 'true')
        await expect(summary).toBeFocused()
        await render(page, { messages: [message(blocks, { id: 'new-group' })], streaming: false })
        await expect(summary).toHaveAttribute('aria-expanded', 'false')
        await render(page, { messages: [message(blocks, { id: 'new-group' })], streaming: true })
        await expect(summary).toHaveAttribute('aria-expanded', 'true')
        await render(page, { messages: [message(blocks, { id: 'new-group' })], streaming: false })
        await expect(summary).toHaveAttribute('aria-expanded', 'false')
        for (const count of [0, 1, 100, 101]) {
          await render(page, {
            messages: [message(group(count), { id: `capacity-${count}` })],
            streaming: false,
            longLabels: true,
          })
          if (count > 1) await page.locator('.hbar-session-activity-summary').click()
          const tools = page.locator('.hbar-session-tool')
          await expect(tools).toHaveCount(count)
          await noOverflow(page)
          if (count) {
            const geometry = await tools.evaluateAll((elements) =>
              elements.map((element) => {
                const rect = element.getBoundingClientRect()
                return {
                  top: rect.top,
                  bottom: rect.bottom,
                  width: rect.width,
                  height: rect.height,
                  position: getComputedStyle(element).position,
                }
              }),
            )
            expect(
              geometry.every(
                (item, index) =>
                  item.width > 0 &&
                  item.height > 0 &&
                  item.position !== 'absolute' &&
                  item.position !== 'fixed' &&
                  (index === 0 || item.top >= geometry[index - 1]!.bottom),
              ),
            ).toBe(true)
            await tools.last().scrollIntoViewIfNeeded()
            await expect(trigger(tools.last())).toBeInViewport()
            await trigger(tools.last()).focus()
            await page.keyboard.press('Space')
            await expect(trigger(tools.last())).toHaveAttribute('aria-expanded', 'true')
            await expect(trigger(tools.last())).toBeFocused()
          }
          await capture(page, info, `capacity-${count}-${locale}-${width}`)
        }
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
      } finally {
        await f.context.close()
      }
    })

    test(`controlled exact result projection is not inferred from another source ${locale} ${width}`, async ({
      browser,
    }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      try {
        const first = message([call()])
        const otherSession = message([result('cancelled', 'OTHER-SESSION')], {
          id: 'other-session-result',
          sessionId: 'session-b',
          role: 'tool',
        })
        const otherRun = message([result('denied', 'OTHER-RUN')], {
          id: 'other-run-result',
          runId: 'run-b',
          role: 'tool',
        })
        const otherName = message([result('failed', 'OTHER-NAME', 'call-a', 'different_tool')], {
          id: 'other-name-result',
          role: 'tool',
        })
        await render(page, { messages: [first, otherSession, otherRun, otherName], streaming: false })
        const original = page.locator('[data-fixture-message="message-a"] .hbar-session-tool')
        await expect(original).toHaveAttribute('data-outcome', 'pending')
        await expect(page.locator('[data-fixture-message="other-session-result"] .hbar-session-tool')).toHaveAttribute(
          'data-outcome',
          'cancelled',
        )
        await expect(page.locator('[data-fixture-message="other-run-result"] .hbar-session-tool')).toHaveAttribute(
          'data-outcome',
          'denied',
        )
        await expect(page.locator('[data-fixture-message="other-name-result"] .hbar-session-tool')).toHaveAttribute(
          'data-outcome',
          'failed',
        )
        const exact = message([result('succeeded', 'EXACT-ORIGINAL')], { id: 'exact-result', role: 'tool' })
        const duplicate = message([result('failed', 'LATE-DUPLICATE')], { id: 'duplicate-result', role: 'tool' })
        await render(page, { messages: [first, otherSession, otherRun, otherName, exact, duplicate], streaming: false })
        await expect(original).toHaveAttribute('data-outcome', 'succeeded')
        await expect(page.locator('.hbar-session-tool')).toHaveCount(4)
        await trigger(original).click()
        await copyOutput(page, original, locale, 'EXACT-ORIGINAL')
        await expect(original).not.toContainText('OTHER-')
        await expect(original).not.toContainText('LATE-DUPLICATE')
        await capture(page, info, `scoped-projection-${locale}-${width}`)
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
      } finally {
        await f.context.close()
      }
    })
  }
