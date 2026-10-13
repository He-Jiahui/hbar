import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const helperOrigin = `http://127.0.0.1:${Number(process.env.HBAR_NODE_CONSOLE_E2E_PORT ?? 4339) + 1}`

async function pairingCode(role: 'operator' | 'observer'): Promise<string> {
  const response = await fetch(`${helperOrigin}/pairing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  expect(response.ok).toBeTruthy()
  const result = (await response.json()) as { code: string }
  expect(result.code).toMatch(/^\d{8}$/u)
  return result.code
}

async function pair(page: Page, role: 'operator' | 'observer') {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  if (new URL(page.url()).pathname === '/') {
    const response = await page.goto('/')
    expect(response?.ok()).toBeTruthy()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/node-console')
  }
  expect(errors).toEqual([])
  await expect(page.getByRole('heading', { name: 'Pair this browser' })).toBeVisible()
  await page.getByLabel('Device name').fill(`${role} browser`)
  await page.getByLabel('Eight-digit pairing code').fill(await pairingCode(role))
  await page.getByRole('button', { name: 'Pair with this B node' }).click()
  await expect(
    page.getByText(role === 'operator' ? 'Local operator' : 'Read-only observer', { exact: true }).first(),
  ).toBeVisible({
    timeout: 15_000,
  })
}

async function expectLumenTypography(page: Page) {
  const fonts = await page.locator('.hbar-node-console').evaluate((root) => {
    const selectors = ['&', 'h2', 'h3', 'p', 'button', 'input', 'select', 'li']
    const rootFont = getComputedStyle(root).fontFamily
    return {
      rootFont,
      families: selectors.map(
        (selector) => getComputedStyle(selector === '&' ? root : (root.querySelector(selector) ?? root)).fontFamily,
      ),
    }
  })
  expect(fonts.rootFont).not.toContain('Times New Roman')
  expect(fonts.rootFont).toMatch(/sans-serif/iu)
  expect(new Set(fonts.families)).toEqual(new Set([fonts.rootFont]))
}

async function saveRouteScreenshot(page: Page, name: string) {
  const screenshotPath = join(process.cwd(), 'artifacts', 'node-console', name)
  await mkdir(dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath, fullPage: true })
}

test('production B route pairs, controls local state, reads audit and messages, then fails closed for observer', async ({
  page,
}) => {
  const discovery = await page.request.get('/node-info')
  expect(discovery.ok()).toBeTruthy()
  await expect(discovery.json()).resolves.toMatchObject({
    role: 'workspace',
    rpcPath: '/rpc',
    consolePath: '/node-console',
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  const rootResponse = await page.goto('/')
  expect(rootResponse?.ok()).toBeTruthy()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/node-console')
  await page.evaluate(() => indexedDB.deleteDatabase(`hbar-node-console:${encodeURIComponent(location.origin)}`))
  await pair(page, 'operator')

  await expect(page.getByRole('heading', { name: 'Node connection' })).toBeVisible({ timeout: 15_000 })
  await expectLumenTypography(page)
  await expect(page.getByRole('list').getByText(/Documentation very-long-visible-root-label/u)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Allow network access' })).toBeVisible()
  await saveRouteScreenshot(page, 'operator-1440.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await saveRouteScreenshot(page, 'operator-390.png')
  await page.setViewportSize({ width: 1280, height: 900 })

  const network = page.getByRole('checkbox', { name: 'Allow network access' })
  await network.check()
  const competingWrite = await page.request.post(`${helperOrigin}/policy-race`)
  expect(competingWrite.ok()).toBeTruthy()
  await expect(competingWrite.json()).resolves.toMatchObject({ process: false })
  await page.getByRole('button', { name: 'Save local floor' }).click()
  await expect(
    page.getByText(
      'Another operator updated the floor. The latest server value is refreshed and your draft is preserved; save again to apply it to the new revision.',
    ),
  ).toBeVisible()
  await expect(network).toBeChecked()
  const serverFloor = (await page.request.post(`${helperOrigin}/policy-read`).then((response) => response.json())) as {
    floor: { process: boolean; network: boolean }
  }
  expect(serverFloor.floor.process).toBe(false)
  expect(serverFloor.floor.network).toBe(false)
  await page.getByRole('button', { name: 'Save local floor' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(network).toBeChecked()

  await page.getByRole('button', { name: 'Pause new execution' }).click()
  await expect(page.getByText('Execution admission is paused')).toBeVisible()
  await page.getByRole('button', { name: 'Resume execution' }).click()
  await expect(page.getByText('Execution admission is enabled')).toBeVisible()

  await page.getByRole('button', { name: 'Local audit' }).click()
  await expect(page.getByText('read_file · allow · none · 0')).toBeVisible()
  await page.getByRole('button', { name: 'Bound conversations' }).click()
  await page.getByRole('button', { name: /Read-only fixture conversation/ }).click()
  await expect(page.getByText('This is a read-only message supplied by the B fixture.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Local operator', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Node connection' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('checkbox', { name: 'Allow network access' })).toBeChecked()

  await page.getByRole('button', { name: 'Remove this browser device key' }).click()
  await expect(page.getByLabel('Eight-digit pairing code')).toBeVisible()
  await pair(page, 'observer')
  await expectLumenTypography(page)
  await expect(page.getByRole('heading', { name: 'Bound conversations' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Local audit' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pause new execution' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Resume execution' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save local floor' })).toHaveCount(0)
  await page.getByRole('button', { name: /Read-only fixture conversation/ }).click()
  await expect(page.getByText('This is a read-only message supplied by the B fixture.')).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 900 })
  await saveRouteScreenshot(page, 'observer-1440.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await saveRouteScreenshot(page, 'observer-390.png')
  const dimensions = await page.locator('.hbar-node-console').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.scrollHeight,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  expect(dimensions.height).toBeGreaterThan(500)
  const sessionButton = page.getByRole('button', { name: /Read-only fixture conversation/ })
  const box = await sessionButton.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
})
