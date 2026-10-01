import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/scheduling-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ mode: 'isolated', variant: `hbar-app-ui-scheduling-${variant}`, theme: 'light' })
  if (fixture) query.set('schedulingFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-scheduling-${variant}"]`)
  await expect(root).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Scheduling${variant}: page overflow`,
  )
  return root
}
async function main() {
  assert((await fetch(baseUrl)).ok, 'Existing production preview unavailable; no automatic server start')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const month = await open(page, 1)
    await month.getByRole('button', { name: '11', exact: true }).press('Space')
    await month.getByRole('combobox', { name: 'Filter events', exact: true }).selectOption('Needs reply')
    await expect(month.getByRole('heading', { level: 2 })).toHaveText('Wednesday, June 11')
    await expect(month.getByRole('article')).toHaveCount(6)
    checks.push('Month: original day ID changes agenda heading; independent choice retains the source overview')

    const range = await open(page, 2)
    await range.getByRole('radio', { name: 'Custom', exact: true }).click()
    await range.getByRole('combobox', { name: 'Start', exact: true }).selectOption('10:30')
    await range.getByRole('combobox', { name: 'End', exact: true }).selectOption('09:30')
    await expect(range.locator('footer > p')).toHaveText('Blocks Custom on the shared calendar')
    await expect(range.locator('[aria-invalid="true"]')).toHaveCount(0)
    checks.push('Range: independent crossed time choices and Custom retain the source duration summary')

    const form = await open(page, 3)
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Core schedule draft')
    await form.getByRole('textbox', { name: 'Notes', exact: true }).fill('Agenda and meeting context')
    await form.getByRole('button', { name: 'Remove Marta Rey', exact: true }).click()
    await expect(form.locator('[data-hbar-app-ui-action="remove-attendee"]')).toHaveCount(1)
    await expect(form.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Core schedule draft')
    await expect(form.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Agenda and meeting context')
    checks.push('Form: name/notes draft persists while removing only the original attendee ID')

    const deadline = await open(page, 4)
    await deadline.locator('[data-hbar-app-ui-action="select-preset"][data-hbar-app-ui-target="none"]').click()
    await expect(deadline.locator('footer > p')).toHaveText('Due June 30, 10:00')
    await deadline.locator('[data-hbar-app-ui-action="select-day"][data-hbar-app-ui-target="15"]').click()
    await deadline.getByRole('radio', { name: '09:30', exact: true }).press('Enter')
    await expect(deadline.locator('footer > p')).toHaveText('Due June 15, 09:30')
    checks.push('Deadline: preset/day/time stay independent and keyboard choice updates inline summary')

    const availability = await open(page, 5)
    const tuesday = availability.locator('.lumen-scheduling-availability-day[data-hbar-app-ui-target="tuesday"]')
    await tuesday.getByRole('switch').press('Space')
    await expect(tuesday.getByRole('combobox')).toHaveCount(0)
    await tuesday.getByRole('switch').press('Enter')
    await expect(tuesday.getByRole('combobox', { name: 'From', exact: true })).toHaveValue('09:00')
    await tuesday.getByRole('button', { name: 'Add interval to Tuesday', exact: true }).click()
    await tuesday.getByRole('combobox', { name: 'From', exact: true }).last().selectOption('14:00')
    await tuesday.getByRole('button', { name: 'Remove interval from Tuesday', exact: true }).first().click()
    await expect(tuesday.getByRole('combobox', { name: 'From', exact: true })).toHaveValue('14:00')
    await expect(tuesday.getByRole('button', { name: 'Remove interval from Tuesday', exact: true })).toBeDisabled()
    await page.screenshot({ path: resolve(output, 'scheduling-availability-desktop.png'), fullPage: true })
    checks.push('Availability: disable/re-enable defaults, add/edit/remove by stable ID and last-interval boundary')

    const timeline = await open(page, 6)
    await timeline.getByRole('button', { name: 'New', exact: true }).click()
    await timeline.getByRole('textbox', { name: 'Event title', exact: true }).fill('Core timeline event')
    await timeline.getByRole('combobox', { name: 'Duration', exact: true }).selectOption('2')
    const created = timeline.locator('[data-hbar-app-ui-action="select-event"][data-hbar-app-ui-target="new-0"]')
    await expect(created).toContainText('Core timeline event')
    const before = await created.boundingBox()
    const destination = await timeline.locator('[data-timeline-day="2026-06-11"]').boundingBox()
    assert(before && destination, 'Timeline event and destination not available')
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
    await page.mouse.down()
    await page.mouse.move(destination.x + destination.width / 2, before.y + before.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(timeline.locator('[data-timeline-day="2026-06-11"] [data-hbar-app-ui-target="new-0"]')).toHaveCount(1)
    await page.screenshot({ path: resolve(output, 'scheduling-timeline-desktop.png'), fullPage: true })
    await timeline.getByRole('button', { name: 'Delete event', exact: true }).click()
    await expect(created).toHaveCount(0)
    await timeline.getByRole('tab', { name: 'Day', exact: true }).click()
    await expect(timeline.locator('[data-timeline-day]')).toHaveCount(1)
    await expect(timeline.getByRole('heading')).toHaveText('Wednesday, 10 June 2026')
    checks.push('Timeline: create, title/duration edit, cross-day drag, delete and day projection form a core loop')

    const booking = await open(page, 7)
    await booking.locator('[data-hbar-app-ui-action="select-day"][data-hbar-app-ui-target="2026-06-08"]').press('Space')
    await booking.getByRole('radio', { name: '09:30', exact: true }).click()
    await expect(booking.locator('footer p')).toHaveText('June 8 at 09:30')
    await expect(booking.locator('[data-hbar-app-ui-target="2026-06-11"]')).toBeDisabled()
    await booking.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(booking.locator('footer p')).toHaveText('June 8 at 09:30')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    checks.push('Booking: independent keyboard date/time choice, full-day gate and source Confirm without fake result')

    await page.setViewportSize({ width: 356, height: 720 })
    const narrow = await open(page, 4, 'localized')
    const top = narrow.locator('.lumen-scheduling-deadline-card > header')
    await top.scrollIntoViewIfNeeded()
    await expect(top).toContainText('欧洲／布加勒斯特')
    assert(
      await top.evaluate((element) => element.getBoundingClientRect().top >= 0),
      'Narrow deadline starts outside safe scroll origin',
    )
    await narrow.locator('footer').scrollIntoViewIfNeeded()
    await expect(narrow.getByRole('button', { name: '应用', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'scheduling-deadline-narrow.png'), fullPage: true })
    checks.push('Representative localized narrow deadline: stacked calendar/time flow, safe top and reachable footer')

    const overflow = await open(page, 3, 'overflow')
    await expect(overflow.locator('[data-hbar-app-ui-action="remove-attendee"]')).toHaveCount(7)
    const people = overflow.locator('[data-hbar-app-ui-region="form-attendees"] > div')
    assert(
      await people.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop > 0 && element.scrollWidth <= element.clientWidth + 1
      }),
      'Extended attendee list lacks owned vertical scroll',
    )
    await overflow.locator('[data-hbar-app-ui-action="remove-attendee"][data-hbar-app-ui-target="attendee-6"]').click()
    await expect(overflow.locator('[data-hbar-app-ui-action="remove-attendee"]')).toHaveCount(6)
    await overflow.getByRole('textbox', { name: 'Notes', exact: true }).scrollIntoViewIfNeeded()
    await expect(overflow.getByRole('button', { name: 'Create schedule', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'scheduling-form-overflow.png'), fullPage: true })
    checks.push(
      'Representative overflowing narrow form: seven attendees retained, last original ID removable, draft/footer reachable',
    )

    assert(diagnostics.length === 0, `Browser diagnostics: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify({ checks, diagnostics, exhaustiveMatrix: false }, null, 2),
    )
    console.log(JSON.stringify({ checks: checks.length, diagnostics: diagnostics.length, output }))
  } finally {
    await browser.close()
  }
}
await main()
