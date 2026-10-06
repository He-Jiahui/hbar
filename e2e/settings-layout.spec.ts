import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'

test('settings scope and model controls fit narrow workspaces without horizontal clipping', async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-settings-layout-'))
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US' })
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Model', exact: true }).click()
    await selectLumenOption(page.getByRole('combobox', { name: 'Settings scope' }), 'session')
    await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toBeVisible()
    for (const viewport of [
      { width: 1440, height: 960 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ]) {
      await page.setViewportSize(viewport)
      const geometry = await page.locator('.hbar-app-react-settings-workspace').evaluate((element) => {
        const box = element.getBoundingClientRect()
        const footer = element.querySelector('.hbar-app-react-settings-footer')!.getBoundingClientRect()
        const overflowing = [...element.querySelectorAll('*')].flatMap((child) => {
          const childBox = child.getBoundingClientRect()
          return childBox.width > 0 && (childBox.right > box.right + 1 || childBox.left < box.left - 1)
            ? [{ tag: child.tagName, class: child.className, width: childBox.width, right: childBox.right }]
            : []
        })
        return {
          noOverflow: element.scrollWidth <= element.clientWidth,
          footerAligned: Math.abs(box.bottom - footer.bottom) <= 1,
          overflowing,
          header: [...element.querySelector('.lumen-page-header')!.children].map((child) => ({
            class: child.className,
            display: getComputedStyle(child).display,
            width: child.getBoundingClientRect().width,
            basis: getComputedStyle(child).flexBasis,
          })),
          flow: getComputedStyle(element.querySelector('.lumen-page-header')!).display,
          wrap: getComputedStyle(element.querySelector('.lumen-page-header')!).flexWrap,
        }
      })
      await page.screenshot({
        path: `artifacts/session-autonomy/settings-layout-${viewport.width}.png`,
        fullPage: true,
      })
      expect(geometry, JSON.stringify(geometry)).toMatchObject({ noOverflow: true, footerAligned: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await expect(page.getByRole('combobox', { name: 'Settings scope' })).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toBeVisible()
    }
    await page.setViewportSize({ width: 1440, height: 960 })
    await selectLumenOption(page.getByRole('combobox', { name: 'Settings scope' }), 'global')
    await page.getByRole('button', { name: 'Providers', exact: true }).click()
    const actions = page.getByTitle('Actions for Local fixture', { exact: true })
    await actions.click()
    await page.getByRole('menuitem', { name: 'Delete Local fixture' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete provider “Local fixture”?' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(actions).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu', { name: 'Actions for Local fixture' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(actions).toBeFocused()
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
