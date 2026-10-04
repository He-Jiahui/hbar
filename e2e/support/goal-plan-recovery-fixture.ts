import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { HbarClient, createConfigurationCommandClient, createGoalPlanCommandClient } from '@hbar/client'
import { goalPlanCommands, goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { expectComposerText } from './composer-text'

const prefix = 'hbar-goal-plan-recovery-ui-'
const readySchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  externalToken: z.string().min(1),
  workspace: workspaceSchema,
  firstSession: sessionSchema,
  secondSession: sessionSchema,
  firstGoal: goalPlanSnapshotSchema,
  initializationWrites: z.array(z.string()).max(16),
  goalAutoContinue: z.literal(false),
})
const wireSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z
    .object({ commandId: z.string().optional(), input: z.unknown().optional(), idempotencyKey: z.string().optional() })
    .passthrough()
    .optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
})
const targetSchema = z.object({ sessionId: z.string() })
const controlled = {
  'goal.set': goalPlanCommands['goal.set'],
  'goal.clear': goalPlanCommands['goal.clear'],
  'goal.snapshot': goalPlanCommands['goal.snapshot'],
  'mode.set': configurationCommands['mode.set'],
  'mode.get': configurationCommands['mode.get'],
}
export type RecoveryCommand = keyof typeof controlled
export type RecoveryFault = Readonly<{
  command: RecoveryCommand
  sessionId: string
  kind: 'unknown' | 'fail' | 'hold'
  times?: number
}>
export interface RecoveryRequest {
  readonly command: string
  readonly sessionId: string | null
  readonly idempotencyKey: string | null
}
function isControlled(command: string): command is RecoveryCommand {
  return Object.hasOwn(controlled, command)
}
function parseWire(message: string) {
  try {
    return wireSchema.safeParse(JSON.parse(message))
  } catch {
    return null
  }
}

/** Faults only replace actual replies; every request reaches the temporary Host.
 * Rules bind at request time to exact session+command and are finite. No store,
 * canonical event, model state or success response is fabricated here. */
