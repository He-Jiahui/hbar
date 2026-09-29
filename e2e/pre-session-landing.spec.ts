import { expect, test } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createModelCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`no-tab composer defers Session creation until first send: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    const labels = preSessionCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const models = createModelCommandClient(host.client)
      const configuration = createConfigurationCommandClient(host.client)
      const hostDefaultApproval = await configuration.execute('permission.get', {})
      const count = async () =>
        (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
      const available = await models.execute('model.list', {})
      const fixtureModel = available.find((item) => item.id === 'local-fixture')
      expect(fixtureModel).toBeDefined()
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const landing = page.locator('.hbar-pre-session-landing')
      await expect(landing.getByRole('heading', { level: 1, name: copy.preSession.hero.title })).toBeVisible()
      const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
      await expect(prompt).toBeVisible()
      await expect(page.getByRole('tab')).toHaveCount(0)
      expect(await count()).toBe(1)

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 900, height: 760 },
        { width: 390, height: 720 },
        { width: 320, height: 560 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(landing.getByRole('heading', { name: copy.preSession.hero.title })).toBeInViewport()
        await expect(prompt).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/desktop-experience/pre-session-${locale}-${viewport.width}.png` })
      }

      await prompt.fill('First message from the no-tab landing.')
      await landing.getByRole('button', { name: labels.workspace.trigger(null) }).click()
      const projects = page.getByRole('dialog', { name: labels.workspace.title })
      await expect(projects).toBeVisible()
      await expect(projects).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-projects-${locale}-320.png` })
      await projects.getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
      await expect(projects).toHaveCount(0)
      await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
      const modelPicker = page.getByRole('dialog', { name: labels.model.title })
      await expect(modelPicker).toBeVisible()
      await expect(modelPicker).toBeInViewport()
      await expect(modelPicker.getByRole('button', { name: labels.model.close })).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-models-${locale}-320.png` })
      await modelPicker.getByRole('button', { name: new RegExp(fixtureModel!.modelName) }).click()
      await expect(modelPicker).toHaveCount(0)
      const approval = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
      await approval.click()
      const approvalPicker = page.locator('.hbar-pre-session-approval-popover')
      await expect(approvalPicker).toBeVisible()
      await expect(approvalPicker.getByRole('menuitemradio')).toHaveCount(5)
      await expect(approvalPicker).toBeInViewport()
      await expect(approvalPicker.getByRole('menuitemradio', { checked: true })).toBeFocused()
      await page.keyboard.press('Home')
      await expect(approvalPicker.locator('[data-choice="ask"]')).toBeFocused()
      await page.keyboard.press('End')
      await expect(approvalPicker.locator('[data-choice="inherit"]')).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-approval-${locale}-320.png` })
      await approvalPicker
        .getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.options.deny.label) })
        .click()
      await expect(approval).toHaveAttribute('data-choice', 'deny')
      await approval.click()
      await approvalPicker
        .getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.options.allow.label) })
        .click()
      await expect(approvalPicker.getByText(copy.session.permissionPicker.confirmTitle, { exact: true })).toBeVisible()
      await expect(approvalPicker.getByRole('button', { name: copy.session.permissionPicker.cancel })).toBeFocused()
      await approvalPicker.getByRole('button', { name: copy.session.permissionPicker.cancel }).click()
      await expect(approvalPicker.locator('[data-choice="allow"]')).toBeFocused()
      await expect(approval).toHaveAttribute('data-choice', 'deny')
      await approvalPicker.getByRole('button', { name: copy.session.permissionPicker.close }).click()
      expect(await count()).toBe(1)
      await expect(prompt).toHaveValue('First message from the no-tab landing.')
      await page.setViewportSize({ width: 1440, height: 900 })
      const modelTrigger = landing.locator('[data-placement="composer"] > button')
      await modelTrigger.click()
      await expect(modelPicker).toBeVisible()
      await expect(modelPicker.getByRole('searchbox', { name: labels.model.search })).toBeFocused()
      const modelPlacement = await modelPicker.evaluate((popup) => {
        const box = popup.getBoundingClientRect()
        const trigger = document.querySelector('[data-placement="composer"] > button')?.getBoundingClientRect()
        return {
          above: Boolean(trigger && box.bottom <= trigger.top + 1),
          trailing: Boolean(trigger && Math.abs(box.right - trigger.right) <= 2),
          within: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0,
        }
      })
      expect(modelPlacement).toEqual({ above: true, trailing: true, within: true })
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-models-${locale}-1440.png` })
      await page.keyboard.press('Escape')
      await expect(modelPicker).toBeHidden()
      await expect(modelTrigger).toBeFocused()
      await expect(prompt).toHaveValue('First message from the no-tab landing.')
      expect(await count()).toBe(1)
      await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
      await expect(page.getByRole('tab')).toHaveCount(1)
      await expect.poll(count).toBe(2)
      await expect
        .poll(
          async () => {
            const created = (
              await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })
            ).items.find((item) => item.id !== host!.ready.sessionId)
            if (!created) return false
            const snapshot = await host!.client.call('session.snapshot', { sessionId: created.id, limit: 10 })
            return snapshot.messages.some((message) =>
              message.content.some(
                (block) => block.type === 'text' && block.text === 'First message from the no-tab landing.',
              ),
            )
          },
          { timeout: 15_000 },
        )
        .toBe(true)
      await expect(page.locator('.hbar-pre-session-landing')).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: copy.session.prompt.input })).toBeVisible()
      const created = (
        await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
      ).items.find((item) => item.id !== host!.ready.sessionId)
      expect(created).toBeDefined()
      const snapshot = await host.client.call('session.snapshot', { sessionId: created!.id, limit: 10 })
      expect(
        snapshot.runs.find((run) => run.input.text === 'First message from the no-tab landing.')?.input.approval,
      ).toBe('deny')
      expect(await configuration.execute('permission.get', {})).toEqual(hostDefaultApproval)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })

  test(`no-tab Plan is confirmed on the created Host Session before first Run: ${locale}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-plan-'))
    const context = await browser.newContext({ locale, viewport: { width: 320, height: 720 } })
    const copy = getShellCopy(locale)
    const labels = preSessionCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const configuration = createConfigurationCommandClient(host.client)
      const fixtureModel = (await createModelCommandClient(host.client).execute('model.list', {})).find(
        (model) => model.id === 'local-fixture',
      )
      expect(fixtureModel).toBeDefined()
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      const landing = page.locator('.hbar-pre-session-landing')
      await expect(landing).toBeVisible()
      const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
      const message = `Plan first on the no-tab landing ${locale}`
      await prompt.fill(message)
      await landing.getByRole('button', { name: labels.workspace.trigger(null) }).click()
      const projects = page.getByRole('dialog', { name: labels.workspace.title })
      await projects.getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
      await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
      const models = page.getByRole('dialog', { name: labels.model.title })
      await models.getByRole('button', { name: new RegExp(fixtureModel!.modelName) }).click()
      const trigger = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
      const picker = page.locator('.hbar-pre-session-approval-popover')
      await trigger.click()
      await expect(picker.getByRole('menuitemradio')).toHaveCount(5)
      await picker
        .getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.options.deny.label) })
        .click()
      await trigger.click()
      await picker.getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.plan.label) }).click()
      await expect(trigger).toHaveAttribute('data-choice', 'plan')
      await expect(prompt).toHaveAttribute('placeholder', copy.session.intent.planPlaceholder)
      await trigger.click()
      await picker
        .getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.options.deny.label) })
        .click()
      await expect(trigger).toHaveAttribute('data-choice', 'deny')
      await expect(prompt).toHaveAttribute('placeholder', copy.preSession.prompt.placeholder)
      await trigger.click()
      await picker.getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.plan.label) }).click()
      await expect(trigger).toHaveAttribute('data-choice', 'plan')
      await trigger.click()
      await picker.getByRole('menuitem', { name: new RegExp(copy.session.permissionPicker.plan.exit) }).click()
      await expect(trigger).toHaveAttribute('data-choice', 'deny')
      await trigger.click()
      await picker.getByRole('menuitemradio', { name: new RegExp(copy.session.permissionPicker.plan.label) }).click()
      await expect(trigger).toHaveAttribute('data-choice', 'plan')
      await trigger.click()
      await expect(
        picker.getByRole('menuitem', { name: new RegExp(copy.session.permissionPicker.plan.exit) }),
      ).toBeVisible()
      await expect(picker).toBeInViewport()
      const menuBody = picker.locator('.hbar-composer-permission-body')
      const overflow = await menuBody.evaluate((element) => ({
        needsScroll: element.scrollHeight > element.clientHeight,
        mode: getComputedStyle(element).overflowY,
      }))
      if (overflow.needsScroll) expect(overflow.mode).toBe('auto')
      const inherited = picker.getByRole('menuitemradio', {
        name: new RegExp(copy.session.permissionPicker.options.inherit.label),
      })
      await inherited.scrollIntoViewIfNeeded()
      await expect(inherited).toBeInViewport()
      const exitPlan = picker.getByRole('menuitem', { name: new RegExp(copy.session.permissionPicker.plan.exit) })
      await exitPlan.scrollIntoViewIfNeeded()
      await expect(exitPlan).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-plan-${locale}-320.png` })
      await picker.getByRole('button', { name: copy.session.permissionPicker.close }).click()
      expect(
        (await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })).items,
      ).toHaveLength(1)
      await page.setViewportSize({ width: 1440, height: 900 })
      await trigger.click()
      const placement = await picker.evaluate((popup) => {
        const box = popup.getBoundingClientRect()
        const anchor = document.querySelector('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
        const triggerBox = anchor?.getBoundingClientRect()
        return {
          above: Boolean(triggerBox && box.bottom <= triggerBox.top + 1),
          within: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0,
        }
      })
      expect(placement).toEqual({ above: true, within: true })
      await page.screenshot({ path: `artifacts/desktop-experience/pre-session-plan-${locale}-1440.png` })
      await picker.getByRole('button', { name: copy.session.permissionPicker.close }).click()
      await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
      await expect(page.getByRole('tab')).toHaveCount(1)
      await expect
        .poll(async () => {
          const items = (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 }))
            .items
          return items.find((item) => item.id !== host!.ready.sessionId)?.id ?? null
        })
        .not.toBeNull()
      const session = (
        await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
      ).items.find((item) => item.id !== host!.ready.sessionId)!
      await expect
        .poll(async () => (await configuration.execute('mode.get', { sessionId: session.id })).mode)
        .toBe('plan')
      await expect
        .poll(async () => {
          const snapshot = await host!.client.call('session.snapshot', { sessionId: session.id, limit: 10 })
          return snapshot.runs.find((run) => run.input.text === message)?.input.approval ?? null
        })
        .toBe('deny')
      await expect(page.locator('.hbar-composer-permission-trigger')).toHaveAttribute('data-choice', 'plan')
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('no-tab project picker pages beyond 100 without clipping its path action at 320px', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-pre-session-capacity-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 320, height: 720 } })
  const copy = getShellCopy('zh-CN')
  const labels = preSessionCopy('zh-CN')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const sessions = createWorkspaceSessionCommandClient(host.client)
    for (let index = 0; index < 100; index += 1) {
      const path = join(
        root,
        `项目-${String(index).padStart(3, '0')}-${index === 99 ? '很长的名称用于核对窄屏换行' : '测试'}`,
      )
      await mkdir(path)
      await sessions.execute('workspace.create', { path })
    }
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    const landing = page.locator('.hbar-pre-session-landing')
    await expect(landing).toBeVisible()
    const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
    await prompt.fill('添加目录前保留这条草稿')
    await landing.getByRole('button', { name: labels.workspace.trigger(null) }).click()
    const picker = page.getByRole('dialog', { name: labels.workspace.title })
    const rows = picker.locator('.hbar-pre-session-choice-row')
    await expect(rows).toHaveCount(60)
    await picker.getByRole('button', { name: labels.workspace.more(40) }).click()
    await expect(rows).toHaveCount(100)
    await picker.getByRole('button', { name: labels.workspace.more(null) }).click()
    await expect(rows).toHaveCount(101)
    const list = picker.locator('.hbar-pre-session-choice-list')
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    expect(
      await rows.evaluateAll((elements) =>
        elements.every((element, index) => {
          if (index === 0) return true
          const previous = elements[index - 1]!.getBoundingClientRect()
          const current = element.getBoundingClientRect()
          return current.top >= previous.bottom - 1
        }),
      ),
    ).toBe(true)
    const path = picker.getByRole('textbox', { name: labels.path })
    await path.focus()
    await expect(path).toBeInViewport()
    await expect(picker.getByRole('button', { name: labels.addWorkspace })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/desktop-experience/pre-session-projects-101-zh-CN-320.png' })
    await path.fill(join(root, 'missing-directory'))
    await picker.getByRole('button', { name: labels.addWorkspace }).click()
    await expect(picker.getByRole('alert')).toBeVisible()
    await expect(path).toHaveValue(join(root, 'missing-directory'))
    await path.fill(root)
    await picker.getByRole('button', { name: labels.addWorkspace }).click()
    await expect(picker).toHaveCount(0)
    await expect(prompt).toHaveValue('添加目录前保留这条草稿')
    expect(
      (await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })).items,
    ).toHaveLength(1)
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
