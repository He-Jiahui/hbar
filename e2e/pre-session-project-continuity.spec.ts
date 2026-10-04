import { expect, test, type Page } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createModelCommandClient,
  createSettingsCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { encodePath } from '@hbar/schema-core'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-project-continuity-'
async function cleanupFixture(root: string): Promise<void> {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing to remove an unowned project-continuity fixture')
  await rm(exact, { recursive: true, force: true })
}

async function chooseProject(page: Page, name: string): Promise<void> {
  const location = preSessionLaunchCopy('zh-CN').location
  await page.locator('.hbar-pre-session-location-picker > button').click()
  const root = page.getByRole('dialog', { name: location.title, exact: true })
  if (await root.isVisible()) await root.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
  const picker = page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
  await picker.locator('.hbar-pre-session-location-list').getByRole('button').filter({ hasText: name }).click()
  await expect(root).toBeVisible()
  await root.getByRole('button', { name: location.close, exact: true }).click()
  await expect(root).toBeHidden()
}

test('first-send project switch preserves current model and effort, then tab Files opens the actual target', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), prefix))
  const sourceRoot = join(root, 'source-project')
  const targetRoot = join(root, '目标项目 · 不同默认模型')
  await mkdir(sourceRoot)
  await mkdir(targetRoot)
  const path = 'target-only.md'
  const fileText = '# This file belongs only to the selected target project.'
  await writeFile(join(targetRoot, path), fileText)
  const context = await browser.newContext({
    locale: 'zh-CN',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
  })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root: sourceRoot,
      home: join(root, 'data'),
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
    })
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const models = createModelCommandClient(host.client)
    const settings = createSettingsCommandClient(host.client)
    const target = await sessions.execute('workspace.create', { path: targetRoot })
    await createConfigurationCommandClient(host.client).execute('provider.save', {
      provider: {
        id: 'project-continuity-fixture',
        name: 'Temporary different project default',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'different-default',
        reasoning: true,
        models: [
          {
            id: 'different-default',
            name: 'Different project model',
            thinkingLevels: ['low', 'high'],
            defaultThinkingLevel: 'low',
          },
        ],
      },
    })
    const catalog = await models.execute('model.list', {})
    const current = catalog.find((model) => model.id === 'local-fixture')
    const destination = catalog.find((model) => model.providerId === 'project-continuity-fixture')
    if (!current || !destination || !current.thinkingLevels.includes('high'))
      throw new Error('Missing continuity fixture models')
    const setDefaults = async (
      scope: { readonly kind: 'global' } | { readonly kind: 'workspace'; readonly targetId: string },
      modelId: string,
      thinking: 'low' | 'high',
    ) => {
      const before = await settings.execute('settings.get', { scope })
      await settings.execute(
        'settings.apply',
        {
          scope,
          schemaVersion: before.schemaVersion,
          baselineRevisions: before.revisions,
          changes: [
            { op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: modelId },
            { op: 'set', path: [{ kind: 'field', name: 'provider.thinkingLevel' }], value: thinking },
          ],
        },
        { idempotencyKey: crypto.randomUUID() },
      )
    }
    await setDefaults({ kind: 'global' }, current.id, 'low')
    await setDefaults({ kind: 'workspace', targetId: host.ready.workspaceId }, current.id, 'low')
    const targetScope = { kind: 'workspace' as const, targetId: target.id }
    await setDefaults(targetScope, destination.id, 'low')
    const targetBefore = await settings.execute('settings.get', { scope: targetScope })
    expect(
      targetBefore.resolution.reports[encodePath([{ kind: 'field', name: 'provider.model' }])]?.effectiveValue,
    ).toBe(destination.id)
    expect(
      targetBefore.resolution.reports[encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])]?.effectiveValue,
    ).toBe('low')

    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const copy = getShellCopy('zh-CN')
    const labels = preSessionCopy('zh-CN')
    const landing = page.locator('.hbar-pre-session-landing')
    const input = landing.getByRole('textbox', { name: copy.preSession.prompt.input, exact: true })
    const message = '切换项目时保留模型、思考等级和这份草稿，然后在目标项目发送。'
    await input.fill(message)
    const model = landing.getByRole('button', { name: labels.model.trigger(current.modelName), exact: true })
    await expect(model).toBeVisible()
    await chooseProject(page, host.ready.workspaceName)
    const effort = landing.locator('.hbar-pre-session-thinking-picker > button')
    await effort.click()
    const thinking = page.getByRole('dialog', { name: copy.session.modelPicker.thinking, exact: true })
    await expect(thinking.getByRole('slider')).toBeFocused()
    await page.keyboard.press('Home')
    for (let index = 0; index < current.thinkingLevels.indexOf('high'); index++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    const highName = copy.session.modelPicker.thinkingTrigger(copy.session.modelPicker.thinkingLevel('high'))
    await expect(effort).toHaveAccessibleName(highName)
    await page.screenshot({ path: info.outputPath('source-current-selection-1440.png') })
    await page.setViewportSize({ width: 320, height: 900 })
    await chooseProject(page, target.name)
    await expect(model).toBeVisible()
    await expect(effort).toHaveAccessibleName(highName)
    await expect(input).toHaveValue(message)
    await expect(landing.locator('.hbar-pre-session-location-picker > button')).toContainText(target.name)
    expect(
      (await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })).items,
    ).toHaveLength(1)
    expect((await sessions.execute('session.list', { workspaceId: target.id, limit: 100 })).items).toHaveLength(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
    await page.screenshot({ path: info.outputPath('target-preserved-before-first-send-320.png') })
    await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
    await expect
      .poll(async () => (await sessions.execute('session.list', { workspaceId: target.id, limit: 100 })).items.length)
      .toBe(1)
    const created = (await sessions.execute('session.list', { workspaceId: target.id, limit: 100 })).items[0]!
    await expect
      .poll(async () => {
        const snapshot = await host!.client.call('session.snapshot', { sessionId: created.id })
        return snapshot.runs.filter(
          (run) => run.input.text === message && run.modelId === current.id && run.status === 'completed',
        ).length
      })
      .toBe(1)
    const configuration = await models.execute('session.getModel', { sessionId: created.id })
    expect(configuration).toMatchObject({
      modelId: current.id,
      thinkingLevel: 'high',
      sources: {
        model: `settings:session:${created.id}`,
        thinkingLevel: `settings:session:${created.id}`,
      },
    })
    const targetAfter = await settings.execute('settings.get', { scope: targetScope })
    expect(targetAfter.revisions).toEqual(targetBefore.revisions)
    expect(targetAfter.resolution).toEqual(targetBefore.resolution)
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
    await expect(landing).toHaveCount(0)
    await expect(page.locator('.hbar-composer-model-trigger')).toHaveText(current.modelName)
    await expect(page.locator('.hbar-composer-thinking-trigger')).toHaveAccessibleName(highName)

    // Follow the newly created tab's real Files action, not the sidebar workspace shortcut.
    await page.setViewportSize({ width: 1440, height: 900 })
    const toolbar = page
      .locator('.hbar-workspace-tabs-tools')
      .getByRole('button', { name: copy.session.tools.files, exact: true })
    await expect(toolbar).toBeVisible()
    await expect(page.getByRole('button', { name: copy.session.tools.files, exact: true })).toHaveCount(1)
    const next = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const nextDraft = '文件打开、关闭后，继续保留目标会话的草稿。'
    await next.fill(nextDraft)
    await toolbar.focus()
    await page.keyboard.press('Enter')
    await expect(toolbar).toHaveAttribute('aria-pressed', 'true')
    const files = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
    await expect(files).toBeVisible()
    const navigator = files.getByRole('region', { name: copy.files.navigator, exact: true })
    await navigator.getByRole('combobox', { name: copy.files.changes.mode, exact: true }).selectOption('all')
    await navigator.getByRole('textbox', { name: copy.files.tree.filter, exact: true }).fill(path)
    const results = navigator.getByRole('list', { name: copy.files.tree.searchResults, exact: true })
    await results.getByRole('button').filter({ hasText: path }).click()
    const preview = files.getByLabel(copy.files.textPreview(path), { exact: true })
    await expect(preview.getByRole('heading', { level: 1, name: fileText.slice(2), exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('target-tab-markdown-reading-1440.png') })
    // Markdown defaults to semantic reading; inspect Source to prove the same
    // target document still retains the exact original text, including '#'.
    await files.getByRole('button', { name: copy.files.source, exact: true }).click()
    const source = files.getByLabel(copy.files.textPreview(path), { exact: true }).locator('[data-source-code]')
    await expect(source).toHaveCount(1)
    expect(await source.textContent()).toBe(fileText)
    await expectComposerText(next, nextDraft)
    await page.screenshot({ path: info.outputPath('target-tab-files-1440.png') })
    await files.getByRole('button', { name: copy.files.close, exact: true }).click()
    await expect(files).toHaveCount(0)
    await expect(toolbar).toHaveAttribute('aria-pressed', 'false')
    await expectComposerText(next, nextDraft)
    expect(errors).toEqual([])
  } finally {
    try {
      await context.close()
    } finally {
      try {
        if (host) await stopWebSessionHost(host)
      } finally {
        await cleanupFixture(root)
      }
    }
  }
})
