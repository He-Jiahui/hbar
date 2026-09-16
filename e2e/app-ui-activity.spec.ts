import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('activity uses session totals, labels loaded runs, and virtualizes real trace history', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  await page.goto(fixture.url)
  await page.locator('.session-select').filter({ hasText: '10k history' }).click()
  await page.getByRole('button', { name: '运行与事件', exact: true }).click()
  const panel = page.locator('.hbar-app-ui-activity-panel').filter({ visible: true })
  await expect(panel.getByRole('heading', { name: '整段会话累计', exact: true })).toBeVisible()
  await expect(panel).toContainText(/已加载 \d+ 次运行/)
  await panel.getByRole('button', { name: '事件', exact: true }).click()
  await expect(panel).toContainText('近期已加载 200 条事件')
  const list = panel.locator('.hbar-app-ui-virtual-list')
  await expect(async () => {
    const mounted = await list.getByRole('listitem').count()
    expect(mounted).toBeGreaterThan(0)
    expect(mounted).toBeLessThan(200)
  }).toPass()
  const first = panel.locator('.hbar-app-ui-event-row').first()
  const eventType = await first.locator('code').innerText()
  await first.click()
  const details = page.getByRole('dialog', { name: eventType, exact: true })
  await expect(details.locator('pre')).toContainText('eventId')
  await details.getByRole('button', { name: '关闭', exact: true }).click()
  expect(
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return element.scrollTop > 0
    }),
  ).toBe(true)
  await expect(panel.getByRole('button', { name: '事件', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'artifacts/app-ui-integration/activity-desktop.png' })
})
