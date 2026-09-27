import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createSettingsCommandClient } from '@hbar/client'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { encodePath } from '@hbar/schema-core'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { WEB_ZOOM_STORAGE_KEY } from '../apps/web/src/app-zoom'

const prefix = 'hbar-send-shortcut-'
const evidence = resolve(process.env.HBAR_SEND_SHORTCUT_EVIDENCE ?? 'artifacts/send-shortcut/browser')
const settingPath = [{ kind: 'field' as const, name: 'client.chatSendBehavior' }]
const settingKey = encodePath(settingPath)
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
  method: z.string(),
  params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
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
  if (!executable) throw new Error('Bun unavailable for owned send-shortcut Host')
  return executable
}

async function cleanup(child: ChildProcess, root: string, directory: string): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.stdin?.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 15_000 }).toBe(true)
  }
  expect(child.exitCode).toBe(0)
  const stat = await lstat(root)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Refusing replaced send-shortcut fixture root')
  const exact = await realpath(root)
  if (exact !== resolve(root) || dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing cleanup outside exact owned send-shortcut fixture')
  await rm(exact, { recursive: true })
  await writeFile(
    join(directory, 'cleanup.json'),
    JSON.stringify(
      {
        root,
        pid: child.pid,
        exitCode: child.exitCode,
        removed: !existsSync(root),
        stop: 'Owned child stdin only',
      },
      null,
      2,
    ),
  )
}

async function start(
  browser: Browser,
  locale: ShellLocale,
  width: number,
  beforeGoto?: (page: Page) => Promise<void>,
): Promise<Fixture> {
  const assets = resolve(z.string().min(1).parse(process.env.HBAR_SEND_SHORTCUT_WEB_DIST))
  const asset = z
    .string()
    .regex(/^index-[A-Za-z0-9_-]+\.js$/)
    .parse(process.env.HBAR_SEND_SHORTCUT_EXPECTED_ASSET)
  const sha256 = z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/)
    .parse(process.env.HBAR_SEND_SHORTCUT_EXPECTED_SHA256)
  expect(
    createHash('sha256')
      .update(await readFile(join(assets, 'assets', asset)))
      .digest('hex')
      .toUpperCase(),
  ).toBe(sha256.toUpperCase())
  const directory = join(evidence, `${locale}-${width}-${randomUUID().slice(0, 8)}`)
  await mkdir(directory, { recursive: true })
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  const child = spawn(bunExecutable(), ['e2e/support/send-shortcut-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HBAR_SEND_SHORTCUT_ROOT: root, HBAR_SEND_SHORTCUT_WEB_DIST: assets },
  })
  const context = await browser.newContext({ locale, viewport: { width, height: width === 320 ? 760 : 960 } })
  let observer: HbarClient | undefined
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
          /* Credential-bearing stdout is never retained in evidence. */
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
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text())
    })
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        try {
          const parsed = wireSchema.safeParse(JSON.parse(String(frame.payload)))
          if (!parsed.success) return
          if (commands.length >= 2048) throw new Error('Observed request capacity exceeded')
          commands.push(
            parsed.data.method === 'command.execute'
              ? (parsed.data.params?.commandId ?? 'invalid')
              : parsed.data.method,
          )
        } catch {
          errors.push('Invalid browser command frame')
        }
      }),
    )
    await beforeGoto?.(page)
    await page.goto(ready.url)
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', `/assets/${asset}`)
    const copy = getShellCopy(locale)
    const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await show.isVisible()) await show.click()
    const project = page.locator(`[data-workspace-id="${ready.workspace.id}"]`)
    const toggle = project.locator('.hbar-app-react-workspace-row')
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      try {
        await project.locator('.hbar-app-react-workspace-row[aria-expanded="false"]').click({ timeout: 1500 })
      } catch (error) {
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') throw error
      }
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await project.getByRole('button', { name: copy.shell.openSession(ready.firstSession.title), exact: true }).click()
    const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
    if (await hide.isVisible()) {
      try {
        await hide.click({ timeout: 1500 })
      } catch (error) {
        if (await hide.isVisible()) throw error
      }
    }
    return { root, directory, child, context, page, observer, ready, copy, locale, width, asset, commands, errors }
  } catch (error) {
    await context.close()
    observer?.disconnect()
    await cleanup(child, root, directory)
    throw error
  }
}

async function stop(fixture: Fixture): Promise<void> {
  try {
    await fixture.context.close()
  } finally {
    fixture.observer.disconnect()
    await cleanup(fixture.child, fixture.root, fixture.directory)
  }
}

