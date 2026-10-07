import { cleanupOwnedArchiveFixture } from './support/archive-fixture-cleanup'
import { sessionTreeItemForRow } from './support/session-tree'
import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`batch archive selection is keyboard-safe, captured, cancellable and narrow-screen readable: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-archive-batch-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        goalAutoContinue: false,
        budgetAutoContinue: false,
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        historyCount: 2,
        sessionCount: 3,
      })
      const sessions = await host.client.call('session.list', {
        workspaceId: host.ready.workspaceId,
        limit: 100,
      })
      const firstSession = sessions.items[0]
      const second = sessions.items[1]
      if (!firstSession || !second) throw new Error('The Host fixture must contain at least two sessions')
      const firstTitle = `Archive preview target · ${'Long captured session title '.repeat(4)}`.trim()
      await createWorkspaceSessionCommandClient(host.client).execute('session.rename', {
        sessionId: firstSession.id,
        title: firstTitle,
      })
      const first = { ...firstSession, title: firstTitle }
      const copy = getShellCopy(locale)
      const labels = copy.shell.archiveBatch
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const pageErrors: string[] = []
      let archiveWrites = 0
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.params?.commandId === 'session.archive') archiveWrites += 1
          }
          server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      await page.goto(base)
      const toolbar = page.getByRole('button', { name: labels.enter, exact: true })
      await expect(toolbar).toBeVisible()
      await toolbar.focus()
      await page.keyboard.press('Enter')
      await expect(toolbar).toHaveAttribute('aria-pressed', 'true')
      const firstRow = page.locator(`[data-session-id="${first.id}"]`)
      const firstTarget = sessionTreeItemForRow(firstRow)
      await firstTarget.focus()
      await expect(firstTarget).toHaveAccessibleName(first.title)
      await page.keyboard.press('Enter')
      await expect(firstTarget).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('heading', { name: first.title, exact: true })).toHaveCount(0)
      await page.keyboard.press('Space')
      await expect(firstTarget).toHaveAttribute('aria-checked', 'false')
      await page.keyboard.press('Enter')
      await expect(firstTarget).toHaveAttribute('aria-checked', 'true')
      await page.keyboard.press('Escape')
      await expect(toolbar).toHaveAttribute('aria-pressed', 'false')
      await expect(toolbar).toBeFocused()
      expect(archiveWrites).toBe(0)

      await toolbar.click()
      await firstTarget.click()
      const secondTarget = sessionTreeItemForRow(page.locator(`[data-session-id="${second.id}"]`))
      await secondTarget.click()
      const selection = page.getByRole('region', { name: labels.selectionTitle, exact: true })
      await expect(selection).toContainText(labels.selectedCount(2, 100))
      await mkdir('artifacts/session-archive-batch', { recursive: true })
      for (const width of [1440, 1100, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        if (width < 1024) {
          const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (await show.isVisible()) await show.click()
        }
        await expect(selection).toBeVisible()
        await expect(selection).toContainText(labels.selectedCount(2, 100))
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/session-archive-batch/select-${locale}-${width}.png` })
        if (width < 1024) {
          const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first()
          if (await hide.isVisible()) await hide.click()
        }
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      await selection.getByRole('button', { name: labels.archiveSelected, exact: true }).click()
      const confirmation = page.getByRole('region', { name: labels.previewTitle(2), exact: true })
      await expect(confirmation.locator('li[data-session-id]')).toHaveCount(2)
      await expect(
        confirmation.locator(`li[data-workspace-id="${first.workspaceId}"][data-session-id="${first.id}"]`),
      ).toBeVisible()
      await expect(
        confirmation.locator(`li[data-workspace-id="${second.workspaceId}"][data-session-id="${second.id}"]`),
      ).toBeVisible()
      await expect(confirmation.getByText(labels.project(host.ready.workspaceName), { exact: true })).toBeVisible()
      await expect(confirmation.getByRole('button', { name: labels.cancel, exact: true })).toBeFocused()
      const actionBoxes = await confirmation
        .locator('.hbar-app-react-session-archive-actions')
        .last()
        .evaluate((node) =>
          [...node.querySelectorAll<HTMLButtonElement>('button')].map((button) => {
            const box = button.getBoundingClientRect()
            return { text: button.textContent, centerY: box.y + box.height / 2 }
          }),
        )
      expect(actionBoxes.map((box) => box.text)).toEqual([labels.cancel, labels.confirm])
      const cancelBox = actionBoxes[0]
      const confirmBox = actionBoxes[1]
      if (!cancelBox || !confirmBox) throw new Error('The original archive actions are missing')
      expect(Math.abs(cancelBox.centerY - confirmBox.centerY)).toBeLessThan(2)
      for (const width of [1440, 1100, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        if (width < 1024) {
          const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (await show.isVisible()) await show.click()
        }
        await expect(confirmation).toBeVisible()
        await expect(confirmation.getByRole('button', { name: labels.confirm, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await mkdir('artifacts/session-archive-batch', { recursive: true })
        await page.screenshot({ path: `artifacts/session-archive-batch/confirm-${locale}-${width}.png` })
        if (width < 1024) {
          const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first()
          if (await hide.isVisible()) await hide.click()
        }
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      const openSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await openSidebar.isVisible()) await openSidebar.click()
      await confirmation.getByRole('button', { name: labels.cancel, exact: true }).focus()
      await page.keyboard.press('Escape')
      await expect(selection).toBeVisible()
      expect(archiveWrites).toBe(0)
      await selection.getByRole('button', { name: labels.archiveSelected, exact: true }).click()
      await page
        .getByRole('region', { name: labels.previewTitle(2), exact: true })
        .getByRole('button', { name: labels.confirm, exact: true })
        .click()
      const results = page.getByRole('region', { name: labels.previewTitle(2), exact: true })
      await expect(results.getByRole('status')).toHaveText(labels.succeeded(2))
      await expect(results.locator('li[data-result="archived"]')).toHaveCount(2)
      await expect.poll(() => archiveWrites).toBe(2)
      for (const session of [first, second]) {
        const snapshot = await host.client.call('session.get', { sessionId: session.id })
        expect(snapshot?.archived).toBe(true)
      }
      await results.getByRole('button', { name: labels.dismiss, exact: true }).click()
      expect(pageErrors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        if (host) await stopWebSessionHost(host)
        await cleanupOwnedArchiveFixture(root)
      }
    }
  })
}

