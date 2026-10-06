import { expect, test, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { ContentBlock, Message } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ToolPresentationFixtureInput } from '../tests/fixtures/session-tool-presentation-browser'

// Real message renderers with controlled content. No Host or tool execution.
const root = join(process.cwd(), 'artifacts/session-reading-design')
const origin = 'http://127.0.0.1:45595'
let server: PreviewServer | undefined

test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="../../tests/fixtures/session-tool-presentation-browser.tsx"></script></body></html>',
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
    preview: { host: '127.0.0.1', port: 45595, strictPort: true },
  })
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
  await writeFile(join(root, 'cleanup.json'), JSON.stringify({ ownedPreviewClosed: true, port: 45595 }))
})

const code = '// Original source 雪\nexport const permission = { enabled: true, scope: "workspace" };'
const output = 'Original tool output 雪 🐙\r\nexport const permission = "read";\r\n'
const path = `${'a-long-directory/模块/'.repeat(12)}composer-permission.ts`
const call: Extract<ContentBlock, { type: 'tool_call' }> = {
  type: 'tool_call',
  callId: 'read-reading',
  name: 'read_file',
  args: { path },
  presentation: { version: 1, kind: 'file-read', pathField: 'path' },
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`sidebar activity uses a stable blue breathing lamp and respects appearance ${locale} ${theme}`, async ({
      browser,
    }, info) => {
      const page = await browser.newPage({ locale, viewport: { width: 320, height: 640 } })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const labels = getShellCopy(locale).shell.sort.time.execution
      const input = (
        state: NonNullable<ToolPresentationFixtureInput['activity']>['state'],
        motion = true,
        glow = 0.65,
      ): ToolPresentationFixtureInput => ({
        locale,
        theme,
        motion,
        glow,
        messages: [],
        activity: { state, label: labels[state] },
      })
      try {
        await page.goto(origin)
        await render(page, input('running'))
        const action = page.locator('[data-fixture-outside]')
        await action.hover()
        const hover = await action.evaluate(async (element) => {
          const transition = element
            .getAnimations()
            .find(
              (animation) =>
                animation instanceof CSSTransition && animation.transitionProperty === '--lumen-effect-level',
            )
          if (!transition?.effect) throw new Error('Hover must ease the existing Lumen light level')
          const duration = transition.effect.getComputedTiming().duration
          if (typeof duration !== 'number') throw new Error('Hover needs a bounded transition')
          transition.pause()
          transition.currentTime = 0
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          const start = Number(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))
          const rect = element.getBoundingClientRect()
          transition.currentTime = duration / 2
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          const middle = Number(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))
          transition.currentTime = duration
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          const end = Number(getComputedStyle(element).getPropertyValue('--lumen-effect-level'))
          const after = element.getBoundingClientRect()
          return {
            start,
            middle,
            end,
            before: { width: rect.width, height: rect.height },
            after: { width: after.width, height: after.height },
          }
        })
        expect(hover.middle).toBeGreaterThan(hover.start)
        expect(hover.middle).toBeLessThan(hover.end)
        expect(hover.after).toEqual(hover.before)
        const row = page.locator('[data-fixture-activity-row]')
        const status = row.locator('.hbar-app-react-session-activity-indicator')
        const lamp = status.locator('.lumen-status-dot')
        await row.focus()
        await expect(status).toHaveAccessibleName(labels.running)
        await expect(lamp).toBeVisible()
        await expect(lamp).toHaveAttribute('data-lumen-tone', 'info')
        const breathing = await lamp.evaluate(async (element) => {
          const animation = element
            .getAnimations()
            .find((item) => item instanceof CSSAnimation && item.animationName === 'lumen-breathe')
          if (!animation?.effect) throw new Error('The running lamp must breathe through Lumen')
          const duration = animation.effect.getComputedTiming().duration
          if (typeof duration !== 'number') throw new Error('Breathing needs a bounded duration')
          animation.pause()
          animation.currentTime = 0
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          const low = getComputedStyle(element).boxShadow
          const bounds = (rect: DOMRect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
          const before = bounds(element.getBoundingClientRect())
          animation.currentTime = duration / 2
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          const high = getComputedStyle(element).boxShadow
          const after = bounds(element.getBoundingClientRect())
          animation.play()
          const probe = document.createElement('span')
          probe.style.background = 'var(--lumen-info)'
          element.append(probe)
          const expected = getComputedStyle(probe).backgroundColor
          probe.remove()
          return { low, high, before, after, color: getComputedStyle(element).backgroundColor, expected }
        })
        expect(breathing.low).not.toBe(breathing.high)
        expect(breathing.before).toEqual(breathing.after)
        expect(breathing.color).toBe(breathing.expected)
        const bounds = await status.boundingBox()
        for (const state of ['waiting_approval', 'queued', 'cancelRequested', 'running'] as const) {
          await render(page, input(state))
          await expect(status).toHaveAccessibleName(labels[state])
          expect(await status.boundingBox()).toEqual(bounds)
          await expect(row).toBeFocused()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          if (state !== 'running') {
            await expect(lamp).toHaveCount(0)
            expect(await status.locator('svg').evaluate((element) => getComputedStyle(element).animationName)).toBe(
              'none',
            )
          }
        }
        await render(page, input('running', false))
        await expect(lamp).toBeVisible()
        expect(await lamp.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
        await render(page, input('running'))
        await page.emulateMedia({ reducedMotion: 'reduce' })
        expect(await lamp.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await render(page, input('running', true, 0))
        const lightAlpha = await lamp.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--lumen-effect-light)'
          element.append(probe)
          const color = getComputedStyle(probe).color
          probe.remove()
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Missing browser color probe')
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          return context.getImageData(0, 0, 1, 1).data[3]
        })
        expect(lightAlpha).toBe(0)
        await expect(lamp).toBeVisible()
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '125%'
        })
        const scaled = await status.boundingBox()
        if (!scaled || !bounds) throw new Error('Visible status slot lost its geometry')
        expect(scaled.width).toBeCloseTo(bounds.width * 1.25, 1)
        expect(scaled.height).toBeCloseTo(bounds.height * 1.25, 1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.evaluate(() => {
          document.documentElement.style.fontSize = ''
        })
        await page.emulateMedia({ forcedColors: 'active' })
        expect(await lamp.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
        expect(await lamp.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none')
        await expect(status).toHaveAccessibleName(labels.running)
        await page.emulateMedia({ forcedColors: 'none' })
        await render(page, input('running'))
        await page.screenshot({ path: info.outputPath('sidebar-running-lamp.png') })
        await render(page, input('idle'))
        await expect(status).toHaveCount(0)
        expect(errors).toEqual([])
        await info.attach('breathing-geometry', {
          contentType: 'application/json',
          body: JSON.stringify({ breathing, hover }),
        })
      } finally {
        await page.close()
      }
    })
  }
}
const messages: Message[] = [
  {
    id: 'reading-message',
    sessionId: 'reading-session',
    runId: 'reading-run',
    role: 'assistant',
    seq: 1,
    createdAt: 1,
    content: [
      {
        type: 'thinking',
        text: '**检查原始输入** · Review original input\n\n保持 `sandbox` 与原始路径不变。\n\n- 阅读证据\n- 验证布局',
      },
      call,
      {
        type: 'tool_result',
        callId: call.callId,
        name: call.name,
        text: output,
        isError: false,
        outcome: { kind: 'succeeded', executionStarted: true },
      },
      {
        type: 'tool_call',
        callId: 'command-reading',
        name: 'exec_command',
        args: { cmd: 'printf "%s" "read-only fixture"' },
        presentation: { version: 1, kind: 'command', commandField: 'cmd' },
      },
      {
        type: 'tool_result',
        callId: 'command-reading',
        name: 'exec_command',
        text: 'read-only fixture',
        isError: false,
        outcome: { kind: 'succeeded', executionStarted: true },
      },
      {
        type: 'text',
        text: `# 阅读与状态\n\n正文中 **重要信息**、*辅助说明*、\`sandbox\` 与 [文档](https://example.invalid) 保持语义着色。\n\n## 工具详情\n\n> 检查输入与结果后再继续。\n\n- 标签保持单行\n- 原文可以完整复制\n\n### 代码\n\n\`\`\`typescript\n${code}\n\`\`\`\n\n| 区域 | 视觉角色 |\n| --- | --- |\n| 正文 | 连续阅读 |\n| 工具 | 就近反馈 |\n\n| ${'WideColumnValue'.repeat(18)} | ${'AnotherColumnValue'.repeat(18)} |\n| --- | --- |\n| a | b |\n\n---\n\n末段仍然清楚可读。`,
      },
    ],
  },
]

