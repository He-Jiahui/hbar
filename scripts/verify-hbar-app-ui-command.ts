import { chromium, expect } from '@playwright/test'
const port = 5187,
  base = `http://127.0.0.1:${port}`
const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
  stdout: 'ignore',
  stderr: 'ignore',
})
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(base)).ok) break
    } catch {
      /* Preview server is starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const variant of [1, 2, 3, 4, 5, 6])
    for (const width of [1192, 768, 320])
      for (const theme of ['dark', 'light']) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(`${base}/?variant=hbar-app-ui-command-menu-${variant}&mode=isolated&theme=${theme}`)
        if ([1, 2, 3, 6].includes(variant)) {
          const list = page.getByRole('listbox', { name: 'Available commands', exact: true })
          await expect(list).toBeVisible()
          expect(await list.getByRole('option').count()).toBe(
            variant === 1 ? 10 : variant === 2 ? 5 : variant === 3 ? 8 : 6,
          )
        } else if (variant === 4)
          await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible()
        else await expect(page.getByRole('button', { name: /Ask about/ })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/app-ui-integration/command-${variant}-${width}-${theme}.png` })
      }
  await page.goto(`${base}/?variant=hbar-app-ui-command-menu-2&mode=isolated`)
  await page.getByRole('option', { name: /Switch project/ }).click()
  await expect(page.getByRole('option', { name: 'Aurora', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('option', { name: /Switch project/ })).toBeVisible()
  await page.goto(`${base}/?variant=hbar-app-ui-command-menu-3&mode=isolated`)
  const searchBody = page.locator('.hbar-app-ui-search-commands-body')
  await searchBody.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: 'Open result', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'People', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open result', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: /Marcus Reed/ }).click()
  await expect(page.getByRole('heading', { name: 'Marcus Reed', exact: true })).toBeVisible()
  await page.goto(`${base}/?variant=hbar-app-ui-command-menu-4&mode=isolated`)
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('changed@example.test')
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption('viewer')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(page.getByText('Step 2 of 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to actions', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toHaveValue('changed@example.test')
  await page.goto(`${base}/?variant=hbar-app-ui-command-menu-5&mode=isolated`)
  await page.locator('.hbar-app-ui-assistant-empty').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('button', { name: 'Usage report', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Usage report', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search or ask', exact: true })).toHaveValue('Usage report')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Search or ask', exact: true })).toHaveCount(0)
  await page.goto(`${base}/?variant=hbar-app-ui-command-menu-1&mode=isolated&commandFixture=overflow`)
  const list = page.getByRole('listbox', { name: 'Available commands', exact: true })
  expect(await list.getByRole('option').count()).toBeLessThan(40)
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(list.getByRole('option', { name: 'Command 9999', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  console.log(
    'Command preview: 36 viewport/theme cases, search/invite/assistant workflows, navigation and 10,000-row virtualization passed.',
  )
} finally {
  await browser.close()
  server.kill()
}
