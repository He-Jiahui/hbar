import { expect, test, type Browser, type Locator, type Page, type TestInfo } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { ContentBlock, Message, ToolCallPresentation } from '@hbar/contracts'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import type { ToolPresentationFixtureInput } from '../tests/fixtures/session-tool-presentation-browser'

// Controlled real React/presenter rendering; deliberately no Host, provider or tool execution.
const root = join(process.cwd(), 'artifacts/tool-presentation/controlled')
const base = 'http://127.0.0.1:45572'
let server: PreviewServer | undefined

test.beforeAll(async () => {
  test.setTimeout(90_000)
  const probe = createServer()
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(45572, '127.0.0.1', () => probe.close((error) => (error ? reject(error) : resolve())))
  })
  await mkdir(root, { recursive: true })
  await mkdir(join(process.cwd(), 'artifacts', 'compact-tool-actions'), { recursive: true })
  await mkdir(join(process.cwd(), 'artifacts', 'tool-status-tones'), { recursive: true })
  await mkdir(join(process.cwd(), 'artifacts', 'session-text-color'), { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="../../../tests/fixtures/session-tool-presentation-browser.tsx"></script></body></html>',
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
    preview: { host: '127.0.0.1', port: 45572, strictPort: true },
  })
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
  await writeFile(join(root, 'cleanup.json'), JSON.stringify({ ownedPreviewClosed: true, port: 45572 }))
})

type Call = Extract<ContentBlock, { type: 'tool_call' }>
type Result = Extract<ContentBlock, { type: 'tool_result' }>
const posix = `/fixture/${'long-directory/模块/'.repeat(12)}alpha/same-basename.tsx`
const windows = `C:\\fixture\\${'long-directory\\模块\\'.repeat(12)}beta\\same-basename.tsx`
const command = `printf '%s\\n' '${'long command 雪 with spaces /\\ '.repeat(12)}'`
const description = 'Inspect the exact requested fixture; never execute this controlled command'
const fullOutput = `${'Original output 雪 🐙\r\n'.repeat(850)}OUTPUT-END`

function call(
  id: string,
  presentation?: ToolCallPresentation,
  args: Record<string, unknown> = { target: posix, sentinel: 'INPUT-ONLY' },
  name = `custom_${id}`,
): Call {
  return { type: 'tool_call', callId: id, name, args, ...(presentation ? { presentation } : {}) }
}
function result(input: Call, failed = false, text = fullOutput): Result {
  return {
    type: 'tool_result',
    callId: input.callId,
    name: input.name,
    text,
    isError: failed,
    outcome: { kind: failed ? 'failed' : 'succeeded', executionStarted: true },
  }
}
function message(content: ContentBlock[], id = 'message-a', source: Partial<Omit<Message, 'content'>> = {}): Message {
  return {
    id,
    sessionId: 'session-a',
    runId: 'run-a',
    role: 'assistant',
    content,
    seq: 1,
    createdAt: 1,
    ...source,
  }
}
function row(page: Page, id: string): Locator {
  return page.locator(`.hbar-session-tool[data-tool-call-id="${id}"]`)
}
function trigger(tool: Locator): Locator {
  return tool.locator(':scope > .hbar-session-disclosure-trigger')
}
async function render(page: Page, input: ToolPresentationFixtureInput): Promise<void> {
  await page.evaluate((input) => window.toolPresentationFixture.render(input), input)
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
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
async function screenshot(page: Page, info: TestInfo, name: string, fullPage = false) {
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage })
}
async function copyOutput(page: Page, tool: Locator, locale: ShellLocale, text: string) {
  const before = await page.evaluate(() => window.toolPresentationFixture.clipboardWrites().length)
  await tool
    .getByRole('button', { name: getShellCopy(locale).session.messageBlocks.toolResultCopy.copy, exact: true })
    .click()
  expect(await page.evaluate(() => window.toolPresentationFixture.clipboardWrites())).toHaveLength(before + 1)
  expect(await page.evaluate(() => window.toolPresentationFixture.clipboardWrites().at(-1))).toBe(text)
}