test('the 100-target preview remains bounded on narrow screens and selection never exceeds its limit', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-archive-batch-limit-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      goalAutoContinue: false,
      budgetAutoContinue: false,
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      sessionCount: 101,
    })
    const sessions = await host.client.call('session.list', {
      workspaceId: host.ready.workspaceId,
      includeArchived: true,
      limit: 200,
    })
    expect(sessions.items).toHaveLength(101)
    const copy = getShellCopy('en-US')
    const labels = copy.shell.archiveBatch
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    let archiveWrites = 0
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = rpcShape.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.params?.commandId === 'session.archive') archiveWrites += 1
        }
        server.send(message)
      })
      server.onMessage((message) => socket.send(message))
    })
    await page.goto(base)
    const roster = page.locator('.hbar-app-react-session-list')
    const loadMore = roster.locator('.hbar-app-react-load-more')
    await expect(loadMore).toBeVisible()
    await loadMore.click()
    await expect(roster.locator('[data-session-id]')).toHaveCount(101)
    const toolbar = page.getByRole('button', { name: labels.enter, exact: true })
    await toolbar.click()
    const rows = roster.locator('[data-session-id]')
    for (let index = 0; index < 100; index += 1) {
      await sessionTreeItemForRow(rows.nth(index)).click()
    }
    const selectedCount = page.getByText(labels.selectedCount(100, 100), { exact: true })
    await expect(selectedCount).toBeVisible()
    const lastRow = rows.nth(100)
    const lastTarget = sessionTreeItemForRow(lastRow)
    await expect(lastTarget).toHaveAttribute('aria-checked', 'false')
    await lastTarget.click()
    await expect(page.getByText(labels.maximumReached(100), { exact: true })).toBeVisible()
    await expect(selectedCount).toBeVisible()
    const selection = page.getByRole('region', { name: labels.selectionTitle, exact: true })
    await selection.getByRole('button', { name: labels.archiveSelected, exact: true }).click()
    const confirmation = page.getByRole('region', { name: labels.previewTitle(100), exact: true })
    const targetList = confirmation.locator('ol')
    const targetReader = confirmation.locator('.hbar-app-react-session-archive-batch-reading')
    await expect(targetList.locator('li')).toHaveCount(100)
    expect(await targetReader.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await mkdir('artifacts/session-archive-batch', { recursive: true })
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      await expect(confirmation).toBeVisible()
      await expect(confirmation.getByRole('button', { name: labels.confirm, exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(await targetReader.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      await page.screenshot({ path: `artifacts/session-archive-batch/confirm-100-en-US-${width}.png` })
    }
    await confirmation.getByRole('button', { name: labels.cancel, exact: true }).focus()
    await page.keyboard.press('Escape')
    await expect(selection).toBeVisible()
    expect(archiveWrites).toBe(0)
  } finally {
    try {
      await context.close()
    } finally {
      if (host) await stopWebSessionHost(host)
      await cleanupOwnedArchiveFixture(root)
    }
  }
})
