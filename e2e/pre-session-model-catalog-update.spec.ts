import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient, createModelCommandClient } from '@hbar/client'
import type { ProviderInput } from '@hbar/contracts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test.use({ actionTimeout: 10_000 })

async function cleanupRoot(root: string): Promise<void> {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-first-send-catalog-'))
    throw new Error('Refusing to remove an unowned catalog fixture')
  await rm(root, { recursive: true, force: true })
}

test('a live first-send model menu reflects Provider changes without replacing the draft selection', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-first-send-catalog-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const configuration = createConfigurationCommandClient(host.client)
    const models = createModelCommandClient(host.client)
    const model = (await models.execute('model.list', {})).find((value) => value.id === 'local-fixture')
    if (!model) throw new Error('The fixture model is required')
    const copy = getShellCopy('zh-CN')
    const labels = preSessionCopy('zh-CN')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const landing = page.locator('.hbar-pre-session-landing')
    const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true })
    const draft = '保留这份首发草稿。\n更新服务商后继续选择模型。'
    await prompt.fill(draft)
    const trigger = landing.locator('.hbar-web-pre-session-model-controls .hbar-pre-session-choice-picker > button')
    await trigger.click()
    const picker = page.getByRole('dialog', { name: labels.model.title, exact: true })
    await picker.getByRole('group', { name: model.providerName, exact: true }).getByRole('button').click()
    const selectedName = labels.model.trigger(model.modelName)
    await expect(trigger).toHaveAccessibleName(selectedName)
    const thinking = landing.locator('.hbar-pre-session-thinking-picker > button')
    const thinkingName = await thinking.getAttribute('aria-label')
    if (!thinkingName) throw new Error('The selected thinking level must have a label')
    await trigger.click()
    await expect(picker).toBeVisible()
    const freshModelName = '新模型 · Fresh choice'
    const provider: ProviderInput = {
      id: 'catalog-update-fixture',
      name: '新服务商 · Updated catalog',
      protocol: 'mock' as const,
      baseUrl: 'http://127.0.0.1',
      model: 'fresh',
      models: [{ id: 'fresh', name: freshModelName }],
      thinkingLevels: ['low', 'medium', 'high'],
      defaultThinkingLevel: 'medium' as const,
    }
    // The real paired SDK changes the Host; no application store or DOM is injected.
    await configuration.execute('provider.save', { provider })
    const freshGroup = picker.getByRole('group', { name: provider.name, exact: true })
    await expect(freshGroup).toBeVisible()
    await page.screenshot({ path: info.outputPath('catalog-after-provider-change.png') })
    await expect(trigger).toHaveAccessibleName(selectedName)
    await expect(thinking).toHaveAccessibleName(thinkingName)
    await expect(prompt).toHaveValue(draft)
    await freshGroup.getByRole('button', { name: new RegExp(freshModelName) }).click()
    await expect(picker).toBeHidden()
    const fresh = (await models.execute('model.list', {})).find((value) => value.providerId === provider.id)
    if (!fresh) throw new Error('The updated model must exist in the Host catalog')
    await expect(trigger).toHaveAccessibleName(labels.model.trigger(fresh.modelName))
    await expect(prompt).toHaveValue(draft)
    await page.screenshot({ path: info.outputPath('catalog-fresh-selection.png') })
    // Going to Settings unmounts this landing; returning must retain its draft and reload the catalog.
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    await expect(landing).toHaveCount(0)
    await expect(page.locator('.hbar-app-react-provider-list')).toBeVisible()
    await configuration.execute('provider.save', {
      provider: { ...provider, models: [{ id: 'fresh', name: '模型已更新' }] },
    })
    await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
    await expect(landing).toBeVisible()
    await expect(prompt).toHaveValue(draft)
    await trigger.click()
    await expect(picker.getByRole('button', { name: /模型已更新/ })).toBeVisible()
    await page.screenshot({ path: info.outputPath('catalog-after-settings-return.png') })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupRoot(root)
  }
})
