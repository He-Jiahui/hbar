import { revealComposerControl } from './support/composer-controls'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { createGoalPlanCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const envelope = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough()
const modeInput = z.object({ sessionId: z.string(), mode: z.enum(['default', 'plan']) }).passthrough()

async function removeOwnedFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-composer-intent-recovery-'))
    throw new Error('Refusing to remove a directory outside this owned fixture')
  await rm(target, { recursive: true, force: true })
}

async function observeMode(page: Page) {
  const commands: string[] = []
  const writes: Array<{ sessionId: string; mode: 'default' | 'plan' }> = []
  const ids = new Set<string | number>()
  let fault: 'normal' | 'hold' | 'unknown' = 'normal'
  let release: (() => void) | null = null
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const result = envelope.safeParse(JSON.parse(message))
        if (result.success) {
          const command = result.data.method === 'command.execute' ? result.data.params?.commandId : result.data.method
          if (command) commands.push(command)
          if (command === 'mode.set' && result.data.id !== undefined) {
            writes.push(modeInput.parse(result.data.params?.input))
            ids.add(result.data.id)
          }
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const result = envelope.safeParse(JSON.parse(message))
        if (result.success && result.data.id !== undefined && ids.delete(result.data.id)) {
          if (fault === 'hold') {
            fault = 'normal'
            release = () => socket.send(message)
            return
          }
          if (fault === 'unknown') {
            fault = 'normal'
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: result.data.id,
                error: {
                  code: -32603,
                  message: 'Owned fixture loses a real accepted mode reply',
                  data: 'RESULT_UNKNOWN',
                },
              }),
            )
            return
          }
        }
      }
      socket.send(message)
    })
  })
  return {
    commands,
    writes,
    fault: (next: 'hold' | 'unknown') => {
      fault = next
    },
    held: () => release !== null,
    release: () => {
      const current = release
      release = null
      current?.()
    },
  }
}

async function visibleHit(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  await expect(target).toBeInViewport()
  expect(
    await target.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.left >= 0 &&
        box.right <= innerWidth &&
        Boolean(hit && element.contains(hit))
      )
    }),
  ).toBe(true)
}

