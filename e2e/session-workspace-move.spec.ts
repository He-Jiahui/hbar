import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createModelCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { sessionWorkspaceMoveCopy } from '../apps/web/src/session-workspace-move-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const baseUrl = () => 'http://127.0.0.1:' + (process.env.HBAR_E2E_PORT ?? '4329')

async function connectPage(browser: Browser, host: WebSessionHost, locale: 'en-US' | 'zh-CN') {
  const context = await browser.newContext({
    locale,
    viewport: locale === 'en-US' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  })
  try {
    const response = await context.request.post(baseUrl() + '/auth/token', { data: { token: host.ready.token } })
    expect(response.ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(baseUrl())
    return { context, page, errors }
  } catch (error) {
    await context.close()
    throw error
  }
}

async function openLocationTarget(
  page: Page,
  targetName: string,
  locationLabels: ReturnType<typeof preSessionLaunchCopy>['location'],
  capture: (name: string) => Promise<void>,
) {
  const trigger = page.locator('.hbar-session-launch-location .hbar-pre-session-location-picker > button:visible')
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const rootDialog = page.getByRole('dialog', { name: locationLabels.title, exact: true })
  await expect(rootDialog).toBeVisible()
  await capture('location-root')
  await rootDialog.locator('.hbar-pre-session-location-body .hbar-pre-session-location-row').first().click()
  const directoryDialog = page.getByRole('dialog', { name: locationLabels.chooseDirectory, exact: true })
  await expect(directoryDialog).toBeVisible()
  const projectList = directoryDialog.locator('.hbar-pre-session-location-list')
  const target = projectList.getByRole('button').filter({ hasText: targetName })
  await expect(target).toBeVisible()
  await capture('project-list')
  await target.click()
}

async function removeTempFixture(path: string, prefix: string) {
  const resolved = resolve(path)
  if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith(prefix))
    throw new Error('Refusing to remove a session move fixture outside its named temp directory')
  await rm(resolved, { recursive: true, force: true })
}

async function showSidebar(page: Page, locale: 'en-US' | 'zh-CN') {
  const copy = getShellCopy(locale)
  const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, exact: true })
  if (!(await sidebar.isVisible()))
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
  await expect(sidebar).toBeVisible()
}

async function openHostSession(page: Page, host: WebSessionHost, locale: 'en-US' | 'zh-CN') {
  const copy = getShellCopy(locale)
  await showSidebar(page, locale)
  const session = page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true })
  if (!(await session.isVisible()))
    await page.getByRole('button', { name: copy.shell.expandWorkspace(host.ready.workspaceName), exact: true }).click()
  await expect(session).toBeVisible()
  await session.click()
}

