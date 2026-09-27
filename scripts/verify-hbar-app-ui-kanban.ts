import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function url(fixture?: 'localized' | 'overflow', variant = 1) {
  const query = new URLSearchParams({ mode: 'isolated', variant: `hbar-app-ui-kanban-${variant}`, theme: 'light' })
  if (fixture) query.set('kanbanFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}

const browser = await chromium.launch({ headless: true, executablePath })
try {
  const page = await browser.newPage({ viewport: { width: 1086, height: 680 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url(), { waitUntil: 'networkidle' })
  const board = page.locator('.hbar-app-ui-kanban-reference-board')
  assert((await page.getByRole('region').count()) === 4, 'Reference board did not render four semantic columns')
  assert(
    (await page.getByRole('button', { name: /^HAL-/ }).count()) === 10,
    'Reference board did not render ten host cards',
  )
  assert(
    await board.evaluate((element) => element.scrollWidth > element.clientWidth),
    'Board did not own horizontal scrolling',
  )
  const initial = page.getByRole('button', { name: /^HAL-241:/ })
  await initial.click()
  assert(
    (await page.getByRole('button', { name: /^HAL-241:/ }).count()) === 1,
    'Passive card click invented a detail transition',
  )
  await page.getByRole('button', { name: 'Add a card to Backlog' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  assert(
    (await page.getByRole('textbox', { name: 'New card in Backlog' }).count()) === 0,
    'Cancel did not close the inline composer',
  )
  await page.getByRole('button', { name: 'Add a card to Backlog' }).click()
  await page.getByRole('textbox', { name: 'New card in Backlog' }).fill('Audit sample card')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  assert(
    (await page.getByRole('button', { name: /^HAL-242: Audit sample card/ }).count()) === 1,
    'New card did not receive the next Host ID',
  )
  assert(
    (await page.getByText('11 open items.', { exact: false }).count()) === 1,
    'New card did not update the Host count',
  )
  assert(
    (await page.getByRole('textbox', { name: 'New card in Backlog' }).count()) === 0,
    'Submit did not close the inline composer',
  )
  await initial.focus()
  await initial.press('Space')
  assert(
    (await page.getByText('HAL-241 grabbed. Use the arrow keys to move it, then press space to drop.').count()) === 1,
    'Keyboard lift did not announce the grabbed card',
  )
  await initial.press('ArrowRight')
  assert(
    (await page
      .getByRole('region', { name: 'In progress' })
      .getByRole('button', { name: /^HAL-241:/ })
      .count()) === 1,
    'ArrowRight did not move the card across columns',
  )
  await initial.press('Space')
  assert(
    (await page.getByText('HAL-241 dropped in In progress.').count()) === 1,
    'Keyboard drop did not announce the destination',
  )

  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  const columnList = page.getByRole('region', { name: 'Backlog' }).locator('ul')
  const scroll = await columnList.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return { scrollable, moved: element.scrollTop > 0 }
  })
  assert(scroll.scrollable && scroll.moved, 'Over-bound cards did not scroll inside their column')

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  assert(
    await board.evaluate((element) => element.scrollWidth > element.clientWidth),
    'Narrow multi-column board lost its horizontal owner',
  )
  await page.goto(url('localized'), { waitUntil: 'networkidle' })
  assert(
    (await page.getByRole('heading', { name: '平台看板' }).count()) === 1,
    'Localized title was not supplied by the Host',
  )
  assert(
    (await page.getByRole('button', { name: /核对发票/ }).count()) === 1,
    'Localized card was not supplied by the Host',
  )
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Narrow board overflowed outside its horizontal owner',
  )

  await page.setViewportSize({ width: 1086, height: 680 })
  await page.goto(url(undefined, 2), { waitUntil: 'networkidle' })
  const swimlaneScroll = page.locator('.hbar-app-ui-kanban-swimlane-scroll')
  assert((await page.getByRole('region').count()) === 3, 'Swimlanes did not render three semantic lane regions')
  assert(
    (await page.getByRole('button', { name: /^HAL-/ }).count()) === 11,
    'Swimlanes did not render eleven Host cards',
  )
  await page.getByRole('button', { name: 'Collapse all' }).click()
  assert(
    (await page.getByRole('button', { name: /^HAL-/ }).count()) === 0,
    'Collapse all retained cards',
  )
  await page.getByRole('button', { name: 'Expand all' }).click()
  assert((await page.getByRole('button', { name: /^HAL-/ }).count()) === 11, 'Expand all did not restore cards')
  await page.getByRole('region', { name: 'Identity' }).getByRole('button', { name: 'Identity', exact: true }).click()
  assert(
    (await page.getByRole('button', { name: /^HAL-/ }).count()) === 8,
    'Individual lane collapse affected other lanes',
  )
  await page.getByRole('region', { name: 'Identity' }).getByRole('button', { name: 'Identity', exact: true }).click()
  const swimlaneCard = page.getByRole('button', { name: /^HAL-231:/ })
  await swimlaneCard.click()
  assert((await swimlaneCard.count()) === 1, 'Passive swimlane card click invented a detail transition')
  await swimlaneCard.focus()
  await swimlaneCard.press('Space')
  assert(
    (await page.getByText('HAL-231 grabbed. Arrow keys move it between columns and lanes.').count()) === 1,
    'Swimlane keyboard grab did not announce',
  )
  await swimlaneCard.press('ArrowRight')
  assert(
    (await swimlaneCard.getAttribute('aria-label'))?.includes('In progress in Billing & invoicing.'),
    'ArrowRight did not move the swimlane card stage',
  )
  await swimlaneCard.press('ArrowDown')
  assert(
    (await swimlaneCard.getAttribute('aria-label'))?.includes('In progress in Identity.'),
    'ArrowDown did not move the swimlane card lane',
  )
  await swimlaneCard.press('Space')
  assert((await page.getByText('HAL-231 dropped.').count()) === 1, 'Swimlane keyboard drop did not announce')

  await page.goto(url(undefined, 2), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^HAL-231:/ }).dragTo(
    page.getByRole('region', { name: 'Identity' }).locator('.hbar-app-ui-kanban-swimlane-cell').nth(1),
  )
  assert(
    (await page.getByRole('button', { name: /^HAL-231:/ }).getAttribute('aria-label'))?.includes('In progress in Identity.'),
    'Pointer drop did not move the swimlane card into the target cell',
  )
  assert((await page.getByText('HAL-231 dropped.').count()) === 1, 'Pointer drop did not announce the completed move')

  await page.goto(url('overflow', 2), { waitUntil: 'networkidle' })
  const swimlaneOverflow = await swimlaneScroll.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return { scrollable, moved: element.scrollTop > 0 }
  })
  assert(swimlaneOverflow.scrollable && swimlaneOverflow.moved, 'Over-bound swimlanes did not scroll in their pane')
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(url('localized', 2), { waitUntil: 'networkidle' })
  assert(
    await swimlaneScroll.evaluate((element) => element.scrollWidth > element.clientWidth),
    'Narrow swimlanes did not own horizontal scrolling',
  )
  assert(
    (await page.getByRole('heading', { name: '工作流' }).count()) === 1,
    'Localized swimlane title was not supplied by the Host',
  )
  assert(
    (await page.getByRole('button', { name: /核对发票/ }).count()) === 1,
    'Localized swimlane card was not supplied by the Host',
  )
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Narrow swimlanes overflowed outside their pane',
  )
  assert(errors.length === 0, `Board preview raised page errors: ${errors.join('; ')}`)
  console.log(
    JSON.stringify({
      boardCards: 10,
      swimlaneCards: 11,
      keyboardMove: true,
      pointerMove: true,
      inlineComposer: true,
      columnScroll: scroll,
      swimlaneScroll: swimlaneOverflow,
      localizedNarrow: true,
      pageErrors: errors.length,
    }),
  )
} finally {
  await browser.close()
}
