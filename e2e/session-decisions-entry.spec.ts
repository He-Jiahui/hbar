import { expect, test } from '@playwright/test'
import { createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

const rpcRequest = z
  .object({ method: z.string(), params: z.object({ commandId: z.string().optional() }).passthrough().optional() })
  .passthrough()

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`tool decisions stay with their original calls and retain confirmed outcomes: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-decisions-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    const labels = copy.session.decisions
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const targetHost = host
      const sessionId = host.ready.sessionId
      const runs = createRunCommandClient(host.client)
      const other = await createWorkspaceSessionCommandClient(host.client).execute(
        'session.create',
        { workspaceId: host.ready.workspaceId, title: 'Other decision session' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool edit_file {"path":"browser-e2e.md","oldText":"# Browser file","newText":"# Approved edit"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () =>
          (await targetHost.client.call('session.snapshot', { sessionId })).approvals.some(
            (approval) => approval.status === 'pending',
          ),
        )
        .toBe(true)
      const initial = await host.client.call('session.snapshot', { sessionId })
      const approval = initial.approvals.find((value) => value.status === 'pending')!
      const callMessage = initial.messages.find(
        (message) =>
          message.role === 'assistant' &&
          message.runId === approval.runId &&
          message.content.some((block) => block.type === 'tool_call' && block.callId === approval.callId),
      )!
      expect(callMessage).toBeDefined()
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      let holdDecision = false
      const heldDecision: { release: (() => void) | null } = { release: null }
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string' && holdDecision) {
            const parsed = rpcRequest.safeParse(JSON.parse(message))
            if (parsed.success && (parsed.data.params?.commandId ?? parsed.data.method) === 'approval.resolve') {
              holdDecision = false
              heldDecision.release = () => server.send(message)
              return
            }
          }
          server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: initial.session.title, exact: true }).click()
      const source = page.locator(`[data-message-id="${callMessage.id}"]`)
      const card = source.locator(`[data-decision-id="${approval.id}"]`)
      await expect(card).toBeVisible()
      await expect(page.locator(`[data-decision-id="${approval.id}"]`)).toHaveCount(1)
      await expect(card).toContainText('browser-e2e.md')
      await expect(card).toContainText('# Browser file')
      await expect(card).toContainText('# Approved edit')
      await expect(card.getByRole('button', { name: labels.allow, exact: true })).toBeEnabled()
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await card.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`approval-pending-${locale}-${width}.png`) })
      }
      await card.getByRole('button', { name: labels.allow, exact: true }).focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await expect(card.getByRole('status')).toHaveText(labels.allowed)
      await expect(card.getByRole('button', { name: labels.allow, exact: true })).toHaveCount(0)
      await expect(card).toBeFocused()
      await expect(card).toHaveAccessibleDescription(labels.allowed)
      expect(await card.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('completed')
      expect(await readFile(join(root, 'browser-e2e.md'), 'utf8')).toBe('# Approved edit\n')
      const approvalEvents = await host.client.call('session.follow', { sessionId, cursor: initial.cursor })
      const resolutions = approvalEvents.events.filter((event) => event.type === 'approval.resolved')
      expect(resolutions).toHaveLength(1)
      expect(resolutions[0]).toMatchObject({
        sessionId,
        runId: approval.runId,
        data: { id: approval.id, callId: approval.callId, status: 'allowed' },
      })
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`approval-confirmed-${locale}-320.png`) })

      await page.reload()
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('treeitem', { name: initial.session.title, exact: true }).click()
      await expect(card.getByRole('status')).toHaveText(labels.allowed)
      await expect(page.locator(`[data-decision-id="${approval.id}"]`)).toHaveCount(1)
      await expect(card.getByRole('button', { name: labels.allow, exact: true })).toHaveCount(0)
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(1)
      await page.screenshot({ path: testInfo.outputPath(`approval-restored-${locale}-320.png`) })

      const questions = [
        {
          id: 'placement',
          header: 'Placement',
          question: 'Where should this decision appear?',
          options: [
            { label: 'Inline', description: 'Directly after the source call' },
            { label: 'Run area', description: 'Outside the message' },
          ],
          isOther: true,
        },
        {
          id: 'verification',
          header: 'Verification',
          question: 'Describe the required verification.',
          options: [],
          isOther: true,
        },
      ]
      const questionRun = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: { text: `/tool request_user_input ${JSON.stringify({ questions })}`, images: [], mode: 'plan' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await targetHost.client.call('session.snapshot', { sessionId })).userInputs.length)
        .toBe(1)
      const pending = await host.client.call('session.snapshot', { sessionId })
      const request = pending.userInputs[0]!
      const questionMessage = pending.messages.find(
        (message) =>
          message.role === 'assistant' &&
          message.runId === request.runId &&
          message.content.some((block) => block.type === 'tool_call' && block.callId === request.callId),
      )!
      const questionSource = page.locator(`[data-message-id="${questionMessage.id}"]`)
      const questionnaire = questionSource.locator(`[data-decision-id="${request.requestId}"]`)
      await expect(questionnaire).toBeVisible()
      await expect(page.locator(`[data-decision-id="${request.requestId}"]`)).toHaveCount(1)
      await expect(questionnaire.getByRole('button', { name: labels.submit, exact: true })).toBeDisabled()
      await questionnaire.getByRole('radio', { name: /Inline/ }).check()
      await questionnaire.getByRole('tab', { name: 'Placement', exact: true }).focus()
      await page.keyboard.press('ArrowRight')
      await expect(questionnaire.getByRole('tab', { name: 'Verification', exact: true })).toBeFocused()
      const answer = 'Verify keyboard, persistence, and narrow screens — 核对键盘、恢复和窄屏。'
      await questionnaire.getByRole('textbox', { name: labels.customAnswer, exact: true }).fill(answer)
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('treeitem', { name: other.title, exact: true }).click()
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('treeitem', { name: pending.session.title, exact: true }).click()
      await questionnaire.getByRole('tab', { name: /Verification/ }).click()
      await expect(questionnaire.getByRole('textbox', { name: labels.customAnswer, exact: true })).toHaveValue(answer)
      await expect(questionnaire.getByRole('button', { name: labels.submit, exact: true })).toBeEnabled()
      await page.screenshot({ path: testInfo.outputPath(`questionnaire-selected-${locale}-320.png`) })
      await questionnaire.getByRole('button', { name: labels.submit, exact: true }).focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('Space')
      await expect(questionnaire.getByRole('status')).toHaveText(labels.answered)
      await expect(questionnaire.getByRole('button', { name: labels.submit, exact: true })).toHaveCount(0)
      await expect(questionnaire).toBeFocused()
      await expect(questionnaire).toHaveAccessibleDescription(labels.answered)
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: questionRun.operationId })).status)
        .toBe('completed')
      const complete = await host.client.call('session.snapshot', { sessionId })
      expect(complete.userInputs).toEqual([])
      const result = complete.messages
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result' && block.callId === request.callId)
      expect(result?.type === 'tool_result' ? result.details : null).toEqual({
        answers: { placement: { answers: ['Inline'] }, verification: { answers: [answer] } },
      })
      await questionnaire.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath(`questionnaire-confirmed-${locale}-320.png`) })
      await page.reload()
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      await show.click()
      await page.getByRole('treeitem', { name: complete.session.title, exact: true }).click()
      const restored = page.locator(`[data-message-id="${questionMessage.id}"] [data-decision-kind="questionnaire"]`)
      await expect(restored.getByRole('status')).toHaveText(labels.answered)
      await restored.getByRole('tab', { name: /Verification/ }).click()
      await expect(restored).toContainText(answer)
      await expect(restored.getByRole('button', { name: labels.submit, exact: true })).toHaveCount(0)
      // A deliberate move while the original request is held must revoke the card's focus ownership.
      const third = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool edit_file {"path":"browser-e2e.md","oldText":"# Approved edit","newText":"# Must not write"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () =>
          (await targetHost.client.call('session.snapshot', { sessionId })).approvals.some(
            (value) => value.runId === third.operationId && value.status === 'pending',
          ),
        )
        .toBe(true)
      const thirdPending = await host.client.call('session.snapshot', { sessionId })
      const thirdApproval = thirdPending.approvals.find((value) => value.status === 'pending')!
      const thirdCard = page.locator(`[data-decision-id="${thirdApproval.id}"]`)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep my newer focus and this unsent draft — 保留后续输入位置与草稿。'
      await prompt.fill(draft)
      holdDecision = true
      await thirdCard.getByRole('button', { name: labels.deny, exact: true }).click()
      await expect.poll(() => heldDecision.release !== null).toBe(true)
      await expect(thirdCard.getByRole('status')).toHaveText(labels.submitting)
      await prompt.focus()
      if (!heldDecision.release) throw new Error('The original approval request was not held')
      const release = heldDecision.release
      heldDecision.release = null
      release()
      await expect(thirdCard.getByRole('status')).toHaveText(labels.denied)
      await expect(prompt).toBeFocused()
      await expectComposerText(prompt, draft)
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: third.operationId })).status)
        .toBe('completed')
      expect(await readFile(join(root, 'browser-e2e.md'), 'utf8')).toBe('# Approved edit\n')
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(3)
      await page.screenshot({ path: testInfo.outputPath(`approval-newer-composer-focus-${locale}-320.png`) })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      const target = resolve(root)
      expect(dirname(target)).toBe(resolve(tmpdir()))
      expect(basename(target).startsWith('hbar-session-decisions-')).toBe(true)
      await rm(target, { recursive: true, force: true })
    }
  })
}
