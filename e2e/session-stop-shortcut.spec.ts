import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import { runCommands } from '@hbar/contracts/commands/run'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'

const prefix = 'hbar-session-stop-ui-'
const evidence = resolve(process.env.HBAR_STOP_SHORTCUT_EVIDENCE ?? 'artifacts/session-stop-shortcut/browser')
const fileName = 'original-draft.md'
const originalFile = '# Original file\nNever save by shortcut.\n'
const dirtyFile = '# Unsaved file retained — 未保存文件保留\n'
const attachmentName = 'original-stop-attachment.txt'
const readySchema = z.object({
  url: z.url(),
  token: z.string(),
  observerToken: z.string(),
  workspace: workspaceSchema,
  firstSession: sessionSchema,
  secondSession: sessionSchema,
  goalAutoContinue: z.literal(false),
  initializationWrites: z.array(z.string()).max(8),
})
const wireSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
})
type ControlledCommand = 'operation.cancel' | 'operation.get'
interface Rule {
  readonly command: ControlledCommand
  readonly operationId: string
  readonly mode: 'unknown' | 'fail' | 'hold'
  matched: number
}
interface Request {
  readonly command: string
  readonly operationId: string | null
}
function parseWire(value: string) {
  try {
    return wireSchema.safeParse(JSON.parse(value))
  } catch {
    return null
  }
}

/** Only actual successful Host replies are replaced. No event, operation, or store is fabricated. */
async function routeFaults(page: Page) {
  const requests: Request[] = []
  const rules: Rule[] = []
  const errors: string[] = []
  const held: { rule: Rule; release: (fail: boolean) => void }[] = []
  let pausedSession: string | null = null
  const pausedEvents: (() => void)[] = []
  let stalledEvents = 0
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    const pending = new Map<string | number, Rule>()
    const fail = (id: string | number, code: 'TIMEOUT' | 'EXECUTION_FAILED') =>
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: 'PRIVATE controlled transport detail must not render', data: code },
        }),
      )
    socket.onMessage((message) => {
      const parsed = typeof message === 'string' ? parseWire(message) : null
      if (parsed?.success && parsed.data.method) {
        const { id, method, params } = parsed.data
        const command = method === 'command.execute' ? params?.commandId : method
        if (command) {
          let operationId: string | null = null
          if (command === 'operation.cancel' || command === 'operation.get') {
            const target = runCommands[command].input.safeParse(params?.input)
            if (target.success) operationId = target.data.operationId
            const rule = rules.find(
              (item) =>
                item.matched === 0 &&
                ![...pending.values()].includes(item) &&
                item.command === command &&
                item.operationId === operationId,
            )
            if (rule && id !== undefined) pending.set(id, rule)
          }
          if (requests.length < 4096) requests.push({ command, operationId })
          else errors.push('Request observation capacity exceeded')
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      const parsed = typeof message === 'string' ? parseWire(message) : null
      if (parsed?.success && pausedSession && ['session.event', 'stream.update'].includes(parsed.data.method ?? '')) {
        const target = z.object({ sessionId: z.string() }).safeParse(parsed.data.params)
        if (target.success && target.data.sessionId === pausedSession) {
          if (pausedEvents.length >= 256) {
            errors.push('Original-session event stall capacity exceeded')
          } else {
            pausedEvents.push(() => socket.send(message))
            stalledEvents++
            return
          }
        }
      }
      if (parsed?.success && parsed.data.id !== undefined) {
        const id = parsed.data.id
        const rule = pending.get(id)
        pending.delete(id)
        if (rule) {
          const actual = runCommands[rule.command].output.safeParse(parsed.data.result)
          if (parsed.data.error !== undefined || !actual.success || actual.data.operationId !== rule.operationId) {
            errors.push('Expected an actual successful response for the captured original operation')
          } else {
            rule.matched++
            if (rule.mode === 'hold')
              held.push({ rule, release: (failed) => (failed ? fail(id, 'EXECUTION_FAILED') : socket.send(message)) })
            else fail(id, rule.mode === 'unknown' ? 'TIMEOUT' : 'EXECUTION_FAILED')
            return
          }
        }
      }
      socket.send(message)
    })
    socket.onClose(async (code, reason) => {
      pending.clear()
      await server.close({ ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) })
    })
  })
  return {
    requests,
    errors,
    stallEvents(sessionId: string) {
      if (pausedSession) throw new Error('A session event stall is already owned')
      pausedSession = sessionId
    },
    releaseEvents() {
      pausedSession = null
      for (const send of pausedEvents.splice(0)) send()
    },
    stalledCount: () => stalledEvents,
    arm(command: ControlledCommand, operationId: string, mode: Rule['mode']) {
      if (
        rules.length >= 16 ||
        (mode === 'unknown' && command !== 'operation.cancel') ||
        (mode === 'fail' && command !== 'operation.get')
      )
        throw new Error('Invalid bounded cancellation fault rule')
      const rule: Rule = { command, operationId, mode, matched: 0 }
      rules.push(rule)
      return rule
    },
    pending: (rule: Rule) => held.filter((item) => item.rule === rule).length,
    release(rule: Rule, failed = false) {
      if (failed && rule.command !== 'operation.get')
        throw new Error('Do not misreport an accepted cancellation as a definite failure')
      const index = held.findIndex((item) => item.rule === rule)
      const item = held[index]
      if (!item) throw new Error('Captured response is not held')
      held.splice(index, 1)
      item.release(failed)
    },
    count: (command: string) => requests.filter((request) => request.command === command).length,
  }
}

