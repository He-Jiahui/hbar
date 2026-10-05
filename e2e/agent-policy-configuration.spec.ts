import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createModelCommandClient } from '@hbar/client'
import { encodePath } from '@hbar/schema-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`Child dispatch policy and independent settings are usable: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-agent-policy-ui-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root })
      const models = createModelCommandClient(host.client)
      const agents = createAgentCommandClient(host.client)
      const baseline = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
      const configured = await models.execute(
        'session.setModel',
        { sessionId: host.ready.sessionId, modelId: 'local-fixture', baselineRevisions: baseline.revisions },
        { idempotencyKey: 'parent-model' },
      )
      await models.execute(
        'session.setThinkingLevel',
        { sessionId: host.ready.sessionId, thinkingLevel: 'max', baselineRevisions: configured.revisions },
        { idempotencyKey: 'parent-max' },
      )
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'agents')
      await page.locator('.hbar-agent-policy-editor summary').click()
      await expect(page.getByText(copy.agents.policy.empty, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.agents.policy.add, exact: true }).click()
      const row = page.locator('.hbar-agent-policy-row')
      await row.getByRole('combobox', { name: copy.agents.policy.difficulty, exact: true }).selectOption('simple')
      await row.locator('.hbar-agent-model-trigger').click()
      const picker = page.getByRole('dialog', { name: copy.agents.modelPicker.title, exact: true })
      await expect(picker).toBeVisible()
      expect(await picker.evaluate((element) => element.parentElement === document.body)).toBe(true)
      expect(await picker.evaluate((element) => getComputedStyle(element).backdropFilter)).not.toBe('none')
      await picker.getByRole('option').click()
      await row.getByRole('combobox', { name: copy.agents.policy.thinking, exact: true }).selectOption('low')
      await row.getByRole('spinbutton', { name: copy.agents.policy.weight, exact: true }).fill('300')
      await expect(page.getByText(copy.agents.policy.unsaved, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.agents.policy.save, exact: true }).click()
      await expect(page.getByText(copy.agents.policy.saved, { exact: true })).toBeVisible()
      expect((await agents.execute('agent.policy.get', { parentSessionId: host.ready.sessionId })).candidates).toEqual([
        { difficulty: 'simple', modelId: 'local-fixture', thinkingLevel: 'low', weight: 300 },
      ])
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`agent-policy-${locale}-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.getByRole('button', { name: copy.agents.createTitle, exact: true }).click()
      await expect(page.getByRole('combobox', { name: copy.agents.thinkingLevel, exact: true })).toHaveValue('')
      await expect(
        page.getByRole('combobox', { name: copy.agents.thinkingLevel, exact: true }).locator('option:checked'),
      ).toHaveText(copy.agents.thinkingInherited('max'))
      await expect(page.getByRole('combobox', { name: copy.agents.approval, exact: true })).toHaveValue('inherit')
      await page.getByRole('combobox', { name: copy.agents.selectionMode, exact: true }).selectOption('simple')
      await page
        .getByRole('textbox', { name: copy.agents.objective, exact: true })
        .fill('Inspect the saved weighted configuration')
      await page.getByRole('textbox', { name: copy.agents.childTitle, exact: true }).fill('Configured child')
      await page.getByRole('button', { name: copy.agents.create, exact: true }).click()
      await expect(page.getByText(copy.agents.created, { exact: true })).toBeVisible()
      const child = (await agents.execute('agent.list', { parentSessionId: host.ready.sessionId, limit: 50 })).items[0]
      if (!child) throw new Error('Child was not created')
      expect(child.dispatchConfiguration).toMatchObject({
        modelId: 'local-fixture',
        thinkingLevel: 'low',
        approval: 'ask',
        selection: { difficulty: 'simple', weight: 300 },
      })
      await page.getByRole('button', { name: copy.agents.configureChild, exact: true }).click()
      await expect(page.locator('.hbar-app-react-settings-workspace')).toBeVisible()
      await expect(page.getByRole('combobox', { name: copy.settings.scopes, exact: true })).toHaveValue('session')
      const effort = page.locator(
        `[id="hbar-schema-field-${encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])}"]`,
      )
      await page
        .getByRole('button', {
          name: copy.settings.form.openOptions(copy.settings.resolve('i18n:settings.provider.thinkingLevel.label')),
          exact: true,
        })
        .click()
      await effort.fill(copy.agents.thinkingOption('high'))
      await page.getByRole('option', { name: copy.agents.thinkingOption('high'), exact: true }).click()
      await expect(effort).toHaveValue(copy.agents.thinkingOption('high'))
      await page.getByRole('button', { name: copy.settings.save, exact: true }).click()
      await expect
        .poll(async () => (await models.execute('session.getModel', { sessionId: child.sessionId })).thinkingLevel)
        .toBe('high')
      expect((await models.execute('session.getModel', { sessionId: host.ready.sessionId })).thinkingLevel).toBe('max')
      expect(
        (await agents.execute('agent.result.get', { parentSessionId: host.ready.sessionId, agentId: child.agentId }))
          .dispatchConfiguration?.thinkingLevel,
      ).toBe('low')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
