import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createNotificationCommandClient, createRunCommandClient, createRunBoardCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { promptTemplateCopy } from '../apps/web/src/prompt-template-copy'
import { scheduleCopy } from '../apps/web/src/schedule-copy'
import { notificationCopy } from '../apps/web/src/notification-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'

const WEB_PORT = Number(process.env.HBAR_E2E_PORT ?? 4329)
const HOST_PORT = Number(process.env.HBAR_E2E_HOST_PORT ?? 4337)
const artifactRoot = 'artifacts/app-ui-migration-audit'

async function authenticate(context: BrowserContext, token: string): Promise<void> {
  const response = await context.request.post(`http://127.0.0.1:${WEB_PORT}/auth/token`, { data: { token } })
  expect(response.ok()).toBe(true)
}

async function openSession(page: Page, host: WebSessionHost, locale: 'en-US' | 'zh-CN'): Promise<void> {
  const copy = getShellCopy(locale)
  await page.goto(`http://127.0.0.1:${WEB_PORT}`)
  await expect(page.getByText(copy.shell.connected, { exact: true }).first()).toBeVisible()
  const sessionEntry = page.locator(`[data-session-id="${host.ready.sessionId}"]`)
  await expect(sessionEntry).toBeVisible()
  await sessionEntry.click()
}

async function openFeature(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click()
}

async function capture(page: Page, name: string): Promise<void> {
  await mkdir(artifactRoot, { recursive: true })
  await page.screenshot({ path: join(artifactRoot, name), fullPage: true })
}

