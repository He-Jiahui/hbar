import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { selectLumenOption } from './support/lumen-controls'

const prefix = 'hbar-settings-command-focus-'
const evidence = resolve(process.env.HBAR_SETTINGS_COMMAND_FOCUS_EVIDENCE ?? 'artifacts/settings-command-focus/browser')
const readySchema = z.object({
  url: z.url(),
  token: z.string(),
  workspace: workspaceSchema,
  session: sessionSchema,
  initialization: z.object({
    workspaces: z.literal(1),
    sessions: z.literal(1),
    demo: z.literal(false),
    runs: z.literal(0),
  }),
})
const wireSchema = z.object({
  method: z.string(),
  params: z
    .object({
      commandId: z.string().optional(),
      input: z.object({ query: z.string().optional() }).passthrough().optional(),
    })
    .passthrough()
    .optional(),
})

interface Fixture {
  readonly root: string
  readonly directory: string
  readonly child: ChildProcess
  readonly context: BrowserContext
  readonly page: Page
  readonly ready: z.infer<typeof readySchema>
  readonly copy: ReturnType<typeof getShellCopy>
  readonly locale: ShellLocale
  readonly width: number
  readonly asset: string
  readonly commands: string[]
  readonly errors: string[]
}

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun unavailable for owned Settings command focus Host')
  return executable
}

async function cleanup(child: ChildProcess, root: string, directory: string): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.stdin?.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 15_000 }).toBe(true)
  }
  const stat = await lstat(root)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Refusing replaced Settings focus fixture root')
  const exact = await realpath(root)
  if (exact !== resolve(root) || dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing cleanup outside exact owned Settings focus fixture')
  await rm(exact, { recursive: true })
  await writeFile(
    join(directory, 'cleanup.json'),
    JSON.stringify(
      { root, pid: child.pid, exitCode: child.exitCode, removed: !existsSync(root), stop: 'Owned child stdin only' },
      null,
      2,
    ),
  )
  expect(child.exitCode).toBe(0)
}

async function start(browser: Browser, locale: ShellLocale, width: number): Promise<Fixture> {
  const assets = resolve(z.string().min(1).parse(process.env.HBAR_SETTINGS_COMMAND_FOCUS_WEB_DIST))
  const asset = z
    .string()
    .regex(/^index-[A-Za-z0-9_-]+\.js$/)
    .parse(process.env.HBAR_SETTINGS_COMMAND_FOCUS_EXPECTED_ASSET)
  const sha256 = z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/)
    .parse(process.env.HBAR_SETTINGS_COMMAND_FOCUS_EXPECTED_SHA256)
  expect(
    createHash('sha256')
      .update(await readFile(join(assets, 'assets', asset)))
      .digest('hex')
      .toUpperCase(),
  ).toBe(sha256.toUpperCase())
  const directory = join(evidence, `${locale}-${width}-${randomUUID().slice(0, 8)}`)
  await mkdir(directory, { recursive: true })
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  const child = spawn(bunExecutable(), ['e2e/support/settings-command-focus-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HBAR_SETTINGS_COMMAND_FOCUS_ROOT: root,
      HBAR_SETTINGS_COMMAND_FOCUS_WEB_DIST: assets,
    },
  })
  const context = await browser.newContext({ locale, viewport: { width, height: width === 320 ? 760 : 960 } })
  let stderr = ''
  child.stderr?.on('data', (value: Buffer) => {
    stderr = (stderr + value.toString()).slice(-16_384)
  })
  try {
    if (!child.stdout) throw new Error('Owned Host stdout is missing')
    const lines = createInterface({ input: child.stdout })
    const ready = await new Promise<z.infer<typeof readySchema>>((done, reject) => {
      const timer = setTimeout(() => reject(new Error(`Owned Host startup timed out: ${stderr}`)), 30_000)
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
          // Never persist credential-bearing fixture stdout.
        }
      })
    }).finally(() => lines.close())
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const commands: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text())
    })
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        try {
          const parsed = wireSchema.safeParse(JSON.parse(String(frame.payload)))
          if (!parsed.success) return
          if (commands.length >= 2048) throw new Error('Observed request capacity exceeded')
          const commandId =
            parsed.data.method === 'command.execute' ? (parsed.data.params?.commandId ?? 'invalid') : parsed.data.method
          const query = parsed.data.params?.input?.query
          commands.push(
            commandId === 'commandPalette.setQuery'
              ? `${commandId}:${query === 'system.' || query === '' ? JSON.stringify(query) : '[redacted]'}`
              : commandId,
          )
        } catch {
          errors.push('Invalid browser command frame')
        }
      }),
    )
    await page.goto(ready.url)
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', `/assets/${asset}`)
    const copy = getShellCopy(locale)
    const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await show.isVisible()) await show.click()
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    const groupSelect = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
    const desktopGroup = page
      .getByRole('navigation', { name: copy.settings.groups, exact: true })
      .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.extensions'), exact: true })
    await expect.poll(async () => (await groupSelect.isVisible()) || (await desktopGroup.isVisible())).toBe(true)
    if (await groupSelect.isVisible()) await selectLumenOption(groupSelect, 'extensions')
    else await desktopGroup.click()
    await expect(page.locator('.hbar-app-react-extension-workspace')).toBeVisible()
    await expect(page.locator('.hbar-app-react-settings-workspace')).not.toContainText(copy.settings.loading)
    await expect(
      page.locator(
        '.hbar-app-react-extension-workspace [data-extension-collection="plugins"] [data-collection-status]',
      ),
    ).toHaveAttribute('data-collection-status', 'ready')
    return { root, directory, child, context, page, ready, copy, locale, width, asset, commands, errors }
  } catch (error) {
    await context.close()
    await cleanup(child, root, directory)
    throw error
  }
}

