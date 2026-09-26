import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session tools remain readable, keyboard-operable and scoped at every width: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-tools-'))
    const context = await browser.newContext({ locale })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('A draft belongs to this session — 工具切换不应丢失草稿')
      const tools = page.getByRole('group', { name: copy.session.tools.label, exact: true })
      const labels = [
        copy.session.find.entry,
        copy.session.tools.files,
        copy.session.tools.monitoring,
        copy.session.tools.agents,
        copy.session.tools.goals,
        copy.session.tools.settings,
      ]
      const panels = [
        { label: copy.session.tools.files, title: copy.files.title, close: copy.files.close },
        { label: copy.session.tools.monitoring, title: copy.monitoring.title, close: copy.monitoring.close },
        { label: copy.session.tools.agents, title: copy.agents.title, close: copy.agents.close },
        { label: copy.session.tools.goals, title: copy.goals.title, close: copy.goals.close },
      ]
      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 900, height: 700 },
        { width: 390, height: 844 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(tools.getByRole('button')).toHaveCount(6)
        for (const label of labels) {
          const action = tools.getByRole('button', { name: label, exact: true })
          await expect(action).toBeVisible()
          await expect(action).toBeInViewport()
          await expect(action).toHaveAttribute('aria-label', label)
          await expect(action).toHaveAttribute('title', label)
          await expect(action).toHaveText('')
          await expect(action.locator('svg')).toHaveAttribute('aria-hidden', 'true')
        }
        expect(
          await tools.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const buttons = [...element.querySelectorAll('button')]
            const rects = buttons.map((button) => button.getBoundingClientRect())
            return {
              fits: element.scrollWidth <= element.clientWidth + 1,
              buttonsFit: buttons.every((button) => {
                const rect = button.getBoundingClientRect()
                return (
                  rect.left >= bounds.left - 1 &&
                  rect.right <= bounds.right + 1 &&
                  button.scrollWidth <= button.clientWidth + 1
                )
              }),
              flowing: rects.every((rect, index) =>
                rects
                  .slice(0, index)
                  .every((previous) => rect.top >= previous.bottom - 1 || rect.left >= previous.right - 1),
              ),
            }
          }),
        ).toEqual({ fits: true, buttonsFit: true, flowing: true })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const headerBounds = await page.locator('.hbar-app-react-session-workspace > .lumen-page-header').boundingBox()
        const headingBounds = await page.locator('.hbar-app-react-session-workspace .lumen-page-heading').boundingBox()
        const actionBounds = await tools.boundingBox()
        if (!headerBounds || !headingBounds || !actionBounds) throw new Error('Session header must remain measurable')
        expect(headerBounds.height).toBeLessThanOrEqual(headingBounds.height + actionBounds.height + 32)
        if (viewport.width <= 560)
          expect(headingBounds.y + headingBounds.height).toBeLessThanOrEqual(actionBounds.y + 1)
        await page.screenshot({ path: `artifacts/desktop-experience/session-tools-${locale}-${viewport.width}.png` })

        await tools.getByRole('button', { name: copy.session.find.entry, exact: true }).focus()
        for (const label of labels.slice(1)) {
          await page.keyboard.press('Tab')
          await expect(tools.getByRole('button', { name: label, exact: true })).toBeFocused()
        }
        expect(
          await tools
            .getByRole('button', { name: copy.session.tools.settings, exact: true })
            .evaluate(
              (element) => element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none',
            ),
        ).toBe(true)
        for (const [index, panel] of panels.entries()) {
          const action = tools.getByRole('button', { name: panel.label, exact: true })
          await expect(action).toHaveAttribute('aria-pressed', 'false')
          await action.focus()
          await page.keyboard.press(index % 2 ? 'Space' : 'Enter')
          const pane = page.getByRole('region', { name: panel.title, exact: true }).filter({
            has: page.getByRole('button', { name: panel.close, exact: true }),
          })
          await expect(pane).toBeVisible()
          if (viewport.width > 1024) {
            await expect(action).toHaveAttribute('aria-pressed', 'true')
            for (const other of panels.filter((candidate) => candidate !== panel))
              await expect(tools.getByRole('button', { name: other.label, exact: true })).toHaveAttribute(
                'aria-pressed',
                'false',
              )
          }
          await pane.getByRole('button', { name: panel.close, exact: true }).click()
          await expect(action).toHaveAttribute('aria-pressed', 'false')
          await expectComposerText(prompt, 'A draft belongs to this session — 工具切换不应丢失草稿')
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(host.ready.sessionTitle)
        }
        const settings = tools.getByRole('button', { name: copy.session.tools.settings, exact: true })
        await expect(settings).not.toHaveAttribute('aria-pressed')
        await settings.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expectComposerText(prompt, 'A draft belongs to this session — 工具切换不应丢失草稿')
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
