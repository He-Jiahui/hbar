import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { HbarClient, createExtensionCommandClient } from '@hbar/client'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
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

const prefix = 'hbar-extension-collections-ui-'
const readySchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  externalToken: z.string().min(1),
  workspace: workspaceSchema,
  firstSession: sessionSchema,
  secondSession: sessionSchema,
  plugins: extensionCommands['plugin.list'].output,
  skills: extensionCommands['skill.list'].output,
  initialization: z.object({
    sessionCreates: z.literal(2),
    skillFiles: z.number().int().min(0).max(21),
    demo: z.literal(false),
    pluginChanges: z.literal(0),
    runs: z.literal(0),
  }),
})
const wireSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
})
export type ExtensionCollectionCommand = 'plugin.list' | 'skill.list'
export interface ExtensionCollectionFault {
  readonly command: ExtensionCollectionCommand
  readonly kind: 'fail' | 'hold'
  readonly times?: number
}
function parseWire(message: string) {
  try {
    return wireSchema.safeParse(JSON.parse(message))
  } catch {
    return null
  }
}
/** Faults replace only actual successful Host reads, not request execution or store state. */
export async function routeExtensionCollectionFaults(page: Page) {
  const commands: string[] = []
  const errors: string[] = []
  const received: { command: ExtensionCollectionCommand; itemCount: number; ticket: number | null }[] = []
  const rules: { ticket: number; rule: ExtensionCollectionFault; remaining: number; matched: number }[] = []
  const held: { ticket: number; connection: number; release: (fail: boolean) => void }[] = []
  let tickets = 0
  let connections = 0
  await page.routeWebSocket('**/rpc', (socket) => {
    const connection = ++connections
    const server = socket.connectToServer()
    const pending = new Map<
      string | number,
      { command: ExtensionCollectionCommand; rule: (typeof rules)[number] | undefined }
    >()
    const fail = (id: string | number) =>
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: 'PRIVATE extension collection fixture diagnostic must not be displayed',
            data: 'EXECUTION_FAILED',
          },
        }),
      )
    socket.onMessage((message) => {
      const parsed = typeof message === 'string' ? parseWire(message) : null
      if (parsed?.success && parsed.data.method) {
        const command = parsed.data.method === 'command.execute' ? parsed.data.params?.commandId : parsed.data.method
        if (command) {
          if (commands.length < 4096) commands.push(command)
          else if (!errors.includes('Observation capacity exceeded')) errors.push('Observation capacity exceeded')
          if ((command === 'plugin.list' || command === 'skill.list') && parsed.data.id !== undefined) {
            const rule = rules.find((item) => item.remaining > 0 && item.rule.command === command)
            if (rule) rule.remaining--
            if (pending.size >= 64) {
              errors.push('Read concurrency capacity exceeded')
              fail(parsed.data.id)
              return
            }
            pending.set(parsed.data.id, { command, rule })
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
        if (entry) {
          const valid = extensionCommands[entry.command].output.safeParse(parsed.data.result)
          if (!valid.success || parsed.data.error !== undefined)
            errors.push(`Expected actual valid ${entry.command} response`)
          else {
            if (received.length < 4096)
              received.push({
                command: entry.command,
                itemCount: valid.data.length,
                ticket: entry.rule?.ticket ?? null,
              })
            else errors.push('Response observation capacity exceeded')
            if (entry.rule) {
              entry.rule.matched++
              if (entry.rule.rule.kind === 'hold')
                held.push({
                  ticket: entry.rule.ticket,
                  connection,
                  release: (rejected) => (rejected ? fail(id) : socket.send(message)),
                })
              else fail(id)
              return
            }
          }
        }
      }
      socket.send(message)
    })
    socket.onClose(async (code, reason) => {
      pending.clear()
      for (let index = held.length - 1; index >= 0; index--)
        if (held[index]?.connection === connection) held.splice(index, 1)
      await server.close({ ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) })
    })
  })
  return {
    commands,
    received,
    errors,
    arm(rule: ExtensionCollectionFault): number {
      const times = rule.times ?? 1
      if (!Number.isInteger(times) || times < 1 || times > 16 || rules.length >= 64)
        throw new Error('Invalid bounded read fault')
      const ticket = ++tickets
      rules.push({ ticket, rule, remaining: times, matched: 0 })
      return ticket
    },
    pending(ticket: number): number {
      return held.filter((item) => item.ticket === ticket).length
    },
    release(ticket: number, options: { fail?: boolean } = {}): void {
      const items = held.filter((item) => item.ticket === ticket)
      if (!items.length) throw new Error('No exact original response is held')
      for (let index = held.length - 1; index >= 0; index--) if (held[index]?.ticket === ticket) held.splice(index, 1)
      for (const item of items) item.release(options.fail === true)
    },
    assertMatched(ticket: number, count = 1): void {
      expect(rules.find((item) => item.ticket === ticket)?.matched).toBe(count)
      expect(errors).toEqual([])
    },
    count(command: string): number {
      return commands.filter((item) => item === command).length
    },
  }
}
export interface ExtensionCollectionsFixture {
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
  readonly faults: Awaited<ReturnType<typeof routeExtensionCollectionFaults>>
}
export interface ExtensionCollectionsOptions {
  readonly locale: ShellLocale
  readonly width: number
  readonly height?: number
  readonly skillCount?: number
  readonly assets?: string
  readonly expectedAsset?: string
  readonly faults?: readonly ExtensionCollectionFault[]
}
function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun unavailable for owned extensions Host')
  return executable
}
async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    if (!child.stdin) throw new Error('Missing owned Host shutdown channel')
    child.stdin.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 10000 }).toBe(true)
  }
  expect(child.exitCode).toBe(0)
}
async function removeOwned(root: string): Promise<void> {
  const path = await realpath(root)
  if (dirname(path) !== (await realpath(tmpdir())) || !basename(path).startsWith(prefix))
    throw new Error('Refusing non-owned extension cleanup')
  await rm(path, { recursive: true, force: true })
}
async function awaitReady(child: ChildProcess) {
  if (!child.stdout) throw new Error('Owned Host stdout is missing')
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
        reject(new Error(`Owned extension Host exited: ${code}`))
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Owned extension Host startup timeout'))
      }, 30000)
      child.once('error', onError)
      child.once('exit', onExit)
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            cleanup()
            done(parsed.data)
          }
        } catch {
          /* Do not retain credential-bearing stdout. */
        }
      })
    })
  } finally {
    lines.close()
  }
}
export function composer(f: ExtensionCollectionsFixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true })
}
export async function setDraft(f: ExtensionCollectionsFixture, text: string): Promise<void> {
  await composer(f).click()
  await f.page.keyboard.press('ControlOrMeta+A')
  await f.page.keyboard.insertText(text)
  await expectComposerText(composer(f), text)
}
export async function openSession(f: ExtensionCollectionsFixture, session = f.ready.firstSession): Promise<void> {
  const side = f.page.getByRole('complementary', { name: f.copy.shell.projectsAndSessions, exact: true })
  if (!(await side.isVisible()))
    await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
  const row = f.page.locator(`[data-workspace-id="${f.ready.workspace.id}"]`)
  const toggle = row.locator('.hbar-app-react-workspace-row')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
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
export async function openExtensions(f: ExtensionCollectionsFixture): Promise<void> {
  await openSettingsGroup(f, 'extensions')
}
export async function openSettingsGroup(f: ExtensionCollectionsFixture, group: 'extensions' | 'skills'): Promise<void> {
  await f.page.getByRole('button', { name: f.copy.session.tools.settings, exact: true }).click()
  await selectExtensionCollection(f, group === 'extensions' ? 'plugins' : 'skills')
}
export async function selectExtensionCollection(
  f: ExtensionCollectionsFixture,
  collection: 'plugins' | 'skills',
): Promise<void> {
  const group = collection === 'plugins' ? 'extensions' : 'skills'
  const select = f.page.getByRole('combobox', { name: f.copy.settings.groups, exact: true })
  if (await select.isVisible()) await select.selectOption(group)
  else
    await f.page
      .getByRole('navigation', { name: f.copy.settings.groups, exact: true })
      .getByRole('button', { name: f.copy.settings.resolve(`i18n:settings.groups.${group}`), exact: true })
      .click()
  await expect(f.page.locator('.hbar-app-react-extension-workspace')).toBeVisible()
}
export async function startExtensionCollections(
  browser: Browser,
  options: ExtensionCollectionsOptions,
): Promise<ExtensionCollectionsFixture> {
  const assets = resolve(options.assets ?? process.env.HBAR_EXTENSION_COLLECTIONS_WEB_DIST ?? 'dist/web')
  const skillCount = z
    .number()
    .int()
    .min(0)
    .max(21)
    .parse(options.skillCount ?? 2)
  if (!existsSync(join(assets, 'index.html'))) throw new Error('Extension static root index.html is missing')
  const executable = bunExecutable()
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({
    locale: options.locale,
    viewport: { width: options.width, height: options.height ?? 900 },
  })
  const child = spawn(executable, ['e2e/support/extension-collections-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HBAR_EXTENSION_COLLECTIONS_ROOT: root,
      HBAR_EXTENSION_COLLECTIONS_WEB_DIST: resolve(assets),
      HBAR_EXTENSION_COLLECTIONS_SKILL_COUNT: String(skillCount),
    },
  })
  let stderr = ''
  let external: HbarClient | undefined
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-16384)
  })
  try {
    const ready = await awaitReady(child)
    external = new HbarClient(ready.url, ready.externalToken)
    await external.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = [],
      warnings: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text())
    })
    const faults = await routeExtensionCollectionFaults(page)
    for (const rule of options.faults ?? []) faults.arm(rule)
    await page.goto(ready.url)
    const asset = options.expectedAsset ?? process.env.HBAR_EXTENSION_COLLECTIONS_EXPECTED_ASSET
    if (asset) expect(await page.locator('script[type="module"][src]').getAttribute('src')).toBe(`/assets/${asset}`)
    const f: ExtensionCollectionsFixture = {
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
    if (stderr) failures.push(new Error(`Owned extension stderr: ${stderr}`))
    throw new AggregateError(failures, `Extension fixture startup failed; owned root ${root}`, { cause: error })
  }
}
export async function stopExtensionCollections(f: ExtensionCollectionsFixture) {
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
export async function assertReadOnly(f: ExtensionCollectionsFixture): Promise<void> {
  const extensionWrites = new Set(
    Object.values(extensionCommands)
      .filter((command) => command.metadata.kind === 'command')
      .map((command) => command.metadata.id),
  )
  expect(
    f.faults.commands.filter(
      (command) =>
        extensionWrites.has(command) ||
        command.startsWith('run.') ||
        [
          'permission.set',
          'mode.set',
          'provider.verify',
          'provider.save',
          'settings.apply',
          'file.write',
          'session.create',
          'session.archive',
        ].includes(command),
    ),
  ).toEqual([])
  for (const session of [f.ready.firstSession, f.ready.secondSession])
    expect((await f.external.call('session.snapshot', { sessionId: session.id })).runs).toEqual([])
  expect(f.faults.errors).toEqual([])
  expect(f.errors).toEqual([])
  expect(f.warnings).toEqual([])
}
export async function readCollections(f: ExtensionCollectionsFixture) {
  const client = createExtensionCommandClient(f.external)
  return { plugins: await client.execute('plugin.list', {}), skills: await client.execute('skill.list', {}) }
}
export async function capture(f: ExtensionCollectionsFixture, directory: string, name: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('Invalid evidence name')
  await mkdir(directory, { recursive: true })
  const panel = f.page.locator('.hbar-app-react-extension-workspace')
  await writeFile(
    join(directory, `${name}.json`),
    JSON.stringify(
      {
        asset: await f.page.locator('script[type="module"][src]').getAttribute('src'),
        viewport: f.page.viewportSize(),
        text: await panel.innerText(),
        pluginRows: await panel.locator('[data-plugin-id]').count(),
        skillRows: await panel.locator('.hbar-app-react-extension-skill-list li').count(),
        overflow: await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        geometry: await panel.evaluate((element) => {
          const scroll = element.closest('.hbar-app-react-settings-scroll')
          const viewport = scroll?.getBoundingClientRect()
          return {
            scroll: scroll
              ? {
                  top: scroll.scrollTop,
                  width: scroll.clientWidth,
                  height: scroll.clientHeight,
                  contentHeight: scroll.scrollHeight,
                  contentWidth: scroll.scrollWidth,
                }
              : null,
            sections: [...element.querySelectorAll<HTMLElement>('.hbar-app-react-extension-section')].map((section) => {
              const box = section.getBoundingClientRect()
              const rows = [...section.querySelectorAll<HTMLElement>('li')]
              return {
                name: section.getAttribute('aria-label'),
                busy: section.getAttribute('aria-busy'),
                status:
                  section.querySelector('[data-collection-status]')?.getAttribute('data-collection-status') ?? null,
                statuses: [...section.querySelectorAll('[role="status"], [role="alert"]')].map(
                  (node) => node.textContent,
                ),
                rect: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
                rows: rows.length,
                visibleRows: rows.filter((row) => {
                  const bounds = row.getBoundingClientRect()
                  return (
                    row.checkVisibility() &&
                    bounds.bottom > Math.max(0, viewport?.top ?? 0) &&
                    bounds.top < Math.min(innerHeight, viewport?.bottom ?? innerHeight)
                  )
                }).length,
              }
            }),
          }
        }),
        initialization: f.ready.initialization,
        commands: f.faults.commands,
        received: f.faults.received,
        applied: f.faults.received.filter((item) => item.ticket !== null),
        errors: f.errors,
        warnings: f.warnings,
      },
      null,
      2,
    ),
  )
  await f.page.screenshot({ path: join(directory, `${name}.png`) })
}
