import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { HbarClient } from '@hbar/client'
import { workspaceSchema, sessionSchema } from '@hbar/contracts/directory'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, delimiter, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { workspaceDisplayNamesCopy } from '../../apps/web/src/workspace-display-names-copy'

export const evidence = process.env.HBAR_DISPLAY_NAMES_EVIDENCE ?? 'artifacts/project-display-names-ui/browser'
const prefix = 'hbar-project-alias-ui-'
const readySchema = z.object({
  url: z.string().url(),
  token: z.string(),
  externalToken: z.string(),
  firstWorkspace: workspaceSchema,
  secondWorkspace: workspaceSchema,
  firstSession: sessionSchema,
  secondSession: sessionSchema,
})
const wireSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional(), kind: z.string().optional() }).passthrough().optional(),
    result: z.unknown().optional(),
  })
  .passthrough()
type Ready = z.infer<typeof readySchema>
export interface Fixture {
  root: string
  child: ChildProcess
  page: Page
  context: BrowserContext
  external: HbarClient
  ready: Ready
  locale: ShellLocale
  copy: ReturnType<typeof getShellCopy>
  names: ReturnType<typeof workspaceDisplayNamesCopy>
  errors: string[]
  commands: string[]
}
export function bunPath() {
  if (process.platform !== 'win32') return 'bun'
  const path = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!path) throw new Error('Bun was not found')
  return path
}
export async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.stdin?.write('stop\n')
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5000))])
  if (child.exitCode === null && child.signalCode === null) child.kill()
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null).toBe(true)
}
export async function removeOwned(root: string) {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith(prefix))
    throw new Error('Refusing to remove an unowned alias fixture')
  await rm(target, { recursive: true, force: true })
}
export async function showSidebar(f: Fixture) {
  const side = f.page.getByRole('complementary', { name: f.copy.shell.projectsAndSessions, exact: true })
  if (!(await side.isVisible()))
    await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
  await expect(side).toBeVisible()
  return side
}
export async function hideSidebar(f: Fixture) {
  const button = f.page.getByRole('button', { name: f.copy.shell.hideSidebar, exact: true })
  if (await button.isVisible()) {
    try {
      await button.click({ timeout: 1500 })
    } catch (error) {
      // Narrow session navigation may have already fulfilled the same close intent.
      if (await button.isVisible()) throw error
    }
  }
}
export function composer(f: Fixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true, includeHidden: true })
}
export function row(f: Fixture, id = f.ready.firstWorkspace.id) {
  return f.page.locator(`[data-workspace-id="${id}"]`)
}
export async function start(
  browser: Browser,
  locale: ShellLocale,
  width: number,
  inject?: (page: Page) => Promise<void>,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({ locale, viewport: { width, height: 900 } })
  const child = spawn(bunPath(), ['e2e/support/workspace-organization-host.ts'], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HBAR_ORGANIZATION_FIXTURE_ROOT: root,
      HBAR_ORGANIZATION_WEB_DIST: process.env.HBAR_DISPLAY_NAMES_WEB_DIST ?? 'dist/web',
    },
  })
  let external: HbarClient | undefined
  let diagnostics = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-16384)
  })
  try {
    if (!child.stdout) throw new Error('Missing owned Host stdout')
    const lines = createInterface({ input: child.stdout })
    const ready = await new Promise<Ready>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Alias Host startup timed out: ${diagnostics}`)), 30000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Alias Host exited ${code}: ${diagnostics}`))
      })
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            clearTimeout(timer)
            resolve(parsed.data)
          }
        } catch {
          /* Startup output is not necessarily fixture data. */
        }
      })
    }).finally(() => lines.close())
    external = new HbarClient(ready.url, ready.externalToken)
    await external.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    const commands: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return
        const parsed = wireSchema.safeParse(JSON.parse(payload))
        if (parsed.success && parsed.data.params?.commandId) commands.push(parsed.data.params.commandId)
      }),
    )
    await inject?.(page)
    await page.goto(ready.url)
    if (process.env.HBAR_DISPLAY_NAMES_EXPECTED_ASSET)
      await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
        'src',
        new RegExp(process.env.HBAR_DISPLAY_NAMES_EXPECTED_ASSET),
      )
    const f: Fixture = {
      root,
      child,
      context,
      page,
      external,
      ready,
      locale,
      errors,
      commands,
      copy: getShellCopy(locale),
      names: workspaceDisplayNamesCopy(locale),
    }
    await showSidebar(f)
    const first = row(f)
    await expect(first).toBeVisible()
    if ((await first.locator('.hbar-app-react-workspace-row').getAttribute('aria-expanded')) === 'false')
      await first.locator('.hbar-app-react-workspace-row').click()
    await first.getByRole('button', { name: f.copy.shell.openSession(ready.firstSession.title), exact: true }).click()
    await hideSidebar(f)
    await expect(composer(f)).toBeVisible()
    return f
  } catch (error) {
    await context.close()
    external?.disconnect()
    await stopChild(child)
    await removeOwned(root)
    throw error
  }
}
export async function stop(f: Fixture) {
  await f.context.close()
  f.external.disconnect()
  await stopChild(f.child)
  await removeOwned(f.root)
}
export async function openEditor(f: Fixture, workspaceId = f.ready.firstWorkspace.id) {
  await showSidebar(f)
  const trigger = row(f, workspaceId).locator('.hbar-app-react-project-menu summary')
  await trigger.focus()
  await f.page.keyboard.press('Enter')
  await f.page.keyboard.press('Home')
  const item = row(f, workspaceId).getByRole('menuitem', { name: f.names.title, exact: true })
  await expect(item).toBeFocused()
  await item.click()
  const dialog = f.page.getByRole('dialog', { name: f.names.title, exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('workspace-display-name-input')).toBeFocused()
  return dialog
}
export async function capture(f: Fixture, name: string) {
  const geometry = await f.page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    elements: [
      ...document.querySelectorAll<HTMLElement>(
        '.hbar-workspace-display-name-dialog input, .hbar-workspace-display-name-dialog button',
      ),
    ]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          clipped: rect.left < -1 || rect.right > innerWidth + 1,
          accessible: element.getAttribute('aria-label') ?? element.textContent,
        }
      }),
  }))
  expect(geometry.overflow).toBe(false)
  expect(geometry.elements.some((element) => element.clipped)).toBe(false)
  await writeFile(`${evidence}/${name}.json`, JSON.stringify(geometry, null, 2))
  await f.page.screenshot({ path: `${evidence}/${name}.png` })
}
export async function noExecution(f: Fixture) {
  for (const session of [f.ready.firstSession, f.ready.secondSession]) {
    expect((await f.external.call('session.snapshot', { sessionId: session.id })).runs).toEqual([])
  }
  expect(
    f.commands.filter((name) =>
      ['run.submit', 'file.write', 'session.rename', 'session.archive', 'workspace.create'].includes(name),
    ),
  ).toEqual([])
  expect(f.errors).toEqual([])
}