interface Fixture {
  readonly root: string
  readonly child: ChildProcess
  readonly context: BrowserContext
  readonly page: Page
  readonly external: HbarClient
  readonly ready: z.infer<typeof readySchema>
  readonly copy: ReturnType<typeof getShellCopy>
  readonly locale: ShellLocale
  readonly width: number
  readonly directory: string
  readonly faults: Awaited<ReturnType<typeof routeFaults>>
  readonly errors: string[]
  readonly warnings: string[]
  readonly runs: ReturnType<typeof createRunCommandClient>
  readonly setupRunIds: string[]
  readonly cleanupCancelIds: string[]
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
    throw new Error('Refusing cleanup outside the exact owned fixture')
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

async function start(browser: Browser, locale: ShellLocale, width: number, phase: string): Promise<Fixture> {
  const assets = resolve(process.env.HBAR_STOP_SHORTCUT_WEB_DIST ?? 'dist/web')
  if (!existsSync(join(assets, 'index.html'))) throw new Error('Frozen Web assets are missing')
  const directory = join(evidence, `${phase}-${locale}-${width}`)
  await mkdir(directory, { recursive: true })
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  const child = spawn(bunExecutable(), ['e2e/support/session-stop-shortcut-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HBAR_STOP_SHORTCUT_ROOT: root, HBAR_STOP_SHORTCUT_WEB_DIST: assets },
  })
  const context = await browser.newContext({ locale, viewport: { width, height: 960 } })
  let external: HbarClient | undefined
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
    external = new HbarClient(ready.url, ready.observerToken)
    await external.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = [],
      warnings: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') warnings.push(message.text())
    })
    const faults = await routeFaults(page)
    await page.goto(ready.url)
    const expectedAsset = process.env.HBAR_STOP_SHORTCUT_EXPECTED_ASSET
    if (expectedAsset)
      expect(await page.locator('script[type="module"][src]').getAttribute('src')).toBe(`/assets/${expectedAsset}`)
    const f: Fixture = {
      root,
      child,
      context,
      page,
      external,
      ready,
      locale,
      width,
      directory,
      copy: getShellCopy(locale),
      faults,
      errors,
      warnings,
      runs: createRunCommandClient(external),
      setupRunIds: [],
      cleanupCancelIds: [],
    }
    const show = page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true })
    if (await show.isVisible()) await show.click()
    const project = page.locator(`[data-workspace-id="${ready.workspace.id}"]`)
    const toggle = project.locator('.hbar-app-react-workspace-row')
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      try {
        await project.locator('.hbar-app-react-workspace-row[aria-expanded="false"]').click({ timeout: 1500 })
      } catch (error) {
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') throw error
      }
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await project.getByRole('button', { name: f.copy.shell.openSession(ready.firstSession.title), exact: true }).click()
    const hide = page.getByRole('button', { name: f.copy.shell.hideSidebar, exact: true })
    if (await hide.isVisible()) {
      try {
        await hide.click({ timeout: 1500 })
      } catch (error) {
        if (await hide.isVisible()) throw error
      }
    }
    await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
    await expect(composer(f)).toBeVisible()
    return f
  } catch (error) {
    await context.close()
    external?.disconnect()
    await cleanup(child, root, directory)
    throw error
  }
}

