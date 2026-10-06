import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer plus opens slash commands in an existing draft without losing content: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-add-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      await writeFile(join(root, 'slash-target.txt'), 'slash target\n')
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
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

      await page.setViewportSize({ width: 1440, height: 900 })
      await prompt.fill('Keep')
      await prompt.press('End')
      await plus.click()
      await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeEnabled()
      await menu.getByRole('button', { name: copy.session.addMenu.slash }).click()
      await expectComposerText(prompt, 'Keep /')
      await expect(prompt).toBeFocused()
      const slashMenu = page.getByRole('listbox', { name: copy.session.slash.menu })
      const slashOptions = slashMenu.getByRole('option')
      const slashOptionCount = await slashOptions.count()
      expect(slashOptionCount).toBeGreaterThanOrEqual(copy.session.slash.commands.length)
      expect(slashOptionCount).toBeLessThanOrEqual(24)
      for (const command of copy.session.slash.commands)
        await expect(slashOptions.filter({ hasText: command.label }).first()).toBeVisible()
      await expect(page.locator('.hbar-composer-slash-hint')).toBeVisible()
      await prompt.press('Escape')
      await expect(slashMenu).toBeHidden()
      await expectComposerText(prompt, 'Keep /')
      await expect(prompt).toBeFocused()

      await prompt.fill('Keep @slash-target')
      const mentionMenu = page.getByRole('listbox', { name: copy.session.mentions.menu })
      await expect(mentionMenu.getByRole('option').filter({ hasText: 'slash-target.txt' })).toBeVisible()
      await mentionMenu.getByRole('option').filter({ hasText: 'slash-target.txt' }).click()
      await expectComposerText(prompt, 'Keep @slash-target.txt')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@slash-target.txt')

      await plus.click()
      const chooserPromise = page.waitForEvent('filechooser')
      await menu.getByRole('button', { name: copy.session.addMenu.files }).click()
      const chooser = await chooserPromise
      await chooser.setFiles({ name: 'add-menu.txt', mimeType: 'text/plain', buffer: Buffer.from('test attachment') })
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })).toBeVisible()

      await page.setViewportSize({ width: 320, height: 900 })
      await prompt.press('Home')
      for (let index = 0; index < 'Keep '.length; index += 1) await prompt.press('ArrowRight')
      await plus.click()
      await expect(menu.getByRole('button', { name: copy.session.addMenu.slash })).toBeEnabled()
      await menu.getByRole('button', { name: copy.session.addMenu.slash }).click()
      await expect(slashMenu).toBeVisible()
      await expect(prompt).toBeFocused()
      await expectComposerText(prompt, 'Keep /@slash-target.txt')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@slash-target.txt')
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })).toBeVisible()
      await expect(page.locator('.hbar-composer-slash-hint')).toBeHidden()
      await page.screenshot({ path: `artifacts/desktop-composer-add/inline-slash-${locale}-320.png` })
      await prompt.press('Escape')
      await expect(slashMenu).toBeHidden()
      await expect(prompt).toBeFocused()
      await expectComposerText(prompt, 'Keep /@slash-target.txt')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@slash-target.txt')
      const attachmentChip = page.locator('.lumen-attachment-chip').filter({ hasText: 'add-menu.txt' })
      await expect(attachmentChip).toBeVisible()
      const attachmentBounds = await attachmentChip.boundingBox()
      expect(attachmentBounds).not.toBeNull()
      expect(attachmentBounds!.x).toBeGreaterThanOrEqual(-1)
      expect(attachmentBounds!.x + attachmentBounds!.width).toBeLessThanOrEqual(321)
      await page.screenshot({ path: `artifacts/desktop-composer-add/inline-slash-escaped-${locale}-320.png` })
      const beforeGoal = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 20 })
      expect(beforeGoal.runs).toHaveLength(0)

      await prompt.fill('Keep this draft')
      await expectComposerText(prompt, 'Keep this draft')
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveCount(0)
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
