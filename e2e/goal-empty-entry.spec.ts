import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`empty Goals pane opens a creation editor and persists the Host Goal: ${locale}`, async ({ browser }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-empty-entry-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const goals = createGoalPlanCommandClient(host.client)
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      await expect(page.getByText(copy.shell.connected, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'goals')
      const pane = page.locator('.hbar-app-react-goal-plan-workspace')
      await expect(pane.getByRole('heading', { name: copy.goals.title, exact: true })).toBeVisible()
      await expect(pane.getByText(copy.goals.goal.composerHint, { exact: true })).toBeVisible()
      const create = pane.getByRole('button', { name: copy.goals.goal.create, exact: true })
      await expect(create).toBeEnabled()
      expect((await goals.execute('goal.get', { sessionId: host.ready.sessionId })).goal).toBeNull()
      await page.screenshot({ path: `artifacts/desktop-experience/goal-empty-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(create).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
      await page.screenshot({ path: `artifacts/desktop-experience/goal-empty-${locale}-320.png` })
      await create.click()
      const objective = `Goal from empty pane ${locale}`
      await pane.getByRole('textbox', { name: copy.goals.goal.objective, exact: true }).fill(objective)
      await pane.getByRole('button', { name: copy.goals.goal.save, exact: true }).click()
      await expect(pane.getByText(copy.goals.goal.saved, { exact: true })).toBeVisible()
      expect((await goals.execute('goal.get', { sessionId: host.ready.sessionId })).goal?.objective).toBe(objective)
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