async function stop(f: Fixture): Promise<void> {
  try {
    await f.context.close()
  } finally {
    f.external.disconnect()
    await cleanup(f.child, f.root, f.directory)
  }
}
function composer(f: Fixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true, includeHidden: true })
}
function files(f: Fixture) {
  return f.page.locator('.lumen-app-tool-drawer .hbar-app-react-file-workspace')
}
function notice(f: Fixture) {
  return f.page.locator('.hbar-app-react-session-stop[data-session-stop]:visible')
}

async function seedDraft(f: Fixture): Promise<string> {
  const draft = `Original unsent Stop draft — 保留原草稿 ${f.locale}`
  await composer(f).focus()
  await f.page.keyboard.insertText(draft)
  await expectComposerText(composer(f), draft)
  const transfer = await f.page.evaluateHandle((name) => {
    const data = new DataTransfer()
    data.items.add(new File(['Original local attachment'], name, { type: 'text/plain' }))
    return data
  }, attachmentName)
  await f.page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: transfer })
  await transfer.dispose()
  await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
  return draft
}

async function openDirtyFiles(f: Fixture) {
  await f.page.getByRole('button', { name: f.copy.session.tools.files, exact: true }).click()
  await files(f).getByRole('button', { name: fileName, exact: true }).click()
  await files(f).getByRole('button', { name: f.copy.files.edit, exact: true }).click()
  const editor = files(f).getByRole('textbox', { name: fileName, exact: true })
  await editor.fill(dirtyFile)
  await editor.focus()
  return editor
}

async function submitPending(f: Fixture, suffix: string, queued = false): Promise<string> {
  const target = `never-write-${suffix}.txt`
  const result = await f.runs.execute(
    'run.submit',
    {
      sessionId: f.ready.firstSession.id,
      modelId: 'local-fixture',
      input: {
        text: `/tool write_file ${JSON.stringify({ path: target, text: 'Never approve or execute this fixture tool.' })}`,
        images: [],
        approval: 'ask',
      },
    },
    { idempotencyKey: crypto.randomUUID() },
  )
  f.setupRunIds.push(result.operationId)
  await expect
    .poll(async () => (await f.runs.execute('operation.get', { operationId: result.operationId })).status)
    .toBe(queued ? 'queued' : 'waiting_approval')
  if (queued) {
    await expect(f.page.locator('.hbar-session-run-current')).toContainText(f.copy.session.runs.activeCount(2))
  } else {
    await expect(f.page.locator(`.hbar-session-run-current[data-run-id="${result.operationId}"]`)).toHaveAttribute(
      'data-status',
      'waiting_approval',
    )
  }
  return result.operationId
}

async function assertPreserved(f: Fixture, draft: string, file = true): Promise<void> {
  await expectComposerText(composer(f), draft)
  await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toHaveCount(1)
  if (file)
    await expect(files(f).getByRole('textbox', { name: fileName, exact: true, includeHidden: true })).toHaveValue(
      dirtyFile,
    )
  expect(await readFile(join(f.ready.workspace.path, fileName), 'utf8')).toBe(originalFile)
}

