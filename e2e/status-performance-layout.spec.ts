import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeFixture(root: string): Promise<void> {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-performance-visual-')
  )
    throw new Error('Unowned performance fixture path')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`performance charts follow actual Host filters and system appearance in normal flow: ${locale} ${mode}`, async ({
      browser,
    }, info) => {
      test.setTimeout(120_000)
      const root = await mkdtemp(join(tmpdir(), 'hbar-performance-visual-'))
      const context = await browser.newContext({ locale, colorScheme: mode, viewport: { width: 1440, height: 960 } })
      let host: WebSessionHost | undefined
      try {
        host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
        const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
        expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
          true,
        )
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        const copy = getShellCopy(locale)
        await page.goto(base)
        await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
        await page.getByRole('button', { name: copy.shell.status, exact: true }).click()
        await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', mode)
        const status = page.locator('.hbar-app-react-status-workspace')
        const system = status.getByRole('img', { name: copy.status.readings.systemCpuPercent, exact: true })
        const hostChart = status.getByRole('img', { name: copy.status.readings.hostCpuPercent, exact: true })
        for (const width of [1440, 900, 390, 320]) {
          await page.setViewportSize({ width, height: 960 })
          const headerRowsOverlap = await status.locator('.lumen-page-header').evaluate((element) => {
            const rows = [...element.children].map((child) => child.getBoundingClientRect())
            return Math.max(...rows.map((row) => row.top)) < Math.min(...rows.map((row) => row.bottom))
          })
          expect(headerRowsOverlap).toBe(true)
          const heading = await status.locator('.lumen-page-header > .lumen-page-heading').evaluate((element) => {
            const style = getComputedStyle(element)
            const content = [...element.children]
            return {
              height: element.getBoundingClientRect().height,
              contentHeight:
                content.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) +
                (parseFloat(style.rowGap) || 0) * Math.max(0, content.length - 1) +
                parseFloat(style.paddingTop) +
                parseFloat(style.paddingBottom),
            }
          })
          expect(heading.height, JSON.stringify(heading)).toBeLessThanOrEqual(heading.contentHeight + 1)
          for (const chart of [system, hostChart]) {
            await chart.scrollIntoViewIfNeeded()
            await expect(chart.locator('canvas')).toBeVisible()
            await expect
              .poll(() =>
                chart.evaluate((element) => {
                  const bounds = element.getBoundingClientRect()
                  const canvas = element.querySelector('canvas')?.getBoundingClientRect()
                  return Boolean(
                    canvas &&
                    canvas.width > 0 &&
                    canvas.height > 0 &&
                    canvas.left >= bounds.left - 1 &&
                    canvas.right <= bounds.right + 1 &&
                    canvas.top >= bounds.top - 1 &&
                    canvas.bottom <= bounds.bottom + 1 &&
                    document.documentElement.scrollWidth <= innerWidth + 1,
                  )
                }),
              )
              .toBe(true)
          }
          await page.screenshot({ path: info.outputPath(`performance-${locale}-${mode}-${width}.png`), fullPage: true })
        }
        await expect(status.getByText(copy.status.title, { exact: true })).toHaveCount(1)
        const filters = status.getByRole('group', { name: copy.status.performanceFilters.label, exact: true })
        const target = filters.getByRole('combobox', { name: copy.status.performanceFilters.target, exact: true })
        const timeWindow = filters.getByRole('combobox', {
          name: copy.status.performanceFilters.timeWindow,
          exact: true,
        })
        await selectLumenOption(target, 'host')
        await expect(target).toHaveAttribute('data-value', 'host')
        await expect(system).toHaveCount(0)
        await expect(hostChart).toBeVisible()
        await selectLumenOption(timeWindow, '2m')
        await expect(timeWindow).toHaveAttribute('data-value', '2m')
        await expect(hostChart.locator('canvas')).toBeVisible()
        await selectLumenOption(target, 'all')
        await expect(system.locator('canvas')).toBeVisible()
        expect(errors).toEqual([])
      } finally {
        try {
          await context.close()
        } finally {
          try {
            if (host) await stopWebSessionHost(host)
          } finally {
            await removeFixture(root)
          }
        }
      }
    })
