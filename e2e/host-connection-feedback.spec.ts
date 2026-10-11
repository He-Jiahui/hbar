import { expect, test, type WebSocketRoute } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { openSessionTool } from './support/session-tools-menu'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-connection-feedback-')
  )
    throw new Error('Unowned connection fixture path')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`connection interruption has one prominent notice and disables server actions until recovery: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-connection-feedback-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const { client, ready } = host
      const { sessionId } = ready
      const runs = createRunCommandClient(client)
      const failed = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: { text: '/fail', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: failed.operationId })).status)
        .toBe('failed')
      const goals = createGoalPlanCommandClient(client)
      await goals.execute('goal.set', {
        sessionId,
        objective: 'Preserve the original goal and draft — 保留原目标与草稿',
        status: 'paused',
      })
      const baseline = await goals.execute('goal.snapshot', { sessionId })
      await goals.execute('plan.update', {
        sessionId,
        expectedRevision: baseline.plan?.revision ?? 0,
        turnId: failed.operationId,
        plan: [
          { step: 'Verified result remains available — 保留已验证成果', status: 'completed' },
          { step: 'Continue after recovery — 恢复后继续', status: 'pending' },
        ],
      })
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let offline = false
      const connection: { socket: WebSocketRoute | null } = { socket: null }
      await page.routeWebSocket('**/rpc', async (route) => {
        connection.socket = route
        if (offline) await route.close({ code: 1012, reason: 'Connection fixture interrupted' })
        else route.connectToServer()
      })
      const copy = getShellCopy(locale)
      await page.goto(origin)
      const title = (await client.call('session.snapshot', { sessionId })).session.title
      await page.getByRole('treeitem', { name: title, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Unsent draft remains editable while disconnected — 离线时草稿仍可编辑 🛰️'
      await expect(prompt).toBeEditable()
      await prompt.click()
      await page.keyboard.insertText(draft)
      await expectComposerText(prompt, draft)
      await expect(page.locator('.hbar-session-interruption-notice')).toBeVisible()
      await openSessionTool(page, copy.session.tools, 'monitoring')
      const pane = page.locator('.hbar-app-react-session-monitoring')
      await expect(pane.locator('.hbar-session-run-current')).toHaveAttribute('data-run-id', failed.operationId)
      const modelPicker = page.locator('.hbar-composer-model-picker')
      await expect(modelPicker.locator('.hbar-composer-model-trigger')).toBeEnabled()
      await modelPicker.locator('.hbar-composer-model-trigger').click()
      await expect(page.locator('.hbar-composer-picker-popover[popover]:popover-open')).toBeVisible()
      offline = true
      await context.setOffline(true)
      await connection.socket?.close({ code: 1012, reason: 'Connection fixture interrupted' })
      const notice = page.locator('.hbar-host-connection-notice')
      await expect(notice).toHaveCount(1)
      await expect(notice).toBeVisible()
      await expect(notice).toContainText(copy.shell.connectionNotice.preserved)
      await expect(page.locator('.hbar-composer-picker-popover[popover]:popover-open')).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-sidebar-load-feedback')).toHaveCount(0)
      await expect(page.locator('.hbar-session-interruption-notice')).toHaveCount(0)
      await expect(page.locator('.hbar-composer-goal-context [role="alert"]')).toHaveCount(0)
      await expect(page.locator('.hbar-composer-permission-feedback [role="alert"]:visible')).toHaveCount(0)
      await expect(page.locator('.hbar-composer-model-closed-recovery')).toHaveCount(0)
      await expect(page.locator('.hbar-composer-background-feedback')).toHaveCount(0)
      await expect(page.locator('.hbar-queued-user-runs-notice')).toHaveCount(0)
      await expect(pane.locator('.hbar-monitoring-context-recovery')).toHaveCount(0)
      await expect(page.locator('.hbar-composer-permission-trigger')).toBeDisabled()
      await expect(modelPicker.locator('.hbar-composer-model-trigger')).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.shell.newSession, exact: true })).toBeDisabled()
      await expect(page.locator('.hbar-composer-goal-strip button:enabled')).toHaveCount(0)
      await expectComposerText(prompt, draft)
      await prompt.click()
      await page.keyboard.press('ControlOrMeta+End')
      await page.keyboard.insertText(' + local edit')
      await expectComposerText(prompt, `${draft} + local edit`)
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 })
        await expect(notice).toHaveCount(1)
        await expect(notice).toBeInViewport()
        for (const foreground of [
          notice,
          notice.getByRole('button', { name: copy.shell.connectionNotice.reconnect, exact: true }),
        ])
          await expect
            .poll(() =>
              foreground.evaluate((node) => {
                const box = node.getBoundingClientRect()
                return node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
              }),
            )
            .toBe(true)
        expect(await notice.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`connection-interrupted-${width}.png`) })
      }
      offline = false
      await context.setOffline(false)
      await expect(notice).toHaveCount(0)
      await page.setViewportSize({ width: 1440, height: 1000 })
      await expectComposerText(prompt, `${draft} + local edit`)
      await expect(page.locator('.hbar-composer-permission-trigger')).toBeEnabled()
      await expect(modelPicker.locator('.hbar-composer-model-trigger')).toBeEnabled()
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeEnabled()
      await expect(page.locator('.hbar-session-interruption-notice')).toBeVisible()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect(page.locator('.hbar-session-interruption-notice')).toHaveCount(0)
      await expect
        .poll(async () => {
          const snapshot = await client.call('session.snapshot', { sessionId })
          return snapshot.runs.some((run) => run.input.text === `${draft} + local edit` && run.status === 'completed')
        })
        .toBe(true)
      expect(
        (await client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === failed.operationId)
          ?.status,
      ).toBe('failed')
      await page.screenshot({ path: info.outputPath('connection-recovered.png') })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
