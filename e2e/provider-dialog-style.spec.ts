import { expect, test } from '@playwright/test'
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
    !basename(target).startsWith('hbar-provider-modal-style-')
  )
    throw new Error('Unexpected provider modal fixture path')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`production provider modal owns its viewport without a browser-default frame: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-provider-modal-style-'))
    const evidence = join(process.cwd(), 'artifacts', 'popup-style')
    await mkdir(evidence, { recursive: true })
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 2048, height: 1228 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.providers'), exact: true })
        .click()
      const trigger = page.getByRole('button', { name: copy.providers.list.add, exact: true })
      await trigger.click()
      const modal = page.locator('.hbar-app-react-provider-modal')
      const editor = page.locator('.hbar-app-react-provider-dialog')
      await expect(editor.locator('#provider-id')).toBeVisible()
      await editor.locator('#provider-id').fill('preserved-modal-draft')
      for (const viewport of [
        { width: 2048, height: 1228 },
        { width: 390, height: 844 },
        { width: 2048, height: 1228 },
      ]) {
        await page.setViewportSize(viewport)
        const geometry = await modal.evaluate((element) => {
          const root = element.parentElement
          const footer = element.querySelector('.hbar-app-react-provider-dialog > footer')
          if (!root || !footer) throw new Error('Provider modal viewport owner/footer missing')
          const style = getComputedStyle(root)
          const rect = (node: Element) => {
            const value = node.getBoundingClientRect()
            return {
              x: value.x,
              y: value.y,
              width: value.width,
              height: value.height,
              bottom: value.bottom,
              right: value.right,
            }
          }
          return {
            viewport: { width: innerWidth, height: innerHeight },
            root: rect(root),
            modal: rect(element),
            footer: rect(footer),
            rootBorder: style.borderWidth,
            rootMargin: style.margin,
            rootBackground: style.backgroundColor,
            portal: root.parentElement === document.body,
            topLayer: root.matches(':popover-open'),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }
        })
        await info.attach(`modal-${viewport.width}`, {
          body: JSON.stringify(geometry, null, 2),
          contentType: 'application/json',
        })
        await page.screenshot({ path: join(evidence, `${locale}-${viewport.width}.png`) })
        expect(geometry.rootBorder).toBe('0px')
        expect(geometry.rootMargin).toBe('0px')
        expect(geometry.rootBackground).toBe('rgba(0, 0, 0, 0)')
        expect(geometry.root).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height })
        const ratio = viewport.width <= 960 || viewport.height <= 640 ? 1 : 0.6
        expect(Math.abs(geometry.modal.width - viewport.width * ratio), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
        expect(Math.abs(geometry.modal.height - viewport.height * ratio), JSON.stringify(geometry)).toBeLessThanOrEqual(
          1,
        )
        expect(geometry.portal).toBe(true)
        expect(geometry.topLayer).toBe(true)
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
        expect(geometry.footer.bottom).toBeLessThanOrEqual(geometry.modal.bottom + 1)
        await expect(editor.locator('#provider-id')).toHaveValue('preserved-modal-draft')
        await expect(editor.getByRole('button', { name: copy.providers.dialog.cancel, exact: true })).toBeVisible()
      }
      const protocol = editor.getByRole('combobox', { name: copy.providers.dialog.provider.protocol, exact: true })
      await protocol.click()
      const options = page.getByRole('listbox')
      await expect(options).toBeVisible()
      await options.press('Escape')
      await expect(options).toBeHidden()
      await expect(modal).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeFixture(root)
    }
  })
}
