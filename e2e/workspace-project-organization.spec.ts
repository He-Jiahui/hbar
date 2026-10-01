import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { workspaceOrganizationReceiptSchema } from '@hbar/contracts/commands/workspace-organization'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceOrganizationCopy as organizationCopy } from '../apps/web/src/workspace-organization-copy'
import { expectComposerText, readComposerText } from './support/composer-text'

const phase = process.env.HBAR_ORGANIZATION_PHASE
if (phase && !/^[A-Za-z0-9_-]+$/.test(phase)) throw new Error('Invalid organization evidence phase')
const evidence = `artifacts/workspace-project-organization/browser${phase ? `/${phase}` : ''}`
const fileName = 'organization-notes.md'
const diskText = '# Original file on disk\n'
const dirtyText = '# Unsaved file draft — 未保存文件草稿\n'
const attachmentName = 'original-material-原材料.md'
const readySchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  externalToken: z.string().min(1),
  firstWorkspace: workspaceSchema,
  secondWorkspace: workspaceSchema,
  firstSession: sessionSchema,
  secondSession: sessionSchema,
})
const rpcSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
    result: z.unknown().optional(),
  })
  .passthrough()
type Ready = z.infer<typeof readySchema>
type Copy = ReturnType<typeof getShellCopy>
interface Fixture {
  root: string
  child: ChildProcess
  context: BrowserContext
  page: Page
  ready: Ready
  external: HbarClient
  copy: Copy
  locale: ShellLocale
  errors: string[]
  warnings: string[]
  commands: string[]
  uploads: string[]
}

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const candidate = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!candidate) throw new Error('Bun is unavailable for the owned organization Host')
  return candidate
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.stdin?.write('stop\n')
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5_000))])
  if (child.exitCode === null && child.signalCode === null) child.kill()
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 5_000 }).toBe(true)
}

async function removeRoot(root: string) {
  const resolved = await realpath(root)
  if (
    dirname(resolved) !== (await realpath(tmpdir())) ||
    !basename(resolved).startsWith('hbar-project-organization-ui-')
  )
    throw new Error('Refusing cleanup outside this exact organization fixture root')
  await rm(resolved, { recursive: true, force: true })
}

async function start(
  browser: Browser,
  locale: ShellLocale,
  width: number,
  beforeGoto?: (page: Page, ready: Ready) => Promise<void>,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-project-organization-ui-'))
  const context = await browser.newContext({ locale, viewport: { width, height: 900 } })
  const child = spawn(bunExecutable(), ['e2e/support/workspace-organization-host.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HBAR_ORGANIZATION_FIXTURE_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let external: HbarClient | undefined
  let diagnostics = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-16_384)
  })
  try {
    const stdout = child.stdout
    if (!stdout) throw new Error('Missing owned Host stdout')
    const lines = createInterface({ input: stdout })
    const ready = await new Promise<Ready>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Owned organization Host startup timed out: ${diagnostics}`)),
        30_000,
      )
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Owned Host exited ${code}: ${diagnostics}`))
      })
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            clearTimeout(timer)
            resolve(parsed.data)
          }
        } catch {
          /* Startup diagnostics are not the fixture protocol. */
        }
      })
    }).finally(() => lines.close())
    external = new HbarClient(ready.url, ready.externalToken)
    await external.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    const warnings: string[] = []
    const commands: string[] = []
    const uploads: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        warnings.push(`${message.type()}: ${message.text()}`)
    })
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/artifacts')
        uploads.push('artifact.upload')
    })
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return
        const parsed = rpcSchema.safeParse(JSON.parse(payload))
        if (parsed.success) {
          const command = parsed.data.params?.commandId ?? parsed.data.method
          if (command) commands.push(command)
        }
      }),
    )
    await beforeGoto?.(page, ready)
    await page.goto(ready.url)
    if (process.env.HBAR_ORGANIZATION_EXPECTED_ASSET)
      await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
        'src',
        new RegExp(process.env.HBAR_ORGANIZATION_EXPECTED_ASSET),
      )
    const fixture: Fixture = {
      root,
      child,
      context,
      page,
      ready,
      external,
      copy: getShellCopy(locale),
      locale,
      errors,
      warnings,
      commands,
      uploads,
    }
    await showSidebar(fixture)
    const row = page.locator(`[data-workspace-id="${ready.firstWorkspace.id}"]`)
    await expect(row).toBeVisible()
    const toggle = row.locator('.hbar-app-react-workspace-row')
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    await row
      .getByRole('button', { name: fixture.copy.shell.openSession(ready.firstSession.title), exact: true })
      .click()
    await hideSidebar(fixture)
    await expect(
      page.getByRole('tab', { name: ready.firstSession.title, exact: true, includeHidden: true }),
    ).toHaveAttribute('aria-selected', 'true')
    return fixture
  } catch (error) {
    await context.close()
    external?.disconnect()
    await stopChild(child)
    await removeRoot(root)
    throw error
  }
}

