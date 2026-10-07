import { expect, test, type Page } from '@playwright/test'
import { createConfigurationCommandClient, createRunCommandClient } from '@hbar/client'
import { access, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { cleanupOwnedPermissionFixture } from './support/permission-fixture-cleanup'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function selectSession(page: Page, title: string, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  await page.getByRole('treeitem', { name: title, exact: true }).click()
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session approval uses real Host settings without changing its default: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-permission-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        sessionCount: 2,
        budgetAutoContinue: false,
      })
      const target = host
      const sessionId = host.ready.sessionId
      const copy = getShellCopy(locale)
      const labels = copy.session.permissionPicker
      const configuration = createConfigurationCommandClient(host.client)
      const baseline = await configuration.execute('permission.get', {})
      expect(baseline).toEqual({ mode: 'ask' })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await selectSession(page, host.ready.sessionTitle, locale)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const trigger = page.locator('.hbar-composer-permission-trigger')
      const popup = page.locator('.hbar-composer-permission-surface')
      const draft = 'Approval choice stays with this draft — 审批选项随本会话草稿保留'
      await prompt.fill(draft)
      await expect(trigger).toHaveAttribute('data-choice', 'inherit')
      await trigger.focus()
      await page.keyboard.press('Enter')
      await expect(popup).toBeVisible()
      await expect(popup.getByRole('menuitemradio')).toHaveCount(6)
      await expect(popup.getByRole('menuitemradio', { checked: true })).toBeFocused()
      await expect(popup).toContainText(labels.scopeHint)
      await page.keyboard.press('ArrowUp')
      await expect(popup.locator('[data-choice="plan"]')).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(popup.locator('[data-choice="allow"]')).toBeFocused()
      await page.keyboard.press('Enter')
      const cancel = popup.getByRole('button', { name: labels.cancel, exact: true })
      await expect(cancel).toBeFocused()
      await expect(popup).toContainText(host.ready.sessionTitle)
      await expectComposerText(prompt, draft)
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(0)
      await cancel.click()
      await expect(popup.locator('[data-choice="allow"]')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await expect(trigger).toHaveAttribute('data-choice', 'inherit')

      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 900 })
        await trigger.click()
        await expect(popup).toBeVisible()
        await expect(popup.getByRole('menuitemradio')).toHaveCount(6)
        expect(
          await popup
            .getByRole('menuitemradio')
            .evaluateAll((items) => items.map((item) => item.getAttribute('data-choice'))),
        ).toEqual(['ask', 'deny', 'sandbox', 'allow', 'plan', 'inherit'])
        await expect(popup).not.toContainText(labels.plan.scope)
        if (width === 320) await expect(popup.locator('[data-choice="plan"]')).toBeInViewport({ ratio: 1 })
        expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        const bounds = await popup.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
        if (width === 1440) expect(bounds!.width).toBeLessThanOrEqual(361)
        else expect(bounds!.width).toBeGreaterThanOrEqual(width - 1)
        await page.screenshot({ path: testInfo.outputPath(`permission-options-${locale}-${width}.png`) })
        if (width !== 390)
          await page.screenshot({ path: `artifacts/desktop-permission-density/after-${locale}-${width}.png` })
        await popup.locator('[data-choice="allow"]').click()
        await expect(popup.getByRole('button', { name: labels.confirmAllow, exact: true })).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath(`permission-confirm-${locale}-${width}.png`) })
        await page.keyboard.press('Escape')
        await expectComposerText(prompt, draft)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await trigger.click()
      await popup.locator('[data-choice="allow"]').click()
      // Switching away dismisses the confirmation and cannot apply it to the new session.
      await selectSession(page, 'Session 001', locale)
      await expect(popup).toBeHidden()
      await expect(trigger).toHaveAttribute('data-choice', 'inherit')
      await selectSession(page, host.ready.sessionTitle, locale)
      await expect(trigger).toHaveAttribute('data-choice', 'inherit')
      await expectComposerText(prompt, draft)

      const choose = async (choice: 'ask' | 'deny' | 'allow' | 'inherit') => {
        await trigger.click()
        await popup.locator(`[data-choice="${choice}"]`).click()
        if (choice === 'allow') await popup.getByRole('button', { name: labels.confirmAllow, exact: true }).click()
        await expect(popup).toBeHidden()
        await expect(trigger).toHaveAttribute('data-choice', choice)
        await expect(trigger).toBeFocused()
        expect(await configuration.execute('permission.get', {})).toEqual(baseline)
      }
      const sendTool = async (path: string) => {
        const text = `/tool write_file ${JSON.stringify({ path, text: `Verified ${path}` })}`
        await prompt.fill(text)
        await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
        await expectComposerText(prompt, '')
        await expect
          .poll(
            async () =>
              (await target.client.call('session.snapshot', { sessionId })).runs.filter(
                (run) => run.input.text === text,
              ).length,
          )
          .toBe(1)
        return text
      }
      const waitCompleted = async (
        text: string,
        approval: 'ask' | 'deny' | 'allow',
        choice: 'ask' | 'deny' | 'allow' | 'inherit',
      ) => {
        await expect
          .poll(
            async () =>
              (await target.client.call('session.snapshot', { sessionId })).runs.find((run) => run.input.text === text)
                ?.status,
          )
          .toBe('completed')
        const snapshot = await target.client.call('session.snapshot', { sessionId })
        const run = snapshot.runs.find((run) => run.input.text === text)
        expect(run?.input.approval).toBe(approval)
        await expect(trigger).toHaveAttribute('data-choice', choice)
        return { run, snapshot }
      }

      await choose('deny')
      const denied = await waitCompleted(await sendTool('denied.txt'), 'deny', 'deny')
      expect(denied.snapshot.approvals.filter((item) => item.runId === denied.run?.id)).toHaveLength(0)
      await expect(access(join(root, 'denied.txt'))).rejects.toThrow()
      expect(await configuration.execute('permission.get', {})).toEqual(baseline)

      await choose('allow')
      const allowed = await waitCompleted(await sendTool('allowed.txt'), 'allow', 'allow')
      expect(allowed.snapshot.approvals.filter((item) => item.runId === allowed.run?.id)).toHaveLength(0)
      expect(await readFile(join(root, 'allowed.txt'), 'utf8')).toBe('Verified allowed.txt')
      expect(await configuration.execute('permission.get', {})).toEqual(baseline)

      await choose('ask')
      await trigger.click()
      await expect(popup).toBeVisible()
      const externalText = `/tool write_file ${JSON.stringify({ path: 'running-lock.txt', text: 'confirmed' })}`
      await createRunCommandClient(host.client).execute(
        'run.submit',
        { sessionId, modelId: 'local-fixture', input: { text: externalText, images: [], approval: 'ask' } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (await target.client.call('session.snapshot', { sessionId })).runs.find(
              (run) => run.input.text === externalText,
            )?.status,
        )
        .toBe('waiting_approval')
      await expect(trigger).toBeDisabled()
      await expect(popup).toBeHidden()
      await expect(trigger).toHaveAttribute('title', labels.runActiveHint)
      await page.screenshot({ path: testInfo.outputPath(`permission-run-active-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 900 })
      await page.screenshot({ path: testInfo.outputPath(`permission-run-active-${locale}-320.png`) })
      await selectSession(page, 'Session 001', locale)
      await expect(trigger).toBeEnabled()
      await selectSession(page, host.ready.sessionTitle, locale)
      await expect(trigger).toBeDisabled()
      await page
        .getByRole('region', { name: copy.session.decisions.approval, exact: true })
        .getByRole('button', { name: copy.session.decisions.allow, exact: true })
        .click()
      await expect
        .poll(
          async () =>
            (await target.client.call('session.snapshot', { sessionId })).runs.find(
              (run) => run.input.text === externalText,
            )?.status,
        )
        .toBe('completed')
      await expect(trigger).toBeEnabled()
      await page.setViewportSize({ width: 1440, height: 960 })
      const askedText = await sendTool('asked.txt')
      const approvalCard = page.getByRole('region', { name: copy.session.decisions.approval, exact: true })
      await expect(approvalCard.getByRole('button', { name: copy.session.decisions.allow, exact: true })).toBeVisible()
      const waiting = await host.client.call('session.snapshot', { sessionId })
      const asked = waiting.runs.find((run) => run.input.text === askedText)
      expect(asked?.input.approval).toBe('ask')
      expect(waiting.approvals.find((item) => item.runId === asked?.id)?.status).toBe('pending')
      await expect(access(join(root, 'asked.txt'))).rejects.toThrow()
      await approvalCard.getByRole('button', { name: copy.session.decisions.allow, exact: true }).click()
      await waitCompleted(askedText, 'ask', 'ask')
      expect(await readFile(join(root, 'asked.txt'), 'utf8')).toBe('Verified asked.txt')
      expect(await configuration.execute('permission.get', {})).toEqual(baseline)

      // Only this fixture setup changes the Host default. The product picker never writes it.
      await choose('inherit')
      await configuration.execute('permission.set', { mode: 'deny' })
      await trigger.click()
      await expect(popup).toContainText(labels.inheritedSnapshotHint(labels.options.deny.label))
      await page.keyboard.press('Escape')
      const inherited = await waitCompleted(await sendTool('inherited-denied.txt'), 'deny', 'inherit')
      expect(inherited.snapshot.approvals.filter((item) => item.runId === inherited.run?.id)).toHaveLength(0)
      await expect(access(join(root, 'inherited-denied.txt'))).rejects.toThrow()
      expect(await configuration.execute('permission.get', {})).toEqual({ mode: 'deny' })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupOwnedPermissionFixture(root, 'hbar-composer-permission-')
    }
  })
}
