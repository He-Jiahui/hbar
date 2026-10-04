import { expect, test } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createModelCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import type { ProviderInput } from '@hbar/contracts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test.use({ actionTimeout: 10_000 })

async function cleanupRoot(root: string): Promise<void> {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-choice-validity-'))
    throw new Error('Refusing to remove an unowned choice fixture')
  await rm(root, { recursive: true, force: true })
}

test('first-send choices stay truthful after the selected model or effort disappears from the live catalog', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-choice-validity-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const configuration = createConfigurationCommandClient(host.client)
    const models = createModelCommandClient(host.client)
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const selected: ProviderInput = {
      id: 'selected-fixture',
      name: '选定服务商',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'selected',
      thinkingLevels: ['low', 'high'],
      defaultThinkingLevel: 'low',
    }
    await configuration.execute('provider.save', { provider: selected })
    const selectedModel = (await models.execute('model.list', {})).find((model) => model.providerId === selected.id)
    if (!selectedModel) throw new Error('The selected fixture must be available')
    const copy = getShellCopy('zh-CN')
    const labels = preSessionCopy('zh-CN')
    const location = preSessionLaunchCopy('zh-CN').location
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const landing = page.locator('.hbar-pre-session-landing')
    const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true })
    const text = '保留明确选择；目录变化后继续发送同一份草稿。'
    await prompt.fill(text)
    await landing.locator('.hbar-pre-session-location-picker > button').click()
    const locationRoot = page.getByRole('dialog', { name: location.title, exact: true })
    if (await locationRoot.isVisible())
      await locationRoot.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
    await page
      .getByRole('dialog', { name: location.chooseDirectory, exact: true })
      .getByRole('button', { name: new RegExp(host.ready.workspaceName) })
      .click()
    await locationRoot.getByRole('button', { name: location.close, exact: true }).click()
    const trigger = landing.locator('.hbar-web-pre-session-model-controls .hbar-pre-session-choice-picker > button')
    const picker = page.getByRole('dialog', { name: labels.model.title, exact: true })
    await trigger.click()
    await picker.getByRole('group', { name: selected.name, exact: true }).getByRole('button').click()
    const effort = landing.locator('.hbar-pre-session-thinking-picker > button')
    await effort.click()
    const thinkingPicker = page.getByRole('dialog', { name: copy.session.modelPicker.thinking, exact: true })
    await thinkingPicker.getByRole('slider').press('End')
    await thinkingPicker.getByRole('slider').press('Enter')
    await expect(effort).toHaveAccessibleName(
      copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel('high')),
    )
    const send = landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true })
    await expect(send).toBeEnabled()
    const count = async () =>
      (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
    expect(await count()).toBe(1)
    await configuration.execute('provider.save', {
      provider: { ...selected, thinkingLevels: ['low', 'medium'], defaultThinkingLevel: 'medium' },
    })
    await expect
      .poll(
        async () =>
          (await models.execute('model.list', {})).find((model) => model.id === selectedModel.id)?.thinkingLevels,
      )
      .toEqual(['low', 'medium'])
    // A local fallback must not claim it is already the canonical first-send selection.
    await expect(send).toBeDisabled()
    await expect(prompt).toHaveValue(text)
    await expect(landing.getByRole('alert')).toBeVisible()
    await expect(effort).toHaveAccessibleName(
      copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel('high')),
    )
    await page.screenshot({ path: info.outputPath('effort-capability-changed.png') })
    // Merely inspecting or dismissing the available scale is not confirmation.
    await effort.click()
    await prompt.click()
    await expect(send).toBeDisabled()
    await effort.click()
    await thinkingPicker.getByRole('slider').press('Home')
    await thinkingPicker.getByRole('slider').press('Escape')
    await expect(send).toBeDisabled()
    await expect(effort).toHaveAccessibleName(
      copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel('high')),
    )
    await effort.click()
    await thinkingPicker.getByRole('slider').press('Home')
    await thinkingPicker.getByRole('slider').press('Enter')
    await expect(send).toBeEnabled()
    await expect(effort).toHaveAccessibleName(
      copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel('low')),
    )
    // A single remaining level is still an explicit recovery choice, not a hidden default.
    await configuration.execute('provider.save', {
      provider: { ...selected, thinkingLevels: ['medium'], defaultThinkingLevel: 'medium' },
    })
    await expect(send).toBeDisabled()
    await effort.click()
    await thinkingPicker.getByRole('slider').press('Enter')
    await expect(send).toBeEnabled()
    await expect(effort).not.toBeVisible()
    await configuration.execute('provider.delete', { id: selected.id })
    await expect
      .poll(async () => (await models.execute('model.list', {})).some((model) => model.id === selectedModel.id))
      .toBe(false)
    await expect(send).toBeDisabled()
    await expect(trigger).toHaveAccessibleName(copy.session.modelPicker.unavailableTrigger)
    await expect(prompt).toHaveValue(text)
    await page.screenshot({ path: info.outputPath('selected-model-removed.png') })
    expect(await count()).toBe(1)
    await trigger.click()
    await picker.getByRole('group', { name: 'Local fixture', exact: true }).getByRole('button').click()
    await expect(send).toBeEnabled()
    await page.screenshot({ path: info.outputPath('selection-recovered.png') })
    await send.click()
    await expect.poll(count).toBe(2)
    const created = (
      await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
    ).items.find((session) => session.id !== host!.ready.sessionId)
    if (!created) throw new Error('The recovered first send must create one Session')
    await expect
      .poll(async () => (await models.execute('session.getModel', { sessionId: created.id })).modelId)
      .toBe('local-fixture')
    await expect
      .poll(
        async () =>
          (await host!.client.call('session.snapshot', { sessionId: created.id, limit: 60 })).runs.filter(
            (run) => run.input.source === 'user' && run.input.text === text,
          ).length,
      )
      .toBe(1)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupRoot(root)
  }
})
