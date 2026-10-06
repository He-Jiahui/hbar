import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { HbarClient, createConfigurationCommandClient, createModelCommandClient } from '@hbar/client'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { openSessionTool } from './support/session-tools-menu'

const phase = process.env.HBAR_MODEL_RECOVERY_PHASE ?? 'current'
if (!/^[A-Za-z0-9_-]+$/.test(phase)) throw new Error('Invalid model recovery evidence phase')
const evidence = `artifacts/model-provider-recovery/${phase}`
const primaryName = 'Original provider — 原供应商'
const selectedName = 'Original selected model — 原模型'
const alternativeName = 'Alternative model — 备选模型'
const fileName = 'model-recovery.md'
const dirtyFile = '# Unsaved original file — 未保存原文件\n'
const attachmentName = 'original-model-material.md'
const readySchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  externalToken: z.string().min(1),
  workspace: workspaceSchema,
  session: sessionSchema,
})
const rpcSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()
type Ready = z.infer<typeof readySchema>
interface Fixture {
  root: string
  child: ChildProcess
  context: BrowserContext
  page: Page
  ready: Ready
  external: HbarClient
  copy: ReturnType<typeof getShellCopy>
  locale: ShellLocale
  commands: string[]
  errors: string[]
  warnings: string[]
  faults: Awaited<ReturnType<typeof routeFaults>>
}

function bunExecutable() {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun unavailable for owned model Host')
  return executable
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.stdin?.write('stop\n')
  await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 10_000 }).toBe(true)
  expect(child.exitCode).toBe(0)
}

async function cleanupRoot(root: string) {
  const resolved = await realpath(root)
  if (dirname(resolved) !== (await realpath(tmpdir())) || !basename(resolved).startsWith('hbar-model-recovery-ui-'))
    throw new Error('Refusing cleanup outside exact model recovery temporary root')
  await rm(resolved, { recursive: true, force: true })
}

async function routeFaults(page: Page, commands: string[]) {
  let failReads = 0
  let holdReads = false
  let holdWrites = false
  let holdCatalog = false
  let suppressModelEvents = false
  let disconnect: (() => Promise<void>) | undefined
  let connections = 0
  const held: { kind: 'read' | 'write' | 'catalog'; release: () => void }[] = []
  await page.routeWebSocket('**/rpc', (socket) => {
    connections++
    const server = socket.connectToServer()
    const requests = new Map<string | number, string>()
    disconnect = async () => {
      await socket.close({ code: 1012, reason: 'Owned reconnect fixture' })
      await server.close()
    }
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcSchema.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.params?.commandId) {
          const command = parsed.data.params.commandId
          commands.push(command)
          if (parsed.data.id !== undefined) {
            requests.set(parsed.data.id, command)
            if (command === 'session.getModel' && failReads > 0) {
              failReads--
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.data.id,
                  error: { code: -32603, message: 'Owned model read failure', data: 'MODEL_READ_FAILED' },
                }),
              )
              return
            }
          }
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcSchema.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.method === 'host.changed' && suppressModelEvents) {
          const change = z.object({ params: z.object({ kind: z.string() }) }).safeParse(parsed.data)
          if (change.success && change.data.params.kind === 'models') return
        }
        if (parsed.success && parsed.data.id !== undefined) {
          const command = requests.get(parsed.data.id)
          requests.delete(parsed.data.id)
          const kind =
            command === 'session.getModel'
              ? 'read'
              : command === 'session.setModel'
                ? 'write'
                : command === 'model.list'
                  ? 'catalog'
                  : null
          if (
            (kind === 'read' && holdReads) ||
            (kind === 'write' && holdWrites) ||
            (kind === 'catalog' && holdCatalog)
          ) {
            held.push({ kind, release: () => socket.send(message) })
            return
          }
        }
      }
      socket.send(message)
    })
  })
  return {
    failNextRead() {
      failReads = 1
    },
    setReadFailure(enabled: boolean) {
      failReads = enabled ? 100 : 0
    },
    suppressModelEvents(enabled: boolean) {
      suppressModelEvents = enabled
    },
    holdReads() {
      holdReads = true
    },
    holdWrites() {
      holdWrites = true
    },
    holdCatalog() {
      holdCatalog = true
    },
    pending(kind: 'read' | 'write' | 'catalog') {
      return held.filter((item) => item.kind === kind).length
    },
    release(kind: 'read' | 'write' | 'catalog') {
      if (kind === 'read') holdReads = false
      else if (kind === 'write') holdWrites = false
      else holdCatalog = false
      for (const item of held.splice(0)) {
        if (item.kind === kind) item.release()
        else held.push(item)
      }
    },
    async disconnect() {
      if (!disconnect) throw new Error('Browser socket unavailable')
      await disconnect()
    },
    connections() {
      return connections
    },
  }
}

