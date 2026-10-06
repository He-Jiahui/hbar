import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import type { Approval, ContentBlock } from '@hbar/contracts'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

const prefix = 'hbar-session-tool-outcome-'
const evidence = resolve(process.env.HBAR_TOOL_OUTCOME_EVIDENCE ?? 'artifacts/tool-outcome/browser-final')
const outcomes = ['cancelled', 'denied', 'failed', 'succeeded'] as const
type Outcome = (typeof outcomes)[number]
type ToolResult = Extract<ContentBlock, { type: 'tool_result' }>
const readySchema = z.object({
  url: z.url(),
  token: z.string(),
  observerToken: z.string(),
  workspace: workspaceSchema,
  session: sessionSchema,
  goalAutoContinue: z.literal(false),
})
const wire = z.object({
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
  readonly browserCommands: string[]
  readonly errors: string[]
}
function bunExecutable(): string {
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun is unavailable')
  return executable
}
async function cleanup(child: ChildProcess, root: string, directory: string): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.stdin?.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 15_000 }).toBe(true)
  }
  expect(child.exitCode).toBe(0)
  const exact = await realpath(root)
  if (exact !== resolve(root) || dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing cleanup outside the exact owned tool-outcome fixture')
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
async function start(browser: Browser, locale: ShellLocale, width: number, outcome: Outcome): Promise<Fixture> {
  const assets = resolve(z.string().min(1).parse(process.env.HBAR_TOOL_OUTCOME_WEB_DIST))
  const expectedAsset = z.string().min(1).parse(process.env.HBAR_TOOL_OUTCOME_EXPECTED_ASSET)
  if (!existsSync(join(assets, 'index.html'))) throw new Error('Frozen tool-outcome Web assets are missing')
  const directory = join(evidence, `${outcome}-${locale}-${width}`)
  await mkdir(directory, { recursive: true })
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  const child = spawn(bunExecutable(), ['e2e/support/session-tool-outcome-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HBAR_TOOL_OUTCOME_ROOT: root, HBAR_TOOL_OUTCOME_WEB_DIST: assets },
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
          const result = readySchema.safeParse(JSON.parse(line))
          if (result.success) {
            clearTimeout(timer)
            done(result.data)
          }
        } catch {
          /* No credential-bearing stdout is retained. */
        }
      })
    }).finally(() => lines.close())
    observer = new HbarClient(ready.url, ready.observerToken)
    await observer.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    const browserCommands: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) errors.push(message.text())
    })
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        try {
          const result = wire.safeParse(JSON.parse(String(frame.payload)))
          if (result.success) {
            if (browserCommands.length >= 2048) throw new Error('Browser command observation capacity exceeded')
            browserCommands.push(
              result.data.method === 'command.execute'
                ? (result.data.params?.commandId ?? 'invalid')
                : result.data.method,
            )
          }
        } catch {
          errors.push('Invalid observed browser request')
        }
      }),
    )
    await page.goto(ready.url)
    expect(await page.locator('script[type="module"][src]').getAttribute('src')).toBe(`/assets/${expectedAsset}`)
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
    const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
    if (await hide.isVisible()) {
      try {
        await hide.click({ timeout: 1500 })
      } catch (error) {
        if (await hide.isVisible()) throw error
      }
    }
    await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
    return { root, directory, child, context, page, observer, ready, copy, browserCommands, errors }
  } catch (error) {
    await context.close()
    observer?.disconnect()
    await cleanup(child, root, directory)
    throw error
  }
}
async function stop(f: Fixture) {
  try {
    await f.context.close()
  } finally {
    f.observer.disconnect()
    await cleanup(f.child, f.root, f.directory)
  }
}
async function capture(f: Fixture, name: string) {
  const geometry = await f.page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    focus: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
  }))
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width + 1)
  await f.page.screenshot({ path: join(f.directory, `${name}.png`) })
  await writeFile(join(f.directory, `${name}.json`), JSON.stringify(geometry, null, 2))
}