test('command reading keeps original arguments, complete Copy and failure recovery in one surface', async ({
  browser,
}, info) => {
  const f = await open(browser, 'en-US', 1440)
  try {
    const source = 'printf "雪 👩‍💻"\r\nprintf "done"'
    const original = call(
      'reading',
      { version: 1, kind: 'command', commandField: 'cmd' },
      { cmd: source, timeout: 123, extra: 'OPTION-REMAINS' },
      'custom-exec',
    )
    const readable = Array.from({ length: 25 }, (_, i) => `output-${i + 1} 雪`).join('\r\n') + '\r\n'
    const stdout = '\u001b]0;fixture title\u0007\u001b[2KDownloading\r\u001b[32m' + readable + '\u001b[0m'
    await render(f.page, { locale: 'en-US', messages: [message([original])], streaming: true })
    const tool = row(f.page, 'reading')
    await trigger(tool).focus()
    await f.page.keyboard.press('Enter')
    const card = tool.locator('.hbar-session-command')
    await expect(card.locator('.hbar-session-command-input pre')).toHaveText(source)
    await expect(card.locator('[data-command-output]')).toHaveCount(0)
    const argumentsButton = card.getByRole('button', {
      name: getShellCopy('en-US').session.messageBlocks.originalInput,
      exact: true,
    })
    await argumentsButton.focus()
    await argumentsButton.press('Enter')
    await expect(card.locator('.hbar-session-command-original pre')).toHaveText(JSON.stringify(original.args, null, 2))
    await render(f.page, { locale: 'en-US', messages: [message([original, result(original, false, stdout)])] })
    await expect(argumentsButton).toBeFocused()
    await expect(card.locator('[data-command-output-tail]')).toBeHidden()
    expect(await card.locator('[data-command-output]').textContent()).toBe(readable)
    const rawToggle = card.locator('.hbar-session-command-view-toggle')
    await rawToggle.focus()
    await rawToggle.press('Enter')
    await expect(rawToggle).toBeFocused()
    await expect(rawToggle).toHaveAttribute('aria-pressed', 'true')
    expect(await card.locator('[data-command-output]').textContent()).toBe(stdout)
    await copyOutput(f.page, tool, 'en-US', stdout)
    await rawToggle.focus()
    await rawToggle.press('Space')
    await expect(rawToggle).toBeFocused()
    await expect(rawToggle).toHaveAttribute('aria-pressed', 'false')
    await copyOutput(f.page, tool, 'en-US', stdout)
    const more = card.getByRole('button', {
      name: getShellCopy('en-US').session.messageBlocks.showMoreOutput(13),
      exact: true,
    })
    await more.focus()
    await more.press('Enter')
    await expect(card.locator('[data-command-output-tail]')).toBeVisible()
    const less = card.getByRole('button', {
      name: getShellCopy('en-US').session.messageBlocks.showLessContent,
      exact: true,
    })
    await expect(less).toBeFocused()
    await screenshot(f.page, info, 'command-reading-expanded-en-US-1440')
    await less.press('Space')
    await expect(more).toBeFocused()
    await expect(card.locator('[data-command-output-tail]')).toBeHidden()
    const readableError = 'ORIGINAL FAILURE\r\n' + 'diagnostic 雪\r\n'.repeat(1200) + 'ERROR-END'
    const error = '\u001b[31m' + readableError + '\u001b[0m'
    await render(f.page, {
      locale: 'zh-CN',
      longLabels: true,
      messages: [message([original, result(original, true, error)])],
    })
    await f.page.setViewportSize({ width: 320, height: 960 })
    const labels = getShellCopy('zh-CN').session.messageBlocks
    expect(await card.locator('[data-command-output]').textContent()).toBe(readableError)
    await expect(card.locator('[data-command-output-tail]')).toHaveCount(0)
    await expect(card.getByText(labels.errorOutput, { exact: true })).toBeVisible()
    await expect(card.locator('.hbar-session-command-output-toggle')).toHaveCount(0)
    await expect(card.locator('.hbar-session-command-original pre')).toHaveText(JSON.stringify(original.args, null, 2))
    await copyOutput(f.page, tool, 'zh-CN', error)
    await rawToggle.click()
    expect(await card.locator('[data-command-output]').textContent()).toBe(error)
    await expect(card.locator('[data-command-output-tail]')).toHaveCount(0)
    await rawToggle.click()
    const output = card.locator('[data-command-output]')
    await output.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    expect(await output.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await screenshot(f.page, info, 'command-reading-error-zh-CN-320')
    await trigger(tool).focus()
    await f.page.keyboard.press('Space')
    await expect(card).toHaveCount(0)
    await expect(trigger(tool)).toBeFocused()
    expect(f.errors).toEqual([])
    expect(f.requests).toEqual([])
  } finally {
    await f.context.close()
  }
})
async function readableSummary(tool: Locator) {
  const summary = tool.locator('.hbar-session-disclosure-preview')
  await expect(summary).toBeVisible()
  const geometry = await summary.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height, text: element.textContent }
  })
  expect(geometry.width).toBeGreaterThan(0)
  expect(geometry.height).toBeGreaterThan(0)
  expect(geometry.text).not.toBe('')
  return geometry
}

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 320]) {
    test(`session semantic text colors survive folding and live transitions ${locale} ${width}`, async ({
      browser,
    }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      const read = call(
        'color-read',
        { version: 1, kind: 'file-read', pathField: 'path' },
        { path: 'composer-permission.ts' },
      )
      const failed = call(
        'color-search',
        { version: 1, kind: 'text-search', patternField: 'pattern' },
        { pattern: 'hostDefault' },
      )
      const thought =
        '**Considering tools and budget** — `composer-permission.ts` [reference](https://example.invalid)\n\n检查 **权限配置**，保留 `sandbox` 与原始输入。'
      const text =
        '## 会话输出 · Session output\n\n正文保留舒适对比，**重点信息**、*补充说明*、`sandbox` 与 [官方文档](https://example.invalid) 使用语义着色。\n\n> 检查配置后继续执行，保持原始输出可复制。\n\n- 保留文件与工具身份\n- 任务状态就近显示\n\n```typescript\nconst result = { enabled: true, count: 42 };\n```'
      const content: ContentBlock[] = [
        { type: 'thinking', text: thought },
        read,
        result(read),
        failed,
        result(failed, true, 'Workspace query exceeded 30 seconds'),
        { type: 'text', text },
      ]
      try {
        for (const theme of ['light', 'dark'] as const) {
          await render(page, { locale, theme, messages: [message(content)] })
          const summary = page.locator('.hbar-session-activity-summary')
          await expect(summary).toHaveAttribute('aria-expanded', 'false')
          const colors = await page.locator('.hbar-session-message-prose').evaluate((element) => ({
            body: getComputedStyle(element).color,
            heading: getComputedStyle(element.querySelector('h2') ?? element).color,
            emphasis: getComputedStyle(element.querySelector('strong') ?? element).color,
            code: getComputedStyle(element.querySelector('p code') ?? element).color,
            link: getComputedStyle(element.querySelector('a') ?? element).color,
          }))
          expect(new Set(Object.values(colors)).size).toBeGreaterThanOrEqual(4)
          const parts = await summary
            .locator('[data-activity-role]')
            .evaluateAll((elements) =>
              elements.map((element) => ({
                role: element.getAttribute('data-activity-role'),
                text: element.textContent,
                color: getComputedStyle(element).color,
              })),
            )
          expect(parts.some((part) => part.role === 'count')).toBe(true)
          expect(new Set(parts.map((part) => part.color)).size).toBeGreaterThanOrEqual(4)
          await noOverflow(page)
          await page.locator('[data-fixture-outside]').focus()
          await page
            .locator('.tool-presentation-fixture-messages')
            .screenshot({ path: `artifacts/session-text-color/folded-${locale}-${theme}-${width}.png` })
          await summary.focus()
          await page.keyboard.press('Enter')
          const thinking = page.locator('.hbar-session-thinking')
          await expect(thinking.locator('.hbar-session-disclosure-preview strong')).toHaveText(
            'Considering tools and budget',
          )
          await expect(thinking.locator('.hbar-session-disclosure-preview code')).toHaveText('composer-permission.ts')
          await expect(thinking.locator('.hbar-session-disclosure-preview a')).toHaveCount(0)
          const thoughtTrigger = trigger(thinking)
          await thoughtTrigger.focus()
          await page.keyboard.press('Enter')
          await expect(thinking.locator('.hbar-session-thinking-content strong')).toHaveText([
            'Considering tools and budget',
            '权限配置',
          ])
          const code = page.locator('.hbar-message-code code').first()
          await expect(code).toHaveAttribute('data-code-highlight', 'ready')
          expect(await code.textContent()).toBe('const result = { enabled: true, count: 42 };\n')
          await render(page, { locale, theme, motion: true, streaming: true, messages: [message(content)] })
          await expect(thoughtTrigger).toBeFocused()
          await expect(thoughtTrigger).toHaveAttribute('aria-expanded', 'true')
          await expect(thinking.locator('.hbar-session-disclosure-label-text')).toHaveAttribute(
            'data-lumen-state',
            'running',
          )
          const motion = await thinking
            .locator('.hbar-session-disclosure-label-text')
            .evaluate((element) => ({
              animation: getComputedStyle(element).animationName,
              before: element.getBoundingClientRect().height,
            }))
          expect(motion.animation).toBe('lumen-breathe')
          await noOverflow(page)
          await page
            .locator('.tool-presentation-fixture-messages')
            .screenshot({ path: `artifacts/session-text-color/live-${locale}-${theme}-${width}.png` })
          await page.emulateMedia({ reducedMotion: 'reduce' })
          await expect
            .poll(() =>
              thinking
                .locator('.hbar-session-disclosure-label-text')
                .evaluate((element) => getComputedStyle(element).animationName),
            )
            .toBe('none')
          await render(page, { locale, theme, messages: [message(content)] })
          await expect(thoughtTrigger).toHaveAttribute('aria-expanded', 'true')
          await thoughtTrigger.press('Space')
          await summary.focus()
          await summary.press('Space')
          await page.emulateMedia({ reducedMotion: 'no-preference' })
          await info.attach(`semantic-text-${theme}`, {
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify({ colors, parts, motion })),
          })
        }
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
      } finally {
        await f.context.close()
      }
    })

    test(`result tones and blue breathing retain a stable disclosure ${locale} ${width}`, async ({ browser }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      const copy = getShellCopy(locale).session.messageBlocks
      const calls = ['success', 'failure', 'missing', 'active'].map((id) =>
        call(`tone-${id}`, { version: 1, kind: 'file-read', pathField: 'path' }, { path: `${id}.ts` }),
      )
      const [success, failure, missing, active] = calls
      if (!success || !failure || !missing || !active) throw new Error('Tool tone fixtures are missing')
      const messages = [
        message([success, result(success)], 'tone-success'),
        message([failure, result(failure, true, 'Original failed output')], 'tone-failure'),
        message([missing], 'tone-missing'),
        message([active], 'tone-active', { runId: 'active-run' }),
      ]
      const activeRow = row(page, active.callId)
      const status = activeRow.locator('.hbar-session-disclosure-status')
      const lamp = activeRow.locator('.hbar-session-tool-status-indicator')
      const fixture = (theme: 'light' | 'dark', motion = true): ToolPresentationFixtureInput => ({
        locale,
        theme,
        motion,
        messages,
        activeRunIds: ['active-run'],
      })
      const expectTone = async (tool: Locator, tone: string, text: string) => {
        const state = tool.locator('.hbar-session-disclosure-status')
        await expect(state).toHaveAttribute('data-status-tone', tone)
        await expect(state).toHaveText(text)
        await expect
          .poll(() =>
            state.evaluate((element, tone) => {
              const probe = document.createElement('span')
              probe.style.color = `var(--lumen-${tone})`
              element.append(probe)
              const expected = getComputedStyle(probe).color
              probe.remove()
              return getComputedStyle(element).color === expected
            }, tone),
          )
          .toBe(true)
      }
      try {
        for (const theme of ['light', 'dark'] as const) {
          await page.emulateMedia({ reducedMotion: 'no-preference' })
          await render(page, fixture(theme))
          await page.locator('[data-fixture-outside]').focus()
          await expectTone(row(page, success.callId), 'success', copy.resultAvailable)
          await expectTone(row(page, failure.callId), 'danger', copy.failed)
          await expectTone(row(page, missing.callId), 'warning', copy.awaitingResult)
          await expectTone(activeRow, 'info', copy.running)
          const breathing = await lamp.evaluate((element) => {
            const animation = element
              .getAnimations()
              .find((candidate) => candidate instanceof CSSAnimation && candidate.animationName === 'lumen-breathe')
            if (!animation?.effect) throw new Error('Blue progress lamp has no breathing animation')
            const duration = animation.effect.getTiming().duration
            if (typeof duration !== 'number') throw new Error('Breathing duration is not resolved')
            const originalTime = animation.currentTime
            animation.pause()
            animation.currentTime = 0
            const low = getComputedStyle(element).boxShadow
            const measure = () => {
              const rect = element.getBoundingClientRect()
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }
            const before = measure()
            animation.currentTime = duration / 2
            const high = getComputedStyle(element).boxShadow
            const after = measure()
            animation.currentTime = originalTime ?? 0
            animation.play()
            return { low, high, before, after, duration, opacity: getComputedStyle(element).opacity }
          })
          expect(breathing.low).not.toBe(breathing.high)
          expect(breathing.before).toEqual(breathing.after)
          expect(breathing.duration).toBeGreaterThan(0)
          expect(breathing.opacity).toBe('1')
          await noOverflow(page)
          await page.locator('.tool-presentation-fixture-messages').screenshot({
            path: `artifacts/tool-status-tones/status-${locale}-${theme}-${width}.png`,
          })
          await trigger(activeRow).focus()
          await page.keyboard.press('Enter')
          await expect(trigger(activeRow)).toHaveAttribute('aria-expanded', 'true')
          const settled = {
            ...fixture(theme),
            messages: messages.map((item) =>
              item.id === 'tone-active' ? { ...item, content: [active, result(active)] } : item,
            ),
          }
          const transition = await status.evaluate(async (element, input) => {
            const before = getComputedStyle(element).color
            const height = element.getBoundingClientRect().height
            window.toolPresentationFixture.render(input)
            const colors: string[] = []
            for (let frame = 0; frame < 8; frame += 1) {
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
              colors.push(getComputedStyle(element).color)
            }
            return { before, colors, height, afterHeight: element.getBoundingClientRect().height }
          }, settled)
          expect(new Set(transition.colors).size).toBeGreaterThan(1)
          expect(transition.afterHeight).toBe(transition.height)
          await expectTone(activeRow, 'success', copy.resultAvailable)
          await expect(trigger(activeRow)).toBeFocused()
          await expect(trigger(activeRow)).toHaveAttribute('aria-expanded', 'true')
          await expect(activeRow.locator('pre').first()).toHaveText(JSON.stringify(active.args, null, 2))
          await expect.poll(() => lamp.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
          await page.keyboard.press('Space')
          await render(page, fixture(theme))
          await page.emulateMedia({ reducedMotion: 'reduce' })
          await expect.poll(() => lamp.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
          await expectTone(activeRow, 'info', copy.running)
          await page.emulateMedia({ reducedMotion: 'no-preference' })
          await render(page, fixture(theme, false))
          await expect.poll(() => lamp.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
          await expectTone(activeRow, 'info', copy.running)
          await info.attach(`tool-status-motion-${theme}`, {
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify({ breathing, transition })),
          })
        }
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
      } finally {
        await f.context.close()
      }
    })

    test(`compact action tags retain descriptions and disclosure ${locale} ${width}`, async ({ browser }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      const read = call(
        'compact-read',
        { version: 1, kind: 'file-read', pathField: 'path' },
        { path: 'composer-permission.ts' },
      )
      const write = call(
        'compact-write',
        { version: 1, kind: 'file-write', pathField: 'path' },
        { path: 'settings.ts', text: 'original write' },
      )
      const search = call(
        'compact-search',
        { version: 1, kind: 'text-search', patternField: 'pattern' },
        { pattern: 'hostDefault' },
      )
      const generic = call('compact-generic', undefined, { ref: 'HEAD' }, 'git_log')
      const failed = call(
        'compact-failed',
        { version: 1, kind: 'text-search', patternField: 'pattern' },
        { pattern: 'approval' },
      )
      const pending = call(
        'compact-pending',
        { version: 1, kind: 'file-read', pathField: 'path' },
        { path: 'next-step.ts' },
      )
      const content = [
        read,
        result(read),
        write,
        result(write),
        search,
        result(search),
        generic,
        result(generic),
        failed,
        result(failed, true, 'Workspace query exceeded 30 seconds'),
        pending,
      ]
      try {
        for (const theme of ['light', 'dark'] as const) {
          await render(page, { locale, theme, streaming: true, messages: [message(content)] })
          const tools = page.locator('.hbar-session-tool')
          await expect(tools).toHaveCount(6)
          await noOverflow(page)
          const geometry = await tools.evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect()
              const button = element.querySelector('.hbar-session-disclosure-trigger')
              const label = element.querySelector('.hbar-session-disclosure-label')
              const summary = element.querySelector('.hbar-session-disclosure-preview')
              const card = element.closest('[data-lumen-component="tool-calls"]')
              if (!button || !label || !summary || !card) throw new Error('Compact tool row lacks its content contract')
              const tag = label.getBoundingClientRect()
              const behavior = summary.getBoundingClientRect()
              return {
                height: box.height,
                cardHeight: card.getBoundingClientRect().height,
                buttonHeight: button.getBoundingClientRect().height,
                tagRight: tag.right,
                behaviorLeft: behavior.left,
                tagTop: tag.top,
                behaviorTop: behavior.top,
                border: getComputedStyle(card).borderTopWidth,
                padding: getComputedStyle(card.firstElementChild ?? card).padding,
                tagTextWhiteSpace: getComputedStyle(label.querySelector('.hbar-session-disclosure-label-text') ?? label)
                  .whiteSpace,
              }
            }),
          )
          await info.attach(`compact-geometry-${theme}`, {
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify(geometry)),
          })
          await writeFile(
            `artifacts/compact-tool-actions/geometry-${locale}-${theme}-${width}.json`,
            JSON.stringify(geometry, null, 2),
          )
          await page.screenshot({ path: `artifacts/compact-tool-actions/rows-${locale}-${theme}-${width}.png` })
          await page
            .locator('.hbar-session-message-blocks')
            .first()
            .screenshot({
              path: `artifacts/compact-tool-actions/actions-${locale}-${theme}-${width}.png`,
            })
          for (const item of geometry) {
            expect(item.cardHeight).toBeLessThanOrEqual(40)
            expect(item.buttonHeight).toBeGreaterThanOrEqual(30)
            expect(item.tagRight).toBeLessThanOrEqual(item.behaviorLeft)
            expect(Math.abs(item.tagTop - item.behaviorTop)).toBeLessThanOrEqual(5)
            expect(item.border).toBe('0px')
            expect(item.padding).toBe('0px')
            expect(item.tagTextWhiteSpace).toBe('nowrap')
          }
          await expect(row(page, generic.callId).locator('.hbar-session-disclosure-label')).toHaveText(
            locale === 'zh-CN' ? '工具调用' : 'Tool call',
          )
          await expect(row(page, generic.callId).locator('.hbar-session-disclosure-preview')).toHaveText('git_log')
          await expect(row(page, pending.callId)).toHaveAttribute('data-outcome', 'pending')
          await expect(row(page, failed.callId)).toHaveAttribute('data-outcome', 'failed')
          const readRow = row(page, read.callId)
          await trigger(readRow).focus()
          await page.keyboard.press('Enter')
          await expect(trigger(readRow)).toHaveAttribute('aria-expanded', 'true')
          await expect(readRow.locator('pre').first()).toHaveText(JSON.stringify(read.args, null, 2))
          await page.keyboard.press('Space')
          await expect(trigger(readRow)).toHaveAttribute('aria-expanded', 'false')
          await expect(trigger(readRow)).toBeFocused()
          await render(page, {
            locale,
            theme,
            streaming: true,
            longLabels: true,
            messages: [
              message([
                { type: 'thinking', text: 'Inspect the exact requested tool input without changing the conversation.' },
                ...content,
              ]),
            ],
          })
          await expect(tools).toHaveCount(6)
          const singleLine = await page.locator('.hbar-session-disclosure-label-text').evaluateAll((elements) =>
            elements.map((element) => ({
              whiteSpace: getComputedStyle(element).whiteSpace,
              height: element.getBoundingClientRect().height,
              text: element.textContent,
            })),
          )
          expect(singleLine).toHaveLength(7)
          expect(
            singleLine.every((item) => item.whiteSpace === 'nowrap' && item.height <= 20 && Boolean(item.text)),
          ).toBe(true)
          expect(
            await tools.evaluateAll((elements) =>
              elements.every((element) => element.getBoundingClientRect().height <= 40),
            ),
          ).toBe(true)
          await noOverflow(page)
        }
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
      } finally {
        await f.context.close()
      }
    })
  }

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 320]) {
    test(`canonical identity, exact input and full output ${locale} ${width}`, async ({ browser }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      const labels = getShellCopy(locale).session.messageBlocks
      const cases = [
        {
          call: call('read', { version: 1, kind: 'file-read', pathField: 'target' }),
          icon: 'file',
          summary: 'same-basename.tsx',
          title: posix,
        },
        {
          call: call(
            'write',
            { version: 1, kind: 'file-write', pathField: 'target' },
            { target: windows, text: 'line one\nline two' },
          ),
          icon: 'file-write',
          summary: 'same-basename.tsx',
          title: windows,
        },
        {
          call: call(
            'edit',
            { version: 1, kind: 'file-edit', pathField: 'target' },
            { target: posix, oldText: 'old', newText: 'new' },
          ),
          icon: 'file-edit',
          summary: 'same-basename.tsx',
          title: posix,
        },
        {
          call: call(
            'directory',
            { version: 1, kind: 'directory-list', pathField: 'target' },
            { target: 'C:\\项目\\子目录' },
          ),
          icon: 'directory',
          summary: '子目录',
          title: 'C:\\项目\\子目录',
        },
        {
          call: call(
            'command',
            { version: 1, kind: 'command', commandField: 'cmd', descriptionField: 'why' },
            { cmd: command, why: description, timeout: 42 },
          ),
          icon: 'terminal',
          summary: description,
          title: command,
        },
        {
          call: call(
            'raw_command',
            { version: 1, kind: 'command', commandField: 'cmd', descriptionField: 'why' },
            { cmd: command, why: '  ' },
          ),
          icon: 'terminal',
          title: command,
        },
        {
          call: call(
            'search',
            { version: 1, kind: 'text-search', patternField: 'needle', pathField: 'target' },
            { needle: 'identity-needle', target: '/fixture/src' },
          ),
          icon: 'search',
          summary: 'identity-needle',
        },
        {
          call: call(
            'files',
            { version: 1, kind: 'file-search', queryField: 'query', includeField: 'globs' },
            { query: 'same-basename', globs: ['**/*.tsx', '**/*.ts'] },
          ),
          icon: 'search',
        },
        {
          call: call(
            'includes',
            { version: 1, kind: 'file-search', includeField: 'globs' },
            { globs: ['**/*.tsx', '**/*.ts'] },
          ),
          icon: 'search',
          summary: '**/*.tsx, **/*.ts',
        },
      ]
      try {
        await render(page, { locale, messages: cases.map(({ call }) => message([call, result(call)], call.callId)) })
        const geometry: unknown[] = []
        for (const item of cases) {
          const tool = row(page, item.call.callId)
          await expect(tool).toHaveAttribute('data-presentation-icon', item.icon)
          await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'false')
          if (item.summary) await expect(tool.locator('.hbar-session-disclosure-preview')).toContainText(item.summary)
          if (item.title)
            await expect(trigger(tool)).toHaveAttribute(
              'title',
              new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
            )
          geometry.push({ id: item.call.callId, ...(await readableSummary(tool)) })
        }
        await expect(row(page, 'command').locator('.hbar-session-disclosure-preview')).toHaveAttribute(
          'data-format',
          'text',
        )
        await expect(row(page, 'raw_command').locator('.hbar-session-disclosure-preview')).toHaveAttribute(
          'data-format',
          'code',
        )
        await screenshot(page, info, `families-${locale}-${width}`, true)
        for (const item of [cases[0]!, cases[1]!, cases[4]!]) {
          const tool = row(page, item.call.callId)
          if (item.call.callId === 'read') {
            const beforeUrl = page.url()
            await tool.locator('.hbar-session-disclosure-preview').click()
            expect(page.url()).toBe(beforeUrl)
            await expect(tool.locator('a')).toHaveCount(0)
          } else {
            await trigger(tool).focus()
            await page.keyboard.press('Enter')
          }
          await expect(trigger(tool)).toBeFocused()
          await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'true')
          const command = item.call.presentation?.kind === 'command'
          if (command) await tool.getByRole('button', { name: labels.originalInput, exact: true }).click()
          const input = command
            ? tool.locator('.hbar-session-command-original pre')
            : tool.locator('.hbar-session-tool-section').first().locator('pre')
          expect(await input.textContent()).toBe(JSON.stringify(item.call.args, null, 2))
          await copyOutput(page, tool, locale, fullOutput)
          const output = tool.locator('.hbar-session-tool-section').last().locator('pre')
          if (command) {
            await expect(tool.locator('[data-command-output-tail]')).toBeHidden()
            await tool.locator('.hbar-session-command-output-toggle').click()
            await expect(tool.locator('[data-command-output-tail]')).toBeVisible()
          } else {
            expect((await output.textContent())?.length).toBe(12_001)
            await tool.getByRole('button', { name: labels.showFullContent, exact: true }).click()
          }
          expect(await output.textContent()).toBe(fullOutput)
          await trigger(tool).scrollIntoViewIfNeeded()
          await screenshot(page, info, `details-${item.call.callId}-${locale}-${width}`)
          await trigger(tool).focus()
          await page.keyboard.press('Escape')
          await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'true')
          await page.keyboard.press('Space')
          await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'false')
          await expect(trigger(tool)).toBeFocused()
        }
        const malformed = call(
          'bad',
          { version: 1, kind: 'command', commandField: 'command', descriptionField: 'description' },
          { command: 42, description: false, path: ['not', 'a', 'path'] },
        )
        const legacy = call('legacy', undefined, { path: posix, command }, 'read_file')
        const unknown = call(
          'unknown',
          undefined,
          { path: windows, command },
          `Unknown_${'very_long_raw_name_'.repeat(12)}`,
        )
        const orphan = result(call('orphan', undefined, {}, 'read_file'))
        await render(page, {
          locale,
          messages: [
            message([malformed, result(malformed)], 'bad'),
            message([legacy, result(legacy)], 'legacy'),
            message([unknown, result(unknown)], 'unknown'),
            message([orphan], 'orphan'),
          ],
        })
        for (const id of ['legacy', 'unknown', 'orphan']) {
          await expect(row(page, id)).toHaveAttribute('data-presentation-icon', 'tool')
        }
        await expect(row(page, 'legacy').locator('.hbar-session-disclosure-preview')).toHaveText(legacy.name)
        await expect(row(page, 'unknown').locator('.hbar-session-disclosure-preview')).toHaveText(/^Unknown_.*…$/)
        await expect(row(page, 'orphan').locator('.hbar-session-disclosure-preview')).toHaveCount(0)
        await trigger(row(page, 'bad')).click()
        expect(await row(page, 'bad').locator('.hbar-session-tool-section').first().locator('pre').textContent()).toBe(
          JSON.stringify(malformed.args, null, 2),
        )
        await copyOutput(page, row(page, 'bad'), locale, fullOutput)
        await screenshot(page, info, `malformed-legacy-unknown-${locale}-${width}`)
        await trigger(row(page, 'bad')).click()
        await row(page, 'unknown').scrollIntoViewIfNeeded()
        await expect(trigger(row(page, 'unknown'))).toBeInViewport()
        await screenshot(page, info, `unknown-full-row-${locale}-${width}`)
        await trigger(row(page, 'orphan')).click()
        await expect(row(page, 'orphan').locator('.hbar-session-tool-section')).toHaveCount(1)
        await copyOutput(page, row(page, 'orphan'), locale, fullOutput)
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
        await info.attach('geometry-and-scope', {
          contentType: 'application/json',
          body: JSON.stringify({
            geometry,
            host: false,
            runs: 0,
            clipboard: 'controlled',
            errors: f.errors,
            requests: f.requests,
          }),
        })
      } finally {
        await f.context.close()
      }
    })

    test(`locale, result replacement and exact disclosure identity ${locale} ${width}`, async ({ browser }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      const original = call('identity', { version: 1, kind: 'file-read', pathField: 'target' })
      try {
        await render(page, { locale, messages: [message([original])], streaming: true })
        const tool = row(page, 'identity')
        await tool.evaluate((element) => element.setAttribute('data-original-dom', 'true'))
        await page.locator('[data-fixture-outside]').focus()
        await render(page, {
          locale,
          messages: [message([original, result(original, true, 'FAILED-FIRST-LINE\nFull error detail')])],
        })
        await expect(tool).toHaveAttribute('data-original-dom', 'true')
        await expect(tool).toHaveAttribute('data-outcome', 'failed')
        await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'false')
        await expect(page.locator('[data-fixture-outside]')).toBeFocused()
        await expect(tool.locator('.hbar-session-disclosure-preview')).toHaveText('FAILED-FIRST-LINE')
        await expect(trigger(tool)).toHaveAttribute('title', new RegExp('same-basename\\.tsx'))
        await screenshot(page, info, `failed-summary-${locale}-${width}`)
        await trigger(tool).click()
        await render(page, { locale, messages: [message([original, result(original)])] })
        await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'true')
        await expect(trigger(tool)).toBeFocused()
        const opposite = locale === 'en-US' ? 'zh-CN' : 'en-US'
        const beforeText = await tool.locator('.hbar-session-disclosure-label').textContent()
        await render(page, { locale: opposite, messages: [message([original, result(original)])] })
        await expect(tool).toHaveAttribute('data-original-dom', 'true')
        await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'true')
        await expect(trigger(tool)).toBeFocused()
        expect(await tool.locator('.hbar-session-disclosure-label').textContent()).not.toBe(beforeText)
        await copyOutput(page, tool, opposite, fullOutput)
        await trigger(tool).focus()
        await render(page, { locale, messages: [message([original, result(original)])] })
        await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'true')
        await expect(trigger(tool)).toBeFocused()
        await screenshot(page, info, `locale-preserves-disclosure-${locale}-${width}`)
        for (const identity of ['session', 'message', 'call', 'name'] as const) {
          const other = {
            ...original,
            ...(identity === 'call' ? { callId: 'other' } : {}),
            ...(identity === 'name' ? { name: 'other_tool' } : {}),
          }
          await render(page, {
            locale,
            messages: [
              message(
                [other, result(other)],
                identity === 'message' ? 'message-b' : 'message-a',
                identity === 'session' ? { sessionId: 'session-b' } : {},
              ),
            ],
          })
          await expect(trigger(row(page, other.callId))).toHaveAttribute('aria-expanded', 'false')
          await trigger(row(page, other.callId)).click()
          await render(page, { locale, messages: [message([original, result(original)])] })
          await expect(trigger(tool)).toHaveAttribute('aria-expanded', 'false')
          await trigger(tool).click()
        }
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
      } finally {
        await f.context.close()
      }
    })

    test(`normal-flow capacity and long translated labels ${locale} ${width}`, async ({ browser }, info) => {
      const f = await open(browser, locale, width)
      const { page } = f
      try {
        for (const count of [0, 1, 100, 101]) {
          const calls = Array.from({ length: count }, (_, index) =>
            call(
              `capacity-${index}`,
              { version: 1, kind: 'file-read', pathField: 'target' },
              { target: index % 2 ? windows : posix },
            ),
          )
          await render(page, { locale, messages: [message(calls, `capacity-${count}`)], longLabels: true })
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
                  height: rect.height,
                  width: rect.width,
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
            await readableSummary(tools.first())
            await tools.last().scrollIntoViewIfNeeded()
            await expect(trigger(tools.last())).toBeInViewport()
            await readableSummary(tools.last())
            await trigger(tools.last()).focus()
            await page.keyboard.press('Enter')
            await expect(trigger(tools.last())).toHaveAttribute('aria-expanded', 'true')
            await expect(trigger(tools.last())).toBeFocused()
            expect(await tools.last().locator('pre').textContent()).toBe(JSON.stringify(calls.at(-1)?.args, null, 2))
          }
          await screenshot(page, info, `capacity-${count}-${locale}-${width}`)
        }
        expect(f.errors).toEqual([])
        expect(f.requests).toEqual([])
      } finally {
        await f.context.close()
      }
    })
  }