async function render(page: Page, input: ToolPresentationFixtureInput): Promise<void> {
  await page.evaluate((value) => window.toolPresentationFixture.render(value), input)
}

async function textSize(page: Page, size: 's' | 'm' | 'l'): Promise<void> {
  // Exercise Lumen's public appearance projection without creating a second settings owner.
  await page
    .locator('[data-lumen-mode]')
    .evaluate((element, size) => element.setAttribute('data-lumen-text-size', size), size)
}

async function geometry(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const labels = await page
    .locator('.hbar-session-disclosure-label-text, .hbar-session-disclosure-status-text')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        style: getComputedStyle(element).whiteSpace,
        height: element.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(element).lineHeight),
      })),
    )
  for (const label of labels) {
    expect(label.style).toBe('nowrap')
    expect(label.height).toBeLessThanOrEqual(label.line + 1)
  }
  const table = page.locator('.hbar-session-message-prose table').last()
  expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  expect(
    await table.evaluate(
      (element) => element.getBoundingClientRect().width <= element.parentElement!.getBoundingClientRect().width + 1,
    ),
  ).toBe(true)
}

async function readingSizes(page: Page): Promise<number[]> {
  return page.locator('.hbar-session-message-blocks').evaluate((element) =>
    [
      '.hbar-session-message-prose',
      '.hbar-session-message-prose h1',
      '.hbar-session-message-prose h2',
      '.hbar-session-message-prose h3',
      '.hbar-session-thinking-content',
      '.hbar-session-activity-summary',
      '.hbar-session-disclosure-label',
      '.hbar-session-disclosure-status',
      '.hbar-message-code-body',
      '.hbar-session-command-output-text',
    ].map((selector) => {
      const node = element.querySelector(selector)
      if (!node) throw new Error(`Missing reading role: ${selector}`)
      return parseFloat(getComputedStyle(node).fontSize)
    }),
  )
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 320]) {
      test(`reading preferences preserve hierarchy, exact copy and bounded tables ${locale} ${theme} ${width}`, async ({
        browser,
      }, info) => {
        const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (entry) => {
          if (entry.type() === 'error') errors.push(entry.text())
        })
        try {
          await page.goto(origin)
          await render(page, { locale, theme, messages })
          await page.addStyleTag({
            content:
              '.tool-presentation-fixture{inline-size:min(100%,58.25rem);box-sizing:border-box;margin-inline:auto} [data-lumen-mode]{background:var(--lumen-contrast)}',
          })
          const summary = page.locator('.hbar-session-activity-summary')
          await summary.press('Enter')
          const thought = page.locator('.hbar-session-thinking > .hbar-session-disclosure-trigger')
          await thought.press('Enter')
          const tool = page.locator(
            '.hbar-session-tool[data-tool-call-id="read-reading"] > .hbar-session-disclosure-trigger',
          )
          await tool.press('Enter')
          await page
            .locator('.hbar-session-tool[data-tool-call-id="command-reading"] > .hbar-session-disclosure-trigger')
            .press('Enter')
          const beforeCode = page.locator('.hbar-message-code code').first()
          await expect(beforeCode).toHaveText(code)
          const sizes: number[][] = []
          for (const size of ['s', 'm', 'l'] as const) {
            await textSize(page, size)
            sizes.push(await readingSizes(page))
            await geometry(page)
            await expect(summary).toHaveAttribute('aria-expanded', 'true')
            await expect(thought).toHaveAttribute('aria-expanded', 'true')
            await expect(tool).toHaveAttribute('aria-expanded', 'true')
          }
          for (let role = 0; role < sizes[0]!.length; role++) {
            expect(sizes[1]![role]).toBeGreaterThan(sizes[0]![role]!)
            expect(sizes[2]![role]).toBeGreaterThan(sizes[1]![role]!)
          }
          const [body, h1, h2, h3] = sizes[2]!
          expect(h1).toBeLessThan(body! * 1.75)
          expect(h1).toBeGreaterThan(h2!)
          expect(h2).toBeGreaterThan(h3!)
          expect(h3).toBeGreaterThan(body!)
          await page.evaluate(() => {
            document.documentElement.style.fontSize = '125%'
          })
          const zoomed = await readingSizes(page)
          for (let role = 0; role < zoomed.length; role++) expect(zoomed[role]!).toBeCloseTo(sizes[2]![role]! * 1.25, 1)
          await geometry(page)
          const copy = getShellCopy(locale).session.messageBlocks
          await page
            .locator('.hbar-message-code-copy')
            .getByRole('button', { name: copy.codeBlock.copy, exact: true })
            .click()
          expect(await page.evaluate(() => window.toolPresentationFixture.clipboardWrites().at(-1))).toBe(code)
          await page
            .locator('.hbar-session-tool[data-tool-call-id="read-reading"] .hbar-session-tool-result-copy')
            .click()
          expect(await page.evaluate(() => window.toolPresentationFixture.clipboardWrites().at(-1))).toBe(output)
          const original = page.locator(
            '.hbar-session-tool[data-tool-call-id="read-reading"] .hbar-session-tool-section[data-content-kind="input"] pre',
          )
          expect(await original.textContent()).toBe(JSON.stringify(call.args, null, 2))
          await tool.focus()
          await render(page, { locale, theme, motion: true, streaming: true, messages })
          await expect(tool).toBeFocused()
          await expect(tool).toHaveAttribute('aria-expanded', 'true')
          await expect(thought).toHaveAttribute('aria-expanded', 'true')
          await geometry(page)
          await page.screenshot({ path: info.outputPath('reading-large-zoomed.png'), fullPage: true })
          expect(errors).toEqual([])
          await info.attach('reading-scale', {
            contentType: 'application/json',
            body: JSON.stringify({ sizes, zoomed, exactCopy: true }),
          })
        } finally {
          await context.close()
        }
      })
    }
  }
}
