import { chromium, type Locator, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type Fixture = 'localized' | 'empty' | 'one' | 'overflow' | 'duplicate' | 'stale'

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
  throw new Error('Bell preview did not start')
}

async function open(page: Page, fixture?: Fixture): Promise<Locator> {
  const params = new URLSearchParams({ variant: 'hbar-app-ui-notifications-6', mode: 'isolated', theme: 'light' })
  if (fixture) params.set('bellFixture', fixture)
  await page.goto(`${baseUrl}/?${params}`, { waitUntil: 'networkidle' })
  const root = page.locator('[data-hbar-app-ui-component="hbar-app-ui-notifications-6"]')
  await root.locator('.lumen-notifications-appbar').waitFor()
  return root
}

export async function verifyNotificationBellClosed(): Promise<void> {
  const server = await ready()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 560 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    let root = await open(page)
    assert(await root.getByRole('link').count() === 3, 'Desktop navigation is not three native links')
    assert(await root.getByRole('button', { name: 'Notifications, 3 unread' }).count() === 1, 'Unread badge name missing')
    root = await open(page, 'empty')
    assert(await root.getByRole('button', { name: 'Notifications, 0 unread' }).count() === 1, 'Empty count did not come from host data')
    assert(await root.locator('.lumen-bell-badge').count() === 0, 'Zero unread should not display a badge')
    root = await open(page, 'one')
    assert(await root.getByRole('button', { name: 'Notifications, 1 unread' }).count() === 1, 'One-message count missing')
    root = await open(page, 'duplicate')
    assert(await root.getByRole('link').count() === 3, 'Duplicate nav IDs were rendered')
    assert(await root.getByRole('button', { name: 'Notifications, 3 unread' }).count() === 1, 'Duplicate messages changed count')
    root = await open(page, 'stale')
    assert(await root.locator('nav [aria-current="page"]').count() === 0, 'Stale selection invented a new active link')
    root = await open(page, 'overflow')
    assert(await root.getByRole('link').count() === 81, 'Navigation capacity lost items')
    const nav = root.locator('.lumen-notifications-appbar nav')
    assert(await nav.evaluate((element) => element.scrollWidth > element.clientWidth), 'Long navigation lacks pane-owned horizontal scroll')
    await root.getByRole('link', { name: 'Workspace 80' }).scrollIntoViewIfNeeded()
    assert(await root.getByRole('button', { name: 'Notifications, 41 unread' }).isVisible(), 'Long navigation obscures bell trigger')
    await root.getByRole('button', { name: 'Notifications, 41 unread' }).click()
    assert(await root.locator('.lumen-notifications-bell article').count() === 81, 'Message capacity lost items')
    const pane = root.locator('.lumen-notifications-bell aside > div')
    assert(await pane.evaluate((element) => element.scrollHeight > element.clientHeight), 'Long messages lack pane-owned scroll')

    for (const [width, height, links] of [[670, 440, 3], [356, 560, 0], [286, 420, 0], [280, 320, 0]] as const) {
      await page.setViewportSize({ width, height })
      root = await open(page, 'localized')
      assert(await root.getByRole('link').count() === links, `${width} navigation breakpoint differs`)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}×${height} long copy overflows`)
      const bell = root.getByRole('button', { name: 'Benachrichtigungen, 3 ungelesen' })
      await bell.focus()
      assert(await bell.evaluate((element) => element === document.activeElement), `${width} bell is not keyboard focusable`)
      assert(await root.getByText('Öffnen Sie die Glocke', { exact: false }).isVisible(), `${width} localized hint is clipped`)
    }
    assert(pageErrors.length === 0, `Bell preview page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ workflow: 'notifications-bell-closed', staticPairs: 8, navCapacity: 81, messageCapacity: 81, widths: [670, 356, 286, 280], pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

if (import.meta.main) await verifyNotificationBellClosed()
