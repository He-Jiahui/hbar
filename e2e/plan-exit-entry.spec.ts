import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient, createInteractionCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

const rpcRequest = z
  .object({
    method: z.string(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`same-Run Plan exit document, approval and feedback remain at the original tool: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-plan-exit-ui-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    const labels = copy.session.decisions.planExit
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        budgetAutoContinue: false,
      })
      const sessionId = host.ready.sessionId
      const originalHost = host
      const runs = createRunCommandClient(host.client)
      const config = createConfigurationCommandClient(host.client)
      const decisions = createInteractionCommandClient(host.client)
      const markdown = `# Plan for ${locale}\n\n${Array.from({ length: 48 }, (_, index) => `- Verify original target ${index + 1} — 保持原始操作目标`).join('\n')}`
      await config.execute('mode.set', { sessionId, mode: 'plan' })
      const submit = () =>
        runs.execute(
          'run.submit',
          {
            sessionId,
            modelId: 'local-fixture',
            input: {
              text: `/tool exit_plan_mode ${JSON.stringify({ plan: markdown })}`,
              images: [],
              approval: 'allow',
            },
          },
          { idempotencyKey: crypto.randomUUID() },
        )
      const accepted = await submit()
      await expect
        .poll(async () =>
          (await originalHost.client.call('session.snapshot', { sessionId })).approvals.some(
            (value) => value.tool === 'exit_plan_mode',
          ),
        )
        .toBe(true)
      const pending = await host.client.call('session.snapshot', { sessionId })
      const approval = pending.approvals.find((value) => value.tool === 'exit_plan_mode')!
      const message = pending.messages.find(
        (value) =>
          value.runId === accepted.operationId &&
          value.content.some((block) => block.type === 'tool_call' && block.callId === approval.callId),
      )!
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      // Hold the original request before dispatch, not an invented Host result.
      // This lets a deliberate move back to the composer happen before completion.
      let holdDecision = false
      const heldDecision: { release: (() => void) | null } = { release: null }
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string' && holdDecision) {
            const parsed = rpcRequest.safeParse(JSON.parse(message))
            if (parsed.success && (parsed.data.params?.commandId ?? parsed.data.method) === 'planExit.resolve') {
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
      await page.getByRole('treeitem', { name: pending.session.title, exact: true }).click()
      const card = page.locator(`[data-message-id="${message.id}"] [data-decision-id="${approval.id}"]`)
      await expect(card).toBeVisible()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep this unsent draft — 保留这份未发送草稿。'
      await prompt.fill(draft)
      await expect(card.getByRole('heading', { name: `Plan for ${locale}` })).toBeVisible()
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await card.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        expect(
          await card
            .getByRole('region', { name: labels.document })
            .evaluate((element) => element.scrollHeight > element.clientHeight),
        ).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`plan-exit-pending-${locale}-${width}.png`) })
      }
      await card.getByRole('button', { name: labels.implement, exact: true }).focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await expect(card.getByRole('status')).toHaveText(labels.implemented)
      await expect(card).toBeFocused()
      await expectComposerText(prompt, draft)
      await expect(card.getByRole('textbox')).toHaveCount(0)
      await expect(card.getByRole('heading', { name: `Plan for ${locale}` })).toBeVisible()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('completed')
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
      const follow = await host.client.call('session.follow', { sessionId, cursor: pending.cursor })
      expect(follow.events.filter((event) => event.type === 'plan_exit.resolved')).toHaveLength(1)
      await page.locator('.lumen-conversation-messages').hover()
      await page.mouse.wheel(0, -700)
      await card.getByRole('status').scrollIntoViewIfNeeded()
      await expect(card.getByRole('status')).toBeInViewport()
      await page.screenshot({ path: testInfo.outputPath(`plan-exit-approved-${locale}-320.png`) })
      await config.execute('mode.set', { sessionId, mode: 'plan' })
      const second = await submit()
      await expect
        .poll(
          async () =>
            (await originalHost.client.call('session.snapshot', { sessionId })).approvals.filter(
              (value) => value.status === 'pending',
            ).length,
        )
        .toBe(1)
      const continued = await host.client.call('session.snapshot', { sessionId })
      const request = continued.approvals.find((value) => value.status === 'pending')!
      const secondCard = page.locator(`[data-decision-id="${request.id}"]`)
      const feedback = 'Review cancellation and recovery — 请复核取消与恢复。'
      await secondCard.getByRole('textbox', { name: labels.feedback, exact: true }).fill(feedback)
      await secondCard.getByRole('button', { name: labels.continuePlanning, exact: true }).click()
      await expect(secondCard.getByRole('status')).toHaveText(labels.continued)
      await expect(secondCard).toBeFocused()
      await expectComposerText(prompt, draft)
      await expect(secondCard).toContainText(feedback)
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: second.operationId })).status)
        .toBe('completed')
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
      expect(
        await decisions.execute('planExit.get', {
          sessionId,
          approvalId: request.id,
          runId: request.runId,
          callId: request.callId,
        }),
      ).toMatchObject({ status: 'denied', feedback })
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(2)
      await page.locator('.lumen-conversation-messages').hover()
      await page.mouse.wheel(0, -700)
      await secondCard.getByRole('status').scrollIntoViewIfNeeded()
      await expect(secondCard.getByRole('status')).toBeInViewport()
      await page.screenshot({ path: testInfo.outputPath(`plan-exit-continued-${locale}-320.png`) })
      const third = await submit()
      await expect
        .poll(async () =>
          (await originalHost.client.call('session.snapshot', { sessionId })).approvals.some(
            (value) => value.status === 'pending',
          ),
        )
        .toBe(true)
      const thirdPending = await host.client.call('session.snapshot', { sessionId })
      const thirdApproval = thirdPending.approvals.find((value) => value.status === 'pending')!
      const thirdCard = page.locator(`[data-decision-id="${thirdApproval.id}"]`)
      holdDecision = true
      await thirdCard.getByRole('button', { name: labels.continuePlanning, exact: true }).click()
      await expect.poll(() => heldDecision.release !== null).toBe(true)
      await expect(thirdCard.getByRole('status')).toHaveText(copy.session.decisions.submitting)
      await prompt.focus()
      if (!heldDecision.release) throw new Error('The original Plan decision request was not held')
      const release = heldDecision.release
      heldDecision.release = null
      release()
      await expect(thirdCard.getByRole('status')).toHaveText(labels.continued)
      await expect(prompt).toBeFocused()
      await expectComposerText(prompt, draft)
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: third.operationId })).status)
        .toBe('completed')
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(3)
      await page.screenshot({ path: testInfo.outputPath(`plan-exit-newer-focus-${locale}-320.png`) })
      await page.reload()
      await expect(page.locator(`[data-decision-id="${approval.id}"]`).getByRole('status')).toHaveText(
        labels.implemented,
      )
      await expect(page.locator(`[data-decision-id="${request.id}"]`)).toContainText(feedback)
      await expect(page.locator(`[data-decision-id="${request.id}"]`).getByRole('button')).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      expect(dirname(resolve(root))).toBe(resolve(tmpdir()))
      expect(basename(root).startsWith('hbar-plan-exit-ui-')).toBe(true)
      await rm(root, { recursive: true, force: true })
    }
  })
}