test('desktop Location moves the complete empty-session draft into a replacement Host Session', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-move-source-'))
  const targetContainer = await mkdtemp(join(tmpdir(), 'hbar-session-move-target-container-'))
  const targetRoot = join(targetContainer, 'Target Project')
  await mkdir(targetRoot)
  await writeFile(join(root, 'move-reference.md'), 'Source project reference\n')
  await writeFile(join(targetRoot, 'move-reference.md'), 'Matching target project reference\n')
  let context: BrowserContext | undefined
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const targetWorkspace = await sessions.execute('workspace.create', { path: targetRoot })
    await createConfigurationCommandClient(host.client).execute('provider.save', {
      provider: {
        id: 'session-move-fixture',
        name: 'Session move fixture',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'move-model',
        reasoning: true,
        models: [
          {
            id: 'move-model',
            name: 'Session move model',
            description: 'A stable model for workspace move coverage',
            thinkingLevels: ['low', 'medium', 'high'],
            defaultThinkingLevel: 'low',
          },
        ],
      },
    })
    const connected = await connectPage(browser, host, 'en-US')
    context = connected.context
    const { page, errors } = connected
    const copy = getShellCopy('en-US')
    const locationCopy = preSessionLaunchCopy('en-US').location
    const moveCopy = sessionWorkspaceMoveCopy('en-US')
    const models = createModelCommandClient(host.client)
    await openHostSession(page, host, 'en-US')
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })

    const modelTrigger = page.locator('.hbar-composer-model-trigger')
    await modelTrigger.click()
    const modelPicker = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
    const modelOption = modelPicker.getByRole('option').filter({ hasText: 'Session move model' })
    await expect(modelOption).toBeVisible()
    await modelOption.click()
    await expect(modelTrigger).toContainText('Session move model')
    const thinking = page.locator('.hbar-composer-thinking-trigger')
    await thinking.click()
    const thinkingDialog = page.getByRole('dialog', { name: copy.session.modelPicker.thinking, exact: true })
    const thinkingSlider = thinkingDialog.getByRole('slider', { name: copy.session.modelPicker.thinking })
    await thinkingSlider.focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(thinking).toHaveText(copy.session.modelPicker.thinkingLevel('high'))
    const sourceModel = await models.execute('session.getModel', { sessionId: host.ready.sessionId })
    expect(sourceModel.model?.modelName).toBe('Session move model')
    expect(sourceModel.thinkingLevel).toBe('high')

    const permission = page.locator('.hbar-composer-permission-picker')
    const permissionLabels = copy.session.permissionPicker
    await permission
      .getByRole('button', {
        name: permissionLabels.trigger(permissionLabels.inheritedTrigger(permissionLabels.options.ask.label)),
      })
      .click()
    await permission.getByRole('menuitemradio', { name: permissionLabels.plan.label, exact: false }).click()
    expect(await host.client.call('mode.get', { sessionId: host.ready.sessionId })).toEqual({ mode: 'plan' })

    const uploadedArtifactResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/artifacts') && response.ok(),
      { timeout: 10_000 },
    )
    await page.locator('.hbar-composer-attachment-target input[type="file"]').setInputFiles({
      name: 'move-attachment.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This accepted attachment must follow the draft.'),
    })
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'move-attachment.txt' })).toBeVisible()
    await expect(page.locator('.hbar-composer-attachment-transfer')).toHaveCount(0)
    const uploaded: unknown = await uploadedArtifactResponse.then((response) => response.json())
    if (!uploaded || typeof uploaded !== 'object' || !('id' in uploaded) || typeof uploaded.id !== 'string')
      throw new Error('Host did not confirm the uploaded attachment artifact')
    const uploadedArtifactId = uploaded.id
    await prompt.fill('Review @move-reference')
    const mentions = page.getByRole('listbox', { name: copy.session.mentions.menu })
    await expect(mentions.getByRole('option').filter({ hasText: 'move-reference.md' })).toBeVisible()
    await prompt.press('Enter')
    await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@move-reference.md')
    await expectComposerText(prompt, 'Review @move-reference.md')

    await openLocationTarget(page, targetWorkspace.name, locationCopy, async (name) => {
      await page.screenshot({ path: testInfo.outputPath(name + '-1440.png') })
    })
    await expect(page.locator('.hbar-session-workspace-move-status:visible').first()).toContainText(
      moveCopy.succeeded(targetWorkspace.name),
    )
    const source = await sessions.execute('session.get', { sessionId: host.ready.sessionId })
    expect(source?.archived).toBe(true)
    const targetPage = await sessions.execute('session.list', { workspaceId: targetWorkspace.id, limit: 100 })
    expect(targetPage.items).toHaveLength(1)
    const targetSession = targetPage.items[0]!
    expect(targetSession.archived).toBe(false)
    await expect(page.locator('.hbar-workspace-tabs [role="tab"]')).toHaveCount(1)
    await expect(page.locator('.hbar-workspace-tabs [role="tab"][aria-selected="true"]')).toBeVisible()

    const targetPrompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await expectComposerText(targetPrompt, 'Review @move-reference.md')
    await expect(page.locator('.hbar-composer-mention-pill')).toHaveText('@move-reference.md')
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'move-attachment.txt' })).toBeVisible()
    const targetModel = await models.execute('session.getModel', { sessionId: targetSession.id })
    expect(targetModel.modelId).toBe(sourceModel.modelId)
    expect(targetModel.thinkingLevel).toBe('high')
    expect(await host.client.call('mode.get', { sessionId: targetSession.id })).toEqual({ mode: 'plan' })
    await expect(page.locator('.hbar-session-workspace-move-status:visible').first()).toContainText(
      moveCopy.succeeded(targetWorkspace.name),
    )
    await page.screenshot({ path: testInfo.outputPath('move-success-1440.png') })
    await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    await expect
      .poll(
        async () =>
          (await host!.client.call('session.snapshot', { sessionId: targetSession.id, limit: 20 })).runs.filter(
            (run) => run.input.source === 'user',
          ).length,
      )
      .toBe(1)
    const targetSnapshot = await host.client.call('session.snapshot', { sessionId: targetSession.id, limit: 20 })
    const targetRun = targetSnapshot.runs.find((run) => run.input.source === 'user')
    expect(targetSession.workspaceId).toBe(targetWorkspace.id)
    expect(targetRun?.input).toMatchObject({ text: 'Review @"move-reference.md"', mode: 'plan' })
    expect(targetRun?.input.files?.map((artifact) => artifact.id)).toContain(uploadedArtifactId)
    expect(targetRun?.input.files?.map((artifact) => artifact.name)).toContain('move-attachment.txt')
    const sourceSnapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 20 })
    expect(sourceSnapshot.runs.filter((run) => run.input.source === 'user')).toHaveLength(0)
    await expect(page.locator('.hbar-session-project-context:visible').first()).toBeVisible()
    await expect(page.locator('.hbar-session-project-context-branch')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('send-result-1440.png') })
    expect(errors).toEqual([])
  } finally {
    await context?.close()
    if (host) await stopWebSessionHost(host)
    await removeTempFixture(root, 'hbar-session-move-source-')
    await removeTempFixture(targetContainer, 'hbar-session-move-target-container-')
  }
})

