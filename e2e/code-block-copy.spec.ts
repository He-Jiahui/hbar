import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { codeBlockCopyFixtures as data } from '../tests/fixtures/code-block-copy-fixtures'
import { expectComposerText } from './support/composer-text'

const prefix = 'hbar-code-block-copy-ui-'
const phase = process.env.HBAR_CODE_COPY_PHASE ?? 'final'
if (!/^[a-zA-Z0-9_-]+$/.test(phase)) throw new Error('Invalid code-copy evidence phase')
const evidence = resolve('artifacts/code-block-copy/browser', phase)
const readySchema = z.object({
  url: z.url(),
  token: z.string().min(1),
  observerToken: z.string().min(1),
  workspace: workspaceSchema,
  firstSession: sessionSchema,
  secondSession: sessionSchema,
  messageIds: z.object({
    ordinary: z.literal(data.messageIds.ordinary),
    multipleTextBlocks: z.literal(data.messageIds.multipleTextBlocks),
    historicalPlan: z.literal(data.messageIds.historicalPlan),
    otherSession: z.literal(data.messageIds.otherSession),
  }),
  initialization: z.object({
    sessions: z.literal(2),
    messageCommits: z.literal(4),
    demo: z.literal(false),
    providerChanges: z.literal(0),
    runs: z.literal(0),
  }),
})
const requestSchema = z.object({
  method: z.string(),
  params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
})
interface Fixture {
  readonly root: string
  readonly child: ChildProcess
  readonly context: BrowserContext
  readonly page: Page
  readonly client: HbarClient
  readonly ready: z.infer<typeof readySchema>
  readonly copy: ReturnType<typeof getShellCopy>
  readonly commands: string[]
  readonly mutatingCommands: ReadonlySet<string>
  readonly errors: string[]
  readonly warnings: string[]
}

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun unavailable for owned code-copy Host')
  return executable
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    if (!child.stdin) throw new Error('Missing owned Host stdin; fixture root retained')
    child.stdin.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 10000 }).toBe(true)
  }
  expect(child.exitCode).toBe(0)
}

async function removeOwned(root: string): Promise<void> {
  const path = await realpath(root)
  if (dirname(path) !== (await realpath(tmpdir())) || !basename(path).startsWith(prefix))
    throw new Error('Refusing non-owned code-copy fixture cleanup')
  await rm(path, { recursive: true, force: true })
}

async function awaitReady(child: ChildProcess) {
  if (!child.stdout) throw new Error('Owned Host stdout is missing')
  const lines = createInterface({ input: child.stdout })
  try {
    return await new Promise<z.infer<typeof readySchema>>((done, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        child.off('error', onError)
        child.off('exit', onExit)
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onExit = (code: number | null) => {
        cleanup()
        reject(new Error(`Owned code-copy Host exited: ${code}`))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Owned code-copy Host startup timeout'))
      }, 30000)
      child.once('error', onError)
      child.once('exit', onExit)
      lines.on('line', (line) => {
        try {
          const result = readySchema.safeParse(JSON.parse(line))
          if (result.success) {
            cleanup()
            done(result.data)
          }
        } catch {
          /* Credential-bearing stdout is not retained as diagnostic evidence. */
        }
      })
    })
  } finally {
    lines.close()
  }
}

function composer(f: Fixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true })
}

async function sidebar(f: Fixture, open: boolean): Promise<void> {
  const control = f.page.getByRole('button', {
    name: open ? f.copy.shell.showSidebar : f.copy.shell.hideSidebar,
    exact: true,
  })
  if (await control.isVisible()) {
    try {
      await control.click({ timeout: 1500 })
    } catch (error) {
      if (await control.isVisible()) throw error
    }
  }
}

async function openSession(f: Fixture, session = f.ready.firstSession): Promise<void> {
  await sidebar(f, true)
  const row = f.page.locator(`[data-workspace-id="${f.ready.workspace.id}"]`)
  const toggle = row
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    try {
      await row.locator('xpath=self::*[@aria-expanded="false"]').click({ timeout: 1500 })
    } catch (error) {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') throw error
    }
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await row.getByRole('treeitem', { name: session.title, exact: true }).click()
  await sidebar(f, false)
  await expect(composer(f)).toBeVisible()
}

async function setDraft(f: Fixture, text: string): Promise<void> {
  await composer(f).click()
  await f.page.keyboard.press('ControlOrMeta+A')
  await f.page.keyboard.insertText(text)
  await expectComposerText(composer(f), text)
}