function prompt(fixture: Fixture) {
  return fixture.page.getByRole('textbox', { name: fixture.copy.session.prompt.input, exact: true })
}

async function userRuns(fixture: Fixture, sessionId = fixture.ready.firstSession.id) {
  const snapshot = await fixture.observer.call('session.snapshot', { sessionId, limit: 100 })
  return snapshot.runs.filter((run) => run.input.source === 'user')
}

async function openGeneral(fixture: Fixture) {
  const { page, copy } = fixture
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
  const groups = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await groups.isVisible()) await groups.selectOption({ label: copy.general.group })
  else await page.getByRole('button', { name: copy.general.group, exact: true }).click()
  const field = page.locator('.hbar-web-general-sending')
  await expect(field).toBeVisible()
  return field
}

function sendChoice(fixture: Fixture, field: Locator, behavior: 'enter' | 'modifierEnter') {
  return field.getByText(fixture.copy.general.sending.options[behavior].label, { exact: true }).locator('..')
}

async function capture(fixture: Fixture, name: string): Promise<void> {
  const { page, directory, width } = fixture
  const choices = page.locator('.hbar-web-general-send-choice')
  if (await choices.count())
    await expect
      .poll(() =>
        choices.evaluateAll((nodes) =>
          nodes.every((node) => node.getAnimations().every((animation) => animation.playState !== 'running')),
        ),
      )
      .toBe(true)
  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    sendChoices: Array.from(document.querySelectorAll<HTMLButtonElement>('.hbar-web-general-send-choice'), (node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        title: node.querySelector('.hbar-web-general-send-title')?.textContent,
        pressed: node.getAttribute('aria-pressed'),
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderWidth,
        rectangle: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      }
    }),
  }))
  expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1)
  if (geometry.sendChoices.length) {
    const selected = geometry.sendChoices.filter((choice) => choice.pressed === 'true')
    const unselected = geometry.sendChoices.filter((choice) => choice.pressed === 'false')
    expect(selected).toHaveLength(1)
    expect(unselected).toHaveLength(1)
    expect(selected[0]?.borderColor).not.toBe(unselected[0]?.borderColor)
    expect(selected[0]?.backgroundColor).not.toBe(unselected[0]?.backgroundColor)
  }
  await page.screenshot({ path: join(directory, `${name}.png`) })
  await writeFile(join(directory, `${name}.json`), JSON.stringify(geometry, null, 2))
}

/** Settings has its own scrollport; fullPage screenshots do not reveal feedback below it. */
async function captureNarrowFeedback(fixture: Fixture, feedback: Locator, name: string): Promise<void> {
  if (fixture.width !== 320) return
  await feedback.scrollIntoViewIfNeeded()
  await expect(feedback).toBeInViewport({ ratio: 0.9 })
  const geometry = await feedback.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  await fixture.page.screenshot({ path: join(fixture.directory, `${name}-feedback.png`) })
  await writeFile(join(fixture.directory, `${name}-feedback.json`), JSON.stringify(geometry, null, 2))
}