async function capture(f: Fixture, name: string): Promise<void> {
  const geometry = await f.page.evaluate(() => {
    const element = document.querySelector('.hbar-app-react-session-stop[data-session-stop]')
    const rect = element?.getBoundingClientRect()
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      notice: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      focus: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? null,
    }
  })
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
  if (geometry.notice) {
    expect(geometry.notice.x).toBeGreaterThanOrEqual(-1)
    expect(geometry.notice.x + geometry.notice.width).toBeLessThanOrEqual(f.width + 1)
  }
  await f.page.screenshot({ path: join(f.directory, `${name}.png`) })
  await writeFile(join(f.directory, `${name}.json`), JSON.stringify(geometry, null, 2))
}

async function assertHost(f: Fixture, suffixes: readonly string[]): Promise<void> {
  const snapshot = await f.external.call('session.snapshot', { sessionId: f.ready.firstSession.id })
  expect(snapshot.runs).toHaveLength(f.setupRunIds.length)
  expect(snapshot.runs.every((run) => run.status === 'cancelled')).toBe(true)
  expect(snapshot.approvals.some((approval) => approval.status === 'allowed')).toBe(false)
  expect((await f.external.call('session.snapshot', { sessionId: f.ready.secondSession.id })).runs).toHaveLength(0)
  for (const suffix of suffixes)
    expect(existsSync(join(f.ready.workspace.path, `never-write-${suffix}.txt`))).toBe(false)
  expect(
    f.faults.requests.filter((request) =>
      ['run.submit', 'run.retry', 'approval.decide', 'file.write'].includes(request.command),
    ),
  ).toEqual([])
  expect(f.errors).toEqual([])
  expect(f.warnings).toEqual([])
  expect(f.faults.errors).toEqual([])
  await writeFile(
    join(f.directory, 'observation.json'),
    JSON.stringify(
      {
        actualHost: true,
        asset: await f.page.locator('script[type="module"][src]').getAttribute('src'),
        locale: f.locale,
        width: f.width,
        initializationWrites: f.ready.initializationWrites,
        setupRunIds: f.setupRunIds,
        observerCleanupCancelIds: f.cleanupCancelIds,
        browserRequests: f.faults.requests,
        originalSessionEventsStalled: f.faults.stalledCount(),
        runRows: snapshot.runs.length,
        neverApproved: true,
        neverWroteTargets: true,
        errors: f.errors,
        warnings: f.warnings,
      },
      null,
      2,
    ),
  )
}

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 320]) {
    test(`Stop shortcut preserves composer and Files while prioritizing executing work: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(90_000)
      const f = await start(browser, locale, width, 'normal')
      try {
        const draft = await seedDraft(f)
        const first = await submitPending(f, 'composer')
        await expect(f.page.getByRole('button', { name: f.copy.session.prompt.stop, exact: true })).toBeEnabled()
        await composer(f).focus()
        await f.page.keyboard.press('Control+.')
        await expect
          .poll(async () => (await f.runs.execute('operation.get', { operationId: first })).status)
          .toBe('cancelled')
        await expect(composer(f)).toBeFocused()
        await expect(notice(f)).toHaveAttribute('data-operation-id', first)
        await capture(f, 'composer-cancelled')
        await assertPreserved(f, draft, false)
        const editor = await openDirtyFiles(f)
        const editorIdentity = await editor.elementHandle()
        if (!editorIdentity) throw new Error('Original Files editor identity is missing')
        const active = await submitPending(f, 'executing')
        const queued = await submitPending(f, 'queued', true)
        await editor.focus()
        await f.page.keyboard.press('Meta+.')
        await expect
          .poll(async () => (await f.runs.execute('operation.get', { operationId: active })).status)
          .toBe('cancelled')
        await expect(notice(f)).toHaveAttribute('data-operation-id', active)
        expect(
          f.faults.requests
            .filter((request) => request.command === 'operation.cancel')
            .map((request) => request.operationId),
        ).toEqual([first, active])
        await expect(editor).toBeFocused()
        expect(
          await editorIdentity.evaluate((element) => element.isConnected && element === document.activeElement),
        ).toBe(true)
        await capture(f, 'files-cancelled')
        await assertPreserved(f, draft)
        // The newer queued operation was not selected by the shortcut. Stop it explicitly via the setup observer.
        f.cleanupCancelIds.push(queued)
        await f.runs.execute('operation.cancel', { operationId: queued })
        await expect
          .poll(async () => (await f.runs.execute('operation.get', { operationId: queued })).status)
          .toBe('cancelled')
        await assertHost(f, ['composer', 'executing', 'queued'])
        await editorIdentity.dispose()
      } finally {
        await stop(f)
      }
    })
  }

for (const [locale, width] of [
  ['en-US', 1440],
  ['zh-CN', 320],
] as const) {
  test(`unknown Stop in Files has read-only recovery without replay: ${locale} ${width}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const f = await start(browser, locale, width, 'unknown')
    try {
      const draft = await seedDraft(f)
      const editor = await openDirtyFiles(f)
      const original = await submitPending(f, 'unknown')
      // A delivered canonical terminal event is sufficient truth. Hold only these original
      // session events as well as losing its ACK to exercise the genuinely unknown UI path.
      f.faults.stallEvents(f.ready.firstSession.id)
      const lost = f.faults.arm('operation.cancel', original, 'unknown')
      await editor.focus()
      await f.page.keyboard.press('Control+.')
      await expect.poll(() => lost.matched).toBe(1)
      await expect(notice(f)).toHaveAttribute('data-stop-state', 'unknown')
      await expect(notice(f)).toHaveAttribute('data-operation-id', original)
      await expect(editor).toBeFocused()
      await f.page.keyboard.press('Control+.')
      expect(f.faults.count('operation.cancel')).toBe(1)
      await capture(f, 'unknown')
      const check = notice(f).getByRole('button', { name: f.copy.shell.stop.check, exact: true })
      const failedRead = f.faults.arm('operation.get', original, 'fail')
      await check.click()
      await expect.poll(() => failedRead.matched).toBe(1)
      await expect(notice(f)).toHaveAttribute('data-stop-state', 'unknown')
      await expect(notice(f)).toContainText(f.copy.shell.stop.failure('EXECUTION_FAILED'))
      await expect(check).toBeFocused()
      await expect(
        f.page.getByText('PRIVATE controlled transport detail must not render', { exact: false }),
      ).toHaveCount(0)
      const heldRead = f.faults.arm('operation.get', original, 'hold')
      const checkIdentity = await check.elementHandle()
      if (!checkIdentity) throw new Error('Original recovery button identity is missing')
      await check.click()
      await expect.poll(() => f.faults.pending(heldRead)).toBe(1)
      await expect(notice(f).getByRole('button', { name: f.copy.shell.stop.checking, exact: true })).toBeDisabled()
      expect(f.faults.count('operation.cancel')).toBe(1)
      await capture(f, 'checking')
      if (locale === 'zh-CN') await editor.focus()
      f.faults.release(heldRead)
      await expect(notice(f)).toHaveAttribute('data-stop-state', 'cancelled')
      f.faults.releaseEvents()
      if (locale === 'zh-CN') await expect(editor).toBeFocused()
      else {
        await expect(notice(f).getByRole('button', { name: f.copy.shell.stop.dismiss, exact: true })).toBeFocused()
        expect(
          await checkIdentity.evaluate((element) => element.isConnected && element === document.activeElement),
        ).toBe(true)
      }
      await checkIdentity.dispose()
      expect(f.faults.count('operation.get')).toBe(2)
      expect(f.faults.count('operation.cancel')).toBe(1)
      await assertPreserved(f, draft)
      await capture(f, 'recovered')
      await assertHost(f, ['unknown'])
    } finally {
      await stop(f)
    }
  })
}
