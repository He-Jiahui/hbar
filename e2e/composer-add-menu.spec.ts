import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer plus presents files and local commands without changing the draft: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-add-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const plus = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      const menu = page.getByRole('group', { name: copy.session.addMenu.menu })

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await plus.click()
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('button', { name: copy.session.addMenu.files })).toBeVisible()
        await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeVisible()
        await expect(menu.getByRole('button', { name: copy.session.intent.goalMenu })).toBeVisible()
        await expect(menu).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/desktop-composer-add/add-menu-${locale}-${width}.png` })
        await page.keyboard.press('Escape')
        await expect(menu).toBeHidden()
        await expect(plus).toBeFocused()
      }

      await plus.click()
      await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeEnabled()
      await menu.getByRole('button', { name: copy.session.addMenu.slash }).click()
      await expectComposerText(prompt, '/')
      await expect(prompt).toBeFocused()
      await expect(page.getByRole('listbox', { name: copy.session.slash.menu }).getByRole('option')).toHaveCount(
        copy.session.slash.commands.length,
      )
      await prompt.press('Escape')
      await prompt.fill('Keep this draft')
      await plus.click()
      await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeDisabled()
      await page.getByRole('heading', { name: host.ready.sessionTitle, exact: true, level: 1 }).click()
      await expect(menu).toBeHidden()
      await expectComposerText(prompt, 'Keep this draft')

      await plus.click()
      const chooserPromise = page.waitForEvent('filechooser')
      await menu.getByRole('button', { name: copy.session.addMenu.files }).click()
      const chooser = await chooserPromise
      await chooser.setFiles({ name: 'add-menu.txt', mimeType: 'text/plain', buffer: Buffer.from('test attachment') })
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })).toBeVisible()
      await expectComposerText(prompt, 'Keep this draft')
      await plus.click()
      await menu.getByRole('button', { name: copy.session.intent.goalMenu }).focus()
      await page.keyboard.press('Enter')
      await expect(menu).toBeHidden()
      await expect(prompt).toBeFocused()
      const prepared = page.getByRole('button', { name: copy.session.intent.cancelGoal, exact: true })
      await expect(prepared).toContainText(copy.session.intent.goalPrepared)
      await prepared.click()
      await expect(prepared).toHaveCount(0)
      await expectComposerText(prompt, 'Keep this draft')
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })).toBeVisible()
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 20 })
      expect(snapshot.runs).toHaveLength(0)
      await plus.click()
      await menu.getByRole('button', { name: copy.session.intent.goalMenu }).click()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(
          async () =>
            (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 20 })).runs.length,
        )
        .toBe(1)
      const submitted = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 20 })
      const userRuns = submitted.runs.filter((run) => run.input.source === 'user')
      expect(userRuns).toHaveLength(1)
      expect(userRuns[0]?.input.text).toBe('Keep this draft')
      expect(userRuns[0]?.input.files?.map((file) => file.name)).toContain('add-menu.txt')
      const goal = await createGoalPlanCommandClient(host.client).execute('goal.get', {
        sessionId: host.ready.sessionId,
      })
      expect(goal.goal?.objective).toBe('Keep this draft')
      await expect(prepared).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
