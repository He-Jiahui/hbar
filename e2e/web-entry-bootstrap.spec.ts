import { expect, test } from '@playwright/test'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import { WEB_ZOOM_STORAGE_KEY } from '../apps/web/src/app-zoom'
import { globalFeatureCopy } from '../apps/web/src/global-feature-copy'

test('production entry initializes the current shell, language and styles without legacy state', async ({
  browser,
}, info) => {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(
    ({ languageKey, zoomKey }) => {
      localStorage.setItem('hbar.workbench.v1', '{broken legacy state')
      localStorage.setItem(languageKey, 'zh-CN')
      localStorage.setItem(zoomKey, '1.1')
    },
    { languageKey: WEB_LANGUAGE_STORAGE_KEY, zoomKey: WEB_ZOOM_STORAGE_KEY },
  )
  const copy = getShellCopy('zh-CN')
  try {
    // Development capture parameters must not replace the shipped workbench.
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/?referenceFixture=ai-chat-1`)
    await expect(page.locator('#reference-fixture-route')).toHaveCount(0)
    await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.getByRole('button', { name: copy.shell.settings, exact: true })).toBeVisible()
    expect(await page.locator('body').evaluate((element) => getComputedStyle(element).margin)).toBe('0px')
    expect(
      await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--lumen-ink')),
    ).not.toBe('')
    await expect(page.locator('body')).toHaveCSS('zoom', '1.1')
    await page.screenshot({ path: info.outputPath('production-entry.png') })
    await page.reload()
    await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('body')).toHaveCSS('zoom', '1.1')
    expect(errors).toEqual([])
    const more = page.getByRole('button', { name: globalFeatureCopy('zh-CN').navigation, exact: true })
    await expect(page.getByRole('button', { name: copy.shell.extensionsAndSkills, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: copy.shell.status, exact: true })).toHaveCount(0)
    await more.click()
    const menu = page.getByRole('menu', { name: globalFeatureCopy('zh-CN').navigation, exact: true })
    await expect(menu.getByRole('menuitem', { name: copy.shell.status, exact: true })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: copy.shell.commands, exact: true })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: copy.shell.schedules, exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('secondary-navigation.png') })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await more.click()
    await menu.getByRole('menuitem', { name: copy.shell.status, exact: true }).click()
    await expect(page.getByText(copy.status.title, { exact: true }).first()).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await more.click()
    await expect(menu).toBeVisible()
    const box = await menu.boundingBox()
    expect(box).not.toBeNull()
    if (!box) throw new Error('Secondary navigation menu is missing')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(391)
    expect(box.y + box.height).toBeLessThanOrEqual(845)
    await page.screenshot({ path: info.outputPath('secondary-navigation-narrow.png') })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  } finally {
    await context.close()
  }
})
