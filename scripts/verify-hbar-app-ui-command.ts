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
  for (const variant of [1, 2, 6])
    for (const width of [1192, 768, 320])
      for (const theme of ['dark', 'light']) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(`${base}/?variant=hbar-app-ui-command-menu-${variant}&mode=isolated&theme=${theme}`)
        const list = page.getByRole('listbox', { name: 'Available commands', exact: true })
        await expect(list).toBeVisible()
        expect(await list.getByRole('option').count()).toBe(variant === 1 ? 10 : variant === 2 ? 5 : 6)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/app-ui-integration/command-${variant}-${width}-${theme}.png` })
      }
  await page.goto(`${base}/?variant=hbar-app-ui-command-menu-2&mode=isolated`)
  await page.getByRole('option', { name: /Switch project/ }).click()
  await expect(page.getByRole('option', { name: 'Aurora', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('option', { name: /Switch project/ })).toBeVisible()
  await page.goto(`${base}/?variant=hbar-app-ui-command-menu-1&mode=isolated&commandFixture=overflow`)
  const list = page.getByRole('listbox', { name: 'Available commands', exact: true })
  expect(await list.getByRole('option').count()).toBeLessThan(40)
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(list.getByRole('option', { name: 'Command 9999', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  console.log('Command preview: 18 viewport/theme cases, project navigation and 10,000-row virtualization passed.')
} finally {
  await browser.close()
  server.kill()
}
