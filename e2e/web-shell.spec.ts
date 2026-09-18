import { expect, test } from '@playwright/test'

for (const locale of ['zh-CN', 'en-US'] as const) {
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    test(`command shell without a Host: ${locale} ${viewport.width}`, async ({ browser }) => {
      const context = await browser.newContext({ locale, viewport })
      const page = await context.newPage()
      const errors: string[] = []
      const businessRequests: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname === '/rpc') businessRequests.push(socket.url())
      })
      page.on('request', (request) => {
        if (/\/(rpc|auth|api|healthz)(?:[/?]|$)/.test(new URL(request.url()).pathname))
          businessRequests.push(request.url())
      })
      await page.addInitScript(() => localStorage.setItem('hbar.workbench.v1', '{broken legacy state'))
      try {
        await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
        await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          locale === 'zh-CN' ? '选择一个会话' : 'Select a session',
        )
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await expect(page.getByRole('complementary')).toBeVisible()
        await expect(page.locator('footer')).toContainText(locale === 'zh-CN' ? '未连接' : 'Disconnected')
        await expect(page.getByRole('button', { name: locale === 'zh-CN' ? '命令' : 'Commands' })).toBeVisible()
        await page.keyboard.press('Control+K')
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'zh-CN' ? '命令' : 'Commands')
        await page.getByRole('button', { name: locale === 'zh-CN' ? '设置' : 'Settings' }).click()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'zh-CN' ? '设置' : 'Settings')
        await expect(page.getByText(locale === 'zh-CN' ? '尚无工程' : 'No projects yet')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/web-b1/shell-${locale}-${viewport.width}.png`, fullPage: true })
        await page.reload()
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        expect(await page.evaluate(() => localStorage.getItem('hbar.workbench.v1'))).toBe('{broken legacy state')
        expect(businessRequests.length).toBeGreaterThan(0)
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
}
