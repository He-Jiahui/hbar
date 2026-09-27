import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5192'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function url(fixture?: 'localized' | 'overflow') {
  const query = new URLSearchParams({mode: 'isolated', variant: 'hbar-app-ui-comments-1', theme: 'light'})
  if (fixture) query.set('commentsFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}
const browser = await chromium.launch({headless: true, executablePath})
try {
  const page = await browser.newPage({viewport: {width: 1086, height: 720}})
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(url(), {waitUntil: 'networkidle'})
  const root = page.locator('.lumen-comments-discussion')
  const thread = root.locator('.lumen-comments-discussion-thread')
  assert(await thread.locator('article').count() === 3, 'Three parent comments missing')
  assert(await thread.locator('.lumen-comments-discussion-replies .lumen-comments-discussion-message').count() === 2, 'Nested replies missing')
  await root.getByRole('tab', {name: 'Newest'}).click()
  assert((await thread.locator('article').first().innerText()).includes('Tomás Guerrero'), 'Newest did not reorder parent comments')
  await root.getByRole('tab', {name: 'Oldest'}).click()
  const first = thread.locator('article').first()
  assert((await first.innerText()).includes('Priya Nandakumar'), 'Oldest did not restore parent order')
  await first.getByRole('button', {name: '5', exact: true}).click()
  assert(await first.getByRole('button', {name: '4', exact: true}).getAttribute('aria-pressed') === 'false', 'Reaction did not decrement')
  await first.getByRole('button', {name: '4', exact: true}).click()
  assert(await first.getByRole('button', {name: '5', exact: true}).getAttribute('aria-pressed') === 'true', 'Reaction did not restore')
  await first.getByRole('button', {name: 'Reply', exact: true}).click()
  await first.getByRole('button', {name: "More actions on Priya Nandakumar's comment"}).click()
  assert(await root.getByRole('button', {name: 'Comment', exact: true}).isDisabled(), 'Empty draft must disable Comment')
  await root.locator('textarea').fill('   ')
  assert(await root.getByRole('button', {name: 'Comment', exact: true}).isDisabled(), 'Whitespace must disable Comment')
  await root.locator('textarea').fill('Ready for the second deploy.')
  await root.getByRole('button', {name: 'Comment', exact: true}).click()
  assert(await root.locator('textarea').inputValue() === 'Ready for the second deploy.', 'Source preview keeps its draft')
  assert(await thread.locator('article').count() === 3, 'No-op submit fabricated a new comment')
  assert(await thread.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop > 0
  }), 'Thread cannot reach the final comment')
  await page.setViewportSize({width: 320, height: 720})
  await page.goto(url('localized'), {waitUntil: 'networkidle'})
  assert(await root.getByRole('heading', {name: '讨论线程'}).count() === 1, 'Host localized heading missing')
  assert(await root.getByRole('button', {name: '评论', exact: true}).isDisabled(), 'Localized composer boundary missing')
  await page.goto(url('overflow'), {waitUntil: 'networkidle'})
  assert(await thread.locator('article').count() === 45, 'Over-capacity thread was truncated')
  assert(await thread.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop > 0 && element.scrollWidth <= element.clientWidth + 1
  }), 'Over-capacity thread must scroll vertically without horizontal overflow')
  assert(await root.locator('textarea').isVisible(), 'Composer lost outside the thread scroll owner')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Comments escaped the viewport')
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({status: 'passed', variant: 'comments-1', states: ['sort', 'reaction', 'no-op', 'draft', 'localized', 'overflow']}))
} finally {
  await browser.close()
}
