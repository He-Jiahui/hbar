import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('shared tool headings and disclosed usage retain content flow at desktop and narrow widths', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-layout-'))
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US' })
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const title = 'A very long session title that must never squeeze the tool title into individual letters'
    await createWorkspaceSessionCommandClient(host.client).execute('session.rename', {
      sessionId: host.ready.sessionId,
      title,
    })
    await createGoalPlanCommandClient(host.client).execute('goal.create', {
      sessionId: host.ready.sessionId,
      objective: 'Check layout state',
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('button', { name: /^Open session / }).click()
    for (const viewport of [
      { width: 1440, height: 960 },
      { width: 900, height: 600 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await page.locator('.hbar-session-usage-trigger').click()
      const dialog = page.getByRole('dialog', { name: 'Usage and budget', exact: true })
      const usage = dialog.locator('.lumen-inline-usage')
      await expect(usage).toBeVisible()
      const usageGeometry = await usage.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        flow: getComputedStyle(element).flexDirection,
        childBases: [...element.children].map((child) => getComputedStyle(child).flexBasis),
      }))
      expect(usageGeometry, JSON.stringify(usageGeometry)).toMatchObject({
        flow: 'column',
      })
      expect(usageGeometry.height).toBeLessThan(viewport.height * 0.7)
      await page.screenshot({ path: `artifacts/session-autonomy/usage-layout-${viewport.width}.png`, fullPage: true })
      await dialog.getByRole('button', { name: 'Close usage and budget' }).click()
      await page.getByRole('button', { name: 'Goals and plans', exact: true }).click()
      const heading = page.locator('.hbar-app-react-goal-plan-workspace .lumen-tool-pane-heading')
      await expect(heading.getByRole('heading', { level: 2 })).toHaveText('Goals and plans')
      const geometry = await heading.evaluate((element) => {
        const title = element.querySelector('h2')!
        const target = element.querySelector('span')!
        const titleBox = title.getBoundingClientRect()
        return {
          titleWidth: titleBox.width,
          titleHeight: titleBox.height,
          lineHeight: parseFloat(getComputedStyle(title).lineHeight),
          targetWidth: target.getBoundingClientRect().width,
          available: element.getBoundingClientRect().width,
        }
      })
      expect(geometry.titleHeight, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1)
      expect(geometry.titleWidth).toBeGreaterThan(80)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/session-autonomy/layout-${viewport.width}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Close goals and plans', exact: true }).click()
    }
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
