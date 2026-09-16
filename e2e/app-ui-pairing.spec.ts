import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { HbarClient } from '../packages/client/src'

test('pairing uses English host copy and light theme without unsupported recovery actions', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string }
  await context.addInitScript(() =>
    localStorage.setItem(
      'hbar.workbench.v1',
      JSON.stringify({ version: 6, state: { locale: 'en-US', theme: 'light' } }),
    ),
  )
  await page.goto(fixture.url)
  const form = page.locator('.hbar-app-ui-code-verification')
  await expect(form.getByRole('heading', { name: 'Pair this device', exact: true })).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'Pairing code', exact: true })).toHaveAttribute('maxlength', '8')
  await expect(form.getByRole('button')).toHaveCount(1)
  await expect(form.getByRole('button', { name: 'Pair and connect', exact: true })).toBeDisabled()
  await page.screenshot({ path: 'artifacts/app-ui-integration/pairing-light.png' })
})

test('shared authentication form retains failed drafts and pairs a real device before refresh', async ({ page }) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  const controller = new HbarClient(fixture.url, fixture.token)
  await controller.connect()
  try {
    await page.goto(fixture.url)
    const form = page.locator('.hbar-app-ui-code-verification')
    await expect(form).toBeVisible()
    await form.getByRole('textbox', { name: '配对码', exact: true }).fill('00000000')
    await form.getByRole('textbox', { name: '设备名称', exact: true }).fill('Pairing regression device')
    await form.getByRole('button', { name: '配对并连接', exact: true }).click()
    await expect(form.getByRole('alert')).toContainText('Invalid or expired')
    await expect(form.getByRole('textbox', { name: '设备名称', exact: true })).toHaveValue('Pairing regression device')
    const pairing = await controller.call('pairing.create', {})
    await form.getByRole('textbox', { name: '配对码', exact: true }).fill(pairing.code)
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/app-ui-integration/pairing-mobile.png' })
    await form.getByRole('button', { name: '配对并连接', exact: true }).click()
    await expect(page.locator('.app-shell')).toBeVisible()
    expect((await controller.call('device.list', {})).some((item) => item.name === 'Pairing regression device')).toBe(
      true,
    )
    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
  } finally {
    controller.disconnect()
  }
})
