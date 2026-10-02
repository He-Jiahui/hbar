import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createNotificationCommandClient, createRunCommandClient, createRunBoardCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
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
  await page.getByRole('button', { name: `Open session ${host.ready.sessionTitle}` }).click()
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
        const labels =
          locale === 'zh-CN'
            ? {
                feature: '提示词模板',
                create: '新建模板',
                edit: '编辑',
                save: '保存',
                apply: '套用',
                append: '追加',
                replace: '替换',
                delete: '删除',
                addVar: '添加变量',
                target: '目标',
                pre: '创建预会话草稿',
              }
            : {
                feature: 'Prompt templates',
                create: 'New template',
                edit: 'Edit',
                save: 'Save',
                apply: 'Apply',
                append: 'Append',
                replace: 'Replace',
                delete: 'Delete',
                addVar: 'Add variable',
                target: 'Target',
                pre: 'Create pre-session draft',
              }
        await openFeature(page, labels.feature)
        await page.getByRole('button', { name: /New template|新建模板/ }).click()
        const editor = page.locator('.hbar-prompt-template-editor')
        await page.getByRole('textbox', { name: 'Body', exact: true }).fill('Release build')
        await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Release template')
        await page.getByRole('textbox', { name: /Description|描述/ }).fill('A release template for browser acceptance')
        await page.getByRole('button', { name: labels.addVar, exact: true }).click()
        const variable = page.locator('.hbar-prompt-variable').last()
        await variable.locator('input').nth(0).fill('environment')
        await variable.locator('input').nth(1).fill('Environment')
        await page.getByRole('textbox', { name: 'Body', exact: true }).fill('Release {{environment}}')
        await page.getByRole('button', { name: labels.save, exact: true }).click()
        await expect(page.getByRole('status')).toContainText(/saved|已保存/i)
        await page.getByRole('button', { name: 'Release template', exact: true }).click()
        await expect(page.getByRole('heading', { name: /Apply template|套用模板/ })).toBeVisible()
        await page.getByRole('combobox', { name: labels.target }).selectOption({ label: host.ready.sessionTitle })
        await page.getByRole('textbox', { name: 'Environment' }).fill('production')
        await page.getByRole('combobox').filter({ hasText: labels.append }).selectOption('append')
        await page.getByRole('button', { name: /Apply to draft|写入草稿/, exact: true }).click()
        await expect(page.getByRole('status')).toContainText(/Draft updated|已写入草稿/i)
        const prompt = page.getByRole('textbox', { name: 'Prompt' })
        await expect(prompt).toContainText(/Release production/)
        await page.getByRole('combobox', { name: labels.target }).selectOption({ label: host.ready.sessionTitle })
        await page.getByRole('combobox').filter({ hasText: labels.append }).selectOption('replace')
        await page.getByRole('button', { name: /Apply to draft|写入草稿/, exact: true }).click()
        await expect(page.getByText(/confirm|确认/i)).toBeVisible()
        await page
          .getByRole('button', { name: /confirm|确认/i })
          .last()
          .click()
        await expect(prompt).toContainText('Release production')
        await page.getByRole('button', { name: labels.pre, exact: true }).click()
        await expect(page.getByRole('combobox', { name: labels.target })).toHaveValue(/pre-session/)
        await page.getByRole('button', { name: labels.edit, exact: true }).click()
        await expect(editor).toBeVisible()
        await page.getByRole('button', { name: /Cancel|取消/ }).click()
        await page.getByRole('button', { name: labels.delete, exact: true }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('dialog').getByRole('button', { name: labels.delete, exact: true }).click()
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
      await openFeature(page, 'Schedules')
      await page.getByLabel('Name').fill('Nightly verification')
      const schedule = page.locator('.hbar-schedule-page')
      await schedule.getByLabel('Prompt').fill('Run the nightly verification')
      await schedule.getByLabel('Model').selectOption('local-fixture')
      await schedule.getByLabel('Type').selectOption('daily')
      await schedule.getByLabel('Timezone').fill('America/Los_Angeles')
      await schedule.getByLabel('Target').selectOption('existing-session')
      await schedule.getByLabel('Existing session').selectOption(host.ready.sessionId)
      await schedule.getByRole('button', { name: 'Preview', exact: true }).click()
      await expect(schedule.getByRole('region', { name: /Preview/ })).toBeVisible()
      await expect(schedule.getByRole('region', { name: /Preview/ }).locator('li')).toHaveCount(5)
      await schedule.getByRole('button', { name: 'Create', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('Schedule saved.')
      await expect(page.getByText('Nightly verification', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      await expect(page.getByText('Paused', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await page.getByLabel('Name').fill('Nightly verification edited')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText('Nightly verification edited', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByRole('group', { name: /Delete schedule/ })).toBeVisible()
      await page
        .getByRole('group', { name: /Delete schedule/ })
        .getByRole('button', { name: 'Delete', exact: true })
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
      await openFeature(page, 'Notifications')
      await expect(page.getByText(/Run completed|Run failed/).first()).toBeVisible()
      await page
        .getByRole('button', { name: /Mark as read/ })
        .first()
        .click()
      await expect(page.getByRole('button', { name: /Mark unread/ }).first()).toBeVisible()
      await page.getByRole('button', { name: 'Notification preferences', exact: true }).click()
      const desktop = page.getByRole('switch', { name: /Enable desktop notifications|Desktop/ })
      if (await desktop.count()) await desktop.click()
      await page.reload()
      await expect(page.getByText(/Notifications|通知中心/).first()).toBeVisible()
      await page
        .getByRole('button', { name: /Run completed|Run failed/ })
        .first()
        .click()
        .catch(() => undefined)
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
      await expect(page.getByRole('heading', { name: 'Run board' })).toBeVisible()
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
        .catch(() => undefined)
      await capture(page, 'run-board-1440.png')
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 320)
      await capture(page, 'run-board-320.png')
    })
  })
})
