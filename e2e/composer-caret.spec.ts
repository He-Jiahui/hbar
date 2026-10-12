import { expect, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer caret and selection remain visible across themes and narrow widths: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const prefix = 'hbar-composer-caret-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, colorScheme: 'dark' })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      await page.goto(origin)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(page.locator(`.hbar-app-react-session-row[data-session-id="${host.ready.sessionId}"]`)).toHaveAttribute(
        'data-selected',
        'true',
      )
      const input = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const editor = page.locator('.hbar-composer-mention-editor')
      const draft = 'Edit here 编辑这里 ' + 'long text 自动换行 '.repeat(12)
      await input.fill(draft)
      for (const theme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', theme)
        for (const width of [1440, 320]) {
          await page.setViewportSize({ width, height: 960 })
          await input.focus()
          await input.press('ControlOrMeta+End')
          const cursor = editor.locator('.cm-cursor-primary')
          await expect(cursor).toBeVisible()
          const appearance = await cursor.evaluate((element) => {
            const style = getComputedStyle(element)
            const bounds = element.getBoundingClientRect()
            const editor = element.closest('.cm-editor')
            if (!editor) throw new Error('Cursor has no editor')
            const content = editor.querySelector('.cm-content')
            if (!content) throw new Error('Editor has no content')
            const focus = getComputedStyle(editor)
            return {
              width: Number.parseFloat(style.borderLeftWidth),
              height: bounds.height,
              color: style.borderLeftColor,
              textColor: getComputedStyle(content).color,
              opacity: style.opacity,
              animationDuration: getComputedStyle(element.parentElement ?? element).animationDuration,
              outline: Number.parseFloat(focus.outlineWidth),
              onScreen:
                bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
            }
          })
          expect(appearance.width).toBeGreaterThanOrEqual(2)
          expect(appearance.height).toBeGreaterThan(10)
          expect(appearance.color).toBe(appearance.textColor)
          expect(appearance.opacity).toBe('1')
          expect(appearance.animationDuration).toBe('0s')
          expect(appearance.outline).toBeGreaterThanOrEqual(2)
          expect(appearance.onScreen).toBe(true)
          await page.screenshot({ path: info.outputPath(`caret-${locale}-${theme}-${width}.png`) })
          await input.press('Shift+ArrowLeft')
          await input.press('Shift+ArrowLeft')
          const selection = editor.locator('.cm-selectionBackground').first()
          await expect(selection).toBeVisible()
          expect(await selection.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
            'rgba(0, 0, 0, 0)',
          )
          await expectComposerText(input, draft)
          await input.press('ArrowRight')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
      }
      await input.press('End')
      await input.type('!')
      await expectComposerText(input, `${draft}!`)
      await input.press('ControlOrMeta+z')
      await expectComposerText(input, draft)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixtureDirectory(root, prefix)
    }
  })
}
