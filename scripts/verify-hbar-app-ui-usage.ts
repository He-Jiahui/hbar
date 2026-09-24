import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { verifyUsageOverview } from './verify-hbar-app-ui-usage-overview'
import { verifyUsageModel } from './verify-hbar-app-ui-usage-model'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
let server: ReturnType<typeof Bun.spawn> | undefined
try {
  if (!(await fetch(baseUrl)).ok) throw new Error('Preview unavailable')
} catch {
  server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1'], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(baseUrl)).ok) break
    } catch {
      /* Wait only for the owned preview process. */
    }
    await Bun.sleep(100)
  }
}
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
function url(variant: number, theme = 'dark', fixture = '') {
  return `${baseUrl}/?${new URLSearchParams({ variant: `hbar-app-ui-ai-usage-${variant}`, mode: 'isolated', theme, usageFixture: fixture })}`
}
try {
  await mkdir('artifacts/app-ui-integration/usage', { recursive: true })
  if (process.argv.includes('--overview-only')) {
    await verifyUsageOverview(page, baseUrl)
    expect(errors).toEqual([])
  } else if (process.argv.includes('--model-only')) {
    await verifyUsageModel(page, baseUrl)
    expect(errors).toEqual([])
  } else {
    for (const theme of ['dark', 'light'])
      for (const width of [1192, 768, 320]) {
        await page.setViewportSize({ width, height: 760 })
        for (let variant = 1; variant <= 8; variant++) {
          await page.goto(url(variant, theme), { waitUntil: 'networkidle' })
          await expect(
            page.locator(
              variant === 1
                ? '.lumen-usage-overview'
                : variant === 2
                  ? '.lumen-usage-model-table'
                  : '.hbar-app-ui-usage-content',
            ),
          ).toBeVisible()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          if (width !== 768 && [1, 5, 7].includes(variant))
            await page.screenshot({ path: `artifacts/app-ui-integration/usage/${variant}-${width}-${theme}.png` })
        }
      }
    for (const variant of [4, 7]) {
      await page.goto(url(variant, 'dark', 'overflow'), { waitUntil: 'networkidle' })
      const viewport = page.locator('.hbar-app-ui-virtual-list')
      expect(await viewport.getByRole('listitem').count()).toBeLessThan(200)
      expect(
        await viewport.evaluate((element) => {
          element.scrollTop = element.scrollHeight
          return element.scrollTop > 0
        }),
      ).toBe(true)
      await page.goto(url(variant, 'light', 'empty'), { waitUntil: 'networkidle' })
      await expect(page.locator('.hbar-app-ui-usage-content')).toContainText(/No /)
    }
    await page.goto(url(4), { waitUntil: 'networkidle' })
    await page.getByRole('textbox', { name: 'Search people', exact: true }).fill('Mina')
    await expect(page.getByText('Mina Patel', { exact: true })).toBeVisible()
    await expect(page.getByText('Avery Chen', { exact: true })).toHaveCount(0)
    await page.goto(url(5), { waitUntil: 'networkidle' })
    await page.getByRole('slider', { name: 'Monthly cap', exact: true }).press('End')
    await page.getByRole('button', { name: 'Save budget', exact: true }).click()
    await expect(page.getByText('Budget saved', { exact: true })).toBeVisible()
    await page.goto(url(7), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Expand request req_91a2', exact: true }).click()
    await expect(page.locator('pre')).toContainText('model=balanced')
    await verifyUsageModel(page, baseUrl)
    expect(errors).toEqual([])
    console.log(
      JSON.stringify({
        variants: 8,
        viewportThemes: 48,
        virtualLists: 2,
        emptyStates: 3,
        interactions: 3,
        pageErrors: errors,
      }),
    )
  }
} finally {
  await browser.close()
  server?.kill()
}
