import { chromium, expect } from '@playwright/test'

const port = 5187
const base = `http://127.0.0.1:${port}`
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
      // The preview server may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const page = await browser.newPage()
  for (const width of [1192, 768, 320])
    for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`${base}/?variant=hbar-app-ui-app-shell-3&mode=isolated&theme=${theme}`)
      await page.getByRole('button', { name: 'Activity', exact: true }).click()
      const form = page.getByRole('form', { name: 'Goal settings', exact: true })
      await expect(form).toBeVisible()
      await form.getByRole('textbox', { name: 'Objective', exact: true }).fill('  Preview goal saved by host  ')
      await form.getByRole('button', { name: 'Save Goal', exact: true }).click()
      await expect(form.getByRole('textbox', { name: 'Objective', exact: true })).toHaveValue(
        'Preview goal saved by host',
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `artifacts/app-ui-integration/goal-preview-${width}-${theme}.png` })
    }
  console.log('Objective preview: 6 viewport/theme cases and host save interactions passed.')
} finally {
  await browser.close()
  server.kill()
}
