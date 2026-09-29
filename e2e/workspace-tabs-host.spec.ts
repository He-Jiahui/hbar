import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const en = getShellCopy('en-US')
const tabCopy = workspaceTabsCopy((_zh, english) => english)

test('real Host session tabs retain independent drafts, close views only, and restore their selected survivor', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-tabs-host-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, sessionCount: 2, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base())
    await page.getByRole('button', { name: en.shell.openSession('Session 001'), exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Session 001', exact: true })).toBeVisible()
    await page.getByRole('textbox', { name: 'Prompt' }).fill('draft for one')
    await page.getByRole('button', { name: en.shell.openSession('Session 002'), exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toBeVisible()
    await page.getByRole('textbox', { name: 'Prompt' }).fill('draft for two')
    await page.getByRole('tab', { name: 'Session 001', exact: true }).click()
    await expectComposerText(page.getByRole('textbox', { name: 'Prompt' }), 'draft for one')
    await page.getByRole('button', { name: tabCopy.tabs.close('Session 001'), exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Session 001', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expectComposerText(page.getByRole('textbox', { name: 'Prompt' }), 'draft for two')
    await page.screenshot({ path: 'artifacts/reference-ux-v2/hbar-tabs-host-selected-1440.png' })
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Session 001', exact: true })).toHaveCount(0)
    await page.setViewportSize({ width: 320, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const mobileNavigation = page.locator('.hbar-mobile-header-menu-trigger')
    await expect(mobileNavigation).toBeVisible()
    await mobileNavigation.click()
    await expect(
      page
        .locator('.hbar-mobile-header-menu-content')
        .getByRole('region', { name: tabCopy.tabs.tabs, exact: true })
        .getByRole('button', { name: `Session 002 — ${host.ready.workspaceName}`, exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: 'artifacts/reference-ux-v2/hbar-tabs-host-selected-320.png' })
    await mobileNavigation.click()
    const sidebar = page.getByRole('complementary', { name: en.shell.projectsAndSessions, exact: true })
    if (!(await sidebar.isVisible()))
      await page.getByRole('button', { name: en.shell.showSidebar, exact: true }).click()
    await sidebar.getByRole('button', { name: en.shell.openSession('Session 001'), exact: true }).click()
    const hideSidebar = page.getByRole('button', { name: en.shell.hideSidebar, exact: true })
    if (await hideSidebar.isVisible()) await hideSidebar.click()
    await mobileNavigation.click()
    const mobileTabs = page.locator('.hbar-mobile-header-menu-content').getByRole('region', {
      name: tabCopy.tabs.tabs,
      exact: true,
    })
    await expect(
      mobileTabs.getByRole('button', { name: `Session 001 — ${host.ready.workspaceName}`, exact: true }),
    ).toBeVisible()
    await mobileTabs.getByRole('button', { name: tabCopy.tabs.close('Session 002'), exact: true }).click()
    await expect(mobileNavigation).toBeFocused()
    await mobileNavigation.click()
    await expect(
      page
        .locator('.hbar-mobile-header-menu-content')
        .getByRole('region', { name: tabCopy.tabs.tabs, exact: true })
        .getByRole('button', { name: `Session 002 — ${host.ready.workspaceName}`, exact: true }),
    ).toHaveCount(0)
    const pageOfSessions = await createWorkspaceSessionCommandClient(host.client).execute('session.list', {
      workspaceId: host.ready.workspaceId,
      limit: 100,
    })
    expect(pageOfSessions.items).toHaveLength(2)
    expect(pageOfSessions.items.some((session) => session.title === 'Session 001')).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('the 33rd visible tab is rejected before selecting or creating another Host session', async ({ browser }) => {
  test.setTimeout(180_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-tabs-capacity-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, sessionCount: 33, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base())
    for (let index = 1; index <= 32; index++) {
      const title = `Session ${String(index).padStart(3, '0')}`
      await page.getByRole('button', { name: en.shell.openSession(title), exact: true }).click()
      await expect(page.getByRole('tab', { name: title, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('tab')).toHaveCount(32)
    await page.getByRole('button', { name: en.shell.openSession('Session 033'), exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Session 033', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab')).toHaveCount(32)
    await expect(page.getByRole('tab', { name: 'Session 032', exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: en.shell.newSession, exact: true }).click()
    const sessions = await createWorkspaceSessionCommandClient(host.client).execute('session.list', {
      workspaceId: host.ready.workspaceId,
      limit: 100,
    })
    expect(sessions.items).toHaveLength(33)
    await page.setViewportSize({ width: 320, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const mobileNavigation = page.locator('.hbar-mobile-header-menu-trigger')
    await mobileNavigation.click()
    const mobileTabs = page.locator('.hbar-mobile-header-menu-content').getByRole('region', {
      name: tabCopy.tabs.tabs,
      exact: true,
    })
    const lastVisibleSession = mobileTabs.getByRole('button', {
      name: `Session 032 — ${host.ready.workspaceName}`,
      exact: true,
    })
    await lastVisibleSession.scrollIntoViewIfNeeded()
    await expect(lastVisibleSession).toBeVisible()
    await expect(
      mobileTabs.getByRole('button', { name: `Session 033 — ${host.ready.workspaceName}`, exact: true }),
    ).toHaveCount(0)
    await page.screenshot({ path: 'artifacts/reference-ux-v2/hbar-tabs-host-overflow-320.png' })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('real Host multi-tab menu closes the original scope and returns to the surviving neighbour', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-tabs-menu-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, sessionCount: 3, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base())
    for (let index = 1; index <= 3; index++) {
      const title = `Session ${String(index).padStart(3, '0')}`
      await page.getByRole('button', { name: en.shell.openSession(title), exact: true }).click()
      await expect(page.getByRole('tab', { name: title, exact: true })).toBeVisible()
    }
    await page.getByRole('tab', { name: 'Session 002', exact: true }).click({ button: 'right' })
    const menu = page.getByRole('menu', { name: tabCopy.tabs.menu('Session 002') })
    await menu.getByRole('menuitem', { name: tabCopy.tabs.action('left'), exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Session 001', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Session 003', exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Session 002', exact: true }).click({ button: 'right' })
    await menu.getByRole('menuitem', { name: tabCopy.tabs.action('others'), exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Session 003', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toBeFocused()
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab')).toHaveCount(1)
    const sessions = await createWorkspaceSessionCommandClient(host.client).execute('session.list', {
      workspaceId: host.ready.workspaceId,
      limit: 100,
    })
    expect(sessions.items).toHaveLength(3)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})

test('a lost Host activity read offers keep-running without retrying cancellation or losing focus', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-tabs-unknown-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, sessionCount: 2, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const envelope = z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
    let faultReads = false
    let cancellations = 0
    const activityReads = new Set<string | number>()
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.params?.commandId === 'operation.cancel') cancellations++
          if (
            faultReads &&
            parsed.success &&
            parsed.data.params?.commandId === 'session.activeOperations' &&
            parsed.data.id !== undefined
          )
            activityReads.add(parsed.data.id)
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.id !== undefined && activityReads.delete(parsed.data.id)) {
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Fixture lost activity read', data: 'DISCONNECTED' },
              }),
            )
            return
          }
        }
        socket.send(message)
      })
    })
    await page.goto(base())
    for (const title of ['Session 001', 'Session 002']) {
      await page.getByRole('button', { name: en.shell.openSession(title), exact: true }).click()
      await expect(page.getByRole('tab', { name: title, exact: true })).toBeVisible()
    }
    faultReads = true
    await page.getByRole('button', { name: tabCopy.tabs.close('Session 002'), exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: tabCopy.close.title })
    await expect(dialog.getByRole('button', { name: tabCopy.close.recheck, exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: tabCopy.close.keepRunning, exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: tabCopy.close.stopAndClose, exact: true })).toHaveCount(0)
    await page.screenshot({ path: 'artifacts/reference-ux-v2/hbar-tabs-host-unknown-1440.png' })
    await dialog.getByRole('button', { name: tabCopy.close.keepRunning, exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Session 001', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Session 001', exact: true })).toBeFocused()
    expect(cancellations).toBe(0)
    const sessions = await createWorkspaceSessionCommandClient(host.client).execute('session.list', {
      workspaceId: host.ready.workspaceId,
      limit: 100,
    })
    expect(sessions.items).toHaveLength(2)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
