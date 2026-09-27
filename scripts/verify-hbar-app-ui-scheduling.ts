import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5192'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function url(fixture?: 'localized' | 'overflow') {
  const query = new URLSearchParams({mode: 'isolated', variant: 'hbar-app-ui-scheduling-1', theme: 'light'})
  if (fixture) query.set('schedulingFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}
const browser = await chromium.launch({headless: true, executablePath})
try {
  const page = await browser.newPage({viewport: {width: 1086, height: 720}})
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(url(), {waitUntil: 'networkidle'})
  const root = page.locator('.lumen-scheduling-month-reference-layout')
  const dates = root.locator('.lumen-scheduling-month-dates')
  const agenda = root.locator('.lumen-scheduling-month-events')
  assert(await dates.getByRole('button').count() === 30 && await agenda.getByRole('article').count() === 6, 'Calendar lost date actions or complete event history')
  assert(await dates.locator('.is-outside').count() === 5, 'Adjacent dates became active controls')
  await root.getByRole('combobox', {name: 'Month', exact: true}).selectOption('April')
  await root.getByRole('combobox', {name: 'Year', exact: true}).selectOption('2027')
  await root.getByRole('combobox', {name: 'Filter events', exact: true}).selectOption('Needs reply')
  assert(await root.getByRole('heading', {level: 2}).innerText() === 'Wednesday, June 10', 'Native choices fabricated a new source calendar projection')
  assert(await agenda.getByRole('article').count() === 6, 'Source choice-only filter incorrectly filtered records')
  await root.getByRole('button', {name: '11', exact: true}).press('Space')
  assert(await root.getByRole('heading', {level: 2}).innerText() === 'Wednesday, June 11', 'Native date selection did not update its heading')
  assert(await dates.locator('[aria-pressed="true"]').getAttribute('data-hbar-app-ui-target') === '11', 'Date selection was directed to an index instead of the original ID')
  assert(await agenda.getByRole('article').count() === 6, 'Date selection lost the source overview event records')
  for (const name of ['Previous month', 'Next month', 'Add']) await root.getByRole('button', {name, exact: true}).click()
  assert(await root.getByRole('heading', {level: 2}).innerText() === 'Wednesday, June 11', 'Source no-op navigation changed the selected date')
  assert(await root.getByRole('combobox', {name: 'Month', exact: true}).inputValue() === 'April', 'Source navigation unexpectedly changed the month select')
  assert(await page.getByRole('dialog').count() === 0 && await agenda.getByRole('article').count() === 6, 'Source Add no-op invented a form or event')
  for (const width of [1024, 1023, 640, 639, 356, 286]) {
    await page.setViewportSize({width, height: 720})
    assert(await root.evaluate((element) => getComputedStyle(element).flexDirection === (window.innerWidth >= 1024 ? 'row' : 'column')), `Incorrect calendar flow at ${width}`)
    assert(await root.locator('.is-filter').isVisible() === (width >= 640), `Incorrect compact filter visibility at ${width}`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Calendar escaped viewport at ${width}`)
  }
  await root.getByRole('button', {name: '4', exact: true}).press('Enter')
  assert(await dates.locator('[aria-pressed="true"]').getAttribute('data-hbar-app-ui-target') === '4', 'Narrow native Enter failed')
  await agenda.locator('article').last().scrollIntoViewIfNeeded()
  assert(await agenda.locator('article').last().isVisible(), 'Content-grown history hides its final event')
  await page.goto(url('localized'), {waitUntil: 'networkidle'})
  assert((await root.getByRole('heading', {level: 2}).innerText()).includes('跨区域平台'), 'Host localized title was lost')
  await root.getByRole('button', {name: '12', exact: true}).press('Space')
  assert((await root.getByRole('heading', {level: 2}).innerText()).includes('六月12日'), 'Localized day selection lost its original target')
  await root.getByRole('button', {name: '添加', exact: true}).click()
  assert(await page.getByRole('dialog').count() === 0, 'Localized source no-op was replaced by a fake workflow')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Long translated title caused page overflow')
  await page.goto(url('overflow'), {waitUntil: 'networkidle'})
  assert(await dates.getByRole('button').count() === 43 && await agenda.locator('article').count() === 7, 'Over-bound Host records were truncated')
  assert(await dates.evaluate((element) => {element.scrollTop = element.scrollHeight; return element.scrollTop > 0}), 'Extended calendar lost pane scroll ownership')
  await dates.getByRole('button', {name: '43', exact: true}).press('Space')
  assert(await dates.locator('[aria-pressed="true"]').getAttribute('data-hbar-app-ui-target') === 'extra-42', 'Over-bound calendar action lost its original ID')
  assert(await agenda.evaluate((element) => {element.scrollTop = element.scrollHeight; return element.scrollTop > 0 && element.scrollWidth <= element.clientWidth + 1}), 'Extended agenda lost its vertical scroll owner')
  assert((await agenda.locator('article').last().innerText()).includes('regional event 7'), 'Final extended event is missing')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Extended metadata escaped the viewport')
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({status: 'passed', variants: ['scheduling-1'], states: ['date-select', 'native-choice-only', 'source-no-op', 'keyboard', 'responsive-breakpoints', 'localized', 'overflow']}))
} finally {await browser.close()}
