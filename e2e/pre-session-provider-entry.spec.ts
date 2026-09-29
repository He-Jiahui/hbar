import { expect, test } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createGoalPlanCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`providerless first-send routes to Settings without losing its Goal draft: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-provider-'))
    const context = await browser.newContext({
      locale,
      viewport: { width: locale === 'en-US' ? 1440 : 320, height: 900 },
    })
    const copy = getShellCopy(locale)
    const labels = preSessionCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const configuration = createConfigurationCommandClient(host.client)
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const goals = createGoalPlanCommandClient(host.client)
      await configuration.execute('provider.delete', { id: 'local-fixture' })
      const count = async () =>
        (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
      expect(await count()).toBe(1)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      const landing = page.locator('.hbar-pre-session-landing')
      await expect(landing).toBeVisible()
      await expect(
        landing.locator('.hbar-web-pre-session-model-guidance').getByText(labels.model.empty, { exact: true }),
      ).toBeVisible()
      const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
      const objective = `Keep the providerless Goal draft ${locale}`
      await prompt.fill(objective)
      await landing.getByRole('button', { name: labels.workspace.trigger(null) }).click()
      await page
        .getByRole('dialog', { name: labels.workspace.title })
        .getByRole('button', { name: new RegExp(host.ready.workspaceName) })
        .click()
      const approval = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
      await approval.click()
      await page
        .locator('.hbar-pre-session-approval-popover')
        .getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.options.deny.label) })
        .click()
      const add = landing.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      await add.click()
      await landing
        .getByRole('group', { name: copy.session.addMenu.menu })
        .getByRole('button', { name: copy.session.intent.goalMenu, exact: true })
        .click()
      await expect(landing.getByRole('button', { name: copy.session.intent.cancelGoal })).toBeVisible()
      await expect(landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true })).toBeDisabled()
      await expect(landing.getByRole('button', { name: labels.configureProviders, exact: true })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-provider-empty-${locale}.png` })
      expect(await count()).toBe(1)
      if (locale === 'zh-CN') {
        await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
        await page
          .getByRole('dialog', { name: labels.model.title })
          .getByRole('button', { name: labels.configureProviders, exact: true })
          .click()
      } else {
        await landing.getByRole('button', { name: labels.configureProviders, exact: true }).click()
      }
      await expect(page.locator('.hbar-app-react-provider-list')).toBeVisible()
      expect(await count()).toBe(1)
      await configuration.execute('provider.save', {
        provider: {
          id: 'local-fixture',
          name: 'Local fixture',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'fixture',
          imageInput: true,
          reasoning: true,
        },
      })
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expect(landing).toBeVisible()
      await expect(prompt).toHaveValue(objective)
      await expect(landing.getByRole('button', { name: copy.session.intent.cancelGoal })).toBeVisible()
      await expect(approval).toHaveAttribute('data-choice', 'deny')
      await expect(
        landing.getByRole('button', { name: labels.workspace.trigger(host.ready.workspaceName) }),
      ).toBeVisible()
      await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
      await page
        .getByRole('dialog', { name: labels.model.title })
        .getByRole('button', { name: /fixture/i })
        .click()
      expect(await count()).toBe(1)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-provider-return-${locale}.png` })
      await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
      await expect(page.getByRole('tab')).toHaveCount(1)
      await expect.poll(count).toBe(2)
      const created = (
        await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
      ).items.find((item) => item.id !== host!.ready.sessionId)!
      await expect
        .poll(async () => (await goals.execute('goal.get', { sessionId: created.id })).goal?.objective)
        .toBe(objective)
      await expect
        .poll(async () => {
          const snapshot = await host!.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
          return snapshot.runs.filter((run) => run.input.source === 'user' && run.input.text === objective).length
        })
        .toBe(1)
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('failed no-tab model read offers Retry without creating a Session or losing text', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-model-retry-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 320, height: 720 } })
  const copy = getShellCopy('en-US')
  const labels = preSessionCopy('en-US')
  const faultCode = `MODEL_READ_FAILED_${'LONG_UNBROKEN_ERROR_'.repeat(6)}`
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const count = async () =>
      (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    let failed = false
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          try {
            const request = JSON.parse(message) as {
              id?: string | number
              params?: { commandId?: string }
            }
            if (!failed && request.id !== undefined && request.params?.commandId === 'model.list') {
              failed = true
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: request.id,
                  error: { code: -32603, message: 'Owned catalog read failure', data: faultCode },
                }),
              )
              return
            }
          } catch {
            // Non-JSON frames pass through to the real Host.
          }
        }
        server.send(message)
      })
      server.onMessage((message) => socket.send(message))
    })
    await page.goto(base)
    const landing = page.locator('.hbar-pre-session-landing')
    const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
    const message = 'Keep this draft while retrying the model catalog'
    await prompt.fill(message)
    await expect(landing.getByRole('alert')).toContainText(labels.modelReadFailed)
    await expect(landing.getByRole('alert')).not.toContainText(faultCode)
    await landing.getByRole('button', { name: labels.workspace.trigger(null) }).click()
    await page
      .getByRole('dialog', { name: labels.workspace.title })
      .getByRole('button', { name: new RegExp(host.ready.workspaceName) })
      .click()
    await expect(landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true })).toBeDisabled()
    expect(await count()).toBe(1)
    await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
    const picker = page.getByRole('dialog', { name: labels.model.title })
    await expect(picker.getByRole('button', { name: labels.retryModels, exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/desktop-experience/pre-session-model-read-failed-en-US-320.png' })
    await picker.getByRole('button', { name: labels.retryModels, exact: true }).click()
    await expect(picker.getByRole('button', { name: /fixture/i })).toBeVisible()
    await expect(picker.getByRole('button', { name: labels.model.close })).toBeFocused()
    await picker.getByRole('button', { name: /fixture/i }).click()
    await expect(prompt).toHaveValue(message)
    expect(await count()).toBe(1)
    await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
    await expect.poll(count).toBe(2)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('first-send model preflight catches a catalog change before Session creation', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-model-change-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  const copy = getShellCopy('en-US')
  const labels = preSessionCopy('en-US')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const configuration = createConfigurationCommandClient(host.client)
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const count = async () =>
      (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    const landing = page.locator('.hbar-pre-session-landing')
    const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
    const message = 'Plan after a provider catalog change'
    await prompt.fill(message)
    await landing.getByRole('button', { name: labels.workspace.trigger(null) }).click()
    await page
      .getByRole('dialog', { name: labels.workspace.title })
      .getByRole('button', { name: new RegExp(host.ready.workspaceName) })
      .click()
    await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
    await page
      .getByRole('dialog', { name: labels.model.title })
      .getByRole('button', { name: /fixture/i })
      .click()
    const execution = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
    await execution.click()
    await page
      .locator('.hbar-pre-session-approval-popover')
      .getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.plan.label) })
      .click()
    await configuration.execute('provider.delete', { id: 'local-fixture' })
    await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
    await expect(landing.getByRole('alert')).toContainText('MODEL_NOT_FOUND')
    await expect(page.getByRole('tab')).toHaveCount(0)
    expect(await count()).toBe(1)
    await expect(prompt).toHaveValue(message)
    await expect(execution).toHaveAttribute('data-choice', 'plan')
    await configuration.execute('provider.save', {
      provider: {
        id: 'local-fixture',
        name: 'Local fixture',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'fixture',
        imageInput: true,
        reasoning: true,
      },
    })
    await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
    await expect.poll(count).toBe(2)
    const created = (
      await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
    ).items.find((item) => item.id !== host!.ready.sessionId)!
    await expect
      .poll(async () => (await configuration.execute('mode.get', { sessionId: created.id })).mode)
      .toBe('plan')
    await expect
      .poll(async () => {
        const snapshot = await host!.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
        return snapshot.runs.filter((run) => run.input.source === 'user' && run.input.text === message).length
      })
      .toBe(1)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
