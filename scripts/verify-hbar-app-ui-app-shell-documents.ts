import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage(),
  errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const url = (mode = '', theme = 'light') =>
  `${base}/?variant=hbar-app-ui-app-shell-6&mode=isolated&theme=${theme}&appShellFixture=${mode}`
try {
  for (const width of [1280, 1086, 1024, 1023, 768, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('treeitem', { name: 'Webhook retry schedule', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    if (width < 1024) await expect(page.getByRole('dialog')).toBeVisible()
    else await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}`).toBe(
      true,
    )
  }
  await page.setViewportSize({ width: 1086, height: 720 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.getByRole('treeitem', { name: 'Webhook retry schedule', exact: true }).press('ArrowDown')
  await expect(page.getByRole('treeitem', { name: 'API versioning', exact: true })).toBeFocused()
  await expect(page.locator('main h1')).toHaveText('Webhook retry schedule')
  await page.getByRole('treeitem', { name: 'API versioning', exact: true }).press('Enter')
  await expect(page.locator('main h1')).toHaveText('API versioning')
  await page.getByRole('textbox', { name: 'Document title', exact: true }).fill('Reviewed document title')
  await expect(page.locator('main h1')).toHaveText('Reviewed document title')
  await expect(page.getByRole('treeitem', { name: 'Reviewed document title', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('treeitem', { name: 'Reviewed document title', exact: true }).press('ArrowLeft')
  await expect(page.getByRole('treeitem', { name: 'Engineering', exact: true })).toBeFocused()
  await page.getByRole('treeitem', { name: 'Engineering', exact: true }).press('ArrowLeft')
  await expect(page.getByRole('treeitem', { name: 'Engineering', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await page.getByRole('treeitem', { name: 'Engineering', exact: true }).press('Home')
  await expect(page.getByRole('treeitem', { name: 'Product specs', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Italic', exact: true }).press('Space')
  await expect(page.getByRole('button', { name: 'Italic', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Document actions', exact: true }).press('Space')
  await expect(page.getByRole('menuitem', { name: 'Duplicate', exact: true })).toBeFocused()
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).press('End')
  await expect(page.getByRole('menuitem', { name: 'Move to trash', exact: true })).toBeFocused()
  await page.getByRole('menuitem', { name: 'Move to trash', exact: true }).press('Escape')
  await expect(page.getByRole('button', { name: 'Document actions', exact: true })).toBeFocused()
  for (const mode of ['', 'localized', 'empty', 'overflow']) {
    await page.setViewportSize({ width: 286, height: 320 })
    await page.goto(url(mode, 'dark'), { waitUntil: 'networkidle' })
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    if (mode === 'overflow') {
      await expect(dialog.getByRole('treeitem')).toHaveCount(102)
      await dialog.getByRole('treeitem').last().scrollIntoViewIfNeeded()
      await expect(dialog.getByRole('treeitem').last()).toBeInViewport()
      await dialog.getByRole('treeitem').last().press('Space')
      await expect(dialog).toBeVisible()
    }
    await dialog.locator('button').first().press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.locator('.lumen-documents-more-formatting > button').press('Space')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    expect(
      await menu.evaluate((element) => {
        const bounds = element.getBoundingClientRect(),
          owner = element.closest('.lumen-documents-shell')?.getBoundingClientRect()
        return owner ? bounds.left >= owner.left && bounds.right <= owner.right : false
      }),
      `narrow formatting menu stays inside owner: ${mode}`,
    ).toBe(true)
    await menu.press('Escape')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `fixture ${mode}`).toBe(
      true,
    )
    if (mode !== 'empty')
      expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  }
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      status: 'passed',
      widths: 9,
      shortHeight: 320,
      documents: 101,
      fixtures: ['en', 'de', 'empty', 'overflow'],
      mechanisms: [
        'tree-focus-selection',
        'title-sync',
        'folder-disclosure',
        'format-toggle',
        'menu-focus-return',
        'narrow-drawer',
      ],
    }),
  )
} finally {
  await browser.close()
}
