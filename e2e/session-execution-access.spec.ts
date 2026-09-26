import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createGoalPlanCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const evidence = 'artifacts/session-execution-access/evidence'
const phase =
  process.env.HBAR_EXECUTION_ACCESS_PHASE === 'baseline'
    ? 'baseline'
    : process.env.HBAR_EXECUTION_ACCESS_PHASE === 'development'
      ? 'development'
      : 'final'
const rpcEnvelope = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough()
const preparationCommands = new Set([
  'run.submit',
  'run.retry',
  'goal.create',
  'goal.set',
  'goal.resume',
  'session.setModel',
  'session.setThinkingLevel',
  'mode.set',
])

test.beforeAll(async () => {
  await mkdir(`${evidence}/${phase}`, { recursive: true })
})

async function removeOwnedRoot(root: string): Promise<void> {
  const resolved = await realpath(root)
  const temporary = await realpath(tmpdir())
  if (dirname(resolved) !== temporary || !basename(resolved).startsWith('hbar-execution-access-'))
    throw new Error('Refusing cleanup outside the owned temporary execution-access fixture')
  await rm(resolved, { recursive: true, force: true })
}

async function authenticate(context: BrowserContext, host: WebSessionHost): Promise<void> {
  expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
}

async function showSidebar(page: Page, locale: ShellLocale): Promise<void> {
  const show = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
}

async function hideSidebar(page: Page, locale: ShellLocale): Promise<void> {
  const hide = page.getByRole('button', { name: getShellCopy(locale).shell.hideSidebar, exact: true })
  if (await hide.isVisible()) await hide.click()
}

async function refreshRoster(page: Page, host: WebSessionHost, locale: ShellLocale, archived = true): Promise<void> {
  const labels = getShellCopy(locale).shell
  await showSidebar(page, locale)
  await page.getByTitle(labels.workspaceActions(host.ready.workspaceName), { exact: true }).click()
  await page
    .getByRole('menuitem', { name: labels.roster.refreshWorkspace(host.ready.workspaceName), exact: true })
    .click()
  await expect(page.locator(`[data-session-id="${host.ready.sessionId}"]`)).toHaveCount(archived ? 0 : 1)
}

async function dropFile(page: Page, name: string): Promise<void> {
  const transfer = await page.evaluateHandle((fileName) => {
    const data = new DataTransfer()
    data.items.add(new File(['Owned unsent fixture attachment'], fileName, { type: 'text/plain' }))
    return data
  }, name)
  try {
    await page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: transfer })
  } finally {
    await transfer.dispose()
  }
}

async function assertNoticeFirstLine(page: Page): Promise<void> {
  const flow = await page
    .locator('[data-session-execution-access="archived"] .hbar-session-execution-summary')
    .evaluate((summary) => {
      const icon = summary.querySelector('.lumen-icon')
      const copy = summary.querySelector('.hbar-session-execution-copy')
      if (!icon || !copy) throw new Error('The archived status must contain its icon and localized explanation')
      const image = icon.getBoundingClientRect()
      const text = copy.getBoundingClientRect()
      const textStyle = getComputedStyle(copy)
      const lineHeight = Number.parseFloat(textStyle.lineHeight) || Number.parseFloat(textStyle.fontSize) * 1.5
      return {
        display: getComputedStyle(summary).display,
        wrap: getComputedStyle(summary).flexWrap,
        sameFirstLine: image.top < text.top + lineHeight && image.bottom > text.top,
        iconBeforeCopy: image.right <= text.left + 1,
      }
    })
  expect(flow).toEqual({ display: 'flex', wrap: 'nowrap', sameFirstLine: true, iconBeforeCopy: true })
}

async function observeWrites(page: Page) {
  const commands: string[] = []
  const uploads: string[] = []
  const restoreIds = new Set<string | number>()
  let holdRestore = false
  let releaseRestore: (() => void) | null = null
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/artifacts') uploads.push(request.url())
  })
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcEnvelope.safeParse(JSON.parse(message))
        const command = parsed.success
          ? parsed.data.method === 'command.execute'
            ? parsed.data.params?.commandId
            : parsed.data.method
          : undefined
        if (command && preparationCommands.has(command)) commands.push(command)
        if (parsed.success && command === 'session.archive' && parsed.data.id !== undefined) {
          const input = z.object({ archived: z.boolean() }).passthrough().safeParse(parsed.data.params?.input)
          if (input.success && !input.data.archived) restoreIds.add(parsed.data.id)
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcEnvelope.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined && restoreIds.delete(parsed.data.id) && holdRestore) {
          releaseRestore = () => socket.send(message)
          return
        }
      }
      socket.send(message)
    })
  })
  return {
    commands,
    uploads,
    holdRestore: () => {
      holdRestore = true
    },
    hasHeldRestoreReply: () => releaseRestore !== null,
    releaseRestore: () => {
      if (!releaseRestore) throw new Error('The actual Host restore reply is not held')
      const release = releaseRestore
      releaseRestore = null
      holdRestore = false
      release()
    },
  }
}