test('narrow Chinese Location moves the draft without overflowing or retaining the source tab', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-move-narrow-source-'))
  const targetContainer = await mkdtemp(join(tmpdir(), 'hbar-session-move-narrow-target-container-'))
  const targetRoot = join(targetContainer, '窄屏目标项目')
  await mkdir(targetRoot)
  let context: BrowserContext | undefined
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const targetWorkspace = await sessions.execute('workspace.create', { path: targetRoot })
    const connected = await connectPage(browser, host, 'zh-CN')
    context = connected.context
    const { page, errors } = connected
    const copy = getShellCopy('zh-CN')
    const locationCopy = preSessionLaunchCopy('zh-CN').location
    const moveCopy = sessionWorkspaceMoveCopy('zh-CN')
    await openHostSession(page, host, 'zh-CN')
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const plus = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
    const addMenu = page.getByRole('group', { name: copy.session.addMenu.menu })
    await plus.click()
    await addMenu.getByRole('button', { name: copy.session.intent.goalMenu, exact: true }).click()
    await expect(prompt).toHaveAttribute('placeholder', copy.session.intent.goalPlaceholder)
    const goalControl = page
      .locator('.hbar-composer-intents')
      .getByRole('button', { name: copy.session.intent.cancelGoal, exact: true })
    await expect(goalControl).toHaveAttribute('aria-pressed', 'true')
    await prompt.fill('保留这份窄屏草稿')

    const trigger = page.locator('.hbar-session-launch-location .hbar-pre-session-location-picker > button:visible')
    await expect(trigger).toBeEnabled()
    await trigger.click()
    const rootDialog = page.getByRole('dialog', { name: locationCopy.title, exact: true })
    await expect(rootDialog).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('location-root-390.png') })
    const bounds = await rootDialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeLessThanOrEqual(390)
    expect(bounds!.x).toBeGreaterThanOrEqual(-1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await rootDialog.locator('.hbar-pre-session-location-body .hbar-pre-session-location-row').first().click()
    const directoryDialog = page.getByRole('dialog', { name: locationCopy.chooseDirectory, exact: true })
    await expect(directoryDialog).toBeVisible()
    const projectList = directoryDialog.locator('.hbar-pre-session-location-list')
    const target = projectList.getByRole('button').filter({ hasText: targetWorkspace.name })
    await expect(target).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('project-list-390.png') })
    await target.click()

    await expect(page.locator('.hbar-session-workspace-move-status:visible').first()).toContainText(
      moveCopy.succeeded(targetWorkspace.name),
    )
    await expectComposerText(prompt, '保留这份窄屏草稿')
    await expect(
      page.locator('.hbar-composer-intents').getByRole('button', { name: copy.session.intent.cancelGoal, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: testInfo.outputPath('move-success-390.png') })
    const source = await sessions.execute('session.get', { sessionId: host.ready.sessionId })
    expect(source?.archived).toBe(true)
    const targetPage = await sessions.execute('session.list', { workspaceId: targetWorkspace.id, limit: 100 })
    expect(targetPage.items).toHaveLength(1)
    await expect(page.locator('.hbar-workspace-tabs [role="tab"]')).toHaveCount(1)
    await expect(page.locator('.hbar-workspace-tabs [role="tab"][aria-selected="true"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await context?.close()
    if (host) await stopWebSessionHost(host)
    await removeTempFixture(root, 'hbar-session-move-narrow-source-')
    await removeTempFixture(targetContainer, 'hbar-session-move-narrow-target-container-')
  }
})
