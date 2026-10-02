import { expect, test } from '@playwright/test'
import {
  createModelCommandClient,
  createSettingsCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('the first-send composer exposes the actual Host default model and effort before sending', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-first-send-default-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 320, height: 900 } })
  const copy = getShellCopy('zh-CN')
  const labels = preSessionCopy('zh-CN')
  const location = preSessionLaunchCopy('zh-CN').location
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const models = createModelCommandClient(host.client)
    const settings = createSettingsCommandClient(host.client)
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const model = (await models.execute('model.list', {})).find((item) => item.id === 'local-fixture')!
    const thinking = model.thinkingLevels.find((level) => level !== model.defaultThinkingLevel)!
    expect(thinking).toBeDefined()
    const scope = { kind: 'global' as const }
    const before = await settings.execute('settings.get', { scope })
    await settings.execute(
      'settings.apply',
      {
        scope,
        schemaVersion: before.schemaVersion,
        baselineRevisions: before.revisions,
        changes: [
          { op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: model.id },
          { op: 'set', path: [{ kind: 'field', name: 'provider.thinkingLevel' }], value: thinking },
        ],
      },
      { idempotencyKey: 'first-send-default-fixture' },
    )
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const landing = page.locator('.hbar-pre-session-landing')
    const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
    const message = '不重新选择模型，直接使用输入区显示的默认配置发送。'
    await prompt.fill(message)
    await page.screenshot({ path: info.outputPath('default-before-first-send.png') })
    await expect(
      landing.getByRole('button', {
        name: labels.model.trigger(model.modelName),
        exact: true,
      }),
    ).toBeVisible()
    const effort = landing.locator('.hbar-pre-session-thinking-picker > button')
    await expect(effort).toHaveAccessibleName(
      copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel(thinking)),
    )
    await effort.click()
    const effortPicker = page.getByRole('dialog', { name: copy.session.modelPicker.thinking, exact: true })
    await expect(effortPicker.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      copy.session.modelPicker.thinkingLevel(thinking),
    )
    await page.keyboard.press('Escape')
    await expect(effort).toBeFocused()
    await landing.locator('.hbar-pre-session-location-picker > button').click()
    const locationRootBeforeDirectory = page.getByRole('dialog', { name: location.title, exact: true })
    if (await locationRootBeforeDirectory.isVisible())
      await locationRootBeforeDirectory.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
    const directoryPicker = page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
    await directoryPicker.getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
    await page
      .getByRole('dialog', { name: location.title, exact: true })
      .getByRole('button', { name: location.close, exact: true })
      .click()
    await expect(prompt).toHaveValue(message)
    const count = async () =>
      (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
    expect(await count()).toBe(1)
    await page.screenshot({ path: info.outputPath('default-ready-to-send.png') })
    await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
    await expect.poll(count).toBe(2)
    const created = (
      await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
    ).items.find((item) => item.id !== host!.ready.sessionId)!
    await expect
      .poll(async () => (await models.execute('session.getModel', { sessionId: created.id })).thinkingLevel)
      .toBe(thinking)
    await expect
      .poll(async () => {
        const snapshot = await host!.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
        return snapshot.runs.filter(
          (run) => run.input.source === 'user' && run.input.text === message && run.modelId === model.id,
        ).length
      })
      .toBe(1)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()))
    expect(basename(root).startsWith('hbar-first-send-default-')).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})