async function start(browser: Browser, locale: ShellLocale, width: number): Promise<Fixture> {
  const assets = resolve(process.env.HBAR_CODE_COPY_WEB_DIST ?? 'dist/web')
  if (!existsSync(join(assets, 'index.html'))) throw new Error('Code-copy frozen web index is missing')
  const executable = bunExecutable()
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({
    locale,
    viewport: { width, height: 960 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const child = spawn(executable, ['e2e/support/code-block-copy-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HBAR_CODE_COPY_ROOT: root, HBAR_CODE_COPY_WEB_DIST: assets },
  })
  let stderr = ''
  let client: HbarClient | undefined
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-16384)
  })
  try {
    const ready = await awaitReady(child)
    client = new HbarClient(ready.url, ready.observerToken)
    await client.connect()
    const mutatingCommands = new Set<string>()
    let after: string | undefined
    for (let page = 0; page < 8; page++) {
      const catalog = await client.call('command.catalog', { limit: 200, ...(after ? { after } : {}) })
      for (const command of catalog.items)
        if (command.metadata.kind === 'command') mutatingCommands.add(command.metadata.id)
      after = catalog.nextCursor
      if (!after) break
    }
    if (after) throw new Error('Code-copy command classification exceeded its bounded catalog capacity')
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = [],
      warnings: string[] = [],
      commands: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text())
    })
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          try {
            const parsed = requestSchema.safeParse(JSON.parse(message))
            if (parsed.success) {
              const command =
                parsed.data.method === 'command.execute' ? parsed.data.params?.commandId : parsed.data.method
              if (command) {
                if (commands.length < 4096) commands.push(command)
                else if (!errors.includes('Command observation capacity exceeded'))
                  errors.push('Command observation capacity exceeded')
              }
            }
          } catch {
            /* The recorder never retains payloads or modifies the real response. */
          }
        }
        server.send(message)
      })
      server.onMessage((message) => socket.send(message))
      socket.onClose(async (code, reason) => {
        await server.close({ ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) })
      })
    })
    await page.goto(ready.url)
    const asset = process.env.HBAR_CODE_COPY_EXPECTED_ASSET
    if (asset) expect(await page.locator('script[type="module"][src]').getAttribute('src')).toBe(`/assets/${asset}`)
    const f: Fixture = {
      root,
      child,
      context,
      page,
      client,
      ready,
      copy: getShellCopy(locale),
      commands,
      mutatingCommands,
      errors,
      warnings,
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
    client?.disconnect()
    try {
      await stopChild(child)
      await removeOwned(root)
    } catch (cleanupError) {
      failures.push(cleanupError)
    }
    if (stderr) failures.push(new Error(`Owned code-copy stderr: ${stderr}`))
    throw new AggregateError(failures, `Code-copy startup failed; owned root ${root}`, { cause: error })
  }
}

async function stop(f: Fixture) {
  const failures: unknown[] = []
  try {
    await f.context.close()
  } catch (error) {
    failures.push(error)
  }
  f.client.disconnect()
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
    stop: 'Owned child stdin only',
  }
  if (failures.length) throw new AggregateError(failures, JSON.stringify(cleanup))
  return cleanup
}

async function assertNoExecution(f: Fixture): Promise<void> {
  expect(
    f.commands.filter(
      (command) => f.mutatingCommands.has(command) || ['run.submit', 'run.retry', 'file.write'].includes(command),
    ),
  ).toEqual([])
  for (const session of [f.ready.firstSession, f.ready.secondSession])
    expect((await f.client.call('session.snapshot', { sessionId: session.id })).runs).toEqual([])
  expect(f.errors).toEqual([])
  expect(f.warnings).toEqual([])
}

async function copyCode(f: Fixture, block: Locator, expected: string): Promise<void> {
  const action = block.locator('[data-copy-status]')
  await expect(action).toHaveAttribute('data-copy-status', 'idle')
  const button = action.getByRole('button', { name: f.copy.session.messageBlocks.codeBlock.copy, exact: true })
  await button.focus()
  await f.page.keyboard.press('Enter')
  await expect(action).toHaveAttribute('data-copy-status', 'copied')
  // OS readback can normalize Windows CRLF. The pure helper tests separately
  // assert an unchanged CRLF payload; all authored fixture code here uses LF.
  await expect
    .poll(async () => (await f.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
    .toBe(expected)
}

async function capture(f: Fixture, path: string, name: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await f.page.screenshot({ path: join(path, `${name}.png`) })
  await writeFile(
    join(path, `${name}.json`),
    JSON.stringify(
      {
        asset: await f.page.locator('script[type="module"][src]').getAttribute('src'),
        viewport: f.page.viewportSize(),
        geometry: await f.page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          blocks: [...document.querySelectorAll<HTMLElement>('.hbar-message-code')].map((element) => {
            const box = element.getBoundingClientRect()
            const body = element.querySelector('pre')
            return {
              occurrence: element.dataset.codeOccurrence,
              expanded: element.dataset.expanded,
              left: box.left,
              right: box.right,
              width: box.width,
              bodyClientWidth: body?.clientWidth,
              bodyScrollWidth: body?.scrollWidth,
            }
          }),
        })),
        initialization: f.ready.initialization,
        commands: f.commands,
        errors: f.errors,
        warnings: f.warnings,
      },
      null,
      2,
    ),
  )
}

