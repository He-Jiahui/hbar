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

  await page.setViewportSize({width: 1086, height: 680})
  await page.goto(url(undefined, 3), {waitUntil: 'networkidle'})
  const regroupScroll = page.locator('.hbar-app-ui-kanban-regroup-scroll')
  assert(await page.getByRole('region').count() === 4, 'Regroup status mode did not render four columns')
  assert(await page.getByRole('button', {name: /^NW-/}).count() === 9, 'Regroup did not render nine Host cards')
  await page.getByRole('tab', {name: 'Assignee'}).click()
  assert(await page.getByRole('region', {name: 'Ana Reyes'}).getByRole('button', {name: /^NW-/}).count() === 3, 'Assignee grouping did not partition Ana cards')
  await page.getByRole('tab', {name: 'Priority'}).click()
  assert(await page.getByRole('region', {name: 'Urgent'}).getByRole('button', {name: /^NW-/}).count() === 2, 'Priority grouping did not partition urgent cards')
  await page.getByRole('tab', {name: 'Status'}).click()
  const regroupCard = page.getByRole('button', {name: /^NW-408:/})
  await regroupCard.click()
  assert(await regroupCard.count() === 1, 'Passive regroup card click invented a detail transition')
  await regroupCard.focus()
  await regroupCard.press('Space')
  assert(await page.getByText('NW-408 grabbed. Left and right change status.').count() === 1, 'Regroup keyboard grab did not announce')
  await regroupCard.press('ArrowRight')
  assert(await page.getByRole('region', {name: 'Building'}).getByRole('button', {name: /^NW-408:/}).count() === 1, 'Regroup ArrowRight did not update the status field')
  await regroupCard.press('Space')
  assert(await page.getByText('NW-408 dropped in Building.').count() === 1, 'Regroup drop did not announce')
  await page.getByRole('tab', {name: 'Assignee'}).click()
  assert(await page.getByRole('region', {name: 'Ana Reyes'}).getByRole('button', {name: /^NW-408:/}).count() === 1, 'Status move unexpectedly changed assignee')

  await page.goto(url(undefined, 3), {waitUntil: 'networkidle'})
  await page.getByRole('button', {name: /^NW-392:/}).dragTo(page.getByRole('region', {name: 'Building'}))
  assert(await page.getByRole('region', {name: 'Building'}).getByRole('button', {name: /^NW-392:/}).count() === 1, 'Regroup pointer drop did not update status')
  await page.goto(url('overflow', 3), {waitUntil: 'networkidle'})
  const regroupOverflow = await regroupScroll.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return {scrollable, moved: element.scrollTop > 0}
  })
  assert(regroupOverflow.scrollable && regroupOverflow.moved, 'Over-bound regroup cards did not scroll in their pane')
  await page.setViewportSize({width: 320, height: 720})
  await page.goto(url('localized', 3), {waitUntil: 'networkidle'})
  assert(await page.getByRole('heading', {name: '项目路线图'}).count() === 1, 'Localized regroup title was not supplied by Host')
  assert(await page.getByRole('button', {name: /核对发票/}).count() === 1, 'Localized regroup card was not supplied by Host')
  assert(await regroupScroll.evaluate((element) => element.scrollWidth > element.clientWidth), 'Narrow regroup board lost horizontal owner')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Narrow regroup columns overflowed outside pane')

  await page.setViewportSize({width: 1086, height: 680})
  await page.goto(url(undefined, 4), {waitUntil: 'networkidle'})
  const detailBoard = page.locator('.hbar-app-ui-kanban-detail-board')
  assert(await page.getByRole('region').count() === 4, 'Detail board did not render four columns')
  assert(await page.getByRole('button', {name: /^CDR-/}).count() === 7, 'Detail board did not render seven Host cards')
  assert(await page.getByRole('complementary', {name: 'CDR-118 details'}).count() === 1, 'Default card details missing')
  await page.getByRole('complementary').getByRole('button', {name: 'In progress'}).click()
  assert(await page.getByText('CDR-118 moved to In progress.').count() === 1, 'Current status action did not announce')
  await page.getByRole('button', {name: /^CDR-98:/}).click()
  assert(await page.getByRole('complementary', {name: 'CDR-98 details'}).getByText('No comments yet').count() === 1, 'Selecting an empty-activity card did not update details')
  await page.getByRole('button', {name: 'Close details'}).click()
  assert(await page.getByRole('complementary').count() === 0, 'Close details retained pane')
  await page.getByRole('button', {name: /^CDR-118:/}).click()
  await page.getByRole('complementary').getByRole('button', {name: 'In review'}).click()
  assert(await page.getByRole('region', {name: 'In review'}).getByRole('button', {name: /^CDR-118:/}).count() === 1, 'Move to In review did not update board column')
  assert(await page.getByRole('complementary', {name: 'CDR-118 details'}).getByText('In review', {exact: true}).count() > 0, 'Move did not update detail status')

  await page.goto(url(undefined, 4), {waitUntil: 'networkidle'})
  await page.getByRole('button', {name: /^CDR-109:/}).dragTo(page.getByRole('region', {name: 'In progress'}))
  assert(await page.getByRole('region', {name: 'In progress'}).getByRole('button', {name: /^CDR-109:/}).count() === 1, 'Pointer drop did not update detail-board status')
  await page.goto(url('overflow', 4), {waitUntil: 'networkidle'})
  const detailOverflow = await detailBoard.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return {scrollable, moved: element.scrollTop > 0}
  })
  assert(detailOverflow.scrollable && detailOverflow.moved, 'Over-bound detail board did not scroll in its pane')
  await page.setViewportSize({width: 670, height: 680})
  await page.goto(url(undefined, 4), {waitUntil: 'networkidle'})
  const overlay = await page.getByRole('complementary').boundingBox()
  assert(Boolean(overlay && overlay.x > 250 && overlay.width >= 350), 'Tablet detail pane did not overlay the board')
  await page.setViewportSize({width: 356, height: 680})
  await page.goto(url('localized', 4), {waitUntil: 'networkidle'})
  assert(await page.getByRole('heading', {name: '交付看板'}).count() === 1, 'Localized detail-board title missing')
  assert(await page.getByRole('complementary', {name: 'local-card 详情'}).getByText('核对发票').count() === 1, 'Localized detail pane missing')
  const mobilePane = await page.getByRole('complementary').boundingBox()
  assert(Boolean(mobilePane && mobilePane.x < 2 && mobilePane.width >= 355), 'Mobile detail view did not cover the board')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile detail pane overflowed document')

  await page.setViewportSize({width: 1086, height: 680})
  await page.goto(url(undefined, 5), {waitUntil: 'networkidle'})
  const sprintScroll = page.locator('.hbar-app-ui-kanban-sprint-scroll')
  assert(await page.getByRole('region').count() === 4, 'Sprint did not render four stage regions')
  assert(await page.getByRole('button', {name: /^MER-/}).count() === 10, 'Sprint did not render ten Host cards')
  assert((await page.getByRole('progressbar').count()) === 3, 'Sprint capacity bars did not follow the three bounded stages')
  assert((await page.getByRole('progressbar', {name: 'Committed capacity'}).getAttribute('aria-valuenow')) === '18', 'Initial committed points are wrong')
  await page.getByRole('button', {name: /^MER-45:/}).click()
  assert(await page.getByRole('button', {name: /^MER-45:/}).count() === 1, 'Blocked card click invented a detail transition')
  const sprintCard = page.getByRole('button', {name: /^MER-52:/})
  await sprintCard.focus()
  await sprintCard.press('Space')
  assert(await page.getByText('MER-52 grabbed. Arrow keys move it.').count() === 1, 'Sprint grab did not announce')
  await sprintCard.press('ArrowRight')
  assert(await page.getByRole('region', {name: 'Building'}).getByRole('button', {name: /^MER-52:/}).count() === 1, 'Sprint ArrowRight did not move the card')
  assert((await page.getByRole('progressbar', {name: 'Committed capacity'}).getAttribute('aria-valuenow')) === '10', 'Committed capacity did not recompute')
  assert((await page.getByRole('progressbar', {name: 'Building capacity'}).getAttribute('aria-valuenow')) === '18', 'Building capacity did not recompute over limit')
  await sprintCard.press('Space')
  assert(await page.getByText('MER-52 dropped in Building.').count() === 1, 'Sprint keyboard drop did not announce')
  await page.goto(url(undefined, 5), {waitUntil: 'networkidle'})
  await page.getByRole('button', {name: /^MER-43:/}).dragTo(page.getByRole('region', {name: 'Accepted'}))
  assert(await page.getByRole('region', {name: 'Accepted'}).getByRole('button', {name: /^MER-43:/}).count() === 1, 'Sprint pointer drop did not update stage')
  assert(await page.locator('.hbar-app-ui-kanban-sprint-summary').getByText('41%').count() === 1, 'Burned summary did not recompute after acceptance')
  await page.goto(url('overflow', 5), {waitUntil: 'networkidle'})
  const sprintOverflow = await sprintScroll.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return {scrollable, moved: element.scrollTop > 0}
  })
  assert(sprintOverflow.scrollable && sprintOverflow.moved, 'Over-bound sprint did not scroll in its pane')
  await page.setViewportSize({width: 320, height: 720})
  await page.goto(url('localized', 5), {waitUntil: 'networkidle'})
  assert(await page.getByRole('heading', {name: '迭代 34 · 子午线'}).count() === 1, 'Localized sprint title missing')
  assert(await page.getByRole('button', {name: /核对发票/}).count() === 1, 'Localized sprint card missing')
  assert(await sprintScroll.evaluate((element) => element.scrollWidth > element.clientWidth), 'Narrow sprint lost horizontal scroll owner')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Narrow sprint overflowed document')

  await page.setViewportSize({width: 1086, height: 680})
  await page.goto(url(undefined, 6), {waitUntil: 'networkidle'})
  const compactBoard = page.locator('.hbar-app-ui-kanban-compact-board')
  assert(await page.getByRole('region').count() === 4, 'Compact board did not render four Host columns')
  assert(await page.locator('.hbar-app-ui-kanban-compact-card').count() === 10, 'Compact board did not render ten Host cards')
  const passive = page.getByRole('button', {name: /^Prune stale invite tokens\./})
  await passive.click()
  assert(await passive.count() === 1, 'Compact card click invented a detail transition')
  await passive.focus()
  await passive.press('Space')
  assert(await passive.count() === 1, 'Compact card Space activation invented a transition')
  assert(await page.getByRole('button', {name: 'Move Prune stale invite tokens to previous column'}).isDisabled(), 'First-column reverse arrow was enabled')
  assert(await page.getByRole('button', {name: 'Move Ship the changelog RSS feed to next column'}).isDisabled(), 'Last-column forward arrow was enabled')
  await page.getByRole('button', {name: 'Move Prune stale invite tokens to Today'}).click()
  assert(await page.getByRole('region', {name: 'Today'}).getByRole('button', {name: /^Prune stale invite tokens\./}).count() === 1, 'Forward move did not update Host column')
  assert(await page.getByText('Prune stale invite tokens moved to Today.').count() === 1, 'Move did not announce destination')
  await page.getByRole('button', {name: 'Move Prune stale invite tokens to Inbox'}).click()
  assert(await page.getByRole('region', {name: 'Inbox'}).getByRole('button', {name: /^Prune stale invite tokens\./}).count() === 1, 'Reverse move did not return card')
  await page.goto(url(undefined, 6), {waitUntil: 'networkidle'})
  await page.getByRole('button', {name: /^Document the export limits\./}).dragTo(page.getByRole('region', {name: 'Doing'}))
  assert(await page.getByRole('region', {name: 'Doing'}).getByRole('button', {name: /^Document the export limits\./}).count() === 1, 'Wide pointer drag did not update Host column')
  await page.goto(url('overflow', 6), {waitUntil: 'networkidle'})
  const compactOverflow = await compactBoard.evaluate((element) => {
    const column = element.querySelector('.hbar-app-ui-kanban-compact-card-list')
    if (!column) return {scrollable: false, moved: false}
    const scrollable = column.scrollHeight > column.clientHeight
    column.scrollTop = column.scrollHeight
    return {scrollable, moved: column.scrollTop > 0}
  })
  assert(compactOverflow.scrollable && compactOverflow.moved, 'Over-bound compact cards did not scroll inside column')
  await page.setViewportSize({width: 320, height: 720})
  await page.goto(url('localized', 6), {waitUntil: 'networkidle'})
  assert(await page.getByRole('heading', {name: '海港任务'}).count() === 1, 'Localized compact title missing')
  assert(await page.locator('.hbar-app-ui-kanban-compact-card-main[aria-label*="核对发票"]').count() === 1, 'Localized compact card missing')
  await page.getByRole('tab', {name: '今日 0'}).click()
  assert(await page.getByRole('tab', {name: '今日 0'}).getAttribute('aria-selected') === 'true', 'Compact tab did not select the empty column')
  await page.getByRole('tab', {name: '收件箱 1'}).click()
  await page.getByRole('button', {name: '将核对发票移至今日'}).click()
  assert(await page.getByRole('tab', {name: '今日 1'}).count() === 1, 'Narrow move did not recompute tab count')
  assert(await page.getByRole('tab', {name: '收件箱 0'}).getAttribute('aria-selected') === 'true', 'Narrow move unexpectedly selected destination')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Narrow compact board overflowed document')
  assert(errors.length === 0, `Board preview raised page errors: ${errors.join('; ')}`)
  console.log(
    JSON.stringify({
      boardCards: 10,
      swimlaneCards: 11,
      regroupCards: 9,
      detailCards: 7,
      sprintCards: 10,
      compactCards: 10,
      keyboardMove: true,
      pointerMove: true,
      inlineComposer: true,
      columnScroll: scroll,
      swimlaneScroll: swimlaneOverflow,
      regroupScroll: regroupOverflow,
      detailScroll: detailOverflow,
      sprintScroll: sprintOverflow,
      compactScroll: compactOverflow,
      localizedNarrow: true,
      pageErrors: errors.length,
    }),
  )
} finally {
  await browser.close()
}
