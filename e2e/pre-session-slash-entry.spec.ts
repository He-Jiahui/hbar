import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test.use({ actionTimeout: 10_000 })

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`no-tab slash actions stay local and keep the first-send draft: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-slash-'))
    const context = await browser.newContext({
      locale,
      viewport: { width: locale === 'en-US' ? 1440 : 320, height: 900 },
    })
    const copy = getShellCopy(locale)
    const labels = preSessionCopy(locale)
    const location = preSessionLaunchCopy(locale).location
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const count = async () =>
        (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      const landing = page.locator('.hbar-pre-session-landing')
      const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
      const send = landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true })
      const locationTrigger = landing.locator('.hbar-pre-session-location-picker > button')
      const menu = page.getByRole('listbox', { name: copy.session.slash.menu })

      await prompt.fill('/')
      await expect(menu.getByRole('option')).toHaveCount(3)
      await prompt.press('Tab')
      await expect(prompt).toHaveValue('/model ')
      await send.click()
      const modelPicker = page.getByRole('dialog', { name: labels.model.title })
      await expect(modelPicker).toBeVisible()
      if (locale === 'en-US')
        await expect(modelPicker.getByRole('searchbox', { name: labels.model.search })).toBeFocused()
      else await expect(modelPicker.getByRole('button', { name: labels.model.close })).toBeFocused()
      await expect(prompt).toHaveValue('')
      expect(await count()).toBe(1)
      await modelPicker.getByRole('button', { name: labels.model.close }).click()

      await prompt.fill('/model')
      await expect(menu.getByRole('option')).toHaveCount(1)
      await prompt.press('Enter')
      await expect(prompt).toHaveValue('/model ')
      await prompt.press('Enter')
      await expect(modelPicker).toBeVisible()
      await modelPicker.getByRole('button', { name: labels.model.close }).click()
      await expect(prompt).toHaveValue('')
      expect(await count()).toBe(1)

      await locationTrigger.click()
      const locationRootBeforeDirectory = page.getByRole('dialog', { name: location.title, exact: true })
      if (await locationRootBeforeDirectory.isVisible())
        await locationRootBeforeDirectory.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
      const directoryPicker = page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
      await directoryPicker.getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
      const locationRoot = page.getByRole('dialog', { name: location.title, exact: true })
      await expect(locationRoot).toBeVisible()
      await locationRoot.getByRole('button', { name: location.close, exact: true }).click()
      await expect(locationRoot).toBeHidden()
      await landing.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      await landing
        .getByRole('group', { name: copy.session.addMenu.menu })
        .getByRole('button', { name: copy.session.addMenu.slash, exact: true })
        .click()
      await expect(prompt).toHaveValue('/')
      await expect(menu.getByRole('option')).toHaveCount(3)
      await expect(prompt).toBeFocused()
      await expect(menu).toBeInViewport({ ratio: 0.9 })
      await expect(menu.getByRole('option').last()).toBeInViewport({ ratio: 0.9 })
      const keyboardHint = menu.getByText(copy.session.slash.hint)
      if (locale === 'en-US') await expect(keyboardHint).toBeVisible()
      else await expect(keyboardHint).toBeHidden()
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-slash-menu-${locale}.png` })
      await prompt.press('Escape')
      await expect(menu).toBeHidden()
      await expect(prompt).toBeFocused()
      await landing.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      await landing
        .getByRole('group', { name: copy.session.addMenu.menu })
        .getByRole('button', { name: copy.session.addMenu.slash, exact: true })
        .click()
      await expect(prompt).toHaveValue('/')
      await expect(menu.getByRole('option')).toHaveCount(3)
      await prompt.press('ArrowDown')
      await prompt.press('Tab')
      await expect(prompt).toHaveValue('/settings ')
      await expect(send).toBeEnabled()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-slash-${locale}.png` })
      await send.click()
      await expect(page.getByRole('button', { name: copy.settings.back, exact: true })).toBeVisible()
      expect(await count()).toBe(1)
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expect(landing).toBeVisible()
      await expect(prompt).toHaveValue('')
      await expect(locationTrigger).toHaveAccessibleName(
        new RegExp(`^${location.trigger(host.ready.workspaceName, null, false)}`),
      )

      await prompt.fill('/goal Keep this first objective')
      await send.click()
      await expect(prompt).toHaveValue('Keep this first objective')
      await expect(prompt).toHaveAttribute('placeholder', copy.session.intent.goalPlaceholder)
      const cancelGoal = landing.getByRole('button', { name: copy.session.intent.cancelGoal, exact: true })
      await expect(cancelGoal).toBeVisible()
      expect(await count()).toBe(1)
      const execution = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
      await execution.click()
      const executionMenu = page.locator('.hbar-pre-session-approval-popover')
      const plan = executionMenu.locator('[data-choice="plan"]')
      await expect(plan).toBeEnabled()
      await expect(plan).toContainText(labels.planReplacesGoal)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-goal-plan-switch-${locale}.png` })
      await plan.click()
      await expect(execution).toHaveAttribute('data-choice', 'plan')
      await expect(cancelGoal).toHaveCount(0)
      await expect(prompt).toHaveValue('Keep this first objective')
      await landing.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      const replacePlan = landing
        .getByRole('group', { name: copy.session.addMenu.menu })
        .getByRole('button', { name: labels.goalReplacesPlan, exact: true })
      await expect(replacePlan).toBeEnabled()
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-plan-goal-switch-${locale}.png` })
      await replacePlan.click()
      await expect(cancelGoal).toBeVisible()
      await expect(execution).not.toHaveAttribute('data-choice', 'plan')
      await expect(prompt).toHaveValue('Keep this first objective')
      expect(await count()).toBe(1)
      await cancelGoal.click()
      await expect(prompt).toHaveValue('Keep this first objective')
      await prompt.fill('/cost')
      await expect(send).toBeDisabled()
      await expect(landing.getByText(labels.slashRequiresSession)).toBeVisible()
      expect(await count()).toBe(1)
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
