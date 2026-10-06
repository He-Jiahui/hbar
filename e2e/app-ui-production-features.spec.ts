import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { createNotificationCommandClient, createRunCommandClient, createRunBoardCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { promptTemplateCopy } from '../apps/web/src/prompt-template-copy'
import { scheduleCopy } from '../apps/web/src/schedule-copy'
import { notificationCopy } from '../apps/web/src/notification-copy'
import { expectLumenValue, selectLumenOption } from './support/lumen-controls'
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

async function assertNoHorizontalOverflow(scope: Locator): Promise<void> {
  const geometry = await scope.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
}

async function assertActionFlow(row: Locator, expectedLastTone?: string): Promise<void> {
  await row.scrollIntoViewIfNeeded()
  const geometry = await row.evaluate((element) => {
    const rowBox = element.getBoundingClientRect()
    const buttonElements = [...element.querySelectorAll('button')]
    const buttons = buttonElements.map((button) => button.getBoundingClientRect())
    const overlap = buttons.some((left, index) =>
      buttons.slice(index + 1).some((right) => {
        const horizontal = left.left < right.right && right.left < left.right
        const vertical = left.top < right.bottom && right.top < left.bottom
        return horizontal && vertical
      }),
    )
    return {
      buttonCount: buttons.length,
      outOfBounds: buttons.some((button) => button.left < rowBox.left - 1 || button.right > rowBox.right + 1),
      overlap,
      lastButtonRight: buttons.at(-1)?.right ?? rowBox.left,
      rowRight: rowBox.right,
      lastButtonTone: buttonElements.at(-1)?.getAttribute('data-tone'),
      hitTested: buttons.every((button, index) => {
        const hit = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2)
        const element = buttonElements[index] as HTMLButtonElement | undefined
        return element !== undefined && (hit === element || Boolean(hit && element.contains(hit)))
      }),
    }
  })
  expect(geometry.buttonCount).toBeGreaterThan(0)
  expect(geometry.outOfBounds).toBe(false)
  expect(geometry.overlap).toBe(false)
  expect(geometry.lastButtonRight).toBeLessThanOrEqual(geometry.rowRight + 1)
  expect(geometry.hitTested).toBe(true)
  if (expectedLastTone) expect(geometry.lastButtonTone).toBe(expectedLastTone)
}