async function expectTailHighlight(f: Fixture): Promise<void> {
  await expect
    .poll(() =>
      f.page.evaluate(() => {
        const ranges = [...(CSS.highlights.get('hbar-session-find-active') ?? [])].filter(
          (range): range is Range => range instanceof Range,
        )
        return {
          text: ranges.map((range) => range.toString()).join(''),
          visible:
            ranges.length > 0 &&
            ranges.every((range) => {
              const rect = range.getBoundingClientRect()
              const owner = range.startContainer.parentElement?.closest('.hbar-message-code')
              const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
              if (!owner || !hit || !owner.contains(hit) || rect.width <= 0 || rect.height <= 0) return false
              let ancestor = range.startContainer.parentElement
              while (ancestor) {
                const style = getComputedStyle(ancestor)
                const box = ancestor.getBoundingClientRect()
                if (
                  ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) &&
                  (rect.left < box.left + ancestor.clientLeft - 1 ||
                    rect.right > box.left + ancestor.clientLeft + ancestor.clientWidth + 1)
                )
                  return false
                if (
                  ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY) &&
                  (rect.top < box.top + ancestor.clientTop - 1 ||
                    rect.bottom > box.top + ancestor.clientTop + ancestor.clientHeight + 1)
                )
                  return false
                ancestor = ancestor.parentElement
              }
              return true
            }),
        }
      }),
    )
    .toEqual({ text: data.tailNeedle, visible: true })
}

const cases =
  phase === 'baseline'
    ? ([
        { locale: 'en-US', width: 1440 },
        { locale: 'zh-CN', width: 320 },
      ] as const)
    : ([
        { locale: 'en-US', width: 1440 },
        { locale: 'en-US', width: 320 },
        { locale: 'zh-CN', width: 1440 },
        { locale: 'zh-CN', width: 320 },
      ] as const)