async function withHost<T>(
  browser: Browser,
  locale: 'en-US' | 'zh-CN',
  callback: (page: Page, host: WebSessionHost) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-app-ui-features-'))
  const host = await startWebSessionHost({ root, port: HOST_PORT })
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  try {
    await context.addInitScript((value) => localStorage.setItem('hbar:web:language', value), locale)
    await authenticate(context, host.ready.token)
    return await callback(await context.newPage(), host)
  } finally {
    await context.close()
    await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
}

test.describe('production app-ui feature surfaces', () => {
  test('prompt templates create/edit, variable validation, apply append/replace, pre-session target, and delete', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    for (const locale of ['en-US', 'zh-CN'] as const) {
      await withHost(browser, locale, async (page, host) => {
        await openSession(page, host, locale)
        const templateCopy = promptTemplateCopy(locale)
        await openFeature(page, templateCopy.title)
        await page.getByRole('button', { name: templateCopy.create, exact: true }).click()
        const editor = page.locator('.hbar-prompt-template-editor')
        await page.getByRole('textbox', { name: templateCopy.editor.body, exact: true }).fill('Release build')
        await page.getByRole('textbox', { name: templateCopy.editor.name, exact: true }).fill('Release template')
        await page
          .getByRole('textbox', { name: templateCopy.description, exact: true })
          .fill('A release template for browser acceptance')
        await page.getByRole('button', { name: templateCopy.addVariable, exact: true }).click()
        const variable = page.locator('.hbar-prompt-variable').last()
        await variable.locator('input').nth(0).fill('environment')
        await variable.locator('input').nth(1).fill('Environment')
        await page.getByRole('textbox', { name: templateCopy.editor.body, exact: true }).fill('Release {{environment}}')
        await page.getByRole('button', { name: templateCopy.editor.save, exact: true }).click()
        await expect(page.getByRole('status')).toContainText(templateCopy.saved)
        await page.getByRole('button', { name: 'Release template', exact: true }).click()
        await expect(page.getByRole('heading', { name: /Apply template|套用模板/ })).toBeVisible()
        await page.getByRole('combobox', { name: templateCopy.target }).selectOption({ label: host.ready.sessionTitle })
        await page.getByRole('textbox', { name: 'Environment' }).fill('production')
        await page.getByRole('combobox', { name: templateCopy.mode }).selectOption('append')
        await page.getByRole('button', { name: templateCopy.apply, exact: true }).click()
        await expect(page.getByRole('status')).toContainText(templateCopy.applied)
        const prompt = page.getByRole('textbox', { name: getShellCopy(locale).session.prompt.input })
        await expect(prompt).toContainText(/Release production/)
        await prompt.fill('Existing draft before replacement')
        await page.getByRole('combobox', { name: templateCopy.target }).selectOption({ label: host.ready.sessionTitle })
        await page.getByRole('combobox', { name: templateCopy.mode }).selectOption('replace')
        await page.getByRole('button', { name: templateCopy.apply, exact: true }).click()
        await expect(page.getByRole('alert')).toContainText(templateCopy.confirmReplace)
        await page.getByRole('button', { name: templateCopy.confirmReplace }).click()
        await expect(prompt).toContainText('Release production')
        await page.getByRole('button', { name: templateCopy.createPreDraft, exact: true }).click()
        await expect(page.getByRole('combobox', { name: templateCopy.target })).toHaveValue(/pre-session/)
        await page.getByRole('button', { name: templateCopy.edit, exact: true }).click()
        await expect(editor).toBeVisible()
        await page.getByRole('button', { name: templateCopy.editor.cancel, exact: true }).click()
        await page.getByRole('button', { name: templateCopy.remove, exact: true }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('dialog').getByRole('button', { name: templateCopy.remove, exact: true }).click()
        await expect(page.getByRole('button', { name: 'Release template', exact: true })).toHaveCount(0)
        await capture(page, `templates-${locale}-1440.png`)
        await page.setViewportSize({ width: 320, height: 720 })
        await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320)
        await capture(page, `templates-${locale}-320.png`)
      })
    }
  })

  test('schedules CRUD, five occurrence preview, IANA timezone, pause, and existing session target', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    await withHost(browser, 'en-US', async (page, host) => {
      await openSession(page, host, 'en-US')
      const copy = scheduleCopy('en-US')
      await openFeature(page, copy.title)
      const schedule = page.locator('.hbar-schedule-page')
      await schedule.getByLabel(copy.name).fill('Nightly verification')
      await schedule.getByLabel(copy.prompt).fill('Run the nightly verification')
      await schedule.getByLabel(copy.model).selectOption('local-fixture')
      await schedule.getByLabel(copy.type).selectOption('daily')
      await schedule.getByLabel(copy.timezone).fill('America/Los_Angeles')
      await schedule.getByLabel(copy.target).selectOption('existing-session')
      const existingSession = schedule.getByRole('combobox', { name: copy.existingSession, exact: true })
      await expect(existingSession.locator('option')).toHaveCount(2)
      await existingSession.selectOption(host.ready.sessionId)
      await schedule.getByRole('button', { name: copy.preview, exact: true }).click()
      await expect(schedule.getByRole('region', { name: copy.previewTitle })).toBeVisible()
      await expect(schedule.getByRole('region', { name: copy.previewTitle }).locator('li')).toHaveCount(5)
      await schedule.getByRole('button', { name: copy.create, exact: true }).click()
      await expect(page.getByRole('status')).toContainText(copy.saved)
      await expect(page.getByText('Nightly verification', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.pause, exact: true }).click()
      await expect(page.getByText(copy.paused, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.edit, exact: true }).click()
      await page.getByLabel(copy.name).fill('Nightly verification edited')
      await page.getByRole('button', { name: copy.save, exact: true }).click()
      await expect(page.getByText('Nightly verification edited', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.delete, exact: true }).click()
      await expect(page.getByRole('group', { name: copy.deleteConfirm('Nightly verification edited') })).toBeVisible()
      await page
        .getByRole('group', { name: copy.deleteConfirm('Nightly verification edited') })
        .getByRole('button', { name: copy.delete, exact: true })
        .click()
      await expect(page.getByText('Nightly verification edited', { exact: true })).toHaveCount(0)
      await capture(page, 'schedules-1440.png')
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320)
      await capture(page, 'schedules-320.png')
    })
  })

  test('notifications record completed/failed, unread mark-read, preferences persist, and target navigation', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    await withHost(browser, 'en-US', async (page, host) => {
      const notificationLabels = notificationCopy('en-US')
      const runs = createRunCommandClient(host.client)
      await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'notification success', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () =>
          (
            await createRunBoardCommandClient(host.client).list({
              workspaceId: host.ready.workspaceId,
              limit: 50,
              statuses: [],
            })
          ).items.some((item) => item.run.status === 'completed'),
        )
        .toBe(true)
      await expect
        .poll(
          async () =>
            (await createNotificationCommandClient(host.client).page({ after: null, limit: 40, unreadOnly: false }))
              .items.length,
        )
        .toBeGreaterThanOrEqual(1)
      await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: '/fail notification failure', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (
              await createNotificationCommandClient(host.client).page({ after: null, limit: 40, unreadOnly: false })
            ).items.filter((item) => item.kind === 'run.failed').length,
        )
        .toBeGreaterThanOrEqual(1)
      await openSession(page, host, 'en-US')
      const bell = page.getByRole('button', { name: /^Notifications, \d+ unread$/ })
      await expect(bell).toBeVisible()
      await bell.click()
      const bellDialog = page.getByRole('dialog', { name: notificationLabels.title })
      await expect(bellDialog).toBeVisible()
      await bellDialog.getByRole('button', { name: notificationLabels.title, exact: true }).click()
      await expect(page.getByRole('heading', { name: notificationLabels.title }).first()).toBeVisible()
      await expect(page.getByText(/Run completed|Run failed/).first()).toBeVisible()
      await page
        .getByRole('button', { name: /^Mark Run (completed|failed) read$/ })
        .first()
        .click()
      await expect(page.getByRole('button', { name: /Mark .* unread/ }).first()).toBeVisible()
      const notificationClient = createNotificationCommandClient(host.client)
      await page.getByRole('button', { name: notificationLabels.markAll, exact: true }).click()
      await expect
        .poll(async () => (await notificationClient.page({ after: null, limit: 40, unreadOnly: false })).unreadCount)
        .toBe(0)
      await expect(page.getByRole('button', { name: /^Mark Run (completed|failed) read$/ })).toHaveCount(0)
      await page
        .getByRole('button', { name: /^Open Run (completed|failed)$/ })
        .first()
        .click()
      await expect(page.getByRole('heading', { name: notificationLabels.title }).first()).toHaveCount(0)
      await expect(page.locator(`[data-session-id="${host.ready.sessionId}"]`)).toHaveAttribute('data-selected', 'true')
      await bell.click()
      await bellDialog.getByRole('button', { name: notificationLabels.title, exact: true }).click()
      await page.getByRole('button', { name: notificationLabels.preferencesTab, exact: true }).click()
      const desktop = page.getByRole('switch').first()
      await expect(desktop).toBeVisible()
      const before = await desktop.getAttribute('aria-checked')
      await desktop.click()
      await page.getByRole('button', { name: notificationLabels.save, exact: true }).click()
      await page.reload()
      const reloadedBell = page.getByRole('button', { name: /^Notifications, \d+ unread$/ })
      await expect(reloadedBell).toBeVisible()
      await reloadedBell.click()
      const reloadedDialog = page.getByRole('dialog', { name: notificationLabels.title })
      await reloadedDialog.getByRole('button', { name: notificationLabels.title, exact: true }).click()
      await page.getByRole('button', { name: notificationLabels.preferencesTab, exact: true }).click()
      await expect(page.getByRole('switch').first()).toHaveAttribute(
        'aria-checked',
        before === 'true' ? 'false' : 'true',
      )
      await capture(page, 'notifications-1440.png')
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320)
      await capture(page, 'notifications-320.png')
    })
  })

  test('run board is read-only and supports cancel, retry, and detail plan', async ({ browser }) => {
    test.setTimeout(120_000)
    await withHost(browser, 'en-US', async (page, host) => {
      const runs = createRunCommandClient(host.client)
      await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: '/slow board cancellation', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await openSession(page, host, 'en-US')
      await openFeature(page, 'Run board')
      await expect(page.getByRole('heading', { name: 'Run board' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: /Move|Add card|New card/ })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Cancel run/ }).first()).toBeVisible()
      await page
        .getByRole('button', { name: /Cancel run/ })
        .first()
        .click()
      await expect(page.getByText(/Cancelled|cancelled/i).first()).toBeVisible()
      await runs.execute(
        'run.submit',
        { sessionId: host.ready.sessionId, modelId: 'local-fixture', input: { text: '/fail board retry', images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () =>
          (
            await createRunBoardCommandClient(host.client).list({
              workspaceId: host.ready.workspaceId,
              limit: 50,
              statuses: [],
            })
          ).items.some((item) => item.run.status === 'failed'),
        )
        .toBe(true)
      await page
        .getByRole('button', { name: /Retry run/ })
        .first()
        .click()
      await expect(page.getByText(/queued|running/i).first()).toBeVisible()
      await page
        .getByRole('button', { name: /Open|View details/ })
        .first()
        .click()
      await expect(page.getByText(host.ready.sessionTitle, { exact: true }).first()).toBeVisible()
      await capture(page, 'run-board-1440.png')
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320)
      await capture(page, 'run-board-320.png')
    })
  })
})