export async function routeGoalPlanFaults(page: Page) {
  const requests: RecoveryRequest[] = []
  const errors: string[] = []
  const applied: { ticket: number; command: RecoveryCommand; sessionId: string; kind: RecoveryFault['kind'] }[] = []
  const rules: { ticket: number; fault: RecoveryFault; remaining: number; matched: number }[] = []
  const held: { ticket: number; connection: number; send: (fail: boolean) => void }[] = []
  let nextTicket = 0
  let connection = 0
  await page.routeWebSocket('**/rpc', (socket) => {
    const connectionId = ++connection
    const server = socket.connectToServer()
    const pending = new Map<string | number, { request: RecoveryRequest; rule: (typeof rules)[number] | undefined }>()
    const failure = (id: string | number, code: 'RESULT_UNKNOWN' | 'EXECUTION_FAILED') =>
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: 'PRIVATE Goal Plan fixture response detail must not be displayed',
            data: code,
          },
        }),
      )
    socket.onMessage((message) => {
      const parsed = typeof message === 'string' ? parseWire(message) : null
      if (parsed?.success && parsed.data.method) {
        const data = parsed.data
        const command = data.method === 'command.execute' ? data.params?.commandId : data.method
        if (command) {
          const target = targetSchema.safeParse(data.params?.input ?? data.params)
          const request = {
            command,
            sessionId: target.success ? target.data.sessionId : null,
            idempotencyKey: data.params?.idempotencyKey ?? null,
          }
          if (requests.length < 4096) requests.push(request)
          else if (!errors.includes('Request observation capacity exceeded'))
            errors.push('Request observation capacity exceeded')
          if (isControlled(command) && data.id !== undefined) {
            const rule = rules.find(
              (item) =>
                item.remaining > 0 && item.fault.command === command && item.fault.sessionId === request.sessionId,
            )
            if (rule) rule.remaining--
            if (pending.size >= 64) {
              errors.push('Controlled in-flight capacity exceeded')
              failure(data.id, 'EXECUTION_FAILED')
              return
            }
            pending.set(data.id, { request, rule })
          }
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      const parsed = typeof message === 'string' ? parseWire(message) : null
      if (parsed?.success && parsed.data.id !== undefined) {
        const id = parsed.data.id
        const entry = pending.get(id)
        pending.delete(id)
        if (entry?.rule && isControlled(entry.request.command)) {
          const { rule } = entry
          // Never turn a rejected/malformed write into an alleged accepted ACK.
          const valid = controlled[entry.request.command].output.safeParse(parsed.data.result)
          if (parsed.data.error !== undefined || !valid.success) {
            errors.push(`Expected real successful ${entry.request.command} before response replacement`)
          } else {
            rule.matched++
            applied.push({
              ticket: rule.ticket,
              command: rule.fault.command,
              sessionId: rule.fault.sessionId,
              kind: rule.fault.kind,
            })
            if (rule.fault.kind === 'hold') {
              held.push({
                ticket: rule.ticket,
                connection: connectionId,
                send: (fail) => (fail ? failure(id, 'EXECUTION_FAILED') : socket.send(message)),
              })
            } else failure(id, rule.fault.kind === 'unknown' ? 'RESULT_UNKNOWN' : 'EXECUTION_FAILED')
            return
          }
        }
      }
      socket.send(message)
    })
    socket.onClose(async (code, reason) => {
      pending.clear()
      for (let index = held.length - 1; index >= 0; index--)
        if (held[index]?.connection === connectionId) held.splice(index, 1)
      // Installing onClose disables Playwright's default closure forwarding.
      await server.close({ ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) })
    })
  })
  return {
    requests,
    applied,
    errors,
    arm(fault: RecoveryFault): number {
      const times = fault.times ?? 1
      if (!fault.sessionId || !Number.isInteger(times) || times < 1 || times > 16 || rules.length >= 64)
        throw new Error('Invalid bounded Goal Plan fault rule')
      const write = fault.command === 'goal.set' || fault.command === 'goal.clear' || fault.command === 'mode.set'
      if ((fault.kind === 'unknown' && !write) || (fault.kind === 'fail' && write))
        throw new Error('Unknown is only an accepted write; fail is only a read')
      const ticket = ++nextTicket
      rules.push({ ticket, fault, remaining: times, matched: 0 })
      return ticket
    },
    pending(ticket: number): number {
      return held.filter((item) => item.ticket === ticket).length
    },
    release(ticket: number, options: { fail?: boolean } = {}): void {
      const rule = rules.find((item) => item.ticket === ticket)
      if (options.fail && rule?.fault.command !== 'goal.snapshot' && rule?.fault.command !== 'mode.get')
        throw new Error('A held accepted write cannot be released as a definite read failure')
      const items = held.filter((item) => item.ticket === ticket)
      if (!items.length) throw new Error('No matching original response is held')
      for (let index = held.length - 1; index >= 0; index--) if (held[index]?.ticket === ticket) held.splice(index, 1)
      for (const item of items) item.send(options.fail === true)
    },
    assertMatched(ticket: number, expected = 1): void {
      const rule = rules.find((item) => item.ticket === ticket)
      expect(rule?.matched).toBe(expected)
      expect(errors).toEqual([])
    },
    count(command: string, sessionId?: string): number {
      return requests.filter(
        (item) => item.command === command && (sessionId === undefined || item.sessionId === sessionId),
      ).length
    },
  }
}

