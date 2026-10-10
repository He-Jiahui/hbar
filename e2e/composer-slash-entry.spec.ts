import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectLumenValue } from './support/lumen-controls'
import { openComposerFeedback, revealComposerControl } from './support/composer-controls'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`slash completion stays separate from local action, preserving session and attachments: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-slash-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), sessionCount: 2 })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const menu = page.getByRole('listbox', { name: copy.session.slash.menu })

      await prompt.fill('/')
      await expect(
        menu.getByRole('option', { name: copy.session.slash.select('/agent explore'), exact: true }),
      ).toBeVisible()
      await expect(menu.getByRole('option')).toHaveCount(8)
      await prompt.dispatchEvent('compositionstart', { data: '中' })
      await prompt.dispatchEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      await expectComposerText(prompt, '/')
      await prompt.dispatchEvent('compositionend', { data: '中' })
      await expect(
        menu.getByRole('option', { name: copy.session.slash.select('/agent'), exact: true }),
      ).toHaveAttribute('aria-selected', 'true')
      await prompt.press('ArrowDown')
      await expect(
        menu.getByRole('option', { name: copy.session.slash.select('/agent explore'), exact: true }),
      ).toHaveAttribute('aria-selected', 'true')
      await prompt.press('ArrowDown')
      await expect(menu.getByRole('option', { name: copy.session.slash.select('/model') })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await prompt.press('ArrowDown')
      await expect(menu.getByRole('option', { name: copy.session.slash.select('/settings') })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await prompt.press('Enter')
      await expect(menu).toHaveCount(0)
      await expectComposerText(prompt, '/settings ')
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveCount(0)
      await prompt.press('Enter')
      await expectLumenValue(page.getByRole('combobox', { name: copy.settings.scopes }), 'session')
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, '')

      await prompt.fill('/cost')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect(page.locator('.hbar-app-react-session-monitoring')).toBeVisible()
      await expect(
        page
          .locator('.hbar-app-react-session-monitoring [data-tool-pane-slot="header"]')
          .getByRole('heading', { name: copy.monitoring.title, exact: true }),
      ).toBeVisible()
      await expectComposerText(prompt, '')
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      await page.getByRole('button', { name: copy.monitoring.close, exact: true }).click()
      await expect(page.locator('.hbar-app-react-session-monitoring')).toHaveCount(0)

      await prompt.fill('/help')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      const commands = page.getByRole('dialog', { name: copy.commandPalette.title, exact: true })
      await expect(commands).toBeVisible()
      await expectComposerText(prompt, '')
      await commands.getByRole('button', { name: copy.commandPalette.close, exact: true }).click()
      await expect(commands).toHaveCount(0)

      await prompt.fill('/agents')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect(page.locator('.hbar-app-react-agent-workspace')).toBeVisible()
      await expect(page.getByRole('heading', { name: copy.agents.title, exact: true })).toBeVisible()
      await expectComposerText(prompt, '')
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      await page.getByRole('button', { name: copy.agents.close, exact: true }).click()
      await expect(page.locator('.hbar-app-react-agent-workspace')).toHaveCount(0)

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 800 })
        await prompt.fill('/')
        await expect(menu.getByRole('option')).toHaveCount(8)
        await page.screenshot({ path: `artifacts/reference-ux-v2/slash-catalog-${locale}-${width}.png` })
        await prompt.fill('/mo')
        await expect(menu.getByRole('option')).toHaveCount(1)
        await expect(menu.getByRole('option')).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/slash-${locale}-${width}.png` })
        await prompt.press('Escape')
        await expect(menu).toHaveCount(0)
      }
      await prompt.fill('/model')
      await prompt.press('Tab')
      await expectComposerText(prompt, '/model ')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).evaluate((element) => {
        if (!(element instanceof HTMLButtonElement)) throw new Error('Send is not a button')
        element.click()
        element.click()
      })
      const picker = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      await expect(picker).toBeVisible()
      await expect(picker).toHaveCount(1)
      await expect(picker.getByRole('searchbox', { name: copy.session.modelPicker.search })).toBeFocused()
      await expectComposerText(prompt, '')
      await picker.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()

      const attachmentMenu = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      await revealComposerControl(page, attachmentMenu, copy.session.addMenu)
      await attachmentMenu.click()
      const attachmentMenuId = await attachmentMenu.getAttribute('aria-controls')
      if (!attachmentMenuId) throw new Error('The add-action trigger must identify its surface')
      const addSurface = page.locator(`[id=${JSON.stringify(attachmentMenuId)}]`)
      const chooserPromise = page.waitForEvent('filechooser')
      await addSurface.getByRole('button', { name: copy.session.addMenu.files, exact: true }).click()
      await (await chooserPromise).setFiles({
        name: 'slash-attachment.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('retain attachment'),
      })
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'slash-attachment.txt' })).toBeVisible()
      await prompt.fill('/settings ')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await openComposerFeedback(page, copy)
      await expect(page.getByText(copy.session.slash.attachmentsBlocked, { exact: true })).toBeVisible()
      await expectComposerText(prompt, '/settings ')
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'slash-attachment.txt' })).toBeVisible()
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveCount(0)
      await page
        .locator('.lumen-attachment-chip')
        .filter({ hasText: 'slash-attachment.txt' })
        .getByRole('button')
        .click()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expectLumenValue(page.getByRole('combobox', { name: copy.settings.scopes }), 'session')
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, '')

      await page.setViewportSize({ width: 1440, height: 960 })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await prompt.fill('/settings')
      await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
      const other = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expectComposerText(other, '')
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expectComposerText(prompt, '/settings')
      await prompt.fill('/compact')
      await expect(menu).toHaveCount(0)
      await prompt.press('Enter')
      await expect
        .poll(async () =>
          (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 20 })).runs.some(
            (run) => run.input.source === 'user' && run.input.text === '/compact',
          ),
        )
        .toBe(true)
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveCount(0)
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Goal slash starts one user turn and retains Host ownership for replacement and clear: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-slash-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      const goals = createGoalPlanCommandClient(host.client)
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const send = page.getByRole('button', { name: copy.session.prompt.send, exact: true })
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 800 })
        await prompt.fill('/g')
        const option = page.getByRole('option', { name: copy.session.slash.select('/goal') })
        await expect(option).toBeInViewport()
        await page.screenshot({ path: `artifacts/reference-ux-v2/slash-goal-${locale}-${width}.png` })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await prompt.fill('')
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await prompt.fill('/goal First objective')
      await send.click()
      await expect
        .poll(async () => (await goals.execute('goal.snapshot', { sessionId: host!.ready.sessionId })).goal?.objective)
        .toBe('First objective')
      const first = (await goals.execute('goal.snapshot', { sessionId: host.ready.sessionId })).goal
      if (!first?.goalId) throw new Error('Goal slash did not create an identified Goal')
      await expectComposerText(prompt, '')
      await expect
        .poll(
          async () =>
            (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })).runs.filter(
              (run) => run.input.source === 'user' && run.input.text === 'First objective',
            ).length,
        )
        .toBe(1)
      expect(
        (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs.find(
          (run) => run.input.text === 'First objective',
        )?.input.continuation,
      ).toBeUndefined()
      await expect
        .poll(async () =>
          (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })).runs
            .filter((run) => run.input.text === 'First objective')
            .every((run) => ['completed', 'failed', 'cancelled'].includes(run.status)),
        )
        .toBe(true)
      await expect(page.locator('.hbar-session-current-goal .hbar-composer-goal-strip')).toContainText(
        'First objective',
      )
      await page.screenshot({ path: `artifacts/reference-ux-v2/slash-goal-kickoff-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 800 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/slash-goal-kickoff-${locale}-320.png` })
      await page.setViewportSize({ width: 1440, height: 900 })

      for (const unsupported of ['status', 'pause', 'resume', 'complete', '--tokens 1000']) {
        const rejected = `/goal ${unsupported}`
        await prompt.fill(rejected)
        await send.click()
        await openComposerFeedback(page, copy)
        await expect(page.getByText(copy.session.slash.goalRequired, { exact: true })).toBeVisible()
        await expectComposerText(prompt, rejected)
        expect((await goals.execute('goal.snapshot', { sessionId: host.ready.sessionId })).goal?.goalId).toBe(
          first.goalId,
        )
        if (unsupported === '--tokens 1000') {
          await page.setViewportSize({ width: 320, height: 800 })
          await page.screenshot({ path: `artifacts/reference-ux-v2/slash-goal-usage-${locale}-320.png` })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.setViewportSize({ width: 1440, height: 900 })
        }
      }

      await prompt.fill('/goal Second objective')
      await send.click()
      const desktopConfirmation = page.getByRole('group', {
        name: copy.session.slash.goalConfirmReplace('First objective'),
      })
      await expect(desktopConfirmation).toBeVisible()
      await page.screenshot({ path: `artifacts/reference-ux-v2/slash-goal-confirm-${locale}-1440.png` })
      await desktopConfirmation.getByRole('button', { name: copy.session.slash.goalCancel }).click()
      await expectComposerText(prompt, '/goal Second objective')
      expect((await goals.execute('goal.snapshot', { sessionId: host.ready.sessionId })).goal?.goalId).toBe(
        first.goalId,
      )
      await page.setViewportSize({ width: 320, height: 800 })
      await send.click()
      const replacement = page.getByRole('group', { name: copy.session.slash.goalConfirmReplace('First objective') })
      await expect(replacement).toBeVisible()
      await expectComposerText(prompt, '/goal Second objective')
      await replacement.screenshot({ path: `artifacts/reference-ux-v2/slash-goal-confirm-${locale}-320.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await replacement.getByRole('button', { name: copy.session.slash.goalConfirm }).click()
      await expect
        .poll(async () => (await goals.execute('goal.snapshot', { sessionId: host!.ready.sessionId })).goal?.objective)
        .toBe('Second objective')
      const second = (await goals.execute('goal.snapshot', { sessionId: host.ready.sessionId })).goal
      expect(second?.goalId).not.toBe(first.goalId)
      await expectComposerText(prompt, '')
      // 96445c54 gives confirmed replacements to the Host. This fixture disables
      // automatic continuation, so the browser must not create a duplicate user turn.
      expect(
        (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs.filter(
          (run) => run.input.source === 'user' && run.input.text === 'Second objective',
        ),
      ).toHaveLength(0)
      await prompt.fill('/goal clear')
      await send.click()
      const clearing = page.getByRole('group', { name: copy.session.slash.goalConfirmClear('Second objective') })
      await expect(clearing).toBeVisible()
      await clearing.getByRole('button', { name: copy.session.slash.goalConfirm }).click()
      await expect
        .poll(async () => (await goals.execute('goal.snapshot', { sessionId: host!.ready.sessionId })).goal)
        .toBeNull()
      await expectComposerText(prompt, '')
      await expect(page.locator('[data-goal-event-id]')).toHaveCount(3)
      expect(
        (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs.filter(
          (run) => run.input.source === 'user' && ['First objective', 'Second objective'].includes(run.input.text),
        ),
      ).toHaveLength(1)
      const longObjective = `Long Goal ${'容量Capacity目标'.repeat(280)}`
      expect(longObjective.length).toBeLessThanOrEqual(4000)
      await goals.execute('goal.create', { sessionId: host.ready.sessionId, objective: longObjective })
      await expect(page.locator('.hbar-session-current-goal .hbar-composer-goal-strip')).toContainText(longObjective)
      await prompt.fill('/goal clear')
      await send.click()
      const longConfirmation = page.locator('.hbar-composer-goal-confirmation')
      await expect(longConfirmation).toBeVisible()
      expect((await longConfirmation.boundingBox())!.height).toBeLessThan(200)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await longConfirmation.getByRole('button', { name: copy.session.slash.goalCancel }).click()
      await expectComposerText(prompt, '/goal clear')
      expect((await goals.execute('goal.snapshot', { sessionId: host.ready.sessionId })).goal?.objective).toBe(
        longObjective,
      )
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
