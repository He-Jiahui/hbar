import { chromium, type Locator, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type Fixture = 'empty' | 'one' | 'overflow' | 'duplicate' | 'localized' | 'unavailable' | 'retry'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function ready(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  try { if ((await fetch(baseUrl)).ok) return undefined } catch { /* Start the local preview. */ }
  const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], { stdout: 'ignore', stderr: 'ignore' })
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    try { if ((await fetch(baseUrl)).ok) return server } catch { /* Wait for Vite. */ }
  }
  server.kill()
  throw new Error('System preview did not start')
}

async function open(page: Page, fixture?: Fixture): Promise<Locator> {
  const params = new URLSearchParams({ variant: 'hbar-app-ui-notifications-5', mode: 'isolated', theme: 'light' })
  if (fixture) params.set('systemFixture', fixture)
  await page.goto(`${baseUrl}/?${params}`, { waitUntil: 'networkidle' })
  const root = page.locator('[data-hbar-app-ui-component="hbar-app-ui-notifications-5"]')
  await root.getByRole('heading', { name: fixture === 'localized' ? 'Systemmeldungen' : 'System messages' }).waitFor()
  return root
}

async function rowCount(root: Locator, expected: number): Promise<void> {
  assert(await root.locator('.lumen-system-message').count() === expected, `Expected ${expected} system messages`)
}

export async function verifyNotificationSystem(): Promise<void> {
  const server = await ready()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 620 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    let root = await open(page)
    await rowCount(root, 5)
    assert(await root.getByRole('button', { name: 'Restore all' }).isDisabled(), 'Restore must start disabled')
    await root.getByRole('button', { name: 'Read the notice' }).click()
    await rowCount(root, 4)
    await root.getByRole('button', { name: 'Restore all' }).click()
    await rowCount(root, 5)
    assert(await root.getByRole('button', { name: 'Restore all' }).isDisabled(), 'Confirmed restore must disable itself')
    await root.getByRole('button', { name: 'Show details' }).click()
    assert(await root.locator('.lumen-system-details li').count() === 3, 'Expanded imports should expose three error rows')
    await root.getByRole('button', { name: 'Hide details' }).click()
    assert(await root.locator('.lumen-system-details li').count() === 0, 'Hide details retained the error rows')
    await root.getByRole('button', { name: 'Retry failed' }).click()
    await rowCount(root, 5)
    await root.getByRole('button', { name: 'Update card' }).click()
    await rowCount(root, 5)
    await root.getByRole('button', { name: 'Remind me later' }).click()
    await rowCount(root, 4)
    await root.getByRole('button', { name: 'View DNS' }).click()
    await rowCount(root, 3)

    root = await open(page, 'retry')
    await root.getByRole('button', { name: 'Dismiss: Scheduled maintenance on Sunday' }).click()
    assert(await root.getByText('Could not update this message. Try again.').count() === 1, 'Host failure missing beside target')
    await rowCount(root, 5)
    await root.getByRole('button', { name: 'Dismiss: Scheduled maintenance on Sunday' }).click()
    await rowCount(root, 4)
    root = await open(page, 'unavailable')
    assert(await root.getByRole('button', { name: 'Read the notice' }).isDisabled(), 'Absent action handler was not disabled')
    assert(await root.getByText('Action unavailable').count() === 1, 'Unavailable host action lacks explanation')

    root = await open(page, 'empty')
    await rowCount(root, 0)
    assert(await root.getByText('No messages').count() === 1, 'Empty title missing')
    root = await open(page, 'one')
    await rowCount(root, 1)
    root = await open(page, 'duplicate')
    await rowCount(root, 5)
    root = await open(page, 'overflow')
    await rowCount(root, 81)
    const scroller = root.locator('.lumen-system-scroll')
    assert(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight), '81-row pane does not scroll')
    await root.getByRole('button', { name: 'Dismiss: Scheduled maintenance 80' }).scrollIntoViewIfNeeded()
    assert(await root.getByRole('button', { name: 'Dismiss: Scheduled maintenance 80' }).isVisible(), 'Last row is unreachable')

    for (const [width, height] of [[670, 440], [356, 620], [286, 420], [280, 320]] as const) {
      await page.setViewportSize({ width, height })
      root = await open(page, 'localized')
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      assert(noOverflow, `${width}×${height} localized system messages overflow horizontally`)
      assert(await root.getByRole('button', { name: /Schließen: Scheduled maintenance/ }).count() === 1, 'Translated dismiss accessible name missing')
      await root.getByRole('button', { name: 'Einzelheiten anzeigen' }).focus()
      assert(await root.getByRole('button', { name: 'Einzelheiten anzeigen' }).evaluate((element) => element === document.activeElement), 'Disclosure cannot receive keyboard focus')
    }
    assert(pageErrors.length === 0, `System preview page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ workflow: 'notifications-system', rowsAtCapacity: 81, widths: [670, 356, 286, 280], hostFailureRetry: true, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

if (import.meta.main) await verifyNotificationSystem()
