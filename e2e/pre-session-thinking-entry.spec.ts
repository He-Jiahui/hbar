import { expect, test } from '@playwright/test'
import { createModelCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

test.use({ actionTimeout: 10_000 })

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`no-tab effort selection is Host-confirmed before the first Run: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-thinking-'))
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
      const models = createModelCommandClient(host.client)
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const fixture = (await models.execute('model.list', {})).find((item) => item.id === 'local-fixture')
      expect(fixture).toBeDefined()
      expect(fixture!.thinkingLevels.length).toBeGreaterThan(1)
      const levels = fixture!.thinkingLevels
      const lastIndex = levels.length - 1
      const targetIndex = levels[lastIndex] === fixture!.defaultThinkingLevel ? 0 : lastIndex
      const target = levels[targetIndex]!
      const targetKey = targetIndex === 0 ? 'Home' : 'End'
      const count = async () =>
        (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      const landing = page.locator('.hbar-pre-session-landing')
      const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
      const message = `Review this first with effort ${locale}`
      await prompt.fill(message)
      const locationTrigger = landing.locator('.hbar-pre-session-location-picker > button')
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
      await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
      await page
        .getByRole('dialog', { name: labels.model.title })
        .getByRole('button', { name: new RegExp(fixture!.modelName) })
        .click()
      const effort = landing.locator('.hbar-pre-session-thinking-picker > button')
      const initialName = copy.session.modelPicker.thinkingTrigger(
        copy.session.modelPicker.thinkingLevel(fixture!.defaultThinkingLevel),
      )
      await expect(effort).toHaveAccessibleName(initialName)
      await effort.click()
      const picker = page.getByRole('dialog', { name: copy.session.modelPicker.thinking })
      const slider = picker.getByRole('slider', { name: copy.session.modelPicker.thinking })
      await expect(slider).toBeFocused()
      await page.keyboard.press(targetKey)
      await expect(slider).toHaveAttribute('aria-valuetext', copy.session.modelPicker.thinkingLevel(target))
      await page.keyboard.press('Escape')
      await expect(picker).toBeHidden()
      await expect(effort).toBeFocused()
      await expect(effort).toHaveAccessibleName(initialName)
      await effort.click()
      await expect(slider).toBeFocused()
      await page.keyboard.press(targetKey)
      await page.keyboard.press('Enter')
      await expect(effort).toHaveAccessibleName(
        copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel(target)),
      )
      const modelTrigger = landing.locator('.hbar-pre-session-choice-picker > button')
      await expect(modelTrigger).toHaveText(fixture!.modelName)
      await expect(modelTrigger.locator('svg')).toHaveCount(1)
      await expect(modelTrigger).toHaveCSS('font-weight', '600')
      await expect(effort).toBeEnabled()
      await expect(picker).toBeHidden()
      await expect(effort).toBeFocused()
      await effort.click()
      await expect(picker).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-thinking-${locale}.png` })
      await page.keyboard.press('Escape')
      await expect(effort).toBeFocused()
      await expect(prompt).toHaveValue(message)
      expect(await count()).toBe(1)
      await page.screenshot({ path: info.outputPath(`model-ready-before-first-send-${locale}.png`) })
      await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
      await expect.poll(count).toBe(2)
      const created = (
        await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
      ).items.find((item) => item.id !== host!.ready.sessionId)!
      await expect
        .poll(async () => (await models.execute('session.getModel', { sessionId: created.id })).thinkingLevel)
        .toBe(target)
      await expect
        .poll(async () => {
          const snapshot = await host!.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
          return snapshot.runs.filter((run) => run.input.source === 'user' && run.input.text === message).length
        })
        .toBe(1)
      await expect(landing).toHaveCount(0)
      const existingModel = page.locator('.hbar-composer-model-trigger')
      const existingEffort = page.locator('.hbar-composer-thinking-trigger')
      await expect(existingModel).toHaveText(fixture!.modelName)
      await expect(existingModel.locator('svg')).toHaveCount(1)
      await expect(existingModel).toHaveCSS('font-weight', '600')
      await expect(existingEffort).toHaveAccessibleName(
        copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel(target)),
      )
      const nextPrompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const nextDraft = 'Keep composing after the first send — 首发后继续编辑而不提交。'
      await nextPrompt.fill(nextDraft)
      await expect(existingModel).toBeEnabled()
      await existingModel.click()
      const existingPicker = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      await expect(existingPicker).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(existingModel).toBeFocused()
      await expectComposerText(nextPrompt, nextDraft)
      await page.screenshot({ path: info.outputPath(`model-ready-after-first-send-${locale}.png`) })
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      const exactRoot = resolve(root)
      expect(dirname(exactRoot)).toBe(resolve(tmpdir()))
      expect(basename(exactRoot).startsWith('hbar-pre-session-thinking-')).toBe(true)
      await rm(exactRoot, { recursive: true, force: true })
    }
  })
}
