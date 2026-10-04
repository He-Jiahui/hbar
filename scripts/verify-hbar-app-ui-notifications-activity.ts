import { chromium, type Locator, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type Fixture = 'empty' | 'one' | 'duplicate' | 'overflow' | 'localized' | 'unavailable' | 'retry'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function ready(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  try {
    if ((await fetch(baseUrl)).ok) return undefined
  } catch { /* Start the local preview below. */ }
  const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], { stdout: 'ignore', stderr: 'ignore' })
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    try {
      if ((await fetch(baseUrl)).ok) return server
    } catch { /* Wait for Vite to listen. */ }
  }
  server.kill()
  throw new Error('Activity preview did not start')
}

async function open(page: Page, fixture?: Fixture): Promise<Locator> {
  const query = new URLSearchParams({ variant: 'hbar-app-ui-notifications-4', mode: 'isolated', theme: 'light' })
  if (fixture) query.set('activityFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'networkidle' })
  const root = page.locator('[data-hbar-app-ui-component="hbar-app-ui-notifications-4"]')
  await root.getByRole('heading', { name: fixture === 'localized' ? 'Aktivitäten' : 'Activity' }).waitFor()
  return root
}

async function count(root: Locator, label: string, value: number): Promise<void> {
  assert(await root.getByRole('tab', { name: `${label} ${value}` }).count() === 1, `${label} count should be ${value}`)
}

async function noHorizontalOverflow(page: Page, context: string): Promise<void> {
  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  assert(!overflowing, `${context} overflowed the host horizontally`)
}

export async function verifyNotificationActivity(): Promise<void> {
  const server = await ready()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 680 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    let root = await open(page)
    await count(root, 'Inbox', 3)
    assert(await root.locator('.lumen-activity-list li').count() === 3, 'Initial Inbox should show three rows')
    await root.getByRole('button', { name: /Wei Chen/ }).click()
    assert(await root.getByRole('heading', { name: 'Usage metering rewrite' }).count() === 1, 'Wei detail did not replace Priya')
    await root.getByRole('button', { name: 'Snooze', exact: true }).click()
    assert(await root.getByRole('menuitem').count() === 4, 'Snooze should expose four host options')
    await page.keyboard.press('Escape')
    assert(await root.getByRole('menuitem').count() === 0, 'Escape did not dismiss the menu')
    await root.getByRole('button', { name: 'Snooze', exact: true }).click()
    await root.getByRole('menuitem', { name: 'Later today' }).click()
    await count(root, 'Inbox', 2)
    await count(root, 'Snoozed', 2)
    assert(await root.getByRole('heading', { name: 'Nothing selected' }).count() === 1, 'Confirmed move should clear detail')

    root = await open(page)
    await root.getByRole('button', { name: 'Archive', exact: true }).click()
    await count(root, 'Inbox', 2)
    await count(root, 'Archived', 2)
    await root.getByRole('tab', { name: 'Snoozed 1' }).click()
    assert(await root.getByRole('button', { name: /Ana Reyes/ }).count() === 1, 'Snoozed list did not filter')
    await root.getByRole('button', { name: /Ana Reyes/ }).click()
    assert(await root.getByRole('heading', { name: 'Sidebar density pass' }).count() === 1, 'Ana detail missing')
    await root.getByRole('tab', { name: 'Archived 2' }).click()
    await root.getByRole('button', { name: /Marco Silva/ }).click()
    assert(await root.getByRole('heading', { name: 'Northwind workspace' }).count() === 1, 'Marco detail missing')

    root = await open(page, 'retry')
    await root.getByRole('button', { name: 'Archive', exact: true }).click()
    assert(await root.getByText('Could not update activity. Try again.').count() === 1, 'Host failure was hidden')
    await count(root, 'Inbox', 3)
    await root.getByRole('button', { name: 'Archive', exact: true }).click()
    await count(root, 'Inbox', 2)
    root = await open(page, 'unavailable')
    assert(await root.getByRole('button', { name: 'Archive', exact: true }).isDisabled(), 'Absent host mover should disable actions')
    assert(await root.getByText('Action unavailable').count() === 1, 'Absent host mover should explain the boundary')

    root = await open(page, 'empty')
    assert(await root.locator('.lumen-activity-list li').count() === 0, 'Empty input invented rows')
    root = await open(page, 'one')
    assert(await root.locator('.lumen-activity-list li').count() === 1, 'Single row did not render')
    root = await open(page, 'duplicate')
    assert(await root.locator('.lumen-activity-list li').count() === 3, 'Duplicate ID rendered twice')
    root = await open(page, 'overflow')
    assert(await root.locator('.lumen-activity-list li').count() === 81, 'Capacity list lost rows')
    const list = root.locator('.lumen-activity-list')
    assert(await list.evaluate((element) => element.scrollHeight > element.clientHeight), 'Capacity list should scroll within its pane')
    await root.getByRole('button', { name: /Workspace member 80/ }).scrollIntoViewIfNeeded()
    assert(await root.getByRole('button', { name: /Workspace member 80/ }).isVisible(), 'Last capacity row is unreachable')

    for (const [width, height] of [[670, 440], [356, 680], [286, 420], [280, 320]] as const) {
      await page.setViewportSize({ width, height })
      root = await open(page, 'localized')
      await noHorizontalOverflow(page, `${width}×${height} translated activity`)
      assert(await root.getByRole('tab', { name: /Posteingang/ }).count() === 1, 'Translated view name missing')
      if (width <= 356) {
        const back = root.getByRole('button', { name: 'Zurück', exact: true })
        assert(await back.isVisible(), 'Narrow detail Back missing')
        await back.click()
        assert(await root.getByRole('button', { name: /Wei Chen/ }).isVisible(), 'Narrow list did not replace detail')
        await root.getByRole('button', { name: /Wei Chen/ }).click()
        assert(await root.getByRole('heading', { name: 'Usage metering rewrite' }).isVisible(), 'Narrow selection did not restore detail')
      }
    }
    assert(pageErrors.length === 0, `Activity preview page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ workflow: 'notifications-activity', rowsAtCapacity: 81, widths: [670, 356, 286, 280], hostFailureRetry: true, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

if (import.meta.main) await verifyNotificationActivity()
