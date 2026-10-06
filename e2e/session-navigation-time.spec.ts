import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session title and time stay on one navigable row at desktop and narrow widths: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-time-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const directory = createWorkspaceSessionCommandClient(host.client)
      const session = await directory.execute(
        'session.create',
        {
          workspaceId: host.ready.workspaceId,
          title:
            'A long session title should stay readable while its updated time and actions remain in the same row — 会话标题',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const row = page.locator(`[data-session-id="${session.id}"]`)
      const target = row.locator('.hbar-app-react-session-target')
      const time = row.locator('time.hbar-app-react-session-time')
      const checkRow = async () => {
        await expect(target).toBeVisible()
        await expect(time).toHaveText(locale === 'en-US' ? 'now' : '刚刚')
        await expect(time).toHaveAttribute('dateTime', new Date(session.updatedAt).toISOString())
        await expect(time).toHaveAttribute('title', copy.shell.sessionUpdatedAtFull(session.updatedAt))
        const bounds = await row.evaluate((element) => {
          const title = element.querySelector('.hbar-app-react-session-title') as HTMLElement
          const time = element.querySelector('time') as HTMLElement
          const action = element.querySelector('.lumen-action-menu') as HTMLElement
          const titleRect = title.getBoundingClientRect()
          const timeRect = time.getBoundingClientRect()
          const actionRect = action.getBoundingClientRect()
          return {
            sameLine: Math.abs(titleRect.top - timeRect.top) < 4,
            ordered: titleRect.right <= timeRect.left && timeRect.right <= actionRect.left,
            titleTruncated: title.scrollWidth > title.clientWidth,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          }
        })
        expect(bounds).toEqual({ sameLine: true, ordered: true, titleTruncated: true, overflow: false })
      }
      await target.click()
      await checkRow()
      await page.screenshot({ path: testInfo.outputPath(`session-time-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 720 })
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await checkRow()
      const trigger = row.locator('.lumen-action-menu-trigger')
      await trigger.click()
      const menu = await lumenMenuForTrigger(trigger)
      await expect(menu.getByRole('menuitem', { name: copy.shell.renameSession, exact: true })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: copy.shell.archiveSession, exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await page.screenshot({ path: testInfo.outputPath(`session-time-${locale}-320.png`) })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