async function stop(fixture: Fixture): Promise<void> {
  try {
    await fixture.context.close()
  } finally {
    await cleanup(fixture.child, fixture.root, fixture.directory)
  }
}

function extension(fixture: Fixture): Locator {
  return fixture.page.locator('.hbar-app-react-extension-workspace')
}

function opener(fixture: Fixture): Locator {
  return extension(fixture).getByRole('button', { name: fixture.copy.extensions.openSystemCommands, exact: true })
}

function palette(fixture: Fixture): Locator {
  return fixture.page.locator('.lumen-dialog.hbar-app-react-command-modal[role="dialog"]')
}

function commandSearch(fixture: Fixture): Locator {
  return palette(fixture).getByRole('searchbox', { name: fixture.copy.commandPalette.search, exact: true })
}

async function capture(fixture: Fixture, name: string): Promise<void> {
  const state = await fixture.page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    activeTag: document.activeElement?.tagName ?? null,
    activeLabel: document.activeElement?.getAttribute('aria-label') ?? null,
    modalOpen: Boolean(
      document.querySelector('.lumen-dialog.hbar-app-react-command-modal[role="dialog"][aria-modal="true"]'),
    ),
  }))
  expect(state.documentWidth).toBeLessThanOrEqual(fixture.width + 1)
  await fixture.page.screenshot({ path: join(fixture.directory, `${name}.png`) })
  await writeFile(join(fixture.directory, `${name}.json`), JSON.stringify(state, null, 2))
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    test(`Plugins command palette returns focus to its exact opener: ${locale} ${width}`, async ({ browser }) => {
      test.setTimeout(90_000)
      const fixture = await start(browser, locale, width)
      try {
        const { copy } = fixture
        const filter = extension(fixture).getByRole('textbox', {
          name: copy.extensions.navigation.plugins.filter,
          exact: true,
        })
        await expect(filter).toBeVisible()
        await filter.fill('storage.sqlite')
        const trigger = opener(fixture)
        await expect(trigger).toBeEnabled()
        const originalTrigger = await trigger.elementHandle()
        if (!originalTrigger) throw new Error('Original Settings command opener is missing')
        if (width === 320) {
          await trigger.focus()
          await trigger.press('Enter')
        } else await trigger.click()
        await expect(palette(fixture)).toBeVisible()
        const query = commandSearch(fixture)
        await expect(query).toBeFocused()
        await expect(query).toHaveValue('system.')
        await capture(fixture, 'palette-open')
        await query.press('Escape')
        await expect(query).toHaveValue('')
        await expect(palette(fixture)).toBeVisible()
        await capture(fixture, 'first-escape-clears-query')
        await query.press('Escape')
        await expect(palette(fixture)).toHaveCount(0)
        await expect(filter).toHaveValue('storage.sqlite')
        await capture(fixture, 'palette-closed-focus')
        await writeFile(
          join(fixture.directory, 'opener-identity.json'),
          JSON.stringify(
            {
              originalConnected: await originalTrigger.evaluate((node) => node.isConnected),
              sameNode: await trigger.evaluate((node, original) => node === original, originalTrigger),
              originalDisabled: await originalTrigger.evaluate((node: HTMLButtonElement) => node.disabled),
            },
            null,
            2,
          ),
        )
        await expect(trigger).toBeFocused()
        expect(fixture.commands).not.toContain('run.submit')
        expect(fixture.errors).toEqual([])
        await writeFile(
          join(fixture.directory, 'observation.json'),
          JSON.stringify(
            {
              actualHost: true,
              locale,
              width,
              asset: fixture.asset,
              root: fixture.root,
              pid: fixture.child.pid,
              initialization: fixture.ready.initialization,
              openerMethod: width === 320 ? 'keyboard Enter' : 'pointer click',
              filter: await filter.inputValue(),
              restoredToCurrentSemanticOpener: await trigger.evaluate((node) => document.activeElement === node),
              commands: fixture.commands,
              errors: fixture.errors,
            },
            null,
            2,
          ),
        )
      } finally {
        await writeFile(join(fixture.directory, 'commands.json'), JSON.stringify(fixture.commands, null, 2))
        await stop(fixture)
      }
    })
  }
}

test('a disabled original Settings opener is not refocused after command dialog closes', async ({ browser }) => {
  test.setTimeout(90_000)
  const fixture = await start(browser, 'en-US', 1440)
  try {
    const trigger = opener(fixture)
    const original = await trigger.elementHandle()
    if (!original) throw new Error('Original Settings command trigger is missing')
    await trigger.click()
    const query = commandSearch(fixture)
    await expect(query).toHaveValue('system.')
    await original.evaluate((node: HTMLButtonElement) => {
      node.disabled = true
    })
    await query.press('Escape')
    await expect(query).toHaveValue('')
    await query.press('Escape')
    await expect(palette(fixture)).toHaveCount(0)
    await fixture.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    expect(await original.evaluate((node) => document.activeElement === node)).toBe(false)
    await expect(opener(fixture)).not.toBeFocused()
    await capture(fixture, 'disabled-opener-no-stolen-focus')
    expect(fixture.errors).toEqual([])
  } finally {
    await stop(fixture)
  }
})