export interface GoalPlanRecoveryFixture {
  readonly root: string
  readonly child: ChildProcess
  readonly context: BrowserContext
  readonly page: Page
  readonly external: HbarClient
  readonly ready: z.infer<typeof readySchema>
  readonly copy: ReturnType<typeof getShellCopy>
  readonly locale: ShellLocale
  readonly errors: string[]
  readonly warnings: string[]
  readonly faults: Awaited<ReturnType<typeof routeGoalPlanFaults>>
  readonly goals: ReturnType<typeof createGoalPlanCommandClient>
  readonly configuration: ReturnType<typeof createConfigurationCommandClient>
}
export interface GoalPlanRecoveryOptions {
  readonly locale: ShellLocale
  readonly width: number
  readonly height?: number
  readonly goal?: 'active' | 'paused' | 'none'
  readonly assets?: string
  readonly expectedAsset?: string
}
function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun is unavailable for owned Goal Plan Host')
  return executable
}
async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    if (!child.stdin) throw new Error('Owned Host has no stop channel')
    child.stdin.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 10000 }).toBe(true)
  }
  expect(child.exitCode).toBe(0)
}
async function removeOwned(root: string): Promise<void> {
  const path = await realpath(root)
  if (dirname(path) !== (await realpath(tmpdir())) || !basename(path).startsWith(prefix))
    throw new Error('Refusing cleanup of a non-owned Goal Plan root')
  await rm(path, { recursive: true, force: true })
}
async function awaitReady(child: ChildProcess) {
  if (!child.stdout) throw new Error('Owned Goal Plan Host stdout is missing')
  const lines = createInterface({ input: child.stdout })
  try {
    return await new Promise<z.infer<typeof readySchema>>((done, reject) => {
      const cleanup = () => {
        clearTimeout(timeout)
        child.off('error', onError)
        child.off('exit', onExit)
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onExit = (code: number | null) => {
        cleanup()
        reject(new Error(`Owned Goal Plan Host exited during startup: ${code}`))
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Owned Goal Plan Host startup timed out'))
      }, 30000)
      child.once('error', onError)
      child.once('exit', onExit)
      lines.on('line', (line) => {
        try {
          const ready = readySchema.safeParse(JSON.parse(line))
          if (ready.success) {
            cleanup()
            done(ready.data)
          }
        } catch {
          /* Never retain credential-bearing stdout. */
        }
      })
    })
  } finally {
    lines.close()
  }
}
export function composer(f: GoalPlanRecoveryFixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true })
}
export async function setDraft(f: GoalPlanRecoveryFixture, text: string): Promise<void> {
  const editor = composer(f)
  await editor.click()
  await f.page.keyboard.press('ControlOrMeta+A')
  await f.page.keyboard.insertText(text)
  await expectComposerText(editor, text)
}
export async function openSession(f: GoalPlanRecoveryFixture, session = f.ready.firstSession): Promise<void> {
  const side = f.page.getByRole('complementary', { name: f.copy.shell.projectsAndSessions, exact: true })
  if (!(await side.isVisible()))
    await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
  const row = f.page.locator(`[data-workspace-id="${f.ready.workspace.id}"]`)
  const toggle = row.locator('.hbar-app-react-workspace-row')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    // Initial workspace loading may expand the first project between this
    // observation and the click. Never click an already-expanded row closed.
    try {
      await row.locator('.hbar-app-react-workspace-row[aria-expanded="false"]').click({ timeout: 1500 })
    } catch (error) {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') throw error
    }
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await row.getByRole('button', { name: f.copy.shell.openSession(session.title), exact: true }).click()
  const hide = f.page.getByRole('button', { name: f.copy.shell.hideSidebar, exact: true })
  if (await hide.isVisible()) {
    try {
      await hide.click({ timeout: 1500 })
    } catch (error) {
      if (await hide.isVisible()) throw error
    }
  }
  await expect(composer(f)).toBeVisible()
}
export async function startGoalPlanRecovery(
  browser: Browser,
  options: GoalPlanRecoveryOptions,
): Promise<GoalPlanRecoveryFixture> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({
    locale: options.locale,
    viewport: { width: options.width, height: options.height ?? 900 },
  })
  const assets = options.assets ?? process.env.HBAR_GOAL_PLAN_RECOVERY_WEB_DIST ?? 'dist/web'
  if (!existsSync(join(resolve(assets), 'index.html'))) {
    await context.close()
    await removeOwned(root)
    throw new Error('Build dist/web or provide an existing frozen Goal Plan static root')
  }
  const child = spawn(bunExecutable(), ['e2e/support/goal-plan-recovery-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HBAR_GOAL_PLAN_RECOVERY_ROOT: root,
      HBAR_GOAL_PLAN_RECOVERY_WEB_DIST: resolve(assets),
      HBAR_GOAL_PLAN_RECOVERY_GOAL: options.goal ?? 'active',
    },
  })
  let external: HbarClient | undefined
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-16384)
  })
  try {
    const ready = await awaitReady(child)
    external = new HbarClient(ready.url, ready.externalToken)
    await external.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    const warnings: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text())
    })
    const faults = await routeGoalPlanFaults(page)
    await page.goto(ready.url)
    const expected = options.expectedAsset ?? process.env.HBAR_GOAL_PLAN_RECOVERY_EXPECTED_ASSET
    if (expected)
      expect(await page.locator('script[type="module"][src]').getAttribute('src')).toBe(`/assets/${expected}`)
    const f: GoalPlanRecoveryFixture = {
      root,
      child,
      context,
      page,
      external,
      ready,
      copy: getShellCopy(options.locale),
      locale: options.locale,
      errors,
      warnings,
      faults,
      goals: createGoalPlanCommandClient(external),
      configuration: createConfigurationCommandClient(external),
    }
    await openSession(f)
    return f
  } catch (error) {
    const failures: unknown[] = [error]
    try {
      await context.close()
    } catch (cleanupError) {
      failures.push(cleanupError)
    }
    external?.disconnect()
    try {
      await stopChild(child)
      await removeOwned(root)
    } catch (cleanupError) {
      failures.push(cleanupError)
    }
    if (stderr) failures.push(new Error(`Bounded owned Host stderr: ${stderr}`))
    throw new AggregateError(failures, `Goal Plan fixture startup failed; owned root ${root}`, { cause: error })
  }
}
export async function stopGoalPlanRecovery(f: GoalPlanRecoveryFixture) {
  const failures: unknown[] = []
  try {
    await f.context.close()
  } catch (error) {
    failures.push(error)
  }
  f.external.disconnect()
  let removed = false
  try {
    await stopChild(f.child)
    await removeOwned(f.root)
    removed = !existsSync(f.root)
  } catch (error) {
    failures.push(error)
  }
  const cleanup = {
    root: f.root,
    pid: f.child.pid,
    exitCode: f.child.exitCode,
    signalCode: f.child.signalCode,
    removed,
    stop: 'Owned child stdin; no process enumeration or kill',
  }
  if (failures.length) throw new AggregateError(failures, JSON.stringify(cleanup))
  return cleanup
}
export async function assertNoExecution(f: GoalPlanRecoveryFixture): Promise<void> {
  for (const session of [f.ready.firstSession, f.ready.secondSession])
    expect((await f.external.call('session.snapshot', { sessionId: session.id })).runs).toEqual([])
  expect(
    f.faults.requests.filter(
      (item) =>
        item.command.startsWith('run.') ||
        ['provider.verify', 'permission.set', 'settings.apply', 'file.write'].includes(item.command),
    ),
  ).toEqual([])
  expect(f.faults.errors).toEqual([])
  expect(f.errors).toEqual([])
  expect(f.warnings).toEqual([])
}
export async function capture(f: GoalPlanRecoveryFixture, directory: string, name: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('Invalid evidence name')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, `${name}.json`),
    JSON.stringify(
      {
        asset: await f.page.locator('script[type="module"][src]').getAttribute('src'),
        viewport: f.page.viewportSize(),
        geometry: await f.page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          active: { tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label') },
        })),
        initializationWrites: f.ready.initializationWrites,
        requests: f.faults.requests,
        applied: f.faults.applied,
        errors: f.errors,
        warnings: f.warnings,
      },
      null,
      2,
    ),
  )
  await f.page.screenshot({ path: join(directory, `${name}.png`) })
}