/** Reject one exact public settings.set before dispatch; no Host mutation is fabricated. */
async function rejectOneSendPreferenceWrite(page: Page) {
  let rejected = 0
  const failure = 'Private fixture detail must not appear in the UI'
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        try {
          const wire = wireSchema.safeParse(JSON.parse(message))
          if (
            wire.success &&
            wire.data.id !== undefined &&
            wire.data.method === 'command.execute' &&
            wire.data.params?.commandId === 'settings.set'
          ) {
            const parsed = settingsCommands['settings.set'].input.safeParse(wire.data.params.input)
            if (
              parsed.success &&
              JSON.stringify(parsed.data.path) === JSON.stringify(settingPath) &&
              parsed.data.scope.kind === 'global' &&
              parsed.data.value === 'modifierEnter' &&
              rejected === 0
            ) {
              rejected++
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: wire.data.id,
                  error: { code: -32603, message: failure, data: 'INVALID_INPUT' },
                }),
              )
              return
            }
          }
        } catch {
          /* The actual app protocol validates malformed frames. */
        }
      }
      server.send(message)
    })
    server.onMessage((message) => socket.send(message))
    socket.onClose(async (code, reason) => {
      await server.close({ ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) })
    })
  })
  return { rejected: () => rejected, failure }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    test(`device zoom has a General entry, shortcuts, reset and same-origin persistence: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(90_000)
      const f = await start(browser, locale, width)
      try {
        const editor = prompt(f)
        const draft = `Zoom keeps the original draft — ${locale}`
        await editor.fill(draft)
        await openGeneral(f)
        const zoom = f.page.locator('.hbar-web-general-zoom')
        const range = zoom.getByRole('slider', { name: f.copy.general.zoom.title, exact: true })
        await expect(zoom).toBeVisible()
        await expect(range).toHaveValue('1')
        await expect(zoom.getByText(f.copy.general.zoom.shortcut, { exact: true })).toBeVisible()
        await f.page.keyboard.press('Control+=')
        await expect(range).toHaveValue('1.1')
        await f.page.keyboard.press('Control+=')
        await expect(range).toHaveValue('1.2')
        await expect.poll(() => f.page.evaluate((key) => localStorage.getItem(key), WEB_ZOOM_STORAGE_KEY)).toBe('1.2')
        await expect(zoom.getByText(f.copy.general.zoom.saved, { exact: true })).toBeVisible()
        await zoom.scrollIntoViewIfNeeded()
        await capture(f, 'zoom-applied')
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
        await expectComposerText(editor, draft)
        await f.page.reload()
        const reloaded = await openGeneral(f)
        await expect(f.page.locator('.hbar-web-general-zoom').getByRole('slider')).toHaveValue('1.2')
        await expect(reloaded).toBeVisible()
        await f.page.keyboard.press('Control+0')
        const reloadedRange = f.page.locator('.hbar-web-general-zoom').getByRole('slider')
        await expect(reloadedRange).toHaveValue('1')
        await expect.poll(() => f.page.evaluate((key) => localStorage.getItem(key), WEB_ZOOM_STORAGE_KEY)).toBe('1')
        await reloadedRange.focus()
        await reloadedRange.press('ArrowRight')
        await expect(reloadedRange).toHaveValue('1.01')
        await expect.poll(() => f.page.evaluate((key) => localStorage.getItem(key), WEB_ZOOM_STORAGE_KEY)).toBe('1.01')
        await f.page.getByRole('button', { name: f.copy.general.zoom.reset, exact: true }).click()
        await expect(reloadedRange).toHaveValue('1')
        await reloadedRange.focus()
        await reloadedRange.press('End')
        await expect(reloadedRange).toHaveValue('2')
        await expect.poll(() => f.page.evaluate((key) => localStorage.getItem(key), WEB_ZOOM_STORAGE_KEY)).toBe('2')
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await reloadedRange.press('Home')
        await expect(reloadedRange).toHaveValue('0.5')
        await expect.poll(() => f.page.evaluate((key) => localStorage.getItem(key), WEB_ZOOM_STORAGE_KEY)).toBe('0.5')
        expect(await f.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await f.page.getByRole('button', { name: f.copy.general.zoom.reset, exact: true }).click()
        await expect(reloadedRange).toHaveValue('1')
        await reloadedRange.scrollIntoViewIfNeeded()
        await capture(f, 'zoom-reset')
        expect(await userRuns(f)).toHaveLength(0)
        expect(f.commands.filter((command) => command === 'run.submit')).toHaveLength(0)
        expect(f.errors).toEqual([])
      } finally {
        await stop(f)
      }
    })

    test(`Host-global send preference controls the existing composer without changing target: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const f = await start(browser, locale, width)
      try {
        const editor = prompt(f)
        await expect(editor).toHaveAttribute('contenteditable', 'true')
        const original = await openGeneral(f)
        const enter = sendChoice(f, original, 'enter')
        const modifier = sendChoice(f, original, 'modifierEnter')
        await expect(enter).toHaveAttribute('aria-pressed', 'true')
        await expect(modifier).toHaveAttribute('aria-pressed', 'false')
        await capture(f, 'original-default-setting')
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()

        await editor.fill('Default Enter submits once — 默认发送一次')
        await editor.press('Shift+Enter')
        await expectComposerText(editor, 'Default Enter submits once — 默认发送一次\n')
        expect(await userRuns(f)).toHaveLength(0)
        await editor.press('Enter')
        await expect.poll(async () => (await userRuns(f)).length).toBe(1)
        await expectComposerText(editor, '')
        const first = await userRuns(f)
        expect(first[0]?.input.text).toBe('Default Enter submits once — 默认发送一次\n')
        await expect.poll(async () => (await userRuns(f))[0]?.status).toBe('completed')

        const draft = 'Original unsent draft stays in the same session — 保留原稿'
        await editor.fill(draft)
        await expectComposerText(editor, draft)
        await f.page.locator('.hbar-composer-attachment-target input[type="file"]').setInputFiles({
          name: 'preference-note.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Owned local attachment'),
        })
        const attachment = f.page.locator('.lumen-attachment-chip').filter({ hasText: 'preference-note.txt' })
        await expect(attachment).toBeVisible()
        await expectComposerText(editor, draft)
        const general = await openGeneral(f)
        const chooseModifier = sendChoice(f, general, 'modifierEnter')
        await chooseModifier.click()
        await expect(chooseModifier).toHaveAttribute('aria-pressed', 'true')
        await expect(general.getByText(f.copy.general.sending.saved, { exact: true })).toBeVisible()
        const settings = createSettingsCommandClient(f.observer)
        await expect
          .poll(async () => {
            const snapshot = await settings.execute('settings.get', { scope: { kind: 'global' }, path: settingPath })
            return snapshot.resolution.reports[settingKey]?.effectiveValue
          })
          .toBe('modifierEnter')
        await capture(f, 'modifier-setting')
        await captureNarrowFeedback(
          f,
          general.getByText(f.copy.general.sending.saved, { exact: true }),
          'modifier-setting',
        )
        await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
        await expectComposerText(editor, draft)
        await expect(attachment).toBeVisible()

        await editor.press('Control+End')
        await editor.press('Enter')
        await expectComposerText(editor, `${draft}\n`)
        await editor.press('Shift+Enter')
        await expectComposerText(editor, `${draft}\n\n`)
        expect(await userRuns(f)).toHaveLength(1)
        await expect(f.page.getByRole('button', { name: f.copy.session.prompt.send, exact: true })).toBeEnabled()
        await capture(f, 'modifier-composer-draft')
        await editor.press('Control+Enter')
        await expect.poll(async () => (await userRuns(f)).length).toBe(2)
        const second = await userRuns(f)
        const added = second.filter((run) => !first.some((previous) => previous.id === run.id))
        expect(added).toHaveLength(1)
        const modifierRun = added[0]
        expect(modifierRun?.input.text).toBe(`${draft}\n\n`)
        expect(modifierRun?.sessionId).toBe(f.ready.firstSession.id)
        await expectComposerText(editor, '')
        await expect
          .poll(async () => (await userRuns(f)).find((run) => run.id === modifierRun?.id)?.status)
          .toBe('completed')

        await editor.fill('Meta sends with same preference')
        await editor.press('Meta+Enter')
        await expect.poll(async () => (await userRuns(f)).length).toBe(3)
        const third = (await userRuns(f)).filter((run) => !second.some((previous) => previous.id === run.id))
        expect(third).toHaveLength(1)
        expect(third[0]?.input.text).toBe('Meta sends with same preference')
        await expect
          .poll(async () => (await userRuns(f)).find((run) => run.id === third[0]?.id)?.status)
          .toBe('completed')

        // Genuine browser IME composition cannot be automated here; a composing
        // DOM key event still must not escape the CodeMirror gate.
        await editor.fill('Composition keeps this draft')
        await editor.dispatchEvent('compositionstart', { data: '中' })
        await editor.dispatchEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          ctrlKey: true,
          isComposing: true,
          bubbles: true,
          cancelable: true,
        })
        await editor.dispatchEvent('compositionend', { data: '中' })
        await expectComposerText(editor, 'Composition keeps this draft')
        expect(await userRuns(f)).toHaveLength(3)

        await editor.fill('/mo')
        const slash = f.page.getByRole('listbox', { name: f.copy.session.slash.menu })
        await expect(slash.getByRole('option')).toHaveCount(1)
        await editor.press('Control+Enter')
        await expectComposerText(editor, '/model ')
        expect(await userRuns(f)).toHaveLength(3)
        await editor.fill('Review @')
        const mentions = f.page.getByRole('listbox', { name: f.copy.session.mentions.menu })
        await expect(mentions).toBeVisible()
        await editor.press('Control+Enter')
        expect(await userRuns(f)).toHaveLength(3)

        // A reloaded renderer reads the durable Host-global fact. Runtime-local
        // drafts are intentionally not asserted across full reload.
        await f.page.reload()
        await expect(f.page.locator('script[type="module"][src]')).toHaveAttribute('src', `/assets/${f.asset}`)
        const reloaded = await openGeneral(f)
        await expect(sendChoice(f, reloaded, 'modifierEnter')).toHaveAttribute('aria-pressed', 'true')
        expect(await userRuns(f, f.ready.secondSession.id)).toHaveLength(0)
        expect((await userRuns(f)).map((run) => run.input.text).sort()).toEqual(
          ['Default Enter submits once — 默认发送一次\n', `${draft}\n\n`, 'Meta sends with same preference'].sort(),
        )
        expect(f.commands.filter((command) => command === 'run.submit')).toHaveLength(3)
        expect(f.commands.filter((command) => command === 'settings.set')).toHaveLength(1)
        expect(f.errors).toEqual([])
        await writeFile(
          join(f.directory, 'observation.json'),
          JSON.stringify(
            {
              actualHost: true,
              locale,
              width,
              asset: f.asset,
              root: f.root,
              pid: f.child.pid,
              sessionId: f.ready.firstSession.id,
              otherSessionId: f.ready.secondSession.id,
              initializationWrites: f.ready.initializationWrites,
              runs: (await userRuns(f)).map((run) => ({ id: run.id, text: run.input.text, status: run.status })),
              commands: f.commands,
              errors: f.errors,
              draftPersistAcrossReloadNotClaimed: true,
              noProviderOrShell: true,
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

for (const [locale, width] of [
  ['en-US', 1440],
  ['zh-CN', 320],
] as const) {
  test(`definite settings refusal keeps original Host preference and draft until explicit retry: ${locale} ${width}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    let fault: Awaited<ReturnType<typeof rejectOneSendPreferenceWrite>> | undefined
    const f = await start(browser, locale, width, async (page) => {
      fault = await rejectOneSendPreferenceWrite(page)
    })
    try {
      if (!fault) throw new Error('Owned write-fault route did not install')
      const ownedFault = fault
      const editor = prompt(f)
      await expect(editor).toHaveAttribute('contenteditable', 'true')
      const draft = `Do not send while changing the shortcut — ${locale}`
      await editor.fill(draft)
      const general = await openGeneral(f)
      const modifier = sendChoice(f, general, 'modifierEnter')
      await modifier.click()
      await expect(general.getByRole('alert')).toContainText(f.copy.general.sending.saveError('INVALID_INPUT'))
      await expect(sendChoice(f, general, 'enter')).toHaveAttribute('aria-pressed', 'true')
      expect(ownedFault.rejected()).toBe(1)
      expect(await f.page.getByText(ownedFault.failure).count()).toBe(0)
      const settings = createSettingsCommandClient(f.observer)
      const read = () => settings.execute('settings.get', { scope: { kind: 'global' }, path: settingPath })
      expect((await read()).resolution.reports[settingKey]?.effectiveValue).toBe('enter')
      expect(await userRuns(f)).toHaveLength(0)
      await capture(f, 'definite-save-refusal')
      await captureNarrowFeedback(f, general.getByRole('alert'), 'definite-save-refusal')
      await general.getByRole('button', { name: f.copy.general.sending.retryRead, exact: true }).click()
      await expect(sendChoice(f, general, 'enter')).toHaveAttribute('aria-pressed', 'true')
      await modifier.click()
      await expect(general.getByText(f.copy.general.sending.saved, { exact: true })).toBeVisible()
      await expect.poll(async () => (await read()).resolution.reports[settingKey]?.effectiveValue).toBe('modifierEnter')
      await f.page.getByRole('button', { name: f.copy.settings.back, exact: true }).click()
      await expectComposerText(editor, draft)
      await editor.press('Control+End')
      await editor.press('Enter')
      await expectComposerText(editor, `${draft}\n`)
      expect(await userRuns(f)).toHaveLength(0)
      // The routed, pre-dispatch rejection is counted by ownedFault; the
      // browser websocket observer only sees the later forwarded write.
      expect(f.commands.filter((command) => command === 'settings.set')).toHaveLength(1)
      expect(f.errors.filter((message) => !message.includes(ownedFault.failure))).toEqual([])
      await writeFile(
        join(f.directory, 'observation.json'),
        JSON.stringify(
          {
            actualHost: true,
            locale,
            width,
            asset: f.asset,
            originalRefusalWasBeforeDispatch: true,
            rejected: ownedFault.rejected(),
            globalSettingAfterRetry: (await read()).resolution.reports[settingKey]?.effectiveValue,
            runCount: (await userRuns(f)).length,
            commands: f.commands,
            privateFailureRendered: false,
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
