import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const widths = [320, 390, 768, 1024, 1440] as const

async function authenticate(page: import('@playwright/test').Page, token: string): Promise<string> {
  const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
  const response = await page.request.post(`${base}/auth/token`, { data: { token } })
  expect(response.ok()).toBe(true)
  return base
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`status filters preserve flow and popup semantics across widths: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-status-controls-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const page = await context.newPage()
      let usageQueryCount = 0
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string' && /"commandId"\s*:\s*"usage\.query"/.test(message)) usageQueryCount += 1
          server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      const base = await authenticate(page, host.ready.token)
      const copy = getShellCopy(locale)
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await page.getByRole('button', { name: copy.shell.status, exact: true }).click()
      const status = page.locator('.hbar-app-react-status-workspace')
      await expect(status.getByRole('heading', { level: 1, name: copy.status.title, exact: true })).toBeVisible()
      await status
        .getByRole('navigation', { name: copy.status.tabs, exact: true })
        .getByRole('button', {
          name: copy.status.sections.usage,
          exact: true,
        })
        .click()
      const controls = status.getByRole('group', { name: copy.status.usage.filters, exact: true })
      const scope = controls.getByRole('combobox', { name: copy.status.usage.scope, exact: true })
      const advanced = controls.locator('.hbar-app-react-status-filter-details > .hbar-lumen-disclosure-trigger')
      const exportTrigger = controls.locator(
        `.lumen-action-menu > summary[aria-label=${JSON.stringify(copy.status.usage.export)}], ` +
          `.lumen-action-menu > button.lumen-action-menu-trigger[aria-label=${JSON.stringify(copy.status.usage.export)}]`,
      )
      await expect(scope).toBeVisible()
      await expect(advanced).toBeVisible()
      await expect(exportTrigger).toBeVisible()

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        await expect(scope).toBeVisible()
        await expect(advanced).toBeVisible()
        await expect(exportTrigger).toBeVisible()
        await expect(page.locator('.hbar-app-react-status-workspace')).toHaveCount(1)

        const orderBefore = await controls.evaluate((element) => {
          const scope = element.querySelector('#hbar-status-usage-scope')
          const advanced = element.querySelector('.hbar-app-react-status-filter-details')
          const exportTrigger = element.querySelector('.lumen-action-menu')
          if (!scope || !advanced || !exportTrigger) throw new Error('Status filter controls are incomplete')
          return {
            scopeBeforeAdvanced: Boolean(scope.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING),
            advancedBeforeExport: Boolean(
              advanced.compareDocumentPosition(exportTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          }
        })
        expect(orderBefore).toEqual({ scopeBeforeAdvanced: true, advancedBeforeExport: true })

        const geometry = await scope.evaluate((element) => {
          const trigger = element as HTMLElement
          const label = trigger.querySelector('.lumen-popup-select-label') as HTMLElement | null
          const chevron = trigger.querySelector('.lumen-popup-select-chevron') as HTMLElement | null
          if (!label || !chevron) throw new Error('Popup select trigger is missing label or chevron')
          const triggerBox = trigger.getBoundingClientRect()
          const labelStyle = getComputedStyle(label)
          const chevronBox = chevron.getBoundingClientRect()
          const paddingInlineEnd =
            Number.parseFloat(labelStyle.paddingInlineEnd) ||
            Number.parseFloat(getComputedStyle(trigger).paddingInlineEnd) ||
            0
          return {
            triggerRight: triggerBox.right,
            chevronRight: chevronBox.right,
            paddingInlineEnd,
            labelOverflow: label.scrollWidth > label.clientWidth,
            labelTextOverflow: labelStyle.textOverflow,
          }
        })
        expect(Math.abs(geometry.triggerRight - geometry.chevronRight - geometry.paddingInlineEnd)).toBeLessThanOrEqual(
          1,
        )
        expect(geometry.labelOverflow).toBe(false)
        expect(geometry.labelTextOverflow).not.toBe('ellipsis')
        const controlsBounds = await controls.boundingBox()
        const exportBounds = await exportTrigger.boundingBox()
        expect(controlsBounds).not.toBeNull()
        expect(exportBounds).not.toBeNull()
        expect((controlsBounds?.right ?? 0) - (exportBounds?.right ?? 0)).toBeGreaterThanOrEqual(0)
        expect((controlsBounds?.right ?? 0) - (exportBounds?.right ?? 0)).toBeLessThan(20)

        await exportTrigger.click()
        const exportMenu = page.getByRole('menu', { name: copy.status.usage.export, exact: true })
        await expect(exportMenu).toBeVisible()
        await expect(
          exportMenu.getByRole('menuitem', { name: copy.status.usage.exportJson, exact: true }),
        ).toBeVisible()
        await expect(exportMenu.getByRole('menuitem', { name: copy.status.usage.exportCsv, exact: true })).toBeVisible()
        await expect(exportMenu).toHaveCSS('max-height', /.+/)
        await page.keyboard.press('Escape')
        await expect(exportMenu).toBeHidden()

        await advanced.click()
        await expect(advanced).toHaveAttribute('aria-expanded', 'true')
        const orderAfter = await controls.evaluate((element) => {
          const scope = element.querySelector('#hbar-status-usage-scope')
          const advanced = element.querySelector('.hbar-app-react-status-filter-details')
          const exportTrigger = element.querySelector('.lumen-action-menu')
          if (!scope || !advanced || !exportTrigger) throw new Error('Status filter controls are incomplete')
          return {
            scopeBeforeAdvanced: Boolean(scope.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING),
            advancedBeforeExport: Boolean(
              advanced.compareDocumentPosition(exportTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          }
        })
        expect(orderAfter).toEqual(orderBefore)

        const advancedContent = controls.locator(
          '.hbar-app-react-status-filter-details > .hbar-lumen-disclosure-content',
        )
        await expect(advancedContent).toBeVisible()
        const expandedBounds = await advancedContent.boundingBox()
        expect(expandedBounds).not.toBeNull()
        expect(expandedBounds?.width ?? 0).toBeGreaterThanOrEqual(((await controls.boundingBox())?.width ?? 0) - 32)
        await expect(advancedContent.locator('.lumen-popup-select-listbox')).toHaveCount(0)
        await advanced.click()
        await expect(advanced).toHaveAttribute('aria-expanded', 'false')

        await scope.click()
        await expect(scope).toHaveAttribute('aria-expanded', 'true')
        const listboxId = await scope.getAttribute('aria-controls')
        expect(listboxId).toBeTruthy()
        const listbox = page.locator(`[id=${JSON.stringify(listboxId)}]`)
        await expect(listbox).toBeVisible()
        await expect(listbox).toHaveCSS('overflow-y', 'auto')
        await expect(listbox).toHaveCSS('max-height', /.+/)
        await page.keyboard.press('Escape')
        await expect(scope).toHaveAttribute('aria-expanded', 'false')
        const beforeScopeQuery = usageQueryCount
        await selectLumenOption(scope, 'workspace')
        await expect(scope).toHaveAttribute('data-value', 'workspace')
        await expect(scope).toHaveAttribute('aria-expanded', 'false')
        await expect.poll(() => usageQueryCount).toBeGreaterThan(beforeScopeQuery)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