async function stop(f: Fixture) {
  await f.context.close()
  f.external.disconnect()
  await stopChild(f.child)
  await removeRoot(f.root)
}

async function showSidebar(f: Fixture) {
  const side = f.page.getByRole('complementary', { name: f.copy.shell.projectsAndSessions, exact: true })
  if (!(await side.isVisible()))
    await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
  await expect(side).toBeVisible()
  return side
}

async function hideSidebar(f: Fixture) {
  const hide = f.page.getByRole('button', { name: f.copy.shell.hideSidebar, exact: true })
  if (await hide.isVisible()) await hide.click()
}

function composer(f: Fixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true, includeHidden: true })
}

function files(f: Fixture) {
  return f.page.locator('.lumen-app-tool-drawer .hbar-app-react-file-workspace')
}

async function seedDraft(f: Fixture) {
  const draft = `Original A draft retained — 原会话草稿保留 ${f.locale}`
  await composer(f).fill(draft)
  const transfer = await f.page.evaluateHandle((name) => {
    const data = new DataTransfer()
    data.items.add(new File(['Original local attachment'], name, { type: 'text/markdown' }))
    return data
  }, attachmentName)
  await f.page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: transfer })
  await transfer.dispose()
  await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
  await f.page.getByRole('button', { name: f.copy.session.tools.files, exact: true }).click()
  await files(f).getByRole('button', { name: fileName, exact: true }).click()
  await files(f).getByRole('button', { name: f.copy.files.edit, exact: true }).click()
  await files(f).getByRole('textbox', { name: fileName, exact: true }).fill(dirtyText)
  return draft
}