async function start(
  browser: Browser,
  locale: ShellLocale,
  options: { readonly empty?: boolean; readonly holdCatalog?: boolean } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-model-recovery-ui-'))
  const child = spawn(bunExecutable(), ['e2e/support/model-provider-recovery-host.ts'], {
    env: { ...process.env, HBAR_MODEL_RECOVERY_ROOT: root, HBAR_MODEL_RECOVERY_EMPTY: options.empty ? '1' : '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
  let external: HbarClient | undefined
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-16_384)
  })
  try {
    if (!child.stdout) throw new Error('Owned Host stdout missing')
    const lines = createInterface({ input: child.stdout })
    const ready = await new Promise<Ready>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Owned Host startup timeout: ${stderr}`)), 30_000)
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timeout)
        reject(new Error(`Owned Host startup exit ${code}: ${stderr}`))
      })
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            clearTimeout(timeout)
            resolve(parsed.data)
          }
        } catch {
          /* Ignore non-protocol diagnostics; never record credential stdout. */
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
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text())
    })
    const faults = await routeFaults(page, commands)
    if (options.holdCatalog) faults.holdCatalog()
    await page.goto(ready.url)
    const asset = process.env.HBAR_MODEL_RECOVERY_EXPECTED_ASSET
    if (asset) expect(await page.locator('script[type="module"][src]').getAttribute('src')).toContain(asset)
    const f: Fixture = {
      root,
      child,
      context,
      page,
      ready,
      external,
      copy: getShellCopy(locale),
      locale,
      commands,
      errors,
      warnings,
      faults,
    }
    await page.getByRole('button', { name: f.copy.shell.openSession(ready.session.title), exact: true }).click()
    const hide = page.getByRole('button', { name: f.copy.shell.hideSidebar, exact: true })
    if (await hide.isVisible()) await hide.click()
    if (!options.empty) {
      await picker(f).trigger.click()
      await picker(f).popup.getByRole('option').filter({ hasText: selectedName }).click()
      await expect(picker(f).trigger).toContainText(selectedName)
    }
    return f
  } catch (error) {
    await context.close()
    external?.disconnect()
    await stopChild(child)
    await cleanupRoot(root)
    throw error
  }
}

async function stop(f: Fixture) {
  await f.context.close()
  f.external.disconnect()
  await stopChild(f.child)
  const resolvedRoot = await realpath(f.root)
  await cleanupRoot(f.root)
  const removed = !existsSync(resolvedRoot)
  await writeFile(
    `${evidence}/cleanup-${f.locale}-${f.child.pid ?? 'unstarted'}.json`,
    JSON.stringify(
      {
        root: resolvedRoot,
        pid: f.child.pid,
        privateOrigin: f.ready.url,
        exitCode: f.child.exitCode,
        signalCode: f.child.signalCode,
        stoppedBy: 'Owned child stdin stop; no process enumeration or forced kill',
        removed,
      },
      null,
      2,
    ),
  )
  expect(removed).toBe(true)
}
function composer(f: Fixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true, includeHidden: true })
}
function send(f: Fixture) {
  return f.page.getByRole('button', { name: f.copy.session.prompt.send, exact: true, includeHidden: true })
}
function files(f: Fixture) {
  return f.page.locator('.lumen-app-tool-drawer .hbar-app-react-file-workspace')
}
function picker(f: Fixture) {
  return {
    trigger: f.page.locator('.hbar-composer-model-trigger'),
    popup: f.page.getByRole('dialog', { name: f.copy.session.modelPicker.title, exact: true }),
  }
}
function readCounts(f: Fixture) {
  return {
    usage: f.commands.filter((id) => id === 'usage.query').length,
    budget: f.commands.filter((id) => id === 'session.getBudget').length,
  }
}
async function draft(f: Fixture, materials: boolean, readyToSend = true) {
  const text = `Original draft — 原稿 ${f.locale}`
  await composer(f).click()
  await composer(f).press('ControlOrMeta+A')
  await f.page.keyboard.insertText(text)
  await expectComposerText(composer(f), text)
  if (materials) {
    const transfer = await f.page.evaluateHandle((name) => {
      const data = new DataTransfer()
      data.items.add(new File(['Local original material'], name, { type: 'text/markdown' }))
      return data
    }, attachmentName)
    await f.page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: transfer })
    await transfer.dispose()
    await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
    await f.page.getByRole('button', { name: f.copy.session.tools.files, exact: true }).click()
    await files(f).getByRole('button', { name: fileName, exact: true }).click()
    await files(f).getByRole('button', { name: f.copy.files.edit, exact: true }).click()
    await files(f).getByRole('textbox', { name: fileName, exact: true }).fill(dirtyFile)
  }
  if (readyToSend) await expect(send(f)).toBeEnabled()
  else await expect(send(f)).toBeDisabled()
  return text
}
async function assertOriginal(f: Fixture, text: string, materials: boolean) {
  await expectComposerText(composer(f), text)
  await expect(
    f.page.getByRole('tab', { name: f.ready.session.title, exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-selected', 'true')
  if (materials) {
    await expect(f.page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toHaveCount(1)
    await expect(files(f).getByRole('textbox', { name: fileName, exact: true, includeHidden: true })).toHaveValue(
      dirtyFile,
    )
    expect(await readFile(join(f.ready.workspace.path, fileName), 'utf8')).toBe('# Original file on disk\n')
  }
}
async function providers(f: Fixture) {
  await openSessionTool(f.page, f.copy.session.tools, 'settings')
  const groups = f.page.getByRole('navigation', { name: f.copy.settings.groups, exact: true })
  await groups
    .getByRole('button', { name: f.copy.settings.resolve('i18n:settings.groups.providers'), exact: true })
    .click()
  await expect(f.page.locator('.hbar-app-react-provider-list')).toBeVisible()
}
async function noExecution(f: Fixture) {
  const snapshot = await f.external.call('session.snapshot', { sessionId: f.ready.session.id })
  expect(snapshot.runs).toEqual([])
  expect(
    f.commands.filter((id) =>
      ['run.submit', 'run.retry', 'file.write', 'provider.test', 'provider.validate'].includes(id),
    ),
  ).toEqual([])
  expect(f.errors).toEqual([])
  expect(f.warnings).toEqual([])
}
async function capture(f: Fixture, state: string) {
  expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const geometry = await f.page.evaluate(() => {
    const popup = document.querySelector<HTMLElement>('.hbar-composer-picker-popover:popover-open')
    if (!popup) return []
    const targets = [
      popup,
      ...popup.querySelectorAll<HTMLElement>(
        '.hbar-composer-model-search, .hbar-composer-model-recovery, .hbar-composer-picker-heading button, .hbar-composer-picker-body > button',
      ),
    ]
    return targets
      .filter((element) => element.checkVisibility())
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        // Native popovers enter the top layer, escaping ancestors above the
        // popover. Only its own internal scroll/clip ancestors remain relevant.
        if (element !== popup) {
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const box = ancestor.getBoundingClientRect()
            const style = getComputedStyle(ancestor)
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
              clip.left = Math.max(clip.left, box.left + ancestor.clientLeft)
              clip.right = Math.min(clip.right, box.left + ancestor.clientLeft + ancestor.clientWidth)
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
              clip.top = Math.max(clip.top, box.top + ancestor.clientTop)
              clip.bottom = Math.min(clip.bottom, box.top + ancestor.clientTop + ancestor.clientHeight)
            }
            if (ancestor === popup) break
          }
        }
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return {
          name: element.getAttribute('aria-label') ?? element.className,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          clip,
          fullyVisible:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left >= clip.left - 1 &&
            rect.top >= clip.top - 1 &&
            rect.right <= clip.right + 1 &&
            rect.bottom <= clip.bottom + 1,
          centerHit: hit !== null && (hit === element || element.contains(hit)),
        }
      })
  })
  await writeFile(
    `${evidence}/${state}-${f.locale}-${f.page.viewportSize()?.width ?? 0}-geometry.json`,
    JSON.stringify(geometry, null, 2),
  )
  for (const item of geometry) {
    expect(item.fullyVisible, `${item.name} is within its viewport and clipping ancestors`).toBe(true)
    expect(item.centerHit, `${item.name} center hits its own visible surface`).toBe(true)
  }
  await f.page.screenshot({ path: `${evidence}/${state}-${f.locale}-${f.page.viewportSize()?.width ?? 0}.png` })
}
async function report(f: Fixture, name: string) {
  await writeFile(
    `${evidence}/${name}-${f.locale}.json`,
    JSON.stringify(
      {
        asset: process.env.HBAR_MODEL_RECOVERY_EXPECTED_ASSET,
        locale: f.locale,
        commands: Object.fromEntries(
          [...new Set(f.commands)].map((id) => [id, f.commands.filter((command) => command === id).length]),
        ),
        errors: f.errors,
        warnings: f.warnings,
        runCount: 0,
      },
      null,
      2,
    ),
  )
}

async function assertUnavailable(f: Fixture, modelId: string) {
  await expect(f.page.locator('.hbar-composer-model-picker')).toHaveAttribute('data-model-state', 'unavailable')
  await expect(send(f)).toBeDisabled()
  await picker(f).trigger.click()
  await expect(picker(f).popup.locator('.hbar-composer-model-recovery')).toHaveText(
    f.copy.session.modelPicker.unavailable(modelId),
  )
  await expect(
    picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.providers, exact: true }),
  ).toBeEnabled()
}

async function confirmAlternative(f: Fixture) {
  const { popup, trigger } = picker(f)
  if (!(await popup.isVisible())) await trigger.click()
  const writes = f.commands.filter((id) => id === 'session.setModel').length
  f.faults.holdWrites()
  await popup.getByRole('option').filter({ hasText: alternativeName }).click()
  await expect.poll(() => f.faults.pending('write')).toBe(1)
  await expect(send(f)).toBeDisabled()
  await expect(trigger).not.toContainText(alternativeName)
  await expect(popup.getByText(f.copy.session.modelPicker.pending, { exact: true })).toBeVisible()
  const accepted = await createModelCommandClient(f.external).execute('session.getModel', {
    sessionId: f.ready.session.id,
  })
  expect(accepted.status).toBe('configured')
  expect(accepted.model?.modelName).toBe(alternativeName)
  f.faults.release('write')
  await expect(trigger).toContainText(alternativeName)
  await expect(popup).not.toBeVisible()
  await expect(send(f)).toBeEnabled()
  expect(f.commands.filter((id) => id === 'session.setModel').length - writes).toBe(1)
}

async function primaryProfile(f: Fixture) {
  const profiles = await createConfigurationCommandClient(f.external).execute('provider.list', {})
  const primary = profiles.find((item) => item.provider.id === 'recovery-primary')
  if (!primary) throw new Error('Original fixture provider missing')
  return primary.provider
}

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})
for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`deleting the selected provider refreshes the original session before Back: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const f = await start(browser, locale)
    try {
      const text = await draft(f, true)
      const counts = readCounts(f)
      await providers(f)
      const trigger = f.page.locator(
        `.lumen-action-menu-trigger[aria-label="${f.copy.providers.list.actions(primaryName)}"]`,
      )
      await trigger.click()
      const menu = await lumenMenuForTrigger(trigger)
      await menu.getByRole('menuitem', { name: f.copy.providers.list.remove(primaryName), exact: true }).click()
      const confirmation = f.page.getByRole('dialog', {
        name: f.copy.providers.list.deleteConfirmTitle(primaryName),
        exact: true,
      })
      await confirmation.getByRole('button', { name: f.copy.providers.list.confirmRemove, exact: true }).click()
      await expect(confirmation).not.toBeVisible()
      await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
      const model = await createModelCommandClient(f.external).execute('session.getModel', {
        sessionId: f.ready.session.id,
      })
      expect(model.status).toBe('unavailable')
      await assertOriginal(f, text, true)
      await capture(f, 'returned-after-delete')
      await writeFile(
        `${evidence}/returned-after-delete-${locale}.json`,
        JSON.stringify(
          {
            hostStatus: model.status,
            modelId: model.modelId,
            trigger: await picker(f).trigger.innerText(),
            sendDisabled: await send(f).isDisabled(),
            counts: readCounts(f),
            commands: f.commands,
          },
          null,
          2,
        ),
      )
      // Core regression: never rely on opening the picker to discover that the
      // confirmed provider deletion made this configuration unusable.
      await expect(send(f)).toBeDisabled()
      await expect(picker(f).trigger).not.toContainText(selectedName)
      expect(readCounts(f)).toEqual(counts)
      for (const width of [1440, 320]) {
        if (width === 320) await files(f).getByRole('button', { name: f.copy.files.close, exact: true }).click()
        await f.page.setViewportSize({ width, height: 900 })
        if (!model.modelId) throw new Error('Unavailable model identity missing')
        await assertUnavailable(f, model.modelId)
        await capture(f, 'unavailable-recovery')
        await picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.providers, exact: true }).click()
        await expect(f.page.locator('.hbar-app-react-provider-list')).toBeVisible()
        await expect(f.page.getByRole('button', { name: f.copy.providers.list.add, exact: true })).toBeVisible()
        await capture(f, 'providers-recovery-target')
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
        await expectComposerText(composer(f), text)
      }
      await confirmAlternative(f)
      await f.page.setViewportSize({ width: 1440, height: 900 })
      await f.page.getByRole('button', { name: f.copy.session.tools.files, exact: true }).click()
      await assertOriginal(f, text, true)
      expect(readCounts(f)).toEqual(counts)
      await noExecution(f)
      await report(f, 'delete')
    } finally {
      await stop(f)
    }
  })

  test(`saving removal of the selected model and hiding a valid replacement preserve exact facts: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const f = await start(browser, locale)
    try {
      const text = await draft(f, false)
      const counts = readCounts(f)
      const original = await createModelCommandClient(f.external).execute('session.getModel', {
        sessionId: f.ready.session.id,
      })
      await providers(f)
      await f.page.getByRole('button', { name: f.copy.providers.list.edit(primaryName), exact: true }).click()
      const editor = f.page.locator('.hbar-app-react-provider-dialog')
      await editor
        .getByRole('button', { name: f.copy.providers.dialog.models.select(selectedName), exact: true })
        .click()
      await editor.getByRole('button', { name: f.copy.providers.dialog.models.remove, exact: true }).click()
      await editor.getByRole('button', { name: f.copy.providers.dialog.save, exact: true }).click()
      await expect(editor).toHaveCount(0)
      await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
      await expect(send(f)).toBeDisabled()
      if (!original.modelId) throw new Error('Original model identity missing')
      for (const width of [1440, 320]) {
        await f.page.setViewportSize({ width, height: 900 })
        await assertUnavailable(f, original.modelId)
        await capture(f, 'removed-model')
        await picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.close, exact: true }).click()
        await expect(picker(f).popup).not.toBeVisible()
      }
      await confirmAlternative(f)
      const profiles = await createConfigurationCommandClient(f.external).execute('provider.list', {})
      const alternative = profiles.find((item) => item.provider.id === 'recovery-alternative')
      if (!alternative) throw new Error('Replacement provider missing')
      f.faults.holdReads()
      await createConfigurationCommandClient(f.external).execute('provider.save', {
        provider: { ...alternative.provider, visible: false },
      })
      await expect.poll(() => f.faults.pending('read')).toBeGreaterThan(0)
      await expect(send(f)).toBeDisabled()
      f.faults.release('read')
      await expect(f.page.locator('.hbar-composer-model-picker')).toHaveAttribute('data-model-state', 'configured')
      await expect(picker(f).trigger).toContainText(alternativeName)
      await expect(send(f)).toBeEnabled()
      await picker(f).trigger.click()
      await expect(picker(f).popup.getByRole('option').filter({ hasText: alternativeName })).toHaveCount(0)
      await expect(
        picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.providers, exact: true }),
      ).toHaveCount(0)
      await capture(f, 'hidden-configured-model')
      await picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.close, exact: true }).click()
      await assertOriginal(f, text, false)
      expect(readCounts(f)).toEqual(counts)
      await noExecution(f)
      await report(f, 'save-hidden')
    } finally {
      await stop(f)
    }
  })

  test(`external provider changes expose model read failure and recover on retry and reconnect: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const f = await start(browser, locale)
    try {
      const text = await draft(f, false)
      const counts = readCounts(f)
      const profile = await primaryProfile(f)
      if (!profile.models) throw new Error('Fixture provider models missing')
      const renamed = 'Updated selected model — 最新模型'
      f.faults.holdReads()
      await createConfigurationCommandClient(f.external).execute('provider.save', {
        provider: {
          ...profile,
          models: profile.models.map((model) => (model.id === 'selected' ? { ...model, name: renamed } : model)),
        },
      })
      await expect.poll(() => f.faults.pending('read')).toBeGreaterThan(0)
      await expect(send(f)).toBeDisabled()
      await expect(f.page.locator('.hbar-composer-model-picker')).toHaveAttribute('data-model-state', 'loading')
      await capture(f, 'external-invalidation-pending')
      f.faults.release('read')
      await expect(picker(f).trigger).toContainText(renamed)
      await expect(send(f)).toBeEnabled()
      f.faults.setReadFailure(true)
      await createConfigurationCommandClient(f.external).execute('provider.save', {
        provider: { ...(await primaryProfile(f)), name: 'Updated provider — 已更新供应商' },
      })
      await expect(f.page.locator('.hbar-composer-model-picker')).toHaveAttribute('data-model-state', 'error')
      await expect(send(f)).toBeDisabled()
      for (const width of [1440, 320]) {
        await f.page.setViewportSize({ width, height: 900 })
        await picker(f).trigger.click()
        await expect(picker(f).popup.locator('.hbar-composer-model-recovery')).toHaveText(
          f.copy.session.modelPicker.readFailed,
        )
        await expect(picker(f).popup.getByText(f.copy.session.modelPicker.empty, { exact: true })).toHaveCount(0)
        await expect(
          picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.providers, exact: true }),
        ).toHaveCount(0)
        await capture(f, 'model-read-failed-not-empty')
        if (width === 1440) {
          await picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.close, exact: true }).click()
          await expect(picker(f).popup).not.toBeVisible()
        }
      }
      f.faults.setReadFailure(false)
      f.faults.holdReads()
      const retry = picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.retry, exact: true })
      await retry.click()
      await expect.poll(() => f.faults.pending('read')).toBeGreaterThan(0)
      await expect(retry).toBeDisabled()
      await expect(send(f)).toBeDisabled()
      f.faults.release('read')
      await expect(picker(f).trigger).toContainText(renamed)
      await expect(send(f)).toBeEnabled()
      await expect(retry).toHaveCount(0)
      await picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.close, exact: true }).click()
      await assertOriginal(f, text, false)
      expect(readCounts(f)).toEqual(counts)
      const readsBeforeReconnect = readCounts(f)
      const beforeConnections = f.faults.connections()
      f.faults.suppressModelEvents(true)
      const latest = await primaryProfile(f)
      if (!latest.models) throw new Error('Latest fixture models missing')
      const afterReconnect = 'Reconnected model — 重连后的模型'
      await createConfigurationCommandClient(f.external).execute('provider.save', {
        provider: {
          ...latest,
          models: latest.models.map((model) => (model.id === 'selected' ? { ...model, name: afterReconnect } : model)),
        },
      })
      f.faults.suppressModelEvents(false)
      await f.faults.disconnect()
      await expect.poll(() => f.faults.connections(), { timeout: 15_000 }).toBeGreaterThan(beforeConnections)
      await expect(picker(f).trigger).toContainText(afterReconnect)
      await expect(send(f)).toBeEnabled()
      await assertOriginal(f, text, false)
      await capture(f, 'model-reconnected')
      await writeFile(
        `${evidence}/reconnect-counts-${locale}.json`,
        JSON.stringify(
          { before: readsBeforeReconnect, after: readCounts(f), connections: f.faults.connections() },
          null,
          2,
        ),
      )
      await noExecution(f)
      await report(f, 'external-failure-reconnect')
    } finally {
      await stop(f)
    }
  })

  test(`cold empty model setup routes only for the still-current explicit opening: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const f = await start(browser, locale, { empty: true, holdCatalog: true })
    try {
      const text = await draft(f, false, false)
      await f.page.setViewportSize({ width: 320, height: 900 })
      await picker(f).trigger.click()
      await expect.poll(() => f.faults.pending('catalog')).toBeGreaterThan(0)
      await expect(picker(f).popup).toBeVisible()
      await picker(f).popup.getByRole('button', { name: f.copy.session.modelPicker.close, exact: true }).click()
      await expect(picker(f).popup).not.toBeVisible()
      f.faults.release('catalog')
      await expect(picker(f).trigger).toHaveAccessibleName(f.copy.session.modelPicker.configure)
      await expect(f.page.locator('.hbar-app-react-provider-list')).toHaveCount(0)
      await assertOriginal(f, text, false)
      await capture(f, 'empty-late-close-no-navigation')
      // Ready-empty is now a direct, explicit configuration action, not another
      // empty popover. Returning does not mutate the original composer draft.
      await picker(f).trigger.click()
      await expect(f.page.locator('.hbar-app-react-provider-list')).toBeVisible()
      await expect(f.page.getByRole('button', { name: f.copy.providers.list.add, exact: true })).toBeVisible()
      await capture(f, 'empty-explicit-provider-route')
      await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
      await assertOriginal(f, text, false)
      await noExecution(f)
      await report(f, 'empty-late-close')
    } finally {
      await stop(f)
    }

    // A separate real context/runtime demonstrates first-click confirmation.
    // This is deliberately not a claim that reload persists in-memory drafts.
    const fresh = await start(browser, locale, { empty: true, holdCatalog: true })
    try {
      const text = await draft(fresh, false, false)
      await picker(fresh).trigger.click()
      await expect.poll(() => fresh.faults.pending('catalog')).toBeGreaterThan(0)
      await expect(picker(fresh).popup).toBeVisible()
      fresh.faults.release('catalog')
      await expect(fresh.page.locator('.hbar-app-react-provider-list')).toBeVisible()
      await capture(fresh, 'empty-first-click-confirmed-route')
      await fresh.page.getByRole('button', { name: fresh.copy.settings.back, exact: true }).click()
      await assertOriginal(fresh, text, false)
      const configuration = createConfigurationCommandClient(fresh.external)
      await configuration.execute('provider.save', {
        provider: {
          id: 'background-fixture',
          name: 'Background fixture',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'temporary',
        },
      })
      fresh.faults.holdCatalog()
      await configuration.execute('provider.delete', { id: 'background-fixture' })
      await expect.poll(() => fresh.faults.pending('catalog')).toBeGreaterThan(0)
      fresh.faults.release('catalog')
      await expect(picker(fresh).trigger).toHaveAccessibleName(fresh.copy.session.modelPicker.configure)
      await expect(fresh.page.locator('.hbar-app-react-provider-list')).toHaveCount(0)
      await assertOriginal(fresh, text, false)
      await capture(fresh, 'background-empty-no-navigation')
      await noExecution(fresh)
      await report(fresh, 'empty-first-click-and-background')
    } finally {
      await stop(fresh)
    }
  })
}
