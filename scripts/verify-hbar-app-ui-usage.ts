import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { verifyUsageOverview } from './verify-hbar-app-ui-usage-overview'
import { verifyUsageModel } from './verify-hbar-app-ui-usage-model'
import { verifyUsageLimits } from './verify-hbar-app-ui-usage-limits'
import { verifyUsageMembers } from './verify-hbar-app-ui-usage-members'
import { verifyUsageBudget } from './verify-hbar-app-ui-usage-budget'
import { verifyUsageOverage } from './verify-hbar-app-ui-usage-overage'
import { verifyUsageRequests } from './verify-hbar-app-ui-usage-requests'

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
  } else if (process.argv.includes('--limits-only')) {
    await verifyUsageLimits(page, baseUrl)
    expect(errors).toEqual([])
  } else if (process.argv.includes('--members-only')) {
    await verifyUsageMembers(page, baseUrl)
    expect(errors).toEqual([])
  } else if (process.argv.includes('--budget-only')) {
    await verifyUsageBudget(page, baseUrl)
    expect(errors).toEqual([])
  } else if (process.argv.includes('--overage-only')) {
    await verifyUsageOverage(page, baseUrl)
    expect(errors).toEqual([])
  } else if (process.argv.includes('--requests-only')) {
    await verifyUsageRequests(page, baseUrl)
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
                  : variant === 3
                    ? '.lumen-usage-rate-panel'
                    : variant === 4
                      ? '.lumen-usage-member-list'
                      : variant === 5
                        ? '.lumen-usage-budget-panel'
                        : variant === 6
                          ? '.lumen-usage-overage-panel'
                          : variant === 7
                            ? '.lumen-usage-request-table'
                            : '.hbar-app-ui-usage-content',
            ),
          ).toBeVisible()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          if (width !== 768 && [1, 5, 7].includes(variant))
            await page.screenshot({ path: `artifacts/app-ui-integration/usage/${variant}-${width}-${theme}.png` })
        }
      }
    await verifyUsageRequests(page, baseUrl)
    await verifyUsageMembers(page, baseUrl)
    await verifyUsageBudget(page, baseUrl)
    await verifyUsageOverage(page, baseUrl)
    await verifyUsageModel(page, baseUrl)
    await verifyUsageLimits(page, baseUrl)
    expect(errors).toEqual([])
    console.log(
      JSON.stringify({
        variants: 8,
        viewportThemes: 48,
        pagedLists: 1,
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