async function assertDraft(f: Fixture, draft: string) {
  await expect(composer(f)).toBeAttached()
  await expectComposerText(composer(f), draft)
  await expect(files(f).getByRole('textbox', { name: fileName, exact: true, includeHidden: true })).toHaveValue(
    dirtyText,
  )
  await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toHaveCount(1)
  await expect(
    f.page.getByRole('tab', { name: f.ready.firstSession.title, exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-selected', 'true')
  expect(await readFile(join(f.ready.firstWorkspace.path, fileName), 'utf8')).toBe(diskText)
}

async function workspaceMenu(f: Fixture, workspace = f.ready.firstWorkspace) {
  const side = await showSidebar(f)
  const trigger = side
    .locator(`[data-workspace-id="${workspace.id}"]`)
    .getByTitle(f.copy.shell.workspaceActions(workspace.name), { exact: true })
  await trigger.focus()
  await f.page.keyboard.press('Enter')
  return trigger
}

async function hide(f: Fixture, workspace = f.ready.firstWorkspace) {
  await workspaceMenu(f, workspace)
  const item = f.page.getByRole('menuitem', { name: organizationCopy(f.locale).hide, exact: true })
  await expect(item).toBeEnabled()
  await f.page.keyboard.press('End')
  await expect(item).toBeFocused()
  await f.page.keyboard.press('Enter')
  await expect(f.page.locator(`[data-workspace-id="${workspace.id}"]`)).toHaveCount(0)
  const header = f.page.getByTestId('workspace-organization-menu').locator('[data-workspace-menu-trigger]')
  await expect(header).toHaveAttribute('aria-label', organizationCopy(f.locale).menu)
  await expect(header).toBeFocused()
}

async function restore(f: Fixture, count: number) {
  const copy = organizationCopy(f.locale)
  await showSidebar(f)
  const trigger = f.page.getByTestId('workspace-organization-menu').locator('[data-workspace-menu-trigger]')
  await expect(trigger).toHaveAttribute('aria-label', copy.menu)
  await trigger.focus()
  await f.page.keyboard.press('Enter')
  const item = f.page.getByRole('menuitem', { name: copy.restore(count), exact: true })
  await expect(item).toBeVisible()
  await capture(
    f,
    count === 2
      ? `all-hidden-menu-${f.locale}-${f.page.viewportSize()?.width ?? 0}`
      : `restore-menu-${f.locale}-${f.page.viewportSize()?.width ?? 0}-${count}`,
  )
  await item.click()
  await expect(f.page.locator(`[data-workspace-id="${f.ready.firstWorkspace.id}"]`)).toBeVisible()
}

async function capture(f: Fixture, suffix: string) {
  expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await f.page.screenshot({ path: `${evidence}/${suffix}.png` })
}

async function assertNoExecution(f: Fixture) {
  for (const session of [f.ready.firstSession, f.ready.secondSession]) {
    const snapshot = await f.external.call('session.snapshot', { sessionId: session.id })
    expect(snapshot.runs).toEqual([])
  }
  expect(
    f.commands.filter((command) =>
      ['run.submit', 'file.write', 'session.archive', 'session.rename', 'operation.cancel'].includes(command),
    ),
  ).toEqual([])
  expect(f.errors).toEqual([])
  expect(f.warnings).toEqual([])
}

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    test(`project hide/restore preserves the original session, dirty Files, attachment and pin: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const f = await start(browser, locale, width)
      try {
        const commands = createWorkspaceSessionCommandClient(f.external)
        expect(f.ready.firstWorkspace.name).toBe(f.ready.secondWorkspace.name)
        const side = await showSidebar(f)
        const firstMenu = side
          .locator(`[data-workspace-id="${f.ready.firstWorkspace.id}"]`)
          .getByTitle(f.copy.shell.workspaceActions(f.ready.firstWorkspace.name), { exact: true })
        await expect(
          side.locator(`[data-workspace-id="${f.ready.firstWorkspace.id}"]`).getByRole('menuitem', {
            name: organizationCopy(locale).hide,
            exact: true,
            includeHidden: true,
          }),
        ).toBeEnabled()
        await firstMenu.focus()
        await f.page.keyboard.press('ArrowUp')
        await expect(f.page.getByRole('menuitem', { name: organizationCopy(locale).hide, exact: true })).toBeFocused()
        await capture(f, `project-menu-${locale}-${width}`)
        await f.page.keyboard.press('Escape')
        await expect(
          f.page
            .locator(`[data-workspace-id="${f.ready.firstWorkspace.id}"]`)
            .getByTitle(f.copy.shell.workspaceActions(f.ready.firstWorkspace.name), { exact: true }),
        ).toBeFocused()
        await workspaceMenu(f)
        await f.page.getByRole('menuitem', { name: f.copy.shell.pinWorkspace, exact: true }).click()
        await hideSidebar(f)
        const draft = await seedDraft(f)
        const originalEditor = await files(f).getByRole('textbox', { name: fileName, exact: true }).elementHandle()
        if (!originalEditor) throw new Error('Original file editor missing')
        await hide(f)
        expect((await commands.execute('workspaceOrganization.get', {})).hiddenWorkspaceIds).toEqual([
          f.ready.firstWorkspace.id,
        ])
        await assertDraft(f, draft)
        await capture(f, `hidden-${locale}-${width}`)
        await restore(f, 1)
        await expect(
          f.page
            .locator(`[data-workspace-id="${f.ready.firstWorkspace.id}"]`)
            .getByTitle(f.copy.shell.pinnedWorkspace(f.ready.firstWorkspace.name), { exact: true }),
        ).toBeVisible()
        await hideSidebar(f)
        expect(await originalEditor.evaluate((element) => element.isConnected)).toBe(true)
        await assertDraft(f, draft)
        await hide(f)
        await hide(f, f.ready.secondWorkspace)
        await expect(f.page.locator('[data-workspace-id]')).toHaveCount(0)
        await capture(f, `all-hidden-${locale}-${width}`)
        // Reload only checks saved project visibility/pin; no claim that in-memory drafts survive reload.
        await f.page.reload()
        await showSidebar(f)
        await expect(f.page.locator('[data-workspace-id]')).toHaveCount(0)
        await restore(f, 2)
        await expect(f.page.locator(`[data-workspace-id="${f.ready.secondWorkspace.id}"]`)).toBeVisible()
        await capture(f, `restored-${locale}-${width}`)
        expect((await commands.execute('workspaceOrganization.get', {})).hiddenWorkspaceIds).toEqual([])
        await assertNoExecution(f)
        expect(f.uploads).toHaveLength(1)
        await writeFile(
          `${evidence}/matrix-${locale}-${width}.json`,
          JSON.stringify(
            {
              locale,
              width,
              realHost: true,
              productionUI: true,
              runs: 0,
              browserOrganizationWrites: f.commands.filter((command) => command === 'workspaceOrganization.apply')
                .length,
              attachmentUploads: f.uploads.length,
              errors: f.errors,
              warnings: f.warnings,
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
}

async function injectUnknown(page: Page, wrongWorkspaceId: string) {
  let accepted = false
  let wrongReceipt = true
  const applyIds = new Set<string | number>()
  const receiptIds = new Set<string | number>()
  let receipts = 0
  let holdNextSuccess = false
  let heldSuccess: (() => void) | null = null
  const heldNotifications: (() => void)[] = []
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcSchema.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined) {
          if (parsed.data.params?.commandId === 'workspaceOrganization.apply') applyIds.add(parsed.data.id)
          if (parsed.data.params?.commandId === 'workspaceOrganization.receipt') {
            receiptIds.add(parsed.data.id)
            receipts++
          }
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcSchema.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined) {
          const isApply = applyIds.delete(parsed.data.id)
          if (isApply && !accepted) {
            workspaceOrganizationReceiptSchema.parse(parsed.data.result)
            accepted = true
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Owned fixture lost the accepted ACK', data: 'RESULT_UNKNOWN' },
              }),
            )
            return
          }
          if (isApply && holdNextSuccess) {
            workspaceOrganizationReceiptSchema.parse(parsed.data.result)
            heldSuccess = () => socket.send(message)
            return
          }
          if (receiptIds.delete(parsed.data.id) && wrongReceipt) {
            const receipt = workspaceOrganizationReceiptSchema.parse(parsed.data.result)
            if (receipt.request.change.kind !== 'setHidden') throw new Error('Expected the original hide receipt')
            socket.send(
              JSON.stringify({
                ...parsed.data,
                result: {
                  ...receipt,
                  request: { ...receipt.request, change: { ...receipt.request.change, workspaceId: wrongWorkspaceId } },
                },
              }),
            )
            return
          }
        }
        if (holdNextSuccess && parsed.success && parsed.data.method === 'host.changed') {
          // Hold only the owning Host's committed visibility invalidation so this
          // test can move focus before the accepted UI operation becomes visible.
          const notification = z
            .object({ params: z.object({ kind: z.literal('workspace-organization') }) })
            .safeParse(parsed.data)
          if (notification.success) {
            heldNotifications.push(() => socket.send(message))
            return
          }
        }
      }
      socket.send(message)
    })
  })
  return {
    accepted: () => accepted,
    receipts: () => receipts,
    allowExactReceipt: () => {
      wrongReceipt = false
    },
    holdSuccess: () => {
      holdNextSuccess = true
    },
    hasHeldSuccess: () => heldSuccess !== null,
    releaseSuccess: () => {
      const release = heldSuccess
      if (!release) throw new Error('The accepted visibility acknowledgement is not held')
      heldSuccess = null
      holdNextSuccess = false
      release()
      for (const notify of heldNotifications.splice(0)) notify()
    },
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`unknown hide checks the original receipt and external client updates never steal main focus: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    let fault: Awaited<ReturnType<typeof injectUnknown>> | undefined
    const f = await start(browser, locale, 1440, async (page, ready) => {
      fault = await injectUnknown(page, ready.secondWorkspace.id)
    })
    try {
      if (!fault) throw new Error('ACK injection was not installed')
      const commands = createWorkspaceSessionCommandClient(f.external)
      const draft = `Focus stays in original composer — 不抢主区焦点 ${locale}`
      await composer(f).fill(draft)
      await hide(f)
      await expect.poll(fault.accepted).toBe(true)
      const feedback = f.page.getByTestId('workspace-organization-feedback')
      const reconcile = feedback.getByRole('button', { name: organizationCopy(locale).reconcile, exact: true })
      await expect(reconcile).toBeVisible()
      await expect(feedback).toContainText(organizationCopy(locale).unknown)
      await expect(feedback).not.toContainText(/RESULT_UNKNOWN|INVALID_OUTPUT/)
      await reconcile.click()
      await expect.poll(fault.receipts).toBe(1)
      await expect(reconcile).toBeEnabled()
      await expect(feedback).toContainText(organizationCopy(locale).unknown)
      await expect(feedback).not.toContainText(f.ready.secondWorkspace.id)
      expect(f.commands.filter((command) => command === 'workspaceOrganization.apply')).toHaveLength(1)
      expect((await commands.execute('workspaceOrganization.get', {})).hiddenWorkspaceIds).toEqual([
        f.ready.firstWorkspace.id,
      ])
      fault.allowExactReceipt()
      await reconcile.click()
      await expect.poll(fault.receipts).toBe(2)
      await expect(reconcile).toHaveCount(0)
      await composer(f).focus()
      const current = await commands.execute('workspaceOrganization.get', {})
      await commands.execute(
        'workspaceOrganization.apply',
        {
          expectedRevision: current.revision,
          change: { kind: 'setHidden', workspaceId: f.ready.secondWorkspace.id, expectedHidden: false, hidden: true },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect(f.page.locator('[data-workspace-id]')).toHaveCount(0)
      await expect(composer(f)).toBeFocused()
      await expectComposerText(composer(f), draft)
      await restore(f, 2)
      expect(f.commands.filter((command) => command === 'workspaceOrganization.apply')).toHaveLength(2)
      fault.holdSuccess()
      await workspaceMenu(f)
      await f.page.keyboard.press('End')
      await expect(f.page.getByRole('menuitem', { name: organizationCopy(locale).hide, exact: true })).toBeFocused()
      await f.page.keyboard.press('Enter')
      await expect.poll(fault.hasHeldSuccess).toBe(true)
      await composer(f).focus()
      const beforeEdit = await readComposerText(composer(f))
      // Replace through CodeMirror's real select-all keymap; DOM-level fill can
      // race its editor selection and append to an existing document instead.
      await composer(f).press('ControlOrMeta+A')
      await f.page.keyboard.insertText(`${draft} — edited while acknowledgement waits`)
      const afterEdit = await readComposerText(composer(f))
      await writeFile(
        `${evidence}/held-ack-edit-${locale}-${test.info().repeatEachIndex}.json`,
        JSON.stringify(
          {
            beforeEdit,
            afterEdit,
            acknowledgementStillHeld: fault.hasHeldSuccess(),
          },
          null,
          2,
        ),
      )
      expect(fault.hasHeldSuccess()).toBe(true)
      await expectComposerText(composer(f), `${draft} — edited while acknowledgement waits`)
      fault.releaseSuccess()
      await expect(f.page.locator(`[data-workspace-id="${f.ready.firstWorkspace.id}"]`)).toHaveCount(0)
      await expect(composer(f)).toBeFocused()
      await expectComposerText(composer(f), `${draft} — edited while acknowledgement waits`)
      expect(f.commands.filter((command) => command === 'workspaceOrganization.apply')).toHaveLength(3)
      await capture(f, `unknown-recovered-${locale}-1440`)
      await assertNoExecution(f)
      expect(f.uploads).toEqual([])
      await writeFile(
        `${evidence}/recovery-${locale}.json`,
        JSON.stringify(
          {
            locale,
            width: 1440,
            realHost: true,
            productionUI: true,
            browserOrganizationWrites: f.commands.filter((command) => command === 'workspaceOrganization.apply').length,
            explicitExternalOrganizationWrites: 1,
            originalOperationReceiptReads: fault.receipts(),
            attachmentUploads: f.uploads.length,
            runs: 0,
            errors: f.errors,
            warnings: f.warnings,
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

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`queued project-menu toggle preserves the latest keyboard or outside focus: ${locale}`, async ({ browser }) => {
    const f = await start(browser, locale, 1440)
    try {
      const side = await showSidebar(f)
      const project = side.locator(`[data-workspace-id="${f.ready.firstWorkspace.id}"]`)
      const menu = project.locator('.hbar-app-react-project-menu details')
      const summary = await menu.locator('summary').elementHandle()
      const editor = await composer(f).elementHandle()
      if (!summary || !editor) throw new Error('Original menu/composer elements are missing')
      const observations = []
      for (const scenario of ['end-key', 'outside-focus'] as const) {
        const result = await f.page.evaluate(
          async ({ trigger, input, scenario }) => {
            if (!(trigger instanceof HTMLElement) || !(input instanceof HTMLElement))
              throw new Error('Invalid focus targets')
            const menu = trigger.closest('details')
            if (!(menu instanceof HTMLDetailsElement) || menu.open)
              throw new Error('The original menu must start closed')
            const toggled = new Promise<void>((resolve, reject) => {
              const observe = (event: Event) => {
                if (event.target !== menu) return
                clearTimeout(timer)
                document.removeEventListener('toggle', observe, true)
                resolve()
              }
              const timer = setTimeout(() => {
                document.removeEventListener('toggle', observe, true)
                reject(new Error('The original menu toggle was not observed'))
              }, 3_000)
              // Observe before the component's own capture handler, which is
              // allowed to stop propagation to suppress a later default focus.
              document.addEventListener('toggle', observe, true)
            })
            // These are deliberately in the same task: the native toggle callback
            // is queued, while the actual component's keyboard handler or user-like
            // outside focus has already chosen the next focus owner.
            trigger.focus()
            trigger.click()
            if (scenario === 'end-key')
              trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
            else input.focus()
            await toggled
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
            const active = document.activeElement
            return {
              scenario,
              activeTag: active?.tagName ?? null,
              activeText: active?.textContent ?? null,
              activeLabel: active?.getAttribute('aria-label') ?? null,
              lastItemFocused: active === items.at(-1),
              composerFocused: active === input,
            }
          },
          { trigger: summary, input: editor, scenario },
        )
        observations.push(result)
        await f.page.screenshot({ path: `${evidence}/queued-toggle-${scenario}-${locale}.png` })
        await summary.focus()
        await f.page.keyboard.press('Escape')
        await expect(menu).not.toHaveAttribute('open')
      }
      await writeFile(`${evidence}/queued-toggle-${locale}.json`, JSON.stringify(observations, null, 2))
      expect(observations.find((item) => item.scenario === 'end-key')?.lastItemFocused).toBe(true)
      expect(observations.find((item) => item.scenario === 'outside-focus')?.composerFocused).toBe(true)
      await assertNoExecution(f)
      expect(f.commands.filter((command) => command === 'workspaceOrganization.apply')).toEqual([])
    } finally {
      await stop(f)
    }
  })
}
