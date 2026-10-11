import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import type { ContentBlock, ToolCallPresentation } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

const prefix = 'hbar-session-tool-presentation-'
const evidence = resolve(process.env.HBAR_TOOL_PRESENTATION_EVIDENCE ?? 'artifacts/tool-presentation/browser-final')
const readPath = 'fixtures/资料/readable-original-with-a-long-file-name.txt'
const editPath = 'fixtures/资料/original-edit-target.txt'
const writePath = 'fixtures/资料/never-approved-new-file.txt'
const originalText = `START identity-needle 原始命中\n${'Read-only fixture output — 保留完整内容。\n'.repeat(450)}END-OF-ORIGINAL-OUTPUT\n`
const originalEditText = 'Original editable fixture.\n'
const shellCommand = 'HBAR_NOT_EXECUTED_tool_presentation_fixture --read-only-evidence'
const names = ['read_file', 'write_file', 'edit_file', 'list_directory', 'shell', 'search_text', 'find_files'] as const
type ToolName = (typeof names)[number]
type ToolCall = Extract<ContentBlock, { type: 'tool_call' }>
type ToolResult = Extract<ContentBlock, { type: 'tool_result' }>
interface ToolCase {
  readonly args: Readonly<Record<string, unknown>>
  readonly summary: string
  readonly target: string
  readonly icon: 'file' | 'file-write' | 'file-edit' | 'directory' | 'terminal' | 'search'
  readonly pendingApproval: boolean
  readonly presentation: ToolCallPresentation
}
// Independent static expectations: never derive them from the production presenter.
const expectedTitles: Record<ToolName, Readonly<Record<ShellLocale, string>>> = {
  read_file: { 'en-US': 'Read file', 'zh-CN': '读取文件' },
  write_file: { 'en-US': 'Write file', 'zh-CN': '写入文件' },
  edit_file: { 'en-US': 'Edit file', 'zh-CN': '编辑文件' },
  list_directory: { 'en-US': 'List directory', 'zh-CN': '列出目录' },
  shell: { 'en-US': 'Run command', 'zh-CN': '运行命令' },
  search_text: { 'en-US': 'Search text', 'zh-CN': '搜索文本' },
  find_files: { 'en-US': 'Find files', 'zh-CN': '查找文件' },
}
function toolCase(name: ToolName, width: number): ToolCase {
  // Both separators are real file-tool inputs on this Windows fixture, not reference-tool aliases.
  const filePath = (path: string) => (process.platform === 'win32' && width === 320 ? path.replaceAll('/', '\\') : path)
  switch (name) {
    case 'read_file':
      return {
        args: { path: filePath(readPath) },
        summary: basename(readPath),
        target: filePath(readPath),
        icon: 'file',
        pendingApproval: false,
        presentation: { version: 1, kind: 'file-read', pathField: 'path' },
      }
    case 'write_file':
      return {
        args: { path: filePath(writePath), text: 'Never approved fixture write.' },
        summary: basename(writePath),
        target: filePath(writePath),
        icon: 'file-write',
        pendingApproval: true,
        presentation: { version: 1, kind: 'file-write', pathField: 'path' },
      }
    case 'edit_file':
      return {
        args: {
          path: filePath(editPath),
          oldText: 'Original editable fixture.',
          newText: 'Never approved replacement.',
        },
        summary: basename(editPath),
        target: filePath(editPath),
        icon: 'file-edit',
        pendingApproval: true,
        presentation: { version: 1, kind: 'file-edit', pathField: 'path' },
      }
    case 'list_directory':
      return {
        args: { path: 'fixtures/资料', limit: 20 },
        summary: '资料',
        target: 'fixtures/资料',
        icon: 'directory',
        pendingApproval: false,
        presentation: { version: 1, kind: 'directory-list', pathField: 'path' },
      }
    case 'shell':
      return {
        args: { command: shellCommand },
        summary: shellCommand,
        target: shellCommand,
        icon: 'terminal',
        pendingApproval: true,
        presentation: { version: 1, kind: 'command', commandField: 'command' },
      }
    case 'search_text':
      return {
        args: { path: 'fixtures', pattern: 'identity-needle', literal: true, include: ['**/*.txt'], limit: 20 },
        summary: 'identity-needle',
        target: 'identity-needle',
        icon: 'search',
        pendingApproval: false,
        presentation: { version: 1, kind: 'text-search', patternField: 'pattern', pathField: 'path' },
      }
    case 'find_files':
      return {
        args: { path: 'fixtures', nameQuery: 'readable', include: ['**/*.txt'], limit: 20 },
        summary: 'readable',
        target: 'readable',
        icon: 'search',
        pendingApproval: false,
        presentation: {
          version: 1,
          kind: 'file-search',
          queryField: 'nameQuery',
          includeField: 'include',
          pathField: 'path',
        },
      }
  }
}
const readySchema = z.object({
  url: z.url(),
  token: z.string(),
  observerToken: z.string(),
  workspace: workspaceSchema,
  session: sessionSchema,
  goalAutoContinue: z.literal(false),
})
const wireSchema = z.object({
  method: z.string(),
  params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
})
interface Fixture {
  readonly root: string
  readonly directory: string
  readonly child: ChildProcess
  readonly context: BrowserContext
  readonly page: Page
  readonly observer: HbarClient
  readonly ready: z.infer<typeof readySchema>
  readonly copy: ReturnType<typeof getShellCopy>
  readonly commands: string[]
  readonly errors: string[]
  readonly asset: string
  readonly sha256: string
}
function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun unavailable for owned presentation Host')
  return executable
}
async function cleanup(child: ChildProcess, root: string, directory: string): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.stdin?.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 15_000 }).toBe(true)
  }
  expect(child.exitCode).toBe(0)
  const rootInfo = await lstat(root)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
    throw new Error('Refusing cleanup of a replaced or non-directory tool-presentation root')
  const exact = await realpath(root)
  if (exact !== resolve(root) || dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing cleanup outside exact owned tool-presentation root')
  await rm(exact, { recursive: true })
  await writeFile(
    join(directory, 'cleanup.json'),
    JSON.stringify(
      { root, pid: child.pid, exitCode: child.exitCode, removed: !existsSync(root), stop: 'Owned child stdin only' },
      null,
      2,
    ),
  )
}
async function start(
  browser: Browser,
  locale: ShellLocale,
  width: number,
  name: ToolName,
  activitySeed = false,
): Promise<Fixture> {
  const assets = resolve(z.string().min(1).parse(process.env.HBAR_TOOL_PRESENTATION_WEB_DIST))
  const asset = z
    .string()
    .regex(/^index-[A-Za-z0-9_-]+\.js$/)
    .parse(process.env.HBAR_TOOL_PRESENTATION_EXPECTED_ASSET)
  const sha256 = z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/)
    .parse(process.env.HBAR_TOOL_PRESENTATION_EXPECTED_SHA256)
    .toUpperCase()
  expect(
    createHash('sha256')
      .update(await readFile(join(assets, 'assets', asset)))
      .digest('hex')
      .toUpperCase(),
  ).toBe(sha256)
  const directory = join(evidence, `${activitySeed ? 'folded-history' : name}-${locale}-${width}`)
  await mkdir(directory, { recursive: true })
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  const child = spawn(bunExecutable(), ['e2e/support/session-tool-presentation-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HBAR_TOOL_PRESENTATION_ROOT: root,
      HBAR_TOOL_PRESENTATION_WEB_DIST: assets,
      HBAR_TOOL_PRESENTATION_ACTIVITY_SEED: activitySeed ? '1' : '0',
    },
  })
  const context = await browser.newContext({
    locale,
    viewport: { width, height: 960 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  let observer: HbarClient | undefined
  let stderr = ''
  child.stderr?.on('data', (value: Buffer) => {
    stderr = (stderr + value.toString()).slice(-16_384)
  })
  try {
    if (!child.stdout) throw new Error('Owned Host stdout is missing')
    const lines = createInterface({ input: child.stdout })
    const ready = await new Promise<z.infer<typeof readySchema>>((done, reject) => {
      const timer = setTimeout(() => reject(new Error(`Owned Host startup timeout: ${stderr}`)), 30_000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Owned Host exited ${code}: ${stderr}`))
      })
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            clearTimeout(timer)
            done(parsed.data)
          }
        } catch {
          /* Never retain credential-bearing stdout. */
        }
      })
    }).finally(() => lines.close())
    observer = new HbarClient(ready.url, ready.observerToken)
    await observer.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    const commands: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) errors.push(message.text())
    })
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        try {
          const parsed = wireSchema.safeParse(JSON.parse(String(frame.payload)))
          if (parsed.success) {
            if (commands.length >= 2048) throw new Error('Observed command capacity exceeded')
            commands.push(
              parsed.data.method === 'command.execute'
                ? (parsed.data.params?.commandId ?? 'invalid')
                : parsed.data.method,
            )
          }
        } catch {
          errors.push('Invalid observed browser request')
        }
      }),
    )
    await page.goto(ready.url)
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', `/assets/${asset}`)
    const copy = getShellCopy(locale)
    const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await show.isVisible()) await show.click()
    const project = page.locator(`[data-workspace-id="${ready.workspace.id}"]`)
    const toggle = project
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      try {
        await project.locator('xpath=self::*[@aria-expanded="false"]').click({ timeout: 1500 })
      } catch (error) {
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') throw error
      }
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await project.getByRole('treeitem', { name: ready.session.title, exact: true }).click()
    // Opening a session already closes the overlay sidebar at narrow widths.
    // Its translated-out button can still satisfy isVisible during that transition.
    if (!(await page.evaluate(() => matchMedia('(max-width: 63.9375rem)').matches))) {
      await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).click()
    }
    await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
    return { root, directory, child, context, page, observer, ready, copy, commands, errors, asset, sha256 }
  } catch (error) {
    await context.close()
    observer?.disconnect()
    await cleanup(child, root, directory)
    throw error
  }
}
async function stop(f: Fixture): Promise<void> {
  try {
    await f.context.close()
  } finally {
    f.observer.disconnect()
    await cleanup(f.child, f.root, f.directory)
  }
}
async function exactFacts(f: Fixture, operationId: string, name: ToolName) {
  const snapshot = await f.observer.call('session.snapshot', { sessionId: f.ready.session.id })
  const blocks = snapshot.messages
    .filter((message) => message.runId === operationId)
    .flatMap((message) => message.content)
  const calls = blocks.filter((block): block is ToolCall => block.type === 'tool_call' && block.name === name)
  const results = blocks.filter((block): block is ToolResult => block.type === 'tool_result' && block.name === name)
  expect(calls).toHaveLength(1)
  const call = calls[0]
  if (!call) throw new Error('Original canonical tool call missing')
  return { snapshot, call, results }
}
function rowFor(f: Fixture, call: ToolCall) {
  return f.page.locator(`.hbar-session-tool[data-tool-call-id="${call.callId}"][data-tool-name="${call.name}"]`)
}
async function identity(f: Fixture, call: ToolCall, expected: ToolCase, locale: ShellLocale) {
  const name = names.find((candidate) => candidate === call.name)
  if (!name) throw new Error('Unexpected tool name in owned presentation fixture')
  const row = rowFor(f, call)
  await expect(row).toHaveCount(1)
  await expect(row).toHaveAttribute('data-presentation-icon', expected.icon)
  const trigger = row.locator(':scope > .hbar-session-disclosure-trigger')
  await expect(trigger.locator('.hbar-session-disclosure-label')).toHaveText(expectedTitles[name][locale])
  await expect(trigger.locator('.hbar-session-disclosure-preview')).toHaveText(expected.summary)
  const title = (await trigger.getAttribute('title')) ?? (await row.getAttribute('title'))
  expect(title).toContain(call.name)
  expect(title).toContain(expected.target)
  await expect(row.locator('a')).toHaveCount(0)
  return { row, trigger, title }
}
async function revealEvidence(page: Page, target: Locator) {
  const viewport = page.locator('.lumen-conversation-messages')
  await expect(viewport).toHaveCount(1)
  const readScroll = () =>
    viewport.evaluate((element) => ({
      top: element.scrollTop,
      height: element.scrollHeight,
      client: element.clientHeight,
    }))
  const beforeWheel = await readScroll()
  // Real reader input leaves end-follow. Focusing the original disclosure and
  // pressing Home also cancels a correction started by a late metadata refresh.
  // Neither input activates disclosure or executes a tool.
  await viewport.hover({ position: { x: 8, y: 8 } })
  await page.mouse.wheel(0, -Math.max(160, beforeWheel.client))
  await target.focus()
  await target.press('Home')
  if (beforeWheel.top > 0) await expect.poll(async () => (await readScroll()).top).toBeLessThan(beforeWheel.top)
  const afterIntent = await readScroll()
  // Check pointer actionability without toggling disclosure.
  await target.click({ trial: true })
  await expect(target).toBeInViewport()
  await expect
    .poll(() =>
      target.evaluate(async (element) => {
        const pane = element.closest('.lumen-conversation-messages')
        if (!pane) return false
        let previous = element.getBoundingClientRect()
        let stableFrames = 0
        for (let frame = 0; frame < 60 && stableFrames < 4; frame += 1) {
          await new Promise<void>((accept) => requestAnimationFrame(() => accept()))
          const current = element.getBoundingClientRect()
          stableFrames =
            Math.abs(current.top - previous.top) < 0.5 && Math.abs(current.left - previous.left) < 0.5
              ? stableFrames + 1
              : 0
          previous = current
        }
        const bounds = pane.getBoundingClientRect()
        const hit = document.elementFromPoint(previous.left + previous.width / 2, previous.top + previous.height / 2)
        return (
          stableFrames >= 4 &&
          previous.left >= Math.max(0, bounds.left) - 1 &&
          previous.top >= Math.max(0, bounds.top) - 1 &&
          previous.right <= Math.min(innerWidth, bounds.right) + 1 &&
          previous.bottom <= Math.min(innerHeight, bounds.bottom) + 1 &&
          hit !== null &&
          element.contains(hit)
        )
      }),
    )
    .toBe(true)
  return { beforeWheel, afterIntent, afterAlign: await readScroll() }
}
async function capture(f: Fixture, name: string, call: ToolCall) {
  const row = rowFor(f, call)
  const readingIntent = await revealEvidence(f.page, row.locator(':scope > .hbar-session-disclosure-trigger'))
  const geometry = await row.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const glyph = element.querySelector('svg')
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      row: { left: rect.left, right: rect.right, width: rect.width },
      trigger: element.querySelector('.hbar-session-disclosure-trigger')?.textContent,
      glyph: glyph?.getAttribute('class'),
      glyphWidth: glyph?.getBoundingClientRect().width,
      presentationIcon: element.getAttribute('data-presentation-icon'),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }
  })
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1)
  expect(geometry.row.left).toBeGreaterThanOrEqual(-1)
  expect(geometry.row.right).toBeLessThanOrEqual(geometry.viewport + 1)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  await f.page.screenshot({ path: join(f.directory, `${name}.png`) })
  return { ...geometry, readingIntent }
}
async function verifySettled(
  f: Fixture,
  call: ToolCall,
  result: ToolResult,
  expected: ToolCase,
  locale: ShellLocale,
  phase: string,
) {
  const { row, trigger, title } = await identity(f, call, expected, locale)
  const outcome = expected.pendingApproval ? 'cancelled' : 'succeeded'
  await expect(row).toHaveAttribute('data-outcome', outcome)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger.locator('.hbar-session-disclosure-status')).toHaveText(
    expected.pendingApproval ? f.copy.session.messageBlocks.cancelled : f.copy.session.messageBlocks.resultAvailable,
  )
  await expect(trigger.locator('.hbar-session-disclosure-status')).toHaveAttribute(
    'data-status-tone',
    expected.pendingApproval ? 'warning' : 'success',
  )
  const geometry = await capture(f, `${phase}-compact`, call)
  const catalogBefore = f.commands.filter((name) => name === 'command.catalog').length
  await trigger.focus()
  await f.page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger).toBeFocused()
  const command = expected.presentation.kind === 'command'
  if (command) await row.getByRole('button', { name: f.copy.session.messageBlocks.originalInput, exact: true }).click()
  const input = command
    ? row.locator('.hbar-session-command-original pre')
    : row.locator('.hbar-session-tool-section').first().locator('pre')
  expect(await input.textContent()).toBe(JSON.stringify(call.args, null, 2))
  const output = row.locator(
    `.hbar-session-tool-section[data-tool-call-id="${call.callId}"][data-tool-name="${call.name}"]`,
  )
  const outputText = command ? output.locator('[data-command-output]') : output.locator('.hbar-session-detail-text pre')
  if (!command && result.text.length > 12_000) {
    expect(await outputText.textContent()).toBe(`${result.text.slice(0, 12_000)}…`)
    await output.getByRole('button', { name: f.copy.session.messageBlocks.showFullContent, exact: true }).click()
  }
  expect(await outputText.textContent()).toBe(result.text)
  await capture(f, `${phase}-expanded`, call)
  await output.getByRole('button', { name: f.copy.session.messageBlocks.toolResultCopy.copy, exact: true }).click()
  await expect(output.locator('[data-copy-status]')).toHaveAttribute('data-copy-status', 'copied')
  await expect
    .poll(async () => (await f.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
    .toBe(result.text.replaceAll('\r\n', '\n'))
  if (!command && result.text.length > 12_000) {
    await output.getByRole('button', { name: f.copy.session.messageBlocks.showLessContent, exact: true }).click()
    expect(await outputText.textContent()).toBe(`${result.text.slice(0, 12_000)}…`)
  }
  await trigger.focus()
  await f.page.keyboard.press('Space')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  expect(f.commands.filter((name) => name === 'command.catalog')).toHaveLength(catalogBefore)
  return { title, geometry, clipboardVerified: true, inputPreserved: true, defaultCollapsed: true }
}

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const width of [1440, 320])
    test(`owned Host groups completed activity and restores collapsed history ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(90_000)
      const f = await start(browser, locale, width, 'read_file', true)
      try {
        const before = await f.observer.call('session.snapshot', { sessionId: f.ready.session.id })
        expect(before.runs).toHaveLength(1)
        const summary = f.page.locator('.lumen-conversation-messages .hbar-session-activity-summary')
        const expected =
          locale === 'zh-CN'
            ? '1 段思考 · 工具调用 × 2 · 读取文件 × 1 · 写入文件 × 1 · 执行终端 × 1 · 1 项失败 · 成功率 80%'
            : '1 thought · Tool calls × 2 · Read files × 1 · Write files × 1 · Terminal commands × 1 · 1 failed · Success rate 80%'
        await expect(summary).toHaveCount(1)
        await expect(summary).toHaveText(expected)
        await expect(summary).toHaveAttribute('aria-expanded', 'false')
        await expect(f.page.locator('.lumen-conversation-messages .hbar-session-tool')).toHaveCount(0)
        await expect(f.page.getByText('Before grouped activity — 前文保留', { exact: true })).toBeVisible()
        await expect(f.page.getByText('After grouped activity — 后文保留', { exact: true })).toBeVisible()
        await revealEvidence(f.page, summary)
        await f.page.screenshot({ path: join(f.directory, 'folded.png') })
        await summary.press('Enter')
        await expect(summary).toHaveAttribute('aria-expanded', 'true')
        await expect(summary).toBeFocused()
        await expect(f.page.locator('.lumen-conversation-messages .hbar-session-activity-summary')).toHaveCount(1)
        await expect(f.page.locator('.lumen-conversation-messages .hbar-session-tool')).toHaveCount(5)
        const original = f.page.locator('.hbar-session-tool[data-tool-call-id="fold-2"]')
        const trigger = original.locator(':scope > .hbar-session-disclosure-trigger')
        await revealEvidence(f.page, trigger)
        await trigger.press('Enter')
        await expect(original.locator('.hbar-session-tool-section').last()).toContainText(
          'Original history output-2 — 原始输出',
        )
        await f.page.screenshot({ path: join(f.directory, 'expanded.png') })
        await f.page.reload()
        await expect(summary).toHaveText(expected)
        await expect(summary).toHaveAttribute('aria-expanded', 'false')
        await expect(f.page.locator('.lumen-conversation-messages .hbar-session-tool')).toHaveCount(0)
        // A real pending write/approval must remain visible beside folded historical activity.
        const runs = createRunCommandClient(f.observer)
        const accepted = await runs.execute(
          'run.submit',
          {
            sessionId: f.ready.session.id,
            modelId: 'local-fixture',
            input: {
              text: `/tool write_file ${JSON.stringify(toolCase('write_file', width).args)}`,
              images: [],
              approval: 'ask',
            },
          },
          { idempotencyKey: crypto.randomUUID() },
        )
        await expect
          .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
          .toBe('waiting_approval')
        const pending = await exactFacts(f, accepted.operationId, 'write_file')
        const approval = pending.snapshot.approvals.find(
          (item) => item.runId === accepted.operationId && item.callId === pending.call.callId,
        )
        if (!approval) throw new Error('Original pending write approval missing')
        await expect(f.page.locator(`[data-decision-id="${approval.id}"]`)).toBeVisible()
        await expect(rowFor(f, pending.call)).toBeVisible()
        await expect(summary).toHaveText(expected)
        await expect(summary).toHaveAttribute('aria-expanded', 'false')
        await f.page.getByRole('button', { name: f.copy.session.prompt.stop, exact: true }).click()
        await expect
          .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
          .toBe('cancelled')
        const after = await f.observer.call('session.snapshot', { sessionId: f.ready.session.id })
        const historyRun = before.runs[0]
        if (!historyRun) throw new Error('Historical Run missing')
        expect(after.messages.filter((item) => item.runId === historyRun.id)).toEqual(before.messages)
        expect(existsSync(join(f.ready.workspace.path, writePath))).toBe(false)
        expect(
          f.commands.filter((name) =>
            ['run.submit', 'file.write', 'approval.resolve', 'approval.decide'].includes(name),
          ),
        ).toEqual([])
        expect(f.errors).toEqual([])
        await writeFile(
          join(f.directory, 'observation.json'),
          JSON.stringify(
            {
              locale,
              width,
              actualHost: true,
              historicalRowsPreserved: true,
              pendingApprovalVisible: true,
              commands: f.commands,
              errors: f.errors,
            },
            null,
            2,
          ),
        )
      } finally {
        await stop(f)
      }
    })

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 320])
    for (const name of names) {
      test(`actual persisted tool presentation ${name} ${locale} ${width}`, async ({ browser }) => {
        test.setTimeout(90_000)
        const f = await start(browser, locale, width, name)
        try {
          const expected = toolCase(name, width)
          const draft = `Preserved original draft — ${locale} ${name}`
          const prompt = f.page.locator('.cm-content[contenteditable]')
          await expect(prompt).toHaveAttribute('contenteditable', 'true')
          await prompt.fill(draft)
          const catalogBefore = f.commands.filter((command) => command === 'command.catalog').length
          const runs = createRunCommandClient(f.observer)
          const accepted = await runs.execute(
            'run.submit',
            {
              sessionId: f.ready.session.id,
              modelId: 'local-fixture',
              input: { text: `/tool ${name} ${JSON.stringify(expected.args)}`, images: [], approval: 'ask' },
            },
            { idempotencyKey: crypto.randomUUID() },
          )
          let pendingGeometry: Awaited<ReturnType<typeof capture>> | undefined
          if (expected.pendingApproval) {
            await expect
              .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
              .toBe('waiting_approval')
            const pending = await exactFacts(f, accepted.operationId, name)
            expect(pending.call.args).toEqual(expected.args)
            expect(pending.call.presentation).toEqual(expected.presentation)
            expect(pending.results).toEqual([])
            const { row, trigger } = await identity(f, pending.call, expected, locale)
            await expect(row).toHaveAttribute('data-outcome', 'pending')
            await expect(trigger.locator('.hbar-session-disclosure-status')).toHaveAttribute('data-status-tone', 'info')
            await expect(trigger.locator('.hbar-session-disclosure-status')).toHaveText(
              f.copy.session.messageBlocks.running,
            )
            await expect(trigger.locator('.hbar-session-tool-status-indicator')).toHaveAttribute(
              'data-lumen-state',
              'running',
            )
            await expect(trigger).toHaveAttribute('aria-expanded', 'false')
            const approval = pending.snapshot.approvals.find(
              (item) =>
                item.runId === accepted.operationId && item.callId === pending.call.callId && item.tool === name,
            )
            if (!approval) throw new Error('Exact original pending approval is missing')
            const decision = f.page.locator(`[data-decision-id="${approval.id}"]`)
            await expect(decision).toBeVisible()
            pendingGeometry = await capture(f, 'pending-not-executed', pending.call)
            // Only cancel. Never Allow, and never submit a command via any shell runner.
            await f.page.getByRole('button', { name: f.copy.session.prompt.stop, exact: true }).click()
            await expect(decision).toContainText(f.copy.session.decisions.cancelled)
          }
          await expect
            .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
            .toBe(expected.pendingApproval ? 'cancelled' : 'completed')
          const original = await exactFacts(f, accepted.operationId, name)
          expect(original.call.args).toEqual(expected.args)
          expect(original.call.presentation).toEqual(expected.presentation)
          expect(original.results).toHaveLength(1)
          const result = original.results[0]
          if (!result) throw new Error('Original tool result missing')
          expect(result.callId).toBe(original.call.callId)
          expect(result.outcome).toEqual({
            kind: expected.pendingApproval ? 'cancelled' : 'succeeded',
            executionStarted: !expected.pendingApproval,
          })
          expect(result.isError).toBe(expected.pendingApproval)
          if (name === 'read_file') expect(result.text).toBe(originalText)
          expect(f.commands.filter((command) => command === 'command.catalog')).toHaveLength(catalogBefore)
          const before = await verifySettled(f, original.call, result, expected, locale, 'settled')
          // Drafts belong to the current runtime. Tool actions must preserve them;
          // a new page/runtime has no draft persistence contract.
          await expect(prompt).toHaveText(draft)
          await f.page.reload()
          await expect(f.page.locator('script[type="module"][src]')).toHaveAttribute('src', `/assets/${f.asset}`)
          const reloaded = await exactFacts(f, accepted.operationId, name)
          expect(reloaded.call).toEqual(original.call)
          expect(reloaded.results).toEqual(original.results)
          const after = await verifySettled(f, reloaded.call, result, expected, locale, 'reloaded')
          expect(reloaded.snapshot.runs).toHaveLength(1)
          expect(await readFile(join(f.ready.workspace.path, readPath), 'utf8')).toBe(originalText)
          expect(await readFile(join(f.ready.workspace.path, editPath), 'utf8')).toBe(originalEditText)
          expect(existsSync(join(f.ready.workspace.path, writePath))).toBe(false)
          const follow = await f.observer.call('session.follow', { sessionId: f.ready.session.id, cursor: 0 })
          const events = follow.events.filter((event) => event.runId === accepted.operationId)
          const approvalEvents = events.filter((event) => event.type.startsWith('approval.'))
          expect(
            approvalEvents.some((event) => z.object({ status: z.literal('allowed') }).safeParse(event.data).success),
          ).toBe(false)
          if (expected.pendingApproval) expect(events.filter((event) => event.type.startsWith('tool.'))).toEqual([])
          else expect(approvalEvents).toEqual([])
          expect(
            f.commands.filter((command) =>
              ['run.submit', 'run.retry', 'file.write', 'approval.resolve', 'approval.decide'].includes(command),
            ),
          ).toEqual([])
          expect(f.commands.filter((command) => command === 'operation.cancel')).toHaveLength(
            expected.pendingApproval ? 1 : 0,
          )
          expect(f.errors).toEqual([])
          await writeFile(
            join(f.directory, 'observation.json'),
            JSON.stringify(
              {
                actualHost: true,
                locale,
                width,
                tool: name,
                asset: f.asset,
                sha256: f.sha256,
                hostUrl: f.ready.url,
                root: f.root,
                pid: f.child.pid,
                sessionId: f.ready.session.id,
                run: reloaded.snapshot.runs[0],
                call: original.call,
                result,
                pendingGeometry,
                before,
                after,
                events,
                draftPreservedDuringToolActions: true,
                draftPersistAcrossReloadNotClaimed: true,
                originalFilesUnchanged: true,
                commands: f.commands,
                errors: f.errors,
              },
              null,
              2,
            ),
          )
        } catch (error) {
          await f.page.screenshot({ path: join(f.directory, 'failure.png') })
          throw error
        } finally {
          await stop(f)
        }
      })
    }
