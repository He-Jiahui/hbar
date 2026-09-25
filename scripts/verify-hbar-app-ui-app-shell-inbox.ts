import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage(),
  errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const url = (mode = '', theme = 'light') =>
  `${base}/?variant=hbar-app-ui-app-shell-5&mode=isolated&theme=${theme}&appShellFixture=${mode}`
try {
  for (const width of [1280, 1086, 1024, 1023, 768, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('option')).toHaveCount(9)
    if (width >= 1024) await expect(page.locator('main')).toBeVisible()
    else await expect(page.locator('main')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}`).toBe(
      true,
    )
  }
  await page.setViewportSize({ width: 1086, height: 720 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.getByRole('radio', { name: 'Unread', exact: true }).press('Space')
  await expect(page.getByRole('option')).toHaveCount(8)
  await page.getByRole('option').filter({ hasText: 'Daniel Okonkwo' }).press('Space')
  await expect(page.getByRole('option')).toHaveCount(7)
  await expect(page.locator('main h1')).toContainText('Rotterdam')
  await page.getByRole('button', { name: 'Star this conversation', exact: true }).press('Space')
  await expect(page.getByRole('button', { name: 'Remove star', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('radio', { name: 'All', exact: true }).click()
  await page.getByRole('option').filter({ hasText: 'Daniel Okonkwo' }).press('Home')
  await expect(page.getByRole('option').filter({ hasText: 'Priya Raghunathan' })).toBeFocused()
  await expect(page.locator('main h1')).toContainText('Bulk import')
  await page.getByRole('button', { name: 'More actions', exact: true }).press('Space')
  await expect(page.getByRole('menuitem')).toHaveCount(4)
  await expect(page.getByRole('menu').locator('svg')).toHaveCount(4)
  await page.getByRole('menuitem', { name: 'Mark as unread', exact: true }).press('Space')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'More actions', exact: true })).toBeFocused()
  await page.getByRole('radio', { name: 'Escalated', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible()
  await expect(page.locator('.lumen-inbox-empty-icon svg')).toBeVisible()
  await expect(page.locator('main h1')).toContainText('Bulk import')
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  for (const mode of ['', 'localized', 'empty', 'overflow']) {
    await page.setViewportSize({ width: 286, height: 320 })
    await page.goto(url(mode, 'dark'), { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `fixture ${mode}`).toBe(
      true,
    )
    if (mode === 'localized') {
      await page.getByRole('radio', { name: 'Eskaliert', exact: true }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('radio', { name: 'Eskaliert', exact: true })).toBeInViewport()
    }
    await page.locator('.lumen-inbox-open').press('Space')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    if (mode === 'overflow') {
      await expect(dialog.locator('li')).toHaveCount(21)
      await dialog.locator('li').last().scrollIntoViewIfNeeded()
      await expect(dialog.locator('li').last()).toBeInViewport()
    }
    await dialog.locator('button').first().press('Escape')
    await expect(dialog).toHaveCount(0)
    if (mode !== 'empty') {
      const options = page.getByRole('option')
      if (mode === 'overflow') {
        await expect(options).toHaveCount(101)
        await options.last().scrollIntoViewIfNeeded()
        await expect(options.last()).toBeInViewport()
      }
      await options.first().press('Space')
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator('section.lumen-inbox-list-pane')).toBeHidden()
      expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `reader ${mode}`).toBe(
        true,
      )
      expect(
        await page.locator('.lumen-inbox-sender').evaluate((e) => {
          const name = e.querySelector('div > p'),
            date = e.querySelector(':scope > p')
          return name && date ? Math.abs(name.getBoundingClientRect().top - date.getBoundingClientRect().top) : Infinity
        }),
        'sender/date must retain a single flow row',
      ).toBeLessThan(1)
      await page.locator('.lumen-inbox-back').press('Space')
      await expect(page.locator('section.lumen-inbox-list-pane')).toBeVisible()
    }
  }
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      status: 'passed',
      widths: 9,
      shortHeight: 320,
      records: 101,
      mailboxes: 21,
      fixtures: ['en', 'de', 'empty', 'overflow'],
      mechanisms: [
        'read-filter',
        'star',
        'keyboard-selection',
        'menu-dismiss',
        'empty-recovery',
        'narrow-reader-return',
        'mailbox-drawer',
      ],
    }),
  )
} finally {
  await browser.close()
}
