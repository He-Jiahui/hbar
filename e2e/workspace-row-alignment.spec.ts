import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-workspace-row-alignment-'
async function cleanupFixture(root: string) {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing to remove an unowned workspace alignment fixture')
  await rm(exact, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`workspace row is start-aligned for short and long names, expanded and collapsed: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(60_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({
      locale,
      colorScheme: locale === 'zh-CN' ? 'dark' : 'light',
      viewport: { width: 1440, height: 900 },
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const workspaceId = host.ready.workspaceId
      const directory = createWorkspaceSessionCommandClient(host.client)
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const project = page.locator(`[data-sidebar-level="project"][data-workspace-id="${host.ready.workspaceId}"]`)
      const button = project.locator('.hbar-app-react-workspace-row')
      for (const displayName of [
        'hbar',
        locale === 'zh-CN'
          ? '一个很长的工程名称，用于验证项目图标左对齐和右侧操作按钮不被挤出'
          : 'A long project name preserving left alignment and trailing actions',
      ]) {
        const snapshot = await directory.execute('workspaceDisplayNames.get', {})
        await directory.execute(
          'workspaceDisplayNames.apply',
          {
            workspaceId: host.ready.workspaceId,
            expectedRevision: snapshot.revision,
            expectedDisplayName:
              snapshot.entries.find((entry) => entry.workspaceId === workspaceId)?.displayName ?? null,
            displayName,
          },
          { idempotencyKey: crypto.randomUUID() },
        )
        await expect(button).toContainText(displayName)
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 })
          const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (await showSidebar.isVisible()) await showSidebar.click()
          await expect(button).toBeVisible()
          const geometry = await button.evaluate((element) => {
            const style = getComputedStyle(element)
            const bounds = element.getBoundingClientRect()
            const chevron = element.querySelector('svg')
            if (!chevron) throw new Error('Missing project disclosure icon')
            return {
              justify: style.justifyContent,
              align: style.textAlign,
              startGap: chevron.getBoundingClientRect().left - bounds.left,
              inset: Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth),
              fits: element.scrollWidth <= element.clientWidth + 1,
            }
          })
          expect(geometry.justify).toBe('flex-start')
          expect(geometry.align).toBe('start')
          expect(Math.abs(geometry.startGap - geometry.inset)).toBeLessThan(1)
          expect(geometry.fits).toBe(true)
          await button.hover()
          const actions = project.locator('.hbar-app-react-project-menu .lumen-action-menu-trigger')
          await expect(actions).toBeVisible()
          await actions.click({ trial: true })
          await button.click()
          await expect(button).toHaveAttribute('aria-expanded', 'false')
          await button.press('Space')
          await expect(button).toHaveAttribute('aria-expanded', 'true')
          await page.screenshot({
            path: info.outputPath(`project-${displayName === 'hbar' ? 'short' : 'long'}-${width}.png`),
          })
        }
      }
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await cleanupFixture(root)
        }
      }
    }
  })
}
