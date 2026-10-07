import { expect, test, type Locator } from '@playwright/test'
import { createConfigurationCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeFixture(root: string): Promise<void> {
  const target = await realpath(root)
  if (
    target !== resolve(root) ||
    dirname(target) !== (await realpath(tmpdir())) ||
    !basename(target).startsWith('hbar-preset-layout-')
  )
    throw new Error('Unexpected Provider preset fixture path')
  await rm(target, { recursive: true, force: true })
}

async function expectReadableOptions(list: Locator): Promise<void> {
  const geometry = await list.evaluate((element) => {
    const rectangle = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height }
    }
    const items = [...element.querySelectorAll('[role="option"]')].map((option) => ({
      row: rectangle(option),
      copy: [...option.querySelectorAll('strong, small')].map(rectangle),
    }))
    return {
      items,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }
  })
  expect(geometry.items.length).toBeGreaterThan(10)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight)
  for (const [index, item] of geometry.items.entries()) {
    for (const copy of item.copy) {
      expect(copy.top).toBeGreaterThanOrEqual(item.row.top - 1)
      expect(copy.bottom).toBeLessThanOrEqual(item.row.bottom + 1)
      expect(copy.left).toBeGreaterThanOrEqual(item.row.left - 1)
      expect(copy.right).toBeLessThanOrEqual(item.row.right + 1)
    }
    const next = geometry.items[index + 1]
    if (next) expect(item.row.bottom).toBeLessThanOrEqual(next.row.top + 1)
    const title = item.copy[0]
    const detail = item.copy[1]
    if (title && detail) {
      expect(title.bottom).toBeLessThanOrEqual(detail.top + 1)
      expect(Math.abs(title.left - detail.left)).toBeLessThanOrEqual(1)
    }
  }
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`provider preset rows grow for wrapped API URLs and scroll without overlapping: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-preset-layout-'))
    const output = join(process.cwd(), 'artifacts', 'provider-preset-layout')
    await mkdir(output, { recursive: true })
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 900, height: 1080 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const configuration = createConfigurationCommandClient(host.client)
      const original = await configuration.execute('provider.list', {})
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      const copy = getShellCopy(locale)
      const labels = copy.providers.dialog
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const reveal = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await reveal.isVisible()) await reveal.click()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.providers'), exact: true })
        .click()
      await page.getByRole('button', { name: copy.providers.list.add, exact: true }).click()
      const dialog = page.locator('.hbar-app-react-provider-dialog')
      const preset = dialog.getByRole('combobox', { name: labels.preset.label, exact: true })
      const list = page.getByRole('listbox')
      for (const width of [900, 390, 320]) {
        await page.setViewportSize({ width, height: 1080 })
        await preset.focus()
        await preset.press('ArrowDown')
        await expect(list).toBeVisible()
        await expect(list.getByRole('option').first()).toBeVisible()
        await expectReadableOptions(list)
        const popup = page.locator('.lumen-combobox-popup-surface:visible')
        const popupGeometry = await popup.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
            blur: getComputedStyle(element).backdropFilter,
            bodyChild: element.parentElement === document.body,
            topLayer: element.matches(':popover-open'),
          }
        })
        expect(popupGeometry.left).toBeGreaterThanOrEqual(0)
        expect(popupGeometry.top).toBeGreaterThanOrEqual(0)
        expect(popupGeometry.right).toBeLessThanOrEqual(popupGeometry.width)
        expect(popupGeometry.bottom).toBeLessThanOrEqual(popupGeometry.height)
        expect(popupGeometry.bodyChild).toBe(true)
        expect(popupGeometry.topLayer).toBe(true)
        expect(popupGeometry.blur).toContain('blur(')
        const cloudflare = list
          .getByRole('option')
          .filter({ has: page.getByText('Cloudflare AI Gateway', { exact: true }) })
          .first()
        await cloudflare.scrollIntoViewIfNeeded()
        const detail = cloudflare.locator('small')
        expect(await detail.innerText()).toContain('https://')
        expect(
          await detail.evaluate(
            (element) =>
              element.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(element).lineHeight),
          ),
        ).toBeGreaterThan(1.5)
        await page.screenshot({ path: join(output, `${locale}-${width}.png`) })
        await preset.press('End')
        await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        await expectReadableOptions(list)
        await preset.press('Escape')
        await expect(list).toBeHidden()
        await expect(dialog).toBeVisible()
      }
      await preset.fill('Cloudflare')
      await expect(list.getByRole('option').first()).toBeVisible()
      const chosen = list.getByRole('option').first()
      const chosenLabel = await chosen.locator('strong').innerText()
      await chosen.click()
      await expect(list).toBeHidden()
      await expect(dialog.locator('#provider-name')).toHaveValue(chosenLabel)
      await preset.fill('no-provider-preset-for-layout-fixture')
      await expect(list.getByRole('option')).toHaveCount(0)
      await expect(list).toContainText(labels.preset.empty)
      await dialog.getByRole('button', { name: labels.checkConfiguration, exact: true }).click()
      await expect(list).toBeHidden()
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: labels.cancel, exact: true }).click()
      expect(await configuration.execute('provider.list', {})).toEqual(original)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeFixture(root)
    }
  })
}
