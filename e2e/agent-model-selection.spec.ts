import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createConfigurationCommandClient, createModelCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { mobileShellNavigationLabel } from '../apps/web/src/mobile-shell-navigation-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'
import { expectLumenValue, selectLumenChoice, selectLumenOption } from './support/lumen-controls'

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
      await page.getByRole('button', { name: mobileShellNavigationLabel(locale), exact: true }).click()
      await page
        .getByRole('dialog', { name: mobileShellNavigationLabel(locale), exact: true })
        .getByRole('button', { name: copy.session.tools.agents, exact: true })
        .click()
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
      const trigger = page.locator('.hbar-app-react-agent-create .hbar-agent-model-trigger')
      await expect(trigger).toBeVisible()
      await trigger.click()
      const picker = page.getByRole('dialog', { name: copy.agents.modelPicker.title, exact: true })
      await expect(picker).toBeVisible()
      await expect(picker.getByRole('option')).toHaveCount(60)
      const triggerBounds = await trigger.boundingBox()
      const pickerBounds = await picker.boundingBox()
      if (!triggerBounds || !pickerBounds) throw new Error('Agent model picker geometry is not measurable')
      expect(pickerBounds.height).toBeLessThanOrEqual(421)
      const geometry = await page.evaluate(() => {
        const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
        return { viewportWidth: innerWidth, gap: Math.max(8, Number.isFinite(rootFont) ? rootFont / 2 : 8) }
      })
      const expectedLeft = Math.min(
        Math.max(triggerBounds.x, geometry.gap),
        Math.max(geometry.gap, geometry.viewportWidth - pickerBounds.width - geometry.gap),
      )
      expect(Math.abs(pickerBounds.x - expectedLeft)).toBeLessThanOrEqual(1)
      expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(geometry.viewportWidth - geometry.gap + 1)
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
      const thinking = page.getByRole('radiogroup', { name: copy.agents.thinkingLevel, exact: true })
      await expect(thinking.getByRole('radio')).toHaveCount(4)
      await selectLumenChoice(thinking, 'high')
      await trigger.click()
      await search.fill(low.modelName)
      await picker.getByRole('option').click()
      await expectLumenValue(thinking, '')
      await expect(thinking.getByRole('radio')).toHaveCount(2)
      await trigger.click()
      await search.fill(longName)
      await picker.getByRole('option').click()
      await selectLumenChoice(thinking, 'high')
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
      await selectLumenOption(profile, 'explore')
      await expect(page.getByText(copy.agents.exploreHint)).toBeVisible()
      const policy = page.locator('.hbar-agent-policy-editor')
      await policy.locator('.hbar-lumen-disclosure-trigger').click()
      await expect(page.getByText(copy.agents.policy.empty, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.agents.policy.add, exact: true }).click()
      const policyRow = policy.locator('.hbar-agent-policy-row').first()
      await expect(policyRow.locator('.hbar-agent-policy-fields')).toHaveCount(1)
      await expect(policyRow.locator('.hbar-agent-policy-row-actions')).toHaveCount(1)
      await expect(policyRow.locator('.hbar-agent-policy-row-actions button')).toBeVisible()
      await expect(policyRow.locator('.hbar-agent-policy-fields > .hbar-agent-policy-row-actions')).toHaveCount(0)
      await expect(policyRow.locator('.hbar-agent-policy-weight-row > .hbar-agent-policy-row-actions')).toHaveCount(1)
      const approval = page.getByRole('combobox', { name: copy.agents.approval, exact: true })
      await expectLumenValue(approval, 'inherit')
      await selectLumenOption(approval, 'allow')
      await expectLumenValue(approval, 'allow')
      await selectLumenOption(approval, 'inherit')
      await expectLumenValue(approval, 'inherit')
      const objective = page.getByRole('textbox', { name: copy.agents.objective, exact: true })
      const longObjective = `Verify the selected model and preserve this long task description across the narrow Agent pane. ${'Additional context '.repeat(16)}`
      await objective.fill(longObjective)
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: width < 768 ? 720 : 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        for (const field of await page.locator('.hbar-app-react-agent-create fieldset > .lumen-form-field').all()) {
          const bounds = await field.boundingBox()
          if (!bounds) throw new Error(`Agent field is not measurable at ${width}px`)
          expect(bounds.x).toBeGreaterThanOrEqual(-1)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
        }
        for (const field of await policyRow
          .locator(
            '.hbar-agent-policy-primary-fields > .lumen-form-field, .hbar-agent-policy-thinking, .hbar-agent-policy-weight',
          )
          .all()) {
          const bounds = await field.boundingBox()
          if (!bounds) throw new Error(`Policy field is not measurable at ${width}px`)
          expect(bounds.x).toBeGreaterThanOrEqual(-1)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
        }
        const slots = await policyRow.evaluate((element) => {
          const rect = (selector: string) => {
            const node = element.querySelector<HTMLElement>(selector)
            if (!node) return null
            const bounds = node.getBoundingClientRect()
            return { top: bounds.top, bottom: bounds.bottom }
          }
          const primary = element.querySelector<HTMLElement>('.hbar-agent-policy-primary-fields')
          return {
            primaryWidth: primary?.getBoundingClientRect().width ?? 0,
            difficulty: rect('.hbar-agent-policy-primary-fields > .lumen-form-field:first-child'),
            model: rect('.hbar-agent-policy-primary-fields > .lumen-form-field:nth-child(2)'),
            weight: rect('.hbar-agent-policy-weight'),
            remove: rect('.hbar-agent-policy-row-actions button'),
          }
        })
        if (slots.primaryWidth >= 384 && slots.difficulty && slots.model)
          expect(Math.abs(slots.difficulty.top - slots.model.top)).toBeLessThanOrEqual(1)
        if (slots.weight && slots.remove)
          expect(Math.abs(slots.weight.bottom - slots.remove.bottom)).toBeLessThanOrEqual(1)
        await page.screenshot({ path: testInfo.outputPath(`agent-explore-form-${locale}-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
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