for (const { locale, width } of cases) {
  test(`code Copy keeps the original authored source, Find and readonly history ${locale} ${width}`, async ({
    browser,
  }) => {
    test.setTimeout(120000)
    const directory = join(evidence, `${locale}-${width}`)
    await mkdir(directory, { recursive: true })
    const f = await start(browser, locale, width)
    let archiveSetupWrites = 0
    let passed = false
    const failures: unknown[] = []
    try {
      const ordinary = f.page.locator(`[data-message-id="${data.messageIds.ordinary}"]`)
      await expect(ordinary).toContainText('Ordinary authored code fixture.')
      await ordinary.locator('pre').first().scrollIntoViewIfNeeded()
      await assertNoExecution(f)
      await capture(f, directory, 'entry-before-copy')
      // On the frozen pre-feature bundle this is the deterministic behavior red:
      // the real authored pre exists, but it has no contextual code Copy entry.
      const blocks = ordinary.locator('.hbar-message-code')
      await expect(blocks).toHaveCount(2)
      const long = blocks.nth(0),
        short = blocks.nth(1)
      await expect(
        long.getByRole('button', { name: f.copy.session.messageBlocks.codeBlock.copy, exact: true }),
      ).toBeVisible()
      await expect(long).toHaveAttribute('data-expanded', 'false')
      await expect(long.locator('[data-code-tail]')).toBeHidden()
      expect(await long.locator('pre').innerText()).not.toContain(data.tailNeedle)
      expect((await long.locator('pre').innerText()).trimEnd().split('\n')).toHaveLength(20)
      await copyCode(f, long, data.longCode)
      await expect(short.locator('[data-copy-status]')).toHaveAttribute('data-copy-status', 'idle')
      await copyCode(f, short, data.shortCode)
      await capture(f, directory, 'independent-fences')
      const draftA = `Original A draft — ${locale} ${width}`
      await setDraft(f, draftA)
      const readsBeforeFind = f.commands.filter((command) => command === 'session.snapshot').length
      const find = f.copy.session.find
      await f.page.getByRole('button', { name: find.entry, exact: true }).click()
      const bar = f.page.getByRole('search', { name: find.title, exact: true })
      const query = bar.getByRole('searchbox', { name: find.input, exact: true })
      await query.fill(f.copy.session.messageBlocks.codeBlock.copy)
      await expect(bar.getByRole('status')).toHaveText('0')
      await query.fill(data.tailNeedle)
      await expect(bar.getByRole('status')).toHaveText('1 / 1')
      await expect(long).toHaveAttribute('data-expanded', 'true')
      expect((await long.locator('pre').innerText()).trimEnd().split('\n')).toHaveLength(25)
      await expectTailHighlight(f)
      expect(f.commands.filter((command) => command === 'session.snapshot').length).toBe(readsBeforeFind)
      await capture(f, directory, 'find-expanded-tail')
      await bar.getByRole('button', { name: find.close, exact: true }).click()
      await expectComposerText(composer(f), draftA)
      const multi = f.page
        .locator(`[data-message-id="${data.messageIds.multipleTextBlocks}"]`)
        .locator('.hbar-message-code')
      await expect(multi).toHaveCount(2)
      await copyCode(f, multi.nth(0), data.multiBlockCode)
      await expect(multi.nth(1).locator('[data-copy-status]')).toHaveAttribute('data-copy-status', 'idle')
      await copyCode(f, multi.nth(1), data.multiBlockCode)
      const plan = f.page.locator(`[data-message-id="${data.messageIds.historicalPlan}"]`)
      await expect(plan.locator('[data-session-find-segment="proposal"]')).toHaveCount(1)
      await copyCode(f, plan.locator('.hbar-message-code'), data.historicalPlanCode)
      await capture(f, directory, 'historical-plan')
      await openSession(f, f.ready.secondSession)
      const draftB = `Independent B draft — ${locale}`
      await setDraft(f, draftB)
      await copyCode(
        f,
        f.page.locator(`[data-message-id="${data.messageIds.otherSession}"] .hbar-message-code`),
        data.otherSessionCode,
      )
      await openSession(f)
      await expectComposerText(composer(f), draftA)
      await openSession(f, f.ready.secondSession)
      await expectComposerText(composer(f), draftB)
      await openSession(f)
      await expectComposerText(composer(f), draftA)
      await f.page.reload()
      await openSession(f)
      await expect(blocks).toHaveCount(2)
      await copyCode(f, long, data.longCode)
      // Reload verifies canonical history, not durable composer drafts: memory
      // draft persistence across a full application reload is not asserted here.
      await setDraft(f, draftA)
      const archived = await createWorkspaceSessionCommandClient(f.client).execute('session.archive', {
        sessionId: f.ready.firstSession.id,
        archived: true,
      })
      archiveSetupWrites++
      expect(archived.archived).toBe(true)
      await sidebar(f, true)
      const row = f.page.locator(`[data-workspace-id="${f.ready.workspace.id}"]`)
      await row.getByTitle(f.copy.shell.workspaceActions(f.ready.workspace.name), { exact: true }).click()
      await row
        .getByRole('menuitem', { name: f.copy.shell.roster.refreshWorkspace(f.ready.workspace.name), exact: true })
        .click()
      await sidebar(f, false)
      await expect(f.page.locator('[data-session-execution-access="archived"]')).toBeVisible()
      await expectComposerText(composer(f), draftA)
      await copyCode(f, long, data.longCode)
      expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await capture(f, directory, 'archived-readable-code')
      await assertNoExecution(f)
      passed = true
    } catch (error) {
      failures.push(error)
    } finally {
      let verifiedNoExecution = false
      try {
        await assertNoExecution(f)
        verifiedNoExecution = true
        await capture(f, directory, passed ? 'final' : 'failure')
      } catch (error) {
        failures.push(error)
      }
      let cleanup: Awaited<ReturnType<typeof stop>> | null = null
      try {
        cleanup = await stop(f)
      } catch (error) {
        failures.push(error)
      }
      await writeFile(
        join(directory, 'result.json'),
        JSON.stringify(
          {
            passed,
            locale,
            width,
            asset: process.env.HBAR_CODE_COPY_EXPECTED_ASSET ?? null,
            initialization: f.ready.initialization,
            archiveSetupWrites,
            syntheticMessageRunIdsOnly: true,
            runRows: verifiedNoExecution ? 0 : null,
            observedBrowserMutations: f.commands.filter((command) => f.mutatingCommands.has(command)),
            commands: f.commands,
            errors: f.errors,
            warnings: f.warnings,
            cleanup,
          },
          null,
          2,
        ),
      )
    }
    if (failures.length)
      throw new AggregateError(failures, 'Code-copy behavior, final observation or exact cleanup failed')
  })
}
