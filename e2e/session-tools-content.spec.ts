import { expect, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { SessionToolsContentInput } from '../tests/fixtures/session-tools-content-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/desktop-elements/session-tools-content/controlled')
let server: PreviewServer | undefined
let url = ''
test.beforeAll(async () => {
  test.setTimeout(90_000)
  await build({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(root, 'web'),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rolldownOptions: { input: join(process.cwd(), 'tests/fixtures/session-tools-content.html') },
    },
  })
  server = await preview({
    configFile: false,
    root: process.cwd(),
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned tools preview')
  url = `http://127.0.0.1:${address.port}/tests/fixtures/session-tools-content.html`
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const width of [1440, 1100, 900, 390, 320]) {
    test(`full tool names and shared menu lifecycle ${locale} ${width}`, async ({ browser }, info) => {
      const context = await browser.newContext({ locale, viewport: { width, height: 1000 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(url)
        await page.evaluate(() => {
          document.documentElement.style.zoom = '1.25'
        })
        const copy = getShellCopy(locale).session.tools
        const trigger = page.getByRole('button', { name: copy.more, exact: true })
        const menu = page.getByRole('menu', { name: copy.more, exact: true })
        const row = (id: 'goals' | 'agents' | 'monitoring' | 'settings') =>
          menu.getByRole(id === 'settings' ? 'menuitem' : 'menuitemcheckbox', { name: copy[id].repeat(8), exact: true })
        for (const mode of ['light', 'dark'] as const) {
          const data: SessionToolsContentInput = { locale, mode, selected: 'agents', disabled: false, long: true }
          await page.evaluate((input) => window.mountSessionToolsContent(input), data)
          await trigger.click()
          await expect(menu).toBeVisible()
          await expect(row('agents')).toBeFocused()
          await expect(row('agents')).toHaveAttribute('aria-checked', 'true')
          await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(3)
          await expect(menu.getByRole('menuitem')).toHaveCount(1)
          expect(await menu.evaluate((node) => node.parentElement === document.body)).toBe(true)
          const style = await menu.evaluate((node) => ({
            blur: getComputedStyle(node).backdropFilter,
            zIndex: Number(getComputedStyle(node).zIndex),
          }))
          expect(style.blur).toContain('blur(')
          expect(style.zIndex).toBeGreaterThan(1000)
          const bounds = await menu.boundingBox()
          if (!bounds) throw new Error('Missing visible menu bounds')
          expect(bounds.x).toBeGreaterThanOrEqual(-1)
          expect(bounds.y).toBeGreaterThanOrEqual(-1)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(1001)
          for (const id of ['goals', 'agents', 'monitoring', 'settings'] as const) {
            const title = row(id).locator('[data-text-context="collection.title"]')
            await expect(title).toHaveText(copy[id].repeat(8))
            const flow = await title.evaluate((node) => ({
              wrap: getComputedStyle(node).whiteSpace,
              overflow: getComputedStyle(node).textOverflow,
              fits: node.scrollWidth <= node.clientWidth + 1,
            }))
            expect(flow).toEqual({ wrap: 'normal', overflow: 'clip', fits: true })
            const geometry = await title.evaluate((node) => {
              const range = document.createRange()
              range.selectNodeContents(node)
              const text = range.getBoundingClientRect()
              const row = node.parentElement?.getBoundingClientRect()
              return { textTop: text.top, textBottom: text.bottom, rowTop: row?.top, rowBottom: row?.bottom }
            })
            if (geometry.rowTop === undefined || geometry.rowBottom === undefined)
              throw new Error('Missing named menu row')
            expect(geometry.textTop).toBeGreaterThanOrEqual(geometry.rowTop - 1)
            expect(geometry.textBottom).toBeLessThanOrEqual(geometry.rowBottom + 1)
          }
          await page.screenshot({ path: info.outputPath(`tools-${mode}-${width}.png`), fullPage: true })
          await page.keyboard.press('End')
          await expect(row('settings')).toBeFocused()
          if (await menu.evaluate((node) => node.scrollHeight > node.clientHeight))
            await expect.poll(() => menu.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
          await page.screenshot({ path: info.outputPath(`tools-last-${mode}-${width}.png`), fullPage: true })
          await page.keyboard.press('ArrowDown')
          await expect(row('goals')).toBeFocused()
          await page.keyboard.press('ArrowUp')
          await expect(row('settings')).toBeFocused()
          await page.keyboard.press('Home')
          await expect(row('goals')).toBeFocused()
          await page.keyboard.press('Escape')
          await expect(menu).not.toBeVisible()
          await expect(trigger).toBeFocused()
          await trigger.press('ArrowUp')
          await expect(row('settings')).toBeFocused()
          await page.keyboard.press('Escape')
          await trigger.press('ArrowDown')
          await expect(row('goals')).toBeFocused()
          await page.evaluate((input) => window.updateSessionToolsContent(input), {
            ...data,
            selected: 'monitoring',
          } satisfies SessionToolsContentInput)
          await expect(row('monitoring')).toHaveAttribute('aria-checked', 'true')
          await expect(row('goals')).toBeFocused()
          await row('goals').press('Enter')
          await expect(menu).not.toBeVisible()
          expect(await page.evaluate(() => window.sessionToolsContentTargets())).toEqual(['goals'])
          await trigger.click()
          await expect(row('monitoring')).toBeFocused()
          await row('settings').click()
          expect(await page.evaluate(() => window.sessionToolsContentTargets())).toEqual(['goals', 'settings'])
          await trigger.click()
          await trigger.click()
          await expect(menu).not.toBeVisible()
          await trigger.click()
          await page.locator('[data-tools-other]').click()
          await expect(menu).not.toBeVisible()
          await expect(page.getByRole('dialog', { name: copy.activity, exact: true })).toBeVisible()
          await page.locator('[data-tools-outside]').click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await trigger.click()
          await page.evaluate((input) => window.updateSessionToolsContent(input), { ...data, disabled: true })
          await expect(menu).not.toBeVisible()
          await expect(trigger).toBeDisabled()
          await page.evaluate((input) => window.updateSessionToolsContent(input), { ...data, selected: null })
          await expect(trigger).toBeEnabled()
          await expect(menu).not.toBeVisible()
          await trigger.click()
          await expect(row('goals')).toBeFocused()
          await expect(menu.locator('[aria-checked="true"]')).toHaveCount(0)
          await page.keyboard.press('Escape')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
