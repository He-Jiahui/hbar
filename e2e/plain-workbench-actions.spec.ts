import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('plain workbench actions preserve keyboard, disclosure, selection and the original composer target', async ({
  browser,
}, info) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-plain-actions-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  const copy = getShellCopy('zh-CN')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const composer = page.locator('.lumen-prompt-composer')
    const editor = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const text = '保留原会话和输入草稿，验证简洁操作入口。'
    await editor.fill(text)
    for (const label of [copy.shell.hideSidebar, copy.shell.roster.refreshExpanded, copy.session.addMenu.open]) {
      const action = page.getByRole('button', { name: label, exact: true })
      await expect(action.locator('[data-edge]')).toHaveCount(0)
      await expect(action).toHaveAttribute('data-lumen-indicator', 'none')
      const box = await action.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(30)
      expect(box?.height).toBeGreaterThanOrEqual(30)
    }
    const batch = page.locator('.hbar-app-react-session-batch-mode')
    await batch.click()
    await expect(batch).toHaveAttribute('aria-pressed', 'true')
    expect(await batch.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
    await batch.click()
    await expect(batch).toHaveAttribute('aria-pressed', 'false')
    await expect(editor).toHaveText(text)

    const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
    await hide.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(hide).toBeFocused()
    expect(await hide.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
    await page.screenshot({ path: info.outputPath('plain-actions-desktop-keyboard.png') })
    await page.keyboard.press('Enter')
    const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    await expect(show).toBeVisible()
    await show.click()
    await expect(editor).toHaveText(text)

    await page.setViewportSize({ width: 320, height: 900 })
    if (await hide.isVisible()) await hide.click()
    const add = composer.getByRole('button', { name: copy.session.addMenu.open, exact: true })
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(add).toHaveAttribute('aria-expanded', 'true')
    await expect(composer.locator('.hbar-composer-add-popover')).toBeVisible()
    expect(await add.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
    await page.keyboard.press('Escape')
    await expect(add).toBeFocused()
    await expect(add).toHaveAttribute('aria-expanded', 'false')
    expect(await add.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
    await expect(editor).toHaveText(text)
    await page.screenshot({ path: info.outputPath('plain-actions-narrow-add-focus.png') })
    await composer.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    const target = host
    await expect
      .poll(
        async () =>
          (await target.client.call('session.snapshot', { sessionId: target.ready.sessionId })).runs.filter(
            (run) => run.input.text === text,
          ).length,
      )
      .toBe(1)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    const exactRoot = resolve(root)
    expect(dirname(exactRoot)).toBe(resolve(tmpdir()))
    expect(basename(exactRoot).startsWith('hbar-plain-actions-')).toBe(true)
    await rm(exactRoot, { recursive: true, force: true })
  }
})
