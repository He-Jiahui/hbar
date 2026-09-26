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
    const goal = () =>
      page.locator('.hbar-composer-intents').getByRole('button', { name: copy.session.intent.goal, exact: true })
    const help = page.getByRole('dialog', { name: copy.session.intent.blocked.title, exact: true })
    const permission = page.locator('.hbar-composer-permission-picker')
    const planOption = permission.getByRole('menuitemcheckbox', { name: copy.session.permissionPicker.plan.label })
    const openPermission = async () => {
      await permission.locator('.hbar-composer-permission-trigger').click()
      await expect(planOption).toBeVisible()
    }
    const selectSession = async (title: string) => {
      const entry = page.getByRole('button', { name: copy.shell.openSession(title), exact: true })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      await expect.poll(async () => (await entry.isVisible()) || (await show.isVisible())).toBe(true)
      if (await show.isVisible()) await show.click()
      await expect(entry).toBeVisible()
      await entry.click()
      await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(prompt).toBeVisible()
    }
    await page.goto(base)
    await selectSession(a.title)
    await expect(prompt).toBeEditable()
    const text = `Retain original A draft — 保留原稿 ${locale} ${width}`
    const filename = 'original-draft-attachment-保留附件.txt'
    await prompt.fill(text)
    await page.locator('.hbar-composer-attachment-target input[type=file]').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: Buffer.from('owned fixture attachment, never submitted'),
    })
    const attachment = page.locator('.lumen-attachment-chip').filter({ hasText: filename })
    await expect(attachment).toBeVisible()
    await expect(goal()).toHaveAttribute('title', copy.session.intent.goalHint)
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
    test(`Goal and Plan each require a separate recovery and preparation action: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(90_000)
      const f = await fixture(browser, locale, width)
      try {
        const { copy, page } = f
        await f.goal().click()
        const cancelGoal = page.getByRole('button', { name: copy.session.intent.cancelGoal, exact: true })
        await expect(cancelGoal).toHaveAttribute('aria-pressed', 'true')
        await f.openPermission()
        await expect(f.planOption).toBeDisabled()
        await expect(f.planOption).toHaveAccessibleDescription(copy.session.permissionPicker.plan.goalPrepared)
        const cancel = f.permission.getByRole('button', {
          name: copy.session.permissionPicker.plan.cancelGoalPreparation,
          exact: true,
        })
        await visibleHit(cancel)
        await page.screenshot({ path: test.info().outputPath(`goal-prepared-${locale}-${width}.png`) })
        await cancel.click()
        await expect(f.planOption).toBeEnabled()
        await expect(f.planOption).toBeFocused()
        await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
        await f.checkDraft()
        expect(f.mode.writes).toEqual([])
        expect(await f.host.client.call('mode.get', { sessionId: f.a.id })).toEqual({ mode: 'default' })
        // Cancel only prepares the next explicit choice; it must not silently enter Plan.
        await f.planOption.click()
        await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'plan')
        expect(f.mode.writes).toEqual([{ sessionId: f.a.id, mode: 'plan' }])
        await f.goal().click()
        await expect(f.help).toContainText(copy.session.intent.blocked.reasons.plan)
        const exit = f.help.getByRole('button', { name: copy.session.intent.blocked.exitPlan, exact: true })
        await visibleHit(exit)
        await page.screenshot({ path: test.info().outputPath(`plan-blocks-goal-${locale}-${width}.png`) })
        await exit.click()
        await expect(f.help).toContainText(copy.session.intent.blocked.exited)
        await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
        await f.checkDraft()
        expect(f.mode.writes).toEqual([
          { sessionId: f.a.id, mode: 'plan' },
          { sessionId: f.a.id, mode: 'default' },
        ])
        await f.help.getByRole('button', { name: copy.session.intent.blocked.close, exact: true }).click()
        await expect(f.goal()).toBeFocused()
        await f.goal().click()
        await expect(cancelGoal).toHaveAttribute('aria-pressed', 'true')
        // Switching away preserves the prepared intent and text/materials only for A.
        await f.selectSession(f.b.title)
        await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
        await f.prompt.fill('Independent B draft — 独立B草稿')
        await expect(page.locator('.lumen-attachment-chip')).toHaveCount(0)
        await f.selectSession(f.a.title)
        await expect(cancelGoal).toHaveAttribute('aria-pressed', 'true')
        await f.checkDraft()
        await cancelGoal.click()
        await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: test.info().outputPath(`recovered-draft-${locale}-${width}.png`) })
        await f.noRunsOrGoals()
      } finally {
        await f.close()
      }
    })
  }

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`late Plan exit remains owned by A and unknown exit reconciles without a second write: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const f = await fixture(browser, locale, 1440)
    try {
      const labels = f.copy.session.intent.blocked
      await f.openPermission()
      await f.planOption.click()
      await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'plan')
      await f.goal().click()
      f.mode.fault('hold')
      await f.help.getByRole('button', { name: labels.exitPlan, exact: true }).click()
      await expect.poll(f.mode.held).toBe(true)
      expect(await f.host.client.call('mode.get', { sessionId: f.a.id })).toEqual({ mode: 'default' })
      // The confirmed Host reply is still held. Native light-dismiss must restore
      // the original Goal entry even if the pending action replaced its button.
      await f.page.keyboard.press('Escape')
      await expect(f.help).not.toBeVisible()
      await expect(f.goal()).toBeFocused()
      await f.selectSession(f.b.title)
      await f.prompt.fill('B keeps focus after A reply — B不被晚回复抢走')
      f.mode.release()
      await expect(f.page.getByRole('tab', { name: f.b.title, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(f.help).not.toBeVisible()
      await expectComposerText(f.prompt, 'B keeps focus after A reply — B不被晚回复抢走')
      await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
      await f.selectSession(f.a.title)
      await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'inherit')
      await f.checkDraft()
      await f.openPermission()
      await f.planOption.click()
      await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'plan')
      await f.goal().click()
      f.mode.fault('unknown')
      await f.help.getByRole('button', { name: labels.exitPlan, exact: true }).click()
      await expect(f.help).toContainText(labels.reasons.planUnknown)
      await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
      await expect(f.help.getByRole('button', { name: labels.exitPlan, exact: true })).toHaveCount(0)
      await f.checkDraft()
      const writesBefore = f.mode.writes.length
      const commandsBefore = f.mode.commands.length
      await f.page.screenshot({ path: test.info().outputPath(`unknown-exit-${locale}.png`) })
      await f.help.getByRole('button', { name: labels.reconcilePlan, exact: true }).click()
      await expect(f.help.getByRole('button', { name: labels.reconcilePlan, exact: true })).toHaveCount(0)
      await expect(f.permission.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'inherit')
      expect(f.mode.writes).toHaveLength(writesBefore)
      expect(f.mode.commands.slice(commandsBefore)).toContain('mode.get')
      expect(f.mode.commands.slice(commandsBefore)).not.toContain('mode.set')
      await expect(f.goal()).toHaveAttribute('aria-pressed', 'false')
      await f.help.getByRole('button', { name: labels.close, exact: true }).click()
      await f.goal().click()
      await expect(f.page.getByRole('button', { name: f.copy.session.intent.cancelGoal, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await f.checkDraft()
      expect(f.mode.writes.every((write) => write.sessionId === f.a.id)).toBe(true)
      expect(f.mode.writes.map((write) => write.mode)).toEqual(['plan', 'default', 'plan', 'default'])
      expect(await f.host.client.call('mode.get', { sessionId: f.b.id })).toEqual({ mode: 'default' })
      await f.noRunsOrGoals()
    } finally {
      await f.close()
    }
  })
}