async function originalResult(f: Fixture, operationId: string, toolName: string): Promise<ToolResult> {
  const snapshot = await f.observer.call('session.snapshot', { sessionId: f.ready.session.id })
  const results = snapshot.messages
    .filter((message) => message.runId === operationId)
    .flatMap((message) =>
      message.content.filter((block): block is ToolResult => block.type === 'tool_result' && block.name === toolName),
    )
  expect(results).toHaveLength(1)
  const result = results[0]
  if (!result) throw new Error('Actual original tool result is missing')
  return result
}

async function verifyRow(f: Fixture, result: ToolResult, outcome: Outcome, phase: string) {
  const row = f.page.locator(
    `.hbar-session-tool[data-tool-call-id="${result.callId}"][data-tool-name="${result.name}"]`,
  )
  await expect(row).toHaveCount(1)
  await expect(row).toHaveAttribute('data-outcome', outcome)
  const trigger = row.locator('.hbar-session-disclosure-trigger')
  // No corrective click: initial and reloaded failures must both start collapsed.
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  const expectedStatus =
    outcome === 'succeeded' ? f.copy.session.messageBlocks.resultAvailable : f.copy.session.messageBlocks[outcome]
  await expect(trigger.locator('.hbar-session-disclosure-status')).toHaveText(expectedStatus)
  await trigger.scrollIntoViewIfNeeded()
  await capture(f, `${phase}-compact`)
  await trigger.focus()
  await f.page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger).toBeFocused()
  const outputSection = row.locator(
    `.hbar-session-tool-section[data-tool-call-id="${result.callId}"][data-tool-name="${result.name}"]`,
  )
  await expect(outputSection).toHaveCount(1)
  const output = outputSection.locator('.hbar-session-detail-text pre')
  await expect(output).toHaveCount(1)
  await expect(output).toBeVisible()
  expect(await output.textContent()).toBe(result.text)
  await trigger.scrollIntoViewIfNeeded()
  await capture(f, `${phase}-expanded`)
  const copy = row.getByRole('button', { name: f.copy.session.messageBlocks.toolResultCopy.copy, exact: true })
  await copy.click()
  await expect(row.locator('[data-copy-status]')).toHaveAttribute('data-copy-status', 'copied')
  const expectedClipboard = result.text.replaceAll('\r\n', '\n')
  await expect
    .poll(async () => (await f.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
    .toBe(expectedClipboard)
  await trigger.focus()
  await f.page.keyboard.press('Space')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  return {
    renderedStatus: await trigger.innerText(),
    resultText: result.text,
    clipboardVerified: true,
    defaultCollapsed: true,
  }
}

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 320])
    for (const outcome of outcomes) {
      test(`actual tool ${outcome} stays exact, collapsed and copyable after reload: ${locale} ${width}`, async ({
        browser,
      }) => {
        test.setTimeout(90_000)
        const f = await start(browser, locale, width, outcome)
        try {
          const runs = createRunCommandClient(f.observer)
          const write = outcome === 'cancelled' || outcome === 'denied'
          const toolName = write ? 'write_file' : 'read_file'
          const target = write
            ? 'never-approved-write.txt'
            : outcome === 'failed'
              ? 'known-absent-file.txt'
              : 'known-readable.txt'
          const args = write ? { path: target, text: 'This fixture must never write this file.' } : { path: target }
          const accepted = await runs.execute(
            'run.submit',
            {
              sessionId: f.ready.session.id,
              modelId: 'local-fixture',
              input: { text: `/tool ${toolName} ${JSON.stringify(args)}`, images: [], approval: 'ask' },
            },
            { idempotencyKey: crypto.randomUUID() },
          )
          let approval: Approval | undefined
          if (write) {
            await expect
              .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
              .toBe('waiting_approval')
            const pending = await f.observer.call('session.snapshot', { sessionId: f.ready.session.id })
            approval = pending.approvals.find((item) => item.runId === accepted.operationId && item.tool === toolName)
            if (!approval) throw new Error('Actual original approval is missing')
            const card = f.page.locator(`[data-decision-id="${approval.id}"]`)
            await expect(card).toBeVisible()
            await capture(f, 'pending')
            if (outcome === 'cancelled') {
              await f.page.getByRole('button', { name: f.copy.session.prompt.stop, exact: true }).click()
            } else {
              await card.getByRole('button', { name: f.copy.session.decisions.deny, exact: true }).click()
            }
            await expect(card).toContainText(
              outcome === 'cancelled' ? f.copy.session.decisions.cancelled : f.copy.session.decisions.denied,
            )
          }
          // The local fixture ends normally after a denied/failed tool result.
          // This proves tool failure is not copied from the enclosing Run outcome.
          await expect
            .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
            .toBe(outcome === 'cancelled' ? 'cancelled' : 'completed')
          const result = await originalResult(f, accepted.operationId, toolName)
          expect(result.outcome).toEqual({ kind: outcome, executionStarted: !write })
          expect(result.isError).toBe(outcome !== 'succeeded')
          if (approval) expect(result.callId).toBe(approval.callId)
          if (outcome === 'succeeded') expect(result.text).toContain('Safe local fixture read.')
          const before = await verifyRow(f, result, outcome, 'settled')
          const asset = await f.page.locator('script[type="module"][src]').getAttribute('src')
          await f.page.reload()
          await expect(f.page.locator('script[type="module"][src]')).toHaveAttribute('src', asset ?? '')
          const afterResult = await originalResult(f, accepted.operationId, toolName)
          expect(afterResult).toEqual(result)
          const after = await verifyRow(f, afterResult, outcome, 'reloaded')
          const snapshot = await f.observer.call('session.snapshot', { sessionId: f.ready.session.id })
          const follow = await f.observer.call('session.follow', { sessionId: f.ready.session.id, cursor: 0 })
          expect(snapshot.runs).toHaveLength(1)
          expect(existsSync(join(f.ready.workspace.path, 'never-approved-write.txt'))).toBe(false)
          expect(existsSync(join(f.ready.workspace.path, 'known-absent-file.txt'))).toBe(false)
          expect(await readFile(join(f.ready.workspace.path, 'known-readable.txt'), 'utf8')).toBe(
            'Safe local fixture read.\n保留原文件。\n',
          )
          expect(f.browserCommands.filter((name) => ['run.submit', 'run.retry', 'file.write'].includes(name))).toEqual(
            [],
          )
          expect(f.browserCommands.filter((name) => name === 'operation.cancel')).toHaveLength(
            outcome === 'cancelled' ? 1 : 0,
          )
          expect(
            f.browserCommands.filter((name) => ['approval.decide', 'approval.resolve'].includes(name)),
          ).toHaveLength(outcome === 'denied' ? 1 : 0)
          const approvalFacts = follow.events.filter(
            (event) => event.runId === accepted.operationId && event.type.startsWith('approval.'),
          )
          expect(
            approvalFacts.some((event) => z.object({ status: z.literal('allowed') }).safeParse(event.data).success),
          ).toBe(false)
          if (!write) expect(approvalFacts).toEqual([])
          expect(f.errors).toEqual([])
          await writeFile(
            join(f.directory, 'observation.json'),
            JSON.stringify(
              {
                actualHost: true,
                locale,
                width,
                outcome,
                asset,
                sessionId: f.ready.session.id,
                run: snapshot.runs[0],
                approvalBefore: approval,
                originalApprovalEvents: approvalFacts,
                originalToolEvents: follow.events.filter(
                  (event) => event.runId === accepted.operationId && event.type.startsWith('tool.'),
                ),
                toolResult: result,
                afterReloadToolResult: afterResult,
                before,
                after,
                browserCommands: f.browserCommands,
                errors: f.errors,
                runCount: snapshot.runs.length,
                proposedFileWritten: false,
                approved: false,
                physicalWorkspaceWrites: 'one setup fixture file only',
              },
              null,
              2,
            ),
          )
        } finally {
          await stop(f)
        }
      })
    }