async function loseOneAcceptedReply(page: Page, commandId: string, holdAcceptedReply = false) {
  const commands: string[] = []
  const ids = new Set<string | number>()
  const receiptIds = new Set<string | number>()
  let hideReceipt = false
  let releaseLostReply: (() => void) | null = null
  let lost = false
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcEnvelope.safeParse(JSON.parse(message))
        if (parsed.success) {
          const command = parsed.data.method === 'command.execute' ? parsed.data.params?.commandId : parsed.data.method
          if (command) commands.push(command)
          if (command === commandId && parsed.data.id !== undefined) ids.add(parsed.data.id)
          if (
            (command === 'session.getModelReceipt' || command === 'command.getReceipt') &&
            parsed.data.id !== undefined
          )
            receiptIds.add(parsed.data.id)
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcEnvelope.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined && receiptIds.delete(parsed.data.id) && hideReceipt) {
          // Fault injection replaces only this read result. The Host receipt is not removed or rewritten.
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: parsed.data.id, result: null }))
          return
        }
        if (parsed.success && parsed.data.id !== undefined && ids.delete(parsed.data.id) && !lost) {
          lost = true
          // Forwarded request was really executed by the Host. Only its reply is lost to this observer.
          const replacement = JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.data.id,
            error: { code: -32603, message: 'Owned fixture hides the accepted reply', data: 'RESULT_UNKNOWN' },
          })
          if (holdAcceptedReply) releaseLostReply = () => socket.send(replacement)
          else socket.send(replacement)
          return
        }
      }
      socket.send(message)
    })
  })
  return {
    commands,
    replyWasLost: () => lost,
    hasHeldAcceptedReply: () => releaseLostReply !== null,
    releaseAcceptedAsUnknown: () => {
      if (!releaseLostReply) throw new Error('The actual accepted reply is not held')
      const release = releaseLostReply
      releaseLostReply = null
      release()
    },
    hideReceipt: (hidden: boolean) => {
      hideReceipt = hidden
    },
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`external archive gates new execution but preserves both loaded observers and explicit restore: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-execution-access-observer-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const narrowContext = await browser.newContext({ locale, viewport: { width: 320, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await mkdir(`${evidence}/${phase}`, { recursive: true })
      host = await startWebSessionHost({ root, port, historyCount: 4, goalAutoContinue: false })
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const models = createModelCommandClient(host.client)
      const configuration = createConfigurationCommandClient(host.client)
      const goals = createGoalPlanCommandClient(host.client)
      const sessionId = host.ready.sessionId
      const title = 'Original A — 外部归档后保留的会话与原始草稿'
      await sessions.execute('session.rename', { sessionId, title })
      await goals.execute('goal.set', { sessionId, objective: 'Existing paused Goal — 原目标', status: 'paused' })
      await authenticate(context, host)
      await authenticate(narrowContext, host)
      const page = await context.newPage()
      const narrow = await narrowContext.newPage()
      const copy = getShellCopy(locale)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      narrow.on('pageerror', (error) => errors.push(error.message))
      const writes = await observeWrites(page)
      const narrowWrites = await observeWrites(narrow)
      const draft = 'Original unsent text — 用户原稿不能被归档删除'
      const narrowDraft = 'Independent narrow draft — 窄屏观察器原稿'
      const attachmentName = 'original-unsent.txt'
      for (const [observer, value] of [
        [page, draft],
        [narrow, narrowDraft],
      ] as const) {
        await observer.goto(base)
        await showSidebar(observer, locale)
        await observer.getByRole('button', { name: copy.shell.openSession(title), exact: true }).click()
        const prompt = observer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
        await expect(prompt).toBeEditable()
        await prompt.fill(value)
        await dropFile(observer, attachmentName)
        await expect(observer.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
      }
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const files = page.locator('.hbar-app-react-file-workspace')
      await expect(files).toBeVisible()
      const modelBefore = await models.execute('session.getModel', { sessionId })
      const modeBefore = await configuration.execute('mode.get', { sessionId })
      const goalBefore = await goals.execute('goal.snapshot', { sessionId })
      const writeCount = writes.commands.length
      const uploadCount = writes.uploads.length
      const narrowWriteCount = narrowWrites.commands.length
      const narrowUploadCount = narrowWrites.uploads.length
      const archived = await sessions.execute('session.archive', { sessionId, archived: true })
      expect(archived.archived).toBe(true)
      await refreshRoster(page, host, locale)
      await refreshRoster(narrow, host, locale)
      await hideSidebar(narrow, locale)
      await expect(page.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
      await expect(narrow.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const narrowPrompt = narrow.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expectComposerText(prompt, draft)
      await expectComposerText(narrowPrompt, narrowDraft)
      await expect(page.getByText('History message 4', { exact: true })).toBeVisible()
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
      await expect(files).toBeVisible()
      await page.screenshot({ path: `${evidence}/${phase}/external-archive-${locale}-1440.png` })
      await narrow.screenshot({ path: `${evidence}/${phase}/external-archive-${locale}-320.png` })
      // First-red baseline is captured above before this assertion; the final source must pass it.
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
      await expect(narrow.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
      await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
      await expect(narrow.locator('[data-session-execution-access="archived"]')).toBeVisible()
      await assertNoticeFirstLine(page)
      await assertNoticeFirstLine(narrow)
      await expect(page.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.session.intent.goal, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.session.intent.clear, exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: copy.session.prompt.addAttachment, exact: true })).toBeDisabled()
      await narrowPrompt.press('Enter')
      await dropFile(narrow, 'must-not-upload-after-archive.txt')
      await expect(
        narrow.locator('.lumen-attachment-chip').filter({ hasText: 'must-not-upload-after-archive.txt' }),
      ).toHaveCount(0)
      await page.locator('.hbar-composer-model-trigger').click()
      const popup = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      await expect(popup.getByRole('option')).not.toHaveCount(0)
      for (const option of await popup.getByRole('option').all()) await expect(option).toBeDisabled()
      await page.screenshot({ path: `${evidence}/${phase}/readonly-model-${locale}-1440.png` })
      await popup.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()
      await expect(narrow.locator('.hbar-composer-thinking-trigger')).toBeDisabled()
      await narrow.locator('.hbar-composer-model-trigger').click()
      const narrowModel = narrow.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      for (const option of await narrowModel.getByRole('option').all()) await expect(option).toBeDisabled()
      expect(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await narrow.screenshot({ path: `${evidence}/${phase}/readonly-model-${locale}-320.png` })
      await narrowModel.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()
      const picker = page.locator('.hbar-composer-permission-picker')
      await picker.locator('.hbar-composer-permission-trigger').click()
      for (const option of await picker.getByRole('menuitemradio').all()) await expect(option).toBeDisabled()
      await expect(
        picker.getByRole('menuitemcheckbox', { name: copy.session.permissionPicker.plan.label }),
      ).toBeDisabled()
      await page.screenshot({ path: `${evidence}/${phase}/readonly-permission-plan-${locale}-1440.png` })
      await picker.getByRole('button', { name: copy.session.permissionPicker.close, exact: true }).click()
      expect(writes.commands).toHaveLength(writeCount)
      expect(writes.uploads).toHaveLength(uploadCount)
      expect(narrowWrites.commands).toHaveLength(narrowWriteCount)
      expect(narrowWrites.uploads).toHaveLength(narrowUploadCount)
      expect(await models.execute('session.getModel', { sessionId })).toEqual(modelBefore)
      expect(await configuration.execute('mode.get', { sessionId })).toEqual(modeBefore)
      expect(await goals.execute('goal.snapshot', { sessionId })).toEqual(goalBefore)
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(0)
      await expectComposerText(prompt, draft)
      await expectComposerText(narrowPrompt, narrowDraft)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `${evidence}/${phase}/gated-${locale}-1440.png` })
      await narrow.screenshot({ path: `${evidence}/${phase}/gated-${locale}-320.png` })
      const notice = page.locator('[data-session-execution-access="archived"]')
      await expect(notice).toContainText(copy.session.executionAccess.archived)
      expect(await notice.evaluate((element) => Boolean(element.closest('.hbar-app-react-session-footer')))).toBe(true)
      await notice
        .getByRole('button', { name: copy.session.executionAccess.openArchived(host.ready.workspaceName), exact: true })
        .click()
      const list = page.getByRole('region', {
        name: copy.shell.archive.listTitle(host.ready.workspaceName),
        exact: true,
      })
      await expect(list).toBeVisible()
      await expect(files).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      writes.holdRestore()
      await list.getByRole('button', { name: copy.shell.archive.restoreSession(title), exact: true }).click()
      await expect.poll(writes.hasHeldRestoreReply).toBe(true)
      // Host really restored it, but this observer has not received that response/fact yet.
      expect((await sessions.execute('session.get', { sessionId }))?.archived).toBe(false)
      await expect(notice).toBeVisible()
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expectComposerText(prompt, draft)
      await page.screenshot({ path: `${evidence}/${phase}/restore-reply-held-${locale}-1440.png` })
      writes.releaseRestore()
      await expect.poll(async () => (await sessions.execute('session.get', { sessionId }))?.archived).toBe(false)
      await expect(notice).toHaveCount(0)
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeEnabled()
      await expect(page.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expectComposerText(prompt, draft)
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
      await expect(files).toBeVisible()
      await list.getByRole('button', { name: copy.shell.archive.close, exact: true }).click()
      await refreshRoster(narrow, host, locale, false)
      await hideSidebar(narrow, locale)
      await expect(narrow.locator('[data-session-execution-access]')).toHaveCount(0)
      await expect(narrow.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeEnabled()
      await expect(narrow.getByRole('tab', { name: title, exact: true })).toHaveCount(0)
      await expectComposerText(narrowPrompt, narrowDraft)
      await page.screenshot({ path: `${evidence}/${phase}/restored-${locale}-1440.png` })
      await narrow.screenshot({ path: `${evidence}/${phase}/restored-${locale}-320.png` })
      await writeFile(
        `${evidence}/${phase}/observations-${locale}.json`,
        JSON.stringify(
          {
            archived,
            draft,
            narrowDraft,
            modelBefore,
            modeBefore,
            goalBefore,
            writes: writes.commands,
            uploads: writes.uploads.length,
            narrowWrites: narrowWrites.commands,
            narrowUploads: narrowWrites.uploads.length,
            errors,
          },
          null,
          2,
        ),
      )
      expect(errors).toEqual([])
    } finally {
      await context.close()
      await narrowContext.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedRoot(root)
    }
  })
}

for (const kind of ['model', 'mode', 'run'] as const) {
  test(`archived original ${kind} unknown intent remains read-only reconcilable without a second write`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-execution-access-unknown-'))
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await mkdir(`${evidence}/${phase}`, { recursive: true })
      host = await startWebSessionHost({ root, port, goalAutoContinue: false })
      const originalHost = host
      const sessionId = host.ready.sessionId
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const models = createModelCommandClient(host.client)
      const copy = getShellCopy('en-US')
      await authenticate(context, host)
      const page = await context.newPage()
      const command = kind === 'model' ? 'session.setThinkingLevel' : kind === 'mode' ? 'mode.set' : 'run.submit'
      const intercepted = await loseOneAcceptedReply(page, command)
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = `Original ${kind} unknown draft — 未确认时保留原目标`
      await expect(prompt).toBeEditable()
      await prompt.fill(draft)
      if (kind === 'model') {
        await page.locator('.hbar-composer-thinking-trigger').click()
        const slider = page.getByRole('slider', { name: copy.session.modelPicker.thinking, exact: true })
        await slider.focus()
        await page.keyboard.press('End')
        await page.keyboard.press('Enter')
        await expect(
          page
            .getByRole('dialog', { name: copy.session.modelPicker.thinking, exact: true })
            .getByText(copy.session.modelPicker.unknown),
        ).toBeVisible()
        expect((await models.execute('session.getModel', { sessionId })).thinkingLevel).toBe('max')
      } else if (kind === 'mode') {
        const picker = page.locator('.hbar-composer-permission-picker')
        await picker.locator('.hbar-composer-permission-trigger').click()
        await picker.getByRole('menuitemcheckbox', { name: copy.session.permissionPicker.plan.label }).click()
        await expect(picker.getByText(copy.session.permissionPicker.plan.unknown)).toBeVisible()
        expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
      } else {
        await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
        await expect(page.getByRole('button', { name: copy.session.intent.reconcile, exact: true })).toBeVisible()
        await expect
          .poll(async () =>
            (await originalHost.client.call('session.snapshot', { sessionId })).runs.map((run) => run.status),
          )
          .toEqual(['completed'])
        // A newer scratch edit must survive receipt reconciliation of the already accepted Run.
        await prompt.fill(`${draft} — newer edit after the lost reply`)
      }
      expect(intercepted.replyWasLost()).toBe(true)
      expect(intercepted.commands.filter((value) => value === command)).toHaveLength(1)
      await sessions.execute('session.archive', { sessionId, archived: true })
      await refreshRoster(page, host, 'en-US')
      await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
      const before = intercepted.commands.length
      if (kind === 'model') {
        await page.locator('.hbar-composer-model-trigger').click()
        const dialog = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
        await expect(
          dialog.getByRole('button', { name: copy.session.modelPicker.reconcile, exact: true }),
        ).toBeEnabled()
        intercepted.hideReceipt(true)
        await dialog.getByRole('button', { name: copy.session.modelPicker.reconcile, exact: true }).click()
        await expect
          .poll(() => intercepted.commands.filter((value) => value === 'session.getModelReceipt').length)
          .toBe(1)
        await expect(
          dialog.getByRole('button', { name: copy.session.modelPicker.reconcile, exact: true }),
        ).toBeEnabled()
        await expect(dialog.getByText(copy.session.modelPicker.unknown)).toBeVisible()
        expect(intercepted.commands.filter((value) => value === command)).toHaveLength(1)
        intercepted.hideReceipt(false)
        await dialog.getByRole('button', { name: copy.session.modelPicker.reconcile, exact: true }).click()
        await expect(dialog.getByText(copy.session.modelPicker.unknown)).toHaveCount(0)
        await expect(page.locator('.hbar-composer-thinking-trigger')).toHaveText(
          copy.session.modelPicker.thinkingLevel('max'),
        )
        expect(intercepted.commands.slice(before)).toContain('session.getModelReceipt')
      } else if (kind === 'mode') {
        const picker = page.locator('.hbar-composer-permission-picker')
        await picker.locator('.hbar-composer-permission-trigger').click()
        await expect(
          picker.getByRole('button', { name: copy.session.permissionPicker.plan.recheck, exact: true }),
        ).toBeEnabled()
        await picker.getByRole('button', { name: copy.session.permissionPicker.plan.recheck, exact: true }).click()
        await expect(picker.getByText(copy.session.permissionPicker.plan.unknown)).toHaveCount(0)
        await expect(
          picker.getByRole('menuitemcheckbox', { name: copy.session.permissionPicker.plan.label }),
        ).toBeDisabled()
      } else {
        await page.getByRole('button', { name: copy.session.intent.reconcile, exact: true }).click()
        await expect(page.getByRole('button', { name: copy.session.intent.reconcile, exact: true })).toHaveCount(0)
        expect(intercepted.commands.slice(before)).toContain('command.getReceipt')
      }
      expect(intercepted.commands.filter((value) => value === command)).toHaveLength(1)
      expect(intercepted.commands.slice(before).filter((value) => preparationCommands.has(value))).toEqual([])
      await expectComposerText(prompt, kind === 'run' ? `${draft} — newer edit after the lost reply` : draft)
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
      await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(kind === 'run' ? 1 : 0)
      await page.screenshot({ path: `${evidence}/${phase}/unknown-${kind}-reconciled-1440.png` })
      await writeFile(
        `${evidence}/${phase}/unknown-${kind}.json`,
        JSON.stringify(
          {
            command,
            commands: intercepted.commands,
            accepted: await sessions.execute('session.get', { sessionId }),
            onlyReadsAfterArchive: intercepted.commands.slice(before),
            runCount: kind === 'run' ? 1 : 0,
          },
          null,
          2,
        ),
      )
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedRoot(root)
    }
  })
}

test('original active approval rejects archive as BUSY and Stop cancels without executing the tool', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-execution-access-active-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 320, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port, goalAutoContinue: false })
    const sessionId = host.ready.sessionId
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const runs = createRunCommandClient(host.client)
    const copy = getShellCopy('en-US')
    await authenticate(context, host)
    const page = await context.newPage()
    await page.goto(base)
    await showSidebar(page, 'en-US')
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await expect(prompt).toBeEditable()
    const accepted = await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: {
          text: '/tool write_file {"path":"must-not-execute.txt","text":"cancel this original tool"}',
          images: [],
          approval: 'ask',
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('waiting_approval')
    await expect(sessions.execute('session.archive', { sessionId, archived: true })).rejects.toMatchObject({
      code: 'BUSY',
    })
    await expect(page.locator('[data-session-execution-access="archived"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: copy.session.prompt.stop, exact: true })).toBeEnabled()
    await page.screenshot({ path: `${evidence}/${phase}/active-busy-stop-320.png` })
    await page.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('cancelled')
    expect(existsSync(join(root, 'must-not-execute.txt'))).toBe(false)
    expect((await sessions.execute('session.get', { sessionId }))?.archived).toBe(false)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedRoot(root)
  }
})

test('archive A never gates B; explicit restore and rapid A/B selection retain each original draft', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-execution-access-switch-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 320, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port, sessionCount: 2, goalAutoContinue: false })
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const all = await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
    const a = all.items.find((session) => session.id === host?.ready.sessionId)
    const b = all.items.find((session) => session.id !== host?.ready.sessionId)
    if (!a || !b) throw new Error('The isolated two-session fixture is incomplete')
    const models = createModelCommandClient(host.client)
    const bModel = await models.execute('session.getModel', { sessionId: b.id })
    await models.execute(
      'session.setModel',
      { sessionId: b.id, modelId: 'local-fixture', baselineRevisions: bModel.revisions },
      { idempotencyKey: crypto.randomUUID() },
    )
    const copy = getShellCopy('zh-CN')
    await authenticate(context, host)
    const page = await context.newPage()
    await page.goto(base)
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await showSidebar(page, 'zh-CN')
    await page.getByRole('button', { name: copy.shell.openSession(a.title), exact: true }).click()
    await expect(prompt).toBeEditable()
    await prompt.fill('Draft A — A原始草稿')
    await showSidebar(page, 'zh-CN')
    await page.getByRole('button', { name: copy.shell.openSession(b.title), exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title)
    await prompt.fill('Draft B — B原始草稿')
    await sessions.execute('session.archive', { sessionId: a.id, archived: true })
    await refreshRoster(page, host, 'zh-CN')
    await hideSidebar(page, 'zh-CN')
    await expect(page.locator('[data-session-execution-access]')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title)
    await expectComposerText(prompt, 'Draft B — B原始草稿')
    await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeEnabled()
    await showSidebar(page, 'zh-CN')
    await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).click()
    await page
      .getByRole('menuitem', { name: copy.shell.archive.openList(host.ready.workspaceName), exact: true })
      .click()
    const list = page.getByRole('region', { name: copy.shell.archive.listTitle(host.ready.workspaceName), exact: true })
    await list.getByRole('button', { name: copy.shell.archive.restoreSession(a.title), exact: true }).click()
    await expect.poll(async () => (await sessions.execute('session.get', { sessionId: a.id }))?.archived).toBe(false)
    await list.getByRole('button', { name: copy.shell.archive.close, exact: true }).click()
    await hideSidebar(page, 'zh-CN')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title)
    await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveCount(0)
    await showSidebar(page, 'zh-CN')
    await page.getByRole('button', { name: copy.shell.openSession(a.title), exact: true }).click()
    await expectComposerText(prompt, 'Draft A — A原始草稿')
    for (const title of [b.title, a.title, b.title, a.title])
      await page.getByRole('tab', { name: title, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(a.title)
    await expectComposerText(prompt, 'Draft A — A原始草稿')
    await expect(page.locator('[data-session-execution-access]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeEnabled()
    await page.screenshot({ path: `${evidence}/${phase}/rapid-a-b-restored-zh-CN-320.png` })
    expect((await host.client.call('session.snapshot', { sessionId: a.id })).runs).toHaveLength(0)
    expect((await host.client.call('session.snapshot', { sessionId: b.id })).runs).toHaveLength(0)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedRoot(root)
  }
})

test('archived completed proposal cannot create a detached Run while its document remains readable', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-execution-access-proposal-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 320, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port, goalAutoContinue: false })
    const originalHost = host
    const sessionId = host.ready.sessionId
    const runs = createRunCommandClient(host.client)
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const copy = getShellCopy('en-US')
    const markdown =
      '# Original completed proposal\n\n1. Preserve the original target.\n2. Do not create a new archived Run.'
    const accepted = await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: {
          text: `Original proposal context\n\n<proposed_plan>\n${markdown}\n</proposed_plan>`,
          images: [],
          mode: 'plan',
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('completed')
    const snapshot = await host.client.call('session.snapshot', { sessionId })
    expect(snapshot.runs.find((run) => run.id === accepted.operationId)?.input.mode).toBe('plan')
    const message = snapshot.messages.find((item) => item.runId === accepted.operationId && item.role === 'assistant')
    if (!message) throw new Error('Actual completed assistant proposal is missing')
    await authenticate(context, host)
    const page = await context.newPage()
    const writes = await observeWrites(page)
    await page.goto(base)
    await showSidebar(page, 'en-US')
    await page.getByRole('button', { name: copy.shell.openSession(snapshot.session.title), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await expect(prompt).toBeEditable()
    await prompt.fill('Unsent proposal-independent draft')
    const proposal = page.locator(`[data-proposal-message="${message.id}"]`)
    await expect(proposal.getByRole('button', { name: copy.session.proposedPlan.implement, exact: true })).toBeEnabled()
    await sessions.execute('session.archive', { sessionId, archived: true })
    await refreshRoster(page, host, 'en-US')
    await hideSidebar(page, 'en-US')
    await expect(
      proposal.getByRole('button', { name: copy.session.proposedPlan.implement, exact: true }),
    ).toBeDisabled()
    await expect(
      proposal.getByRole('button', { name: copy.session.proposedPlan.continuePlanning, exact: true }),
    ).toBeDisabled()
    await expect(proposal.getByRole('region', { name: copy.session.proposedPlan.document, exact: true })).toContainText(
      'Preserve the original target.',
    )
    await expectComposerText(prompt, 'Unsent proposal-independent draft')
    expect(writes.commands).toEqual([])
    expect((await originalHost.client.call('session.snapshot', { sessionId })).runs).toHaveLength(1)
    await proposal.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${evidence}/${phase}/archived-detached-proposal-320.png` })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedRoot(root)
  }
})

