import { expect, test } from '@playwright/test'
import { createModelCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-pre-session-model-picker-'

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error('Unowned model picker test directory')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`pre-session model picker groups, searches, and confirms locally (${locale})`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({
      locale,
      viewport: { width: locale === 'en-US' ? 1440 : 390, height: 900 },
    })
    const copy = getShellCopy(locale)
    const labels = preSessionCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const models = createModelCommandClient(host.client)
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const model = (await models.execute('model.list', {})).find((item) => item.id === 'local-fixture')
      if (!model) throw new Error('Local fixture model is unavailable')
      const countSessions = async () =>
        (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length

      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const landing = page.locator('.hbar-pre-session-landing')
      const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
      const draftText = `Review the first message in ${locale}`
      await prompt.fill(draftText)
      const trigger = landing.locator('.hbar-web-pre-session-model-controls .hbar-pre-session-choice-picker > button')
      await trigger.click()

      const picker = page.getByRole('dialog', { name: labels.model.title, exact: true })
      const provider = picker.getByRole('group', { name: model.providerName, exact: true })
      await expect(provider).toBeVisible()
      const choice = provider.getByRole('button').filter({ hasText: model.modelName })
      await expect(choice).toBeVisible()
      const screenshotRoot = resolve('artifacts/pre-session-model-picker', locale)
      await mkdir(screenshotRoot, { recursive: true })
      await page.screenshot({ path: join(screenshotRoot, 'provider-group.png') })
      await choice.click()

      await expect(picker).toBeHidden()
      await expect(trigger).toHaveAccessibleName(
        labels.model.trigger(labels.modelName(model.providerName, model.modelName)),
      )
      await expect(prompt).toHaveValue(draftText)
      expect(await countSessions()).toBe(1)

      await trigger.click()
      const reopened = page.getByRole('dialog', { name: labels.model.title, exact: true })
      const selectedProvider = reopened.getByRole('group', { name: model.providerName, exact: true })
      const selected = selectedProvider.getByRole('button').filter({ hasText: model.modelName })
      await expect(selected).toHaveAttribute('aria-current', 'true')
      await expect(selected.locator('svg')).toBeVisible()

      await reopened.getByRole('searchbox', { name: labels.model.search, exact: true }).fill(model.modelId)
      const searchedProvider = reopened.getByRole('group', { name: model.providerName, exact: true })
      const searched = searchedProvider.getByRole('button').filter({ hasText: model.modelName })
      await expect(searched).toHaveAttribute('aria-current', 'true')
      await expect(searched.locator('svg')).toBeVisible()
      await page.screenshot({ path: join(screenshotRoot, 'selected-model-id-search.png') })

      await page.keyboard.press('Escape')
      await expect(reopened).toBeHidden()
      await expect(trigger).toBeFocused()
      await expect(prompt).toHaveValue(draftText)
      expect(await countSessions()).toBe(1)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
