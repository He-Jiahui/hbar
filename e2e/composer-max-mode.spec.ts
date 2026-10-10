import { expect, test } from '@playwright/test'
import { createModelCommandClient, createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { startMaxModeFixture } from './support/max-mode-fixture'
test.use({ actionTimeout: 10_000 })

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`MAX is independent of reasoning, stays explicit while running and works for non-reasoning models: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const host = await startMaxModeFixture()
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    try {
      const models = createModelCommandClient(host.client)
      const copy = getShellCopy(locale)
      const labels = copy.session.modelPicker
      await context.request.post(`${host.ready.url}/auth/token`, { data: { token: host.ready.token } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(host.ready.url)
      await page.getByRole('treeitem', { name: 'MAX mode session', exact: true }).click()
      const trigger = page.locator('.hbar-composer-model-picker .hbar-composer-thinking-trigger')
      await expect(trigger).toHaveAccessibleName(labels.thinkingTrigger(labels.thinkingLevel('high')))
      await trigger.click()
      const popup = page.getByRole('dialog', { name: labels.thinking, exact: true })
      const toggle = popup.getByLabel(labels.maxMode.title, { exact: true })
      await toggle.click()
      await expect(toggle).toBeChecked()
      await expect
        .poll(
          async () =>
            (await models.execute('session.getContextUsage', { sessionId: host.ready.sessionId })).contextWindow,
        )
        .toBe(16_384)
      expect(await models.execute('session.getModel', { sessionId: host.ready.sessionId })).toMatchObject({
        maxMode: true,
        thinkingLevel: 'high',
      })
      const slider = popup.getByRole('slider', { name: labels.thinking, exact: true })
      await expect(slider).toBeEnabled()
      await slider.press('End')
      await slider.press('Enter')
      await expect
        .poll(async () => (await models.execute('session.getModel', { sessionId: host.ready.sessionId })).thinkingLevel)
        .toBe('max')
      await expect(toggle).toBeChecked()
      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(popup).toBeVisible()
        expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`max-menu-${locale}-${viewport.width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await toggle.click()
      await expect(toggle).not.toBeChecked()
      await expect
        .poll(
          async () =>
            (await models.execute('session.getContextUsage', { sessionId: host.ready.sessionId })).contextWindow,
        )
        .toBe(4096)
      expect((await models.execute('session.getModel', { sessionId: host.ready.sessionId })).thinkingLevel).toBe('max')
      await toggle.press('Escape')
      await expect(trigger).toBeFocused()
      await createRunCommandClient(host.client).execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'max-fixture/large',
          input: { text: 'hold', images: [], maxMode: false },
        },
        { idempotencyKey: 'held-standard' },
      )
      await expect(trigger).toBeDisabled()
      const configuration = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
      await models.execute(
        'session.setMaxMode',
        { sessionId: host.ready.sessionId, enabled: true, baselineRevisions: configuration.revisions },
        { idempotencyKey: 'next-max' },
      )
      expect((await models.execute('session.getContextUsage', { sessionId: host.ready.sessionId })).contextWindow).toBe(
        4096,
      )
      host.child.stdin?.write('release\n')
      await expect
        .poll(
          async () =>
            (await models.execute('session.getContextUsage', { sessionId: host.ready.sessionId })).contextWindow,
        )
        .toBe(16_384)
      await expect(trigger).toBeEnabled()
      const modelTrigger = page.locator('.hbar-composer-model-trigger')
      await modelTrigger.click()
      await page.getByRole('option').filter({ hasText: 'Tiered non-reasoning model' }).click()
      await expect(trigger).toHaveAccessibleName(labels.maxMode.trigger(labels.maxMode.menu))
      await trigger.click()
      await expect(popup.getByRole('slider')).toHaveCount(0)
      await expect(toggle).toBeChecked()
      await toggle.press('Escape')
      await modelTrigger.click()
      await page.getByRole('option').filter({ hasText: 'Single window model' }).click()
      await expect(trigger).toHaveCount(0)
      expect((await models.execute('session.getModel', { sessionId: host.ready.sessionId })).maxMode).toBe(false)
      expect(errors).toEqual([])
    } finally {
      host.child.stdin?.write('release\n')
      await context.close()
      await host.close()
    }
  })

  test(`first-send MAX is stored on the created Session and Run: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(120_000)
    const host = await startMaxModeFixture()
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    try {
      const models = createModelCommandClient(host.client)
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const workspace = await sessions.execute('workspace.get', { workspaceId: host.ready.workspaceId })
      const copy = getShellCopy(locale)
      const location = preSessionLaunchCopy(locale).location
      await context.request.post(`${host.ready.url}/auth/token`, { data: { token: host.ready.token } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(host.ready.url)
      const landing = page.locator('.hbar-pre-session-landing')
      await landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true }).fill('First MAX message')
      await landing.locator('.hbar-pre-session-location-picker > button').click()
      const root = page.getByRole('dialog', { name: location.title, exact: true })
      if (await root.isVisible()) await root.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
      const directory = page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
      await directory.getByRole('button', { name: new RegExp(workspace?.name ?? 'hbar-max-ui') }).click()
      await root.getByRole('button', { name: location.close, exact: true }).click()
      const trigger = landing.locator('.hbar-pre-session-thinking-picker > button')
      await expect(trigger).toBeEnabled()
      await trigger.click()
      const popup = page.getByRole('dialog', { name: copy.session.modelPicker.thinking, exact: true })
      const toggle = popup.getByLabel(copy.session.modelPicker.maxMode.title, { exact: true })
      await toggle.click()
      await expect(toggle).toBeChecked()
      await expect(trigger).toHaveAccessibleName(
        copy.session.modelPicker.maxMode.trigger(
          copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel('high')),
        ),
      )
      await toggle.press('Escape')
      await page.screenshot({ path: info.outputPath(`first-send-max-${locale}.png`) })
      await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
      await expect
        .poll(
          async () =>
            (await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })).items.length,
        )
        .toBe(2)
      const created = (
        await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
      ).items.find((item) => item.id !== host.ready.sessionId)!
      await expect
        .poll(async () => (await models.execute('session.getModel', { sessionId: created.id })).maxMode)
        .toBe(true)
      expect((await models.execute('session.getContextUsage', { sessionId: created.id })).contextWindow).toBe(16_384)
      await expect(page.getByText('MAX fixture completed.', { exact: true })).toBeVisible()
      await expect
        .poll(async () => {
          const snapshot = await host.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
          return snapshot.runs
            .filter((run) => run.input.source === 'user' && run.input.text === 'First MAX message')
            .map((run) => ({ maxMode: run.input.maxMode, status: run.status }))
        })
        .toEqual([{ maxMode: true, status: 'completed' }])
      expect(errors).toEqual([])
    } finally {
      await context.close()
      await host.close()
    }
  })
}