async function assertVariableFlow(row: Locator): Promise<void> {
  const geometry = await row.evaluate((element) => {
    const rowBox = element.getBoundingClientRect()
    const fields = element.querySelector('.hbar-prompt-variable-fields')?.getBoundingClientRect()
    const actions = element.querySelector('.hbar-prompt-variable-actions')?.getBoundingClientRect()
    const remove = element.querySelector('.hbar-prompt-variable-actions button')?.getBoundingClientRect()
    const fieldAndActionOverlap =
      fields &&
      actions &&
      fields.left < actions.right &&
      actions.left < fields.right &&
      fields.top < actions.bottom &&
      actions.top < fields.bottom
    return {
      rowRight: rowBox.right,
      actionRight: actions?.right ?? rowBox.left,
      removeRight: remove?.right ?? rowBox.left,
      fieldAndActionOverlap: Boolean(fieldAndActionOverlap),
    }
  })
  expect(geometry.actionRight).toBeLessThanOrEqual(geometry.rowRight + 1)
  expect(geometry.removeRight).toBeLessThanOrEqual(geometry.actionRight + 1)
  expect(geometry.fieldAndActionOverlap).toBe(false)
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
        const templateName =
          locale === 'zh-CN'
            ? '用于窄面板验收的发布模板长标题'.repeat(4)
            : 'Release template with a deliberately long title for narrow panes'
        await openFeature(page, templateCopy.title)
        await page.getByRole('button', { name: templateCopy.create, exact: true }).click()
        const editor = page.locator('.hbar-prompt-template-editor')
        await page.getByRole('textbox', { name: templateCopy.editor.body, exact: true }).fill('Release build')
        await page.getByRole('textbox', { name: templateCopy.editor.name, exact: true }).fill(templateName)
        await page
          .getByRole('textbox', { name: templateCopy.description, exact: true })
          .fill('A release template for browser acceptance')
        await page.getByRole('button', { name: templateCopy.addVariable, exact: true }).click()
        const variable = page.locator('.hbar-prompt-variable').last()
        await variable.locator('input.lumen-control').nth(0).fill('environment')
        await variable.locator('input.lumen-control').nth(1).fill('Environment')
        await assertVariableFlow(variable)
        for (const width of [320, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 720 })
          await assertNoHorizontalOverflow(page.locator('.hbar-prompt-templates-page'))
          await assertVariableFlow(variable)
        }
        await page.setViewportSize({ width: 1440, height: 960 })
        await page.locator('.hbar-prompt-templates-page').evaluate((element) => {
          element.style.inlineSize = '28rem'
          element.style.maxInlineSize = '100%'
          element.style.boxSizing = 'border-box'
        })
        await assertNoHorizontalOverflow(page.locator('.hbar-prompt-templates-page'))
        await assertVariableFlow(variable)
        await page.locator('.hbar-prompt-templates-page').evaluate((element) => {
          element.style.removeProperty('inline-size')
          element.style.removeProperty('max-inline-size')
          element.style.removeProperty('box-sizing')
        })
        await page.getByRole('textbox', { name: templateCopy.editor.body, exact: true }).fill('Release {{environment}}')
        await assertActionFlow(editor.locator('footer'))
        await page.getByRole('button', { name: templateCopy.editor.save, exact: true }).click()
        await expect(page.locator('.hbar-prompt-message')).toContainText(templateCopy.saved)
        const templateRow = page.locator('.hbar-prompt-template-list article').filter({ hasText: templateName }).first()
        await expect(templateRow).toBeVisible()
        for (const width of [320, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 720 })
          await assertNoHorizontalOverflow(page.locator('.hbar-prompt-template-list'))
          await assertActionFlow(templateRow.locator('.hbar-prompt-actions'))
        }
        await page.setViewportSize({ width: 1440, height: 960 })
        await page.getByRole('button', { name: templateName, exact: true }).click()
        await expect(page.getByRole('heading', { name: /Apply template|套用模板/ })).toBeVisible()
        await selectLumenOption(page.getByRole('combobox', { name: templateCopy.target }), {
          label: host.ready.sessionTitle,
        })
        await page.getByRole('textbox', { name: 'Environment' }).fill('production')
        await selectLumenOption(page.getByRole('combobox', { name: templateCopy.mode }), 'append')
        await page.getByRole('button', { name: templateCopy.apply, exact: true }).click()
        await expect(page.locator('.hbar-prompt-message')).toContainText(templateCopy.applied)
        const prompt = page.getByRole('textbox', { name: getShellCopy(locale).session.prompt.input })
        await expect(prompt).toContainText(/Release production/)
        await prompt.fill('Existing draft before replacement')
        await selectLumenOption(page.getByRole('combobox', { name: templateCopy.target }), {
          label: host.ready.sessionTitle,
        })
        await selectLumenOption(page.getByRole('combobox', { name: templateCopy.mode }), 'replace')
        await page.getByRole('button', { name: templateCopy.apply, exact: true }).click()
        await expect(page.getByRole('alert')).toContainText(templateCopy.confirmReplace)
        await page.getByRole('button', { name: templateCopy.confirmReplace }).click()
        await expect(prompt).toContainText('Release production')
        await page.getByRole('button', { name: templateCopy.createPreDraft, exact: true }).click()
        await expectLumenValue(page.getByRole('combobox', { name: templateCopy.target }), /pre-session/)
        await page.getByRole('button', { name: templateCopy.edit, exact: true }).click()
        await expect(editor).toBeVisible()
        await page.getByRole('button', { name: templateCopy.editor.cancel, exact: true }).click()
        await page.getByRole('button', { name: templateCopy.remove, exact: true }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('dialog').getByRole('button', { name: templateCopy.remove, exact: true }).click()
        await expect(page.getByRole('button', { name: templateName, exact: true })).toHaveCount(0)
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
      await selectLumenOption(schedule.getByLabel(copy.model), 'local-fixture')
      await selectLumenOption(schedule.getByLabel(copy.type), 'daily')
      await schedule.getByLabel(copy.timezone).fill('America/Los_Angeles')
      await selectLumenOption(schedule.getByLabel(copy.target), 'existing-session')
      const existingSession = schedule.getByRole('combobox', { name: copy.existingSession, exact: true })
      await selectLumenOption(existingSession, host.ready.sessionId)
      const scheduleFormActions = schedule.locator('.hbar-schedule-form-actions')
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 720 })
        await assertNoHorizontalOverflow(schedule)
        await assertActionFlow(scheduleFormActions)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await schedule.evaluate((element) => {
        element.style.inlineSize = '28rem'
        element.style.maxInlineSize = '100%'
        element.style.boxSizing = 'border-box'
      })
      await assertNoHorizontalOverflow(schedule)
      await assertActionFlow(scheduleFormActions)
      await schedule.evaluate((element) => {
        element.style.removeProperty('inline-size')
        element.style.removeProperty('max-inline-size')
        element.style.removeProperty('box-sizing')
      })
      await schedule.getByRole('button', { name: copy.preview, exact: true }).click()
      await expect(schedule.getByRole('region', { name: copy.previewTitle })).toBeVisible()
      await expect(schedule.getByRole('region', { name: copy.previewTitle }).locator('li')).toHaveCount(5)
      await schedule.getByRole('button', { name: copy.create, exact: true }).click()
      await expect(schedule.locator('.hbar-schedule-feedback')).toContainText(copy.saved)
      const scheduleRow = schedule.locator('.hbar-schedule-list article').first()
      await expect(scheduleRow).toBeVisible()
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 720 })
        await assertNoHorizontalOverflow(schedule)
        await assertActionFlow(scheduleRow.locator('.hbar-schedule-item-actions'), 'danger')
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.getByRole('button', { name: copy.pause, exact: true }).click()
      await expect(page.getByText(copy.paused, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.edit, exact: true }).click()
      await page.getByLabel(copy.name).fill('Nightly verification edited')
      await page.getByRole('button', { name: copy.save, exact: true }).click()
      await expect(page.getByText('Nightly verification edited', { exact: true })).toBeVisible()
      await assertActionFlow(
        schedule.locator('.hbar-schedule-list article').first().locator('.hbar-schedule-item-actions'),
        'danger',
      )
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
      await expect(page.locator('[data-global-page="notifications"]')).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('.hbar-web-tool-outlet')).toHaveCount(0)
      await expect(bell).toHaveAttribute('aria-current', 'page')
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
      await expect(bell).toHaveAttribute('aria-label', notificationLabels.bell(0))
      await expect(bell.locator('.hbar-web-notification-count')).toHaveCount(0)
      await page
        .getByRole('button', { name: /^Open Run (completed|failed)$/ })
        .first()
        .click()
      await expect(page.getByRole('heading', { name: notificationLabels.title }).first()).toHaveCount(0)
      await expect(page.locator(`[data-session-id="${host.ready.sessionId}"]`)).toHaveAttribute('data-selected', 'true')
      await bell.click()
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
      await expect(page.locator('[data-global-page="notifications"]')).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
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