async function fixture(browser: Browser, locale: ShellLocale, width: number) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-composer-intent-recovery-'))
  const context = await browser.newContext({ locale, viewport: { width, height: width === 320 ? 844 : 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      sessionCount: 2,
      goalAutoContinue: false,
    })
    const ownedHost = host
    const directory = createWorkspaceSessionCommandClient(host.client)
    const list = await directory.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
    const a = list.items.find((item) => item.title === 'Session 001')
    const b = list.items.find((item) => item.title === 'Session 002')
    if (!a || !b) throw new Error('Owned fixture session pair is missing')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const mode = await observeMode(page)
    const copy = getShellCopy(locale)
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const plus = page.getByRole('button', { name: copy.session.addMenu.open, exact: true, includeHidden: true })
    const addMenu = page.getByRole('group', { name: copy.session.addMenu.menu })
    const goal = () => page.locator('.hbar-composer-intents > button')
    const clickGoal = async () => {
      if (!(await addMenu.isVisible())) {
        await revealComposerControl(page, plus, copy.session.addMenu)
        await plus.click()
      }
      await addMenu.getByRole('button', { name: copy.session.intent.goalMenu, exact: true }).click()
    }
    const help = page.getByRole('dialog', { name: copy.session.intent.blocked.title, exact: true })
    const permission = page.locator('.hbar-composer-permission-picker')
    const planOption = page
      .locator('.hbar-composer-permission-popover')
      .getByRole('menuitemradio', { name: copy.session.permissionPicker.plan.label })
    const openPermission = async () => {
      await revealComposerControl(page, permission.locator('.hbar-composer-permission-trigger'), copy.session.addMenu)
      await permission.locator('.hbar-composer-permission-trigger').click()
      await expect(planOption).toBeVisible()
    }
    const selectSession = async (title: string) => {
      const entry = page.getByRole('treeitem', { name: title, exact: true })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      await expect.poll(async () => (await entry.isVisible()) || (await show.isVisible())).toBe(true)
      if (await show.isVisible()) await show.click()
      await expect(entry).toBeVisible()
      await entry.click()
      if (width > 768)
        await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
      else await expect(page.locator('.hbar-app-react-shell-header-active-title')).toHaveText(title)
      await expect(prompt).toBeVisible()
    }
    await page.goto(base)
    await selectSession(a.title)
    await expect(prompt).toBeEditable()
    const text = `Retain original A draft — 保留原稿 ${locale} ${width}`
    const filename = 'original-draft-attachment-保留附件.txt'
    await prompt.fill(text)
    await page.locator('.hbar-composer-add-root input[type=file]').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: Buffer.from('owned fixture attachment, never submitted'),
    })
    const attachment = page.locator('.lumen-attachment-chip').filter({ hasText: filename })
    await expect(attachment).toBeVisible()
    await revealComposerControl(page, plus, copy.session.addMenu)
    await plus.click()
    await expect(goal()).toHaveAttribute('title', copy.session.intent.goalHint)
    await page.keyboard.press('Escape')
    const checkDraft = async () => {
      await expectComposerText(prompt, text)
      await expect(attachment).toBeVisible()
    }
    return {
      page,
      host,
      context,
      root,
      copy,
      mode,
      a,
      b,
      errors,
      prompt,
      goal,
      clickGoal,
      help,
      permission,
      planOption,
      openPermission,
      selectSession,
      checkDraft,
      async noRunsOrGoals() {
        const goals = createGoalPlanCommandClient(ownedHost.client)
        const observed: Array<{ sessionId: string; runCount: number; goalPresent: boolean }> = []
        for (const session of [a, b]) {
          const snapshot = await ownedHost.client.call('session.snapshot', { sessionId: session.id, limit: 100 })
          const goal = (await goals.execute('goal.get', { sessionId: session.id })).goal
          observed.push({ sessionId: session.id, runCount: snapshot.runs.length, goalPresent: goal !== null })
          expect(snapshot.runs).toHaveLength(0)
          expect(goal).toBeNull()
        }
        expect(
          mode.commands.filter((command) =>
            ['run.submit', 'run.retry', 'goal.set', 'goal.create', 'goal.clear'].includes(command),
          ),
        ).toEqual([])
        expect(errors).toEqual([])
        const factsPath = test.info().outputPath('real-host-intent-recovery-facts.json')
        await writeFile(factsPath, JSON.stringify({ observed, modeWrites: mode.writes, pageErrors: errors }, null, 2))
        await test.info().attach('real-host-intent-recovery-facts', {
          path: factsPath,
          contentType: 'application/json',
        })
      },
      async close() {
        mode.release()
        await context.close()
        await stopWebSessionHost(ownedHost)
        await removeOwnedFixture(root)
      },
    }
  } catch (error) {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedFixture(root)
    throw error
  }
}

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 320]) {
    test(`Goal preparation and Plan mode preserve independent choices and session-owned drafts: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(90_000)
      const f = await fixture(browser, locale, width)
      try {
        const { page, copy } = f
        const cancelGoal = page.getByRole('button', {
          name: copy.session.intent.cancelGoal,
          exact: true,
          includeHidden: true,
        })
        await f.clickGoal()
        await expect(cancelGoal).toHaveAttribute('aria-pressed', 'true')
        await f.openPermission()
        await expect(f.planOption).toBeEnabled()
        await visibleHit(f.planOption)
        await f.planOption.click()
        await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'plan')
        await expect(cancelGoal).toHaveAttribute('aria-pressed', 'true')
        await f.checkDraft()
        expect(await f.host.client.call('mode.get', { sessionId: f.a.id })).toEqual({ mode: 'plan' })
        await revealComposerControl(page, cancelGoal, copy.session.addMenu)
        await cancelGoal.click()
        await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
        await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'plan')
        await f.clickGoal()
        await expect(cancelGoal).toHaveAttribute('aria-pressed', 'true')
        await expect(f.help).not.toBeVisible()
        await f.selectSession(f.b.title)
        await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
        await f.prompt.fill('Independent B draft — 独立B草稿')
        await expect(page.locator('.lumen-attachment-chip')).toHaveCount(0)
        await f.selectSession(f.a.title)
        await expect(cancelGoal).toHaveAttribute('aria-pressed', 'true')
        await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'plan')
        await f.checkDraft()
        await revealComposerControl(page, cancelGoal, copy.session.addMenu)
        await cancelGoal.click()
        await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
        expect(f.mode.writes).toEqual([{ sessionId: f.a.id, mode: 'plan' }])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: test.info().outputPath(`independent-intent-${locale}-${width}.png`) })
        await f.noRunsOrGoals()
      } finally {
        await f.close()
      }
    })
  }
