import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createConfigurationCommandClient, createModelCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Agent model chooser becomes a touch sheet without opening the keyboard first: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-agent-model-touch-'))
    const context = await browser.newContext({
      locale,
      viewport: { width: 320, height: 720 },
      hasTouch: true,
      isMobile: true,
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      await createConfigurationCommandClient(host.client).execute('provider.save', {
        provider: {
          id: 'touch-models',
          name: 'Touch models',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'model-0',
          models: Array.from({ length: 70 }, (_, index) => ({ id: `model-${index}`, name: `Touch model ${index}` })),
          thinkingLevels: ['low', 'high'],
          defaultThinkingLevel: 'low',
        },
      })
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      expect(await page.evaluate(() => matchMedia('(max-width: 40rem) and (pointer: coarse)').matches)).toBe(true)
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'agents')
      await page.getByRole('button', { name: copy.agents.createTitle, exact: true }).click()
      const trigger = page.locator('.hbar-agent-model-trigger')
      await trigger.click()
      const picker = page.getByRole('dialog', { name: copy.agents.modelPicker.title, exact: true })
      const search = picker.getByRole('searchbox', { name: copy.agents.modelPicker.search })
      await expect(picker).toBeVisible()
      await expect(search).not.toBeFocused()
      await expect(picker.getByRole('option')).toHaveCount(60)
      const bounds = await picker.boundingBox()
      if (!bounds) throw new Error('Agent model sheet is not measurable')
      expect(bounds.x).toBeLessThanOrEqual(1)
      expect(bounds.width).toBeGreaterThanOrEqual(319)
      expect(bounds.y).toBeGreaterThanOrEqual(150)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(721)
      const list = picker.locator('.hbar-agent-model-list')
      expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`agent-model-touch-${locale}-320.png`) })
      await search.focus()
      await expect(search).toBeFocused()
      await search.fill('Touch model 69')
      await expect(picker.getByRole('option')).toHaveCount(1)
      await picker.getByRole('option').click()
      await expect(picker).not.toBeVisible()
      await expect(trigger).toContainText('Touch model 69')
      await trigger.click()
      await expect(search).not.toBeFocused()
      await page.keyboard.press('Escape')
      await expect(picker).not.toBeVisible()
      await expect(trigger).toBeFocused()
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
  test(`Agent creation chooses a Host model, thinking level and read-only profile: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-agent-model-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const longName = 'Agent review model — 长名称需要正确截断并保留选择入口'
      const configuration = createConfigurationCommandClient(host.client)
      await configuration.execute('provider.save', {
        provider: {
          id: 'agent-choice',
          name: 'Agent choice',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'review',
          models: [
            { id: 'review', name: longName },
            ...Array.from({ length: 64 }, (_, index) => ({ id: `choice-${index}`, name: `Agent choice ${index}` })),
          ],
          thinkingLevels: ['low', 'medium', 'high'],
          defaultThinkingLevel: 'medium',
        },
      })
      await configuration.execute('provider.save', {
        provider: {
          id: 'agent-low',
          name: 'Low-only provider',
          protocol: 'mock',
          baseUrl: 'http://127.0.0.1',
          model: 'low-only',
          thinkingLevels: ['low'],
          defaultThinkingLevel: 'low',
        },
      })
      const models = createModelCommandClient(host.client)
      const catalog = await models.execute('model.list', {})
      const review = catalog.find((model) => model.modelName === longName)!
      const low = catalog.find((model) => model.providerId === 'agent-low')!
      const before = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'agents')
      await page.getByRole('button', { name: copy.agents.createTitle, exact: true }).click()
      const trigger = page.locator('.hbar-agent-model-trigger')
      await expect(trigger).toBeVisible()
      await trigger.click()
      const picker = page.getByRole('dialog', { name: copy.agents.modelPicker.title, exact: true })
      await expect(picker).toBeVisible()
      await expect(picker.getByRole('option')).toHaveCount(60)
      const triggerBounds = await trigger.boundingBox()
      const pickerBounds = await picker.boundingBox()
      if (!triggerBounds || !pickerBounds) throw new Error('Agent model picker geometry is not measurable')
      expect(pickerBounds.height).toBeLessThanOrEqual(421)
      expect(pickerBounds.x + pickerBounds.width).toBeCloseTo(
        Math.min(triggerBounds.x + triggerBounds.width, 1440 - 16),
        0,
      )
      await page.screenshot({ path: testInfo.outputPath(`agent-model-${locale}-1440.png`) })
      const list = picker.locator('.hbar-agent-model-list')
      expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      const search = picker.getByRole('searchbox', { name: copy.agents.modelPicker.search })
      await expect(search).toBeFocused()
      await search.fill(longName)
      await expect(picker.getByRole('option')).toHaveCount(1)
      await page.keyboard.press('ArrowDown')
      await expect(picker.getByRole('option')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(picker).not.toBeVisible()
      await expect(trigger).toContainText(longName)
      const thinking = page.getByRole('combobox', { name: copy.agents.thinkingLevel, exact: true })
      await expect(thinking.locator('option')).toHaveCount(4)
      await thinking.selectOption('high')
      await trigger.click()
      await search.fill(low.modelName)
      await picker.getByRole('option').click()
      await expect(thinking).toHaveValue('')
      await expect(thinking.locator('option')).toHaveCount(2)
      await trigger.click()
      await search.fill(longName)
      await picker.getByRole('option').click()
      await thinking.selectOption('high')
      expect((await models.execute('session.getModel', { sessionId: host.ready.sessionId })).modelId).toBe(
        before.modelId,
      )
      await page.setViewportSize({ width: 320, height: 720 })
      await trigger.click()
      await expect(picker.getByRole('option').filter({ hasText: longName })).toHaveAttribute('aria-selected', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`agent-model-${locale}-320.png`) })
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 1440, height: 900 })
      const profile = page.getByRole('combobox', { name: copy.agents.profile, exact: true })
      await profile.selectOption('explore')
      await expect(page.getByText(copy.agents.exploreHint)).toBeVisible()
      await page.setViewportSize({ width: 320, height: 720 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`agent-explore-form-${locale}-320.png`) })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.getByRole('textbox', { name: copy.agents.objective, exact: true }).fill('Verify the selected model')
      await page.getByRole('button', { name: copy.agents.create, exact: true }).click()
      await expect(page.getByText(copy.agents.created)).toBeVisible()
      const records = await createAgentCommandClient(host.client).execute('agent.list', {
        parentSessionId: host.ready.sessionId,
        limit: 50,
      })
      expect(records.items[0]?.modelId).toBe(review.id)
      expect(records.items[0]?.profileId).toBe('explore')
      await expect(page.getByText(copy.agents.profileOptions.explore, { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