test('same-Run Plan Exit is not a new-Run gate; active archive is BUSY and its original decision remains usable', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-execution-access-plan-exit-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 320, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port, goalAutoContinue: false })
    const originalHost = host
    const sessionId = host.ready.sessionId
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const runs = createRunCommandClient(host.client)
    await createConfigurationCommandClient(host.client).execute('mode.set', { sessionId, mode: 'plan' })
    const markdown = '# 同轮 Plan Exit\n\n保持原始 Run 和目标。'
    const accepted = await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: { text: `/tool exit_plan_mode ${JSON.stringify({ plan: markdown })}`, images: [], approval: 'allow' },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () =>
        (await originalHost.client.call('session.snapshot', { sessionId })).approvals.some(
          (item) => item.tool === 'exit_plan_mode' && item.status === 'pending',
        ),
      )
      .toBe(true)
    const snapshot = await host.client.call('session.snapshot', { sessionId })
    const approval = snapshot.approvals.find((item) => item.tool === 'exit_plan_mode' && item.status === 'pending')
    if (!approval) throw new Error('Actual pending same-Run Plan Exit is missing')
    await authenticate(context, host)
    const copy = getShellCopy('zh-CN')
    const page = await context.newPage()
    const writes = await observeWrites(page)
    await page.goto(base)
    await showSidebar(page, 'zh-CN')
    await page.getByRole('button', { name: copy.shell.openSession(snapshot.session.title), exact: true }).click()
    await expect(sessions.execute('session.archive', { sessionId, archived: true })).rejects.toMatchObject({
      code: 'BUSY',
    })
    const card = page.locator(`[data-decision-id="${approval.id}"]`)
    await expect(
      card.getByRole('button', { name: copy.session.decisions.planExit.implement, exact: true }),
    ).toBeEnabled()
    await expect(
      card.getByRole('button', { name: copy.session.decisions.planExit.continuePlanning, exact: true }),
    ).toBeEnabled()
    await expect(page.getByRole('button', { name: copy.session.prompt.stop, exact: true })).toBeEnabled()
    await expect(page.locator('[data-session-execution-access="archived"]')).toHaveCount(0)
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${evidence}/${phase}/same-run-plan-exit-busy-320.png` })
    await card
      .getByRole('textbox', { name: copy.session.decisions.planExit.feedback, exact: true })
      .fill('继续检查原目标，不派发新Run')
    await card.getByRole('button', { name: copy.session.decisions.planExit.continuePlanning, exact: true }).click()
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('completed')
    await expect(card.getByRole('status')).toHaveText(copy.session.decisions.planExit.continued)
    expect(writes.commands).toEqual([])
    expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(1)
    await sessions.execute('session.archive', { sessionId, archived: true })
    await refreshRoster(page, host, 'zh-CN')
    await hideSidebar(page, 'zh-CN')
    await expect(card.getByRole('status')).toHaveText(copy.session.decisions.planExit.continued)
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedRoot(root)
  }
})

test('archived unknown run.retry keeps only the original read-only receipt action, never a second retry', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-execution-access-retry-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 320, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port, goalAutoContinue: false })
    const originalHost = host
    const sessionId = host.ready.sessionId
    const runs = createRunCommandClient(host.client)
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const accepted = await runs.execute(
      'run.submit',
      { sessionId, modelId: 'local-fixture', input: { text: '/fail original safe local fixture', images: [] } },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('failed')
    const snapshot = await host.client.call('session.snapshot', { sessionId })
    const copy = getShellCopy('en-US')
    await authenticate(context, host)
    const page = await context.newPage()
    const intercepted = await loseOneAcceptedReply(page, 'run.retry', true)
    await page.goto(base)
    await showSidebar(page, 'en-US')
    await page.getByRole('button', { name: copy.shell.openSession(snapshot.session.title), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await expect(prompt).toBeEditable()
    const draft = 'Retry-independent unsent draft — 不消费原稿'
    await prompt.fill(draft)
    const original = page.locator(`[data-run-id="${accepted.operationId}"]`)
    await original.getByRole('button', { name: copy.session.runs.retryLabel, exact: true }).click()
    await expect.poll(intercepted.hasHeldAcceptedReply).toBe(true)
    await expect
      .poll(async () =>
        (await originalHost.client.call('session.snapshot', { sessionId })).runs.map((run) => run.status),
      )
      .toEqual(['failed', 'failed'])
    await page.getByRole('button', { name: copy.session.runs.details(2), exact: true }).click()
    await expect(original.getByRole('button', { name: copy.session.runs.retryingLabel, exact: true })).toBeDisabled()
    await expect(original.getByRole('button', { name: copy.session.runs.recheckingLabel, exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${evidence}/${phase}/retry-original-request-held-320.png` })
    intercepted.releaseAcceptedAsUnknown()
    await expect(original.getByRole('button', { name: copy.session.runs.recheckLabel, exact: true })).toBeEnabled()
    expect(intercepted.replyWasLost()).toBe(true)
    expect(intercepted.commands.filter((command) => command === 'run.retry')).toHaveLength(1)
    await sessions.execute('session.archive', { sessionId, archived: true })
    await refreshRoster(page, host, 'en-US')
    await hideSidebar(page, 'en-US')
    await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
    const check = original.getByRole('button', { name: copy.session.runs.recheckLabel, exact: true })
    await expect(check).toBeEnabled()
    await expect(page.getByRole('button', { name: copy.session.runs.retryLabel, exact: true })).toHaveCount(0)
    const before = intercepted.commands.length
    intercepted.hideReceipt(true)
    await check.click()
    await expect
      .poll(() => intercepted.commands.slice(before).filter((command) => command === 'command.getReceipt').length)
      .toBe(1)
    await expect(check).toBeEnabled()
    expect(intercepted.commands.filter((command) => command === 'run.retry')).toHaveLength(1)
    await page.screenshot({ path: `${evidence}/${phase}/unknown-retry-no-receipt-320.png` })
    intercepted.hideReceipt(false)
    await check.click()
    await expect(check).toHaveCount(0)
    expect(intercepted.commands.slice(before).filter((command) => preparationCommands.has(command))).toEqual([])
    expect(intercepted.commands.filter((command) => command === 'run.retry')).toHaveLength(1)
    expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(2)
    await expectComposerText(prompt, draft)
    await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
    await page.screenshot({ path: `${evidence}/${phase}/unknown-retry-confirmed-320.png` })
    await writeFile(
      `${evidence}/${phase}/unknown-retry.json`,
      JSON.stringify(
        {
          originalRunId: accepted.operationId,
          commands: intercepted.commands,
          readOnlyAfterArchive: intercepted.commands.slice(before),
          totalRuns: 2,
          draft,
        },
        null,
        2,
      ),
    )
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedRoot(root)
  }
})
