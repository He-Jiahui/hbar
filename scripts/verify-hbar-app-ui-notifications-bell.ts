import { chromium, type Locator, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type Fixture = 'localized' | 'empty' | 'one' | 'overflow' | 'duplicate' | 'stale' | 'unavailable' | 'retry'

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

export async function verifyNotificationBell(): Promise<void> {
  const server = await ready()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 560 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    let root = await open(page)
    let bell = root.getByRole('button', { name: 'Notifications, 3 unread' })
    await bell.click()
    const dialog = root.getByRole('dialog', { name: 'Notifications' })
    assert(await dialog.getByRole('listitem').count() === 5, 'All view lost a source row')
    assert(await dialog.getByRole('tab', { name: 'All' }).getAttribute('aria-selected') === 'true', 'All tab not selected')
    await dialog.getByRole('button', { name: /Marco Silva replied/ }).click()
    assert(await root.getByRole('button', { name: 'Notifications, 3 unread' }).count() === 1, 'Already read row changed the count')
    await dialog.getByRole('button', { name: /Ana Reyes mentioned/ }).click()
    await root.getByRole('button', { name: 'Notifications, 2 unread' }).waitFor()
    assert(await dialog.getByRole('listitem').count() === 5, 'Reading a row removed it from All')
    await dialog.getByRole('tab', { name: 'Unread' }).click()
    assert(await dialog.getByRole('listitem').count() === 2, 'Unread filter did not project confirmed state')
    await dialog.getByRole('button', { name: 'Mark all read' }).click()
    await root.getByRole('button', { name: 'Notifications, 0 unread' }).waitFor()
    assert(await dialog.getByText('No unread notifications').count() === 1, 'Unread empty state missing')
    assert(await dialog.getByRole('button', { name: 'Mark all read' }).isDisabled(), 'Read-all remains enabled with zero unread')
    await dialog.getByRole('tab', { name: 'All' }).click()
    assert(await dialog.getByRole('listitem').count() === 5, 'All tab did not restore read rows')
    await dialog.getByRole('tab', { name: 'Unread' }).press('Escape')
    assert(await root.getByRole('dialog').count() === 0, 'Escape did not close popover')
    assert(await root.getByRole('button', { name: 'Notifications, 0 unread' }).evaluate((element) => element === document.activeElement), 'Escape did not return trigger focus')

    root = await open(page)
    bell = root.getByRole('button', { name: 'Notifications, 3 unread' })
    await bell.click()
    await root.getByText('Open the bell to review recent activity.', { exact: false }).click()
    assert(await root.getByRole('dialog').count() === 0, 'Outside click did not close popover')
    await bell.click()
    await root.getByRole('button', { name: 'Open notification center' }).click()
    assert(await root.getByRole('dialog').count() === 0, 'Notification center action did not close popover')

    root = await open(page, 'retry')
    await root.getByRole('button', { name: 'Notifications, 3 unread' }).click()
    await root.getByRole('button', { name: 'Mark all read' }).click()
    await root.getByRole('alert').waitFor()
    assert(await root.getByRole('button', { name: 'Notifications, 3 unread' }).count() === 1, 'Failed host action falsely changed the badge')
    await root.getByRole('button', { name: 'Mark all read' }).click()
    await root.getByRole('button', { name: 'Notifications, 0 unread' }).waitFor()
    root = await open(page, 'unavailable')
    await root.getByRole('button', { name: 'Notifications, 3 unread' }).click()
    assert(await root.getByRole('button', { name: 'Mark all read' }).isDisabled(), 'Unavailable host write is enabled')
    assert(await root.getByText('Read action unavailable').count() === 1, 'Unavailable action has no local explanation')

    root = await open(page, 'empty')
    await root.getByRole('button', { name: 'Notifications, 0 unread' }).click()
    assert(await root.getByText('No notifications').count() === 1, 'Empty host list did not render an empty state')
    root = await open(page, 'one')
    await root.getByRole('button', { name: 'Notifications, 1 unread' }).click()
    assert(await root.getByRole('dialog').getByRole('listitem').count() === 1, 'Single-message list lost its row')
    root = await open(page, 'duplicate')
    await root.getByRole('button', { name: 'Notifications, 3 unread' }).click()
    assert(await root.getByRole('dialog').getByRole('listitem').count() === 5, 'Duplicate host message ID created an extra row')
    root = await open(page, 'overflow')
    await root.getByRole('button', { name: 'Notifications, 41 unread' }).click()
    const list = root.locator('.lumen-bell-list')
    assert(await list.getByRole('listitem').count() === 81, 'Large host list lost a row')
    const scrolling = await list.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }))
    assert(scrolling.scroll > scrolling.client, 'Large host list has no independent scroll owner')
    await list.getByRole('button', { name: /Colleague 80/ }).scrollIntoViewIfNeeded()
    assert(await list.evaluate((element) => element.scrollTop > 0), 'The last host message cannot be reached')
    assert(await root.getByRole('button', { name: 'Open notification center' }).isVisible(), 'Large list displaced the footer')

    for (const [width, height] of [[356, 560], [286, 560], [280, 320]] as const) {
      await page.setViewportSize({ width, height })
      root = await open(page, 'localized')
      await root.getByRole('button', { name: 'Benachrichtigungen, 3 ungelesen' }).click()
      const panel = root.getByRole('dialog', { name: 'Benachrichtigungen' })
      const bounds = await panel.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right, bottom: rect.bottom }
      })
      assert(bounds.left >= 0 && bounds.right <= width + 1 && bounds.bottom <= height + 1, `${width}×${height} popover clips host content: ${JSON.stringify(bounds)}`)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} long translated panel overflows horizontally`)
      assert(await panel.getByRole('tab', { name: 'Ungelesen' }).isVisible(), `${width} localized filter is inaccessible`)
      assert(await panel.getByRole('button', { name: 'Benachrichtigungszentrale öffnen' }).isVisible(), `${width} footer action is inaccessible`)
    }
    assert(pageErrors.length === 0, `Bell preview page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ workflow: 'notifications-bell', filter: true, confirmedRead: true, failureRetry: true, focusRestore: true, cardinalities: [0, 1, 5, 81], narrowWidths: [356, 286, 280], pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

if (import.meta.main) await verifyNotificationBell()
