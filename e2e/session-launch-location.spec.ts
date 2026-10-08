import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { basename, dirname, join, resolve } from 'node:path'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  createGoalPlanCommandClient,
  createModelCommandClient,
  createSessionLaunchTargetReader,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-session-launch-location-'
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error('Unowned Session Location test directory')
  await rm(target, { recursive: true, force: true })
}

function git(repository: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8', windowsHide: true }).trim()
}

async function showSidebar(page: Page, locale: ShellLocale): Promise<void> {
  const copy = getShellCopy(locale)
  const shell = page.locator('[data-hbar-sidebar-expanded]')
  const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, exact: true })
  await expect(shell).toBeAttached()
  if ((await shell.getAttribute('data-hbar-sidebar-expanded')) !== 'true')
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
  await expect(shell).toHaveAttribute('data-hbar-sidebar-expanded', 'true')
  await expect(sidebar).toBeInViewport()
}

async function createSessionFromSidebar(page: Page, host: WebSessionHost, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const sessions = createWorkspaceSessionCommandClient(host.client)
  const count = async () =>
    (await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })).items.length
  const before = await count()
  await showSidebar(page, locale)
  await page.getByRole('button', { name: copy.shell.newSession, exact: true }).click()
  const picker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
  await picker
    .getByRole('button', {
      name: copy.shell.createSessionInWorkspace(host.ready.workspaceName),
      exact: true,
    })
    .click()
  await expect.poll(count).toBe(before + 1)
  const items = (await sessions.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })).items
  const created = items.find((item) => item.id !== host.ready.sessionId)
  if (!created) throw new Error('The explicit New Session action did not create a Session')
  return { created, count }
}

async function preparePage(
  context: import('@playwright/test').BrowserContext,
  host: WebSessionHost,
  pageLocale: 'en-US' | 'zh-CN',
) {
  expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(base())
  const copy = getShellCopy(pageLocale)
  if (await page.evaluate(() => window.matchMedia('(max-width: 63.9375rem)').matches))
    await expect(page.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeVisible()
  await showSidebar(page, pageLocale)
  await expect(page.getByRole('button', { name: copy.shell.newSession, exact: true })).toBeVisible()
  return { page, errors }
}

async function openLocation(page: import('@playwright/test').Page, workspaceName: string, locale: 'en-US' | 'zh-CN') {
  const labels = preSessionLaunchCopy(locale).location
  const trigger = page.locator('.hbar-session-launch-location .hbar-pre-session-location-picker > button:visible')
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: labels.title, exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(workspaceName)
  await expect(dialog.getByRole('button', { name: new RegExp(`^${labels.branch}`) })).toBeEnabled()
  await expect(dialog.getByRole('radio', { name: new RegExp(labels.isolated) })).toBeEnabled()
  return { labels, trigger, dialog }
}

async function selectModel(page: import('@playwright/test').Page, host: WebSessionHost, locale: 'en-US' | 'zh-CN') {
  const models = createModelCommandClient(host.client)
  const model = (await models.execute('model.list', {})).find((item) => item.id === 'local-fixture')
  if (!model) throw new Error('The local E2E model is unavailable')
  await page.locator('.hbar-composer-model-trigger:visible').click()
  const menu = page.getByRole('dialog', { name: getShellCopy(locale).session.modelPicker.title, exact: true })
  await expect(menu).toBeVisible()
  await menu.getByRole('option', { name: new RegExp(model.modelName) }).click()
  await expect(menu).toBeHidden()
  const copy = getShellCopy(locale)
  await expect(
    page.getByRole('button', { name: copy.session.modelPicker.trigger(model.modelName), exact: true }),
  ).toBeVisible()
}

async function chooseBranch(
  page: import('@playwright/test').Page,
  host: WebSessionHost,
  branchName: string,
  locale: 'en-US' | 'zh-CN',
  isolated: boolean,
  screenshotRoot: string,
) {
  const { labels, trigger, dialog } = await openLocation(page, host.ready.workspaceName, locale)
  const isolatedRadio = dialog.getByRole('radio', { name: new RegExp(labels.isolated) })
  if (isolated) {
    await isolatedRadio.click()
    await expect(dialog).toBeHidden()
    await trigger.click()
  } else {
    await expect(dialog.getByRole('radio', { name: new RegExp(labels.shared) })).toHaveAttribute('aria-checked', 'true')
  }
  const root = page.getByRole('dialog', { name: labels.title, exact: true })
  await expect(root.getByRole('button', { name: new RegExp(`^${labels.branch}`) })).toBeEnabled()
  if (isolated)
    await expect(root.getByRole('radio', { name: new RegExp(labels.isolated) })).toHaveAttribute('aria-checked', 'true')
  await root.getByRole('button', { name: new RegExp(`^${labels.branch}`) }).click()
  const branches = page.getByRole('dialog', { name: labels.chooseBranch, exact: true })
  await branches.getByRole('searchbox', { name: labels.searchBranches, exact: true }).fill(branchName)
  const choice = branches.getByRole('button', { name: new RegExp(branchName) })
  await expect(choice).toBeEnabled()
  await page.screenshot({ path: join(screenshotRoot, 'branch-selection.png') })
  await choice.click()
  await expect(root).toBeVisible()
  if (isolated)
    await expect(root.getByRole('radio', { name: new RegExp(labels.isolated) })).toHaveAttribute('aria-checked', 'true')
  else
    await expect(root.getByRole('radio', { name: new RegExp(labels.shared) })).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: join(screenshotRoot, 'picker-root.png') })
  await expect(trigger).toHaveAccessibleName(labels.trigger(host.ready.workspaceName, branchName, isolated))
  await root.getByRole('button', { name: labels.close, exact: true }).click()
  await expect(root).toBeHidden()
}

test('existing empty Session selects a shared branch locally and applies it on ordinary Send', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), prefix))
  const hostData = await mkdtemp(join(tmpdir(), `${prefix}host-data-`))
  const branchName = 'feature/session-launch-shared'
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      budgetAutoContinue: false,
      goalAutoContinue: false,
      root,
      home: hostData,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 48979),
    })
    const fixture = host
    const targets = createSessionLaunchTargetReader(host.client)
    const originalBranch = git(root, 'branch', '--show-current')
    const originalHead = git(root, 'rev-parse', 'HEAD')
    git(root, 'branch', branchName)
    const { page, errors } = await preparePage(context, host, 'en-US')
    const { created, count } = await createSessionFromSidebar(page, host, 'en-US')
    const screenshotRoot = resolve('artifacts/session-launch-location/en-US')
    await mkdir(screenshotRoot, { recursive: true })
    await selectModel(page, host, 'en-US')
    const copy = getShellCopy('en-US')
    const text = 'Keep this pre-existing Session and start on the selected branch.'
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await prompt.fill(text)
    await chooseBranch(page, host, branchName, 'en-US', false, screenshotRoot)
    await expectComposerText(prompt, text)
    expect(await count()).toBe(2)
    expect(git(root, 'branch', '--show-current')).toBe(originalBranch)
    expect(git(root, 'rev-parse', 'HEAD')).toBe(originalHead)
    expect((await targets.read(created.id)).selection).toEqual({ mode: 'shared-current' })

    await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    await expect
      .poll(async () => {
        const snapshot = await fixture.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
        return snapshot.runs.some((run) => run.input.source === 'user' && run.input.text === text)
      })
      .toBe(true)
    await expect.poll(count).toBe(2)
    await expect.poll(() => Promise.resolve(git(root, 'branch', '--show-current'))).toBe(branchName)
    const target = await targets.read(created.id)
    expect(target.locked).toBe(true)
    expect(target.selection).toMatchObject({ mode: 'shared-branch', branch: { ref: `refs/heads/${branchName}` } })
    expect(target.resolution.status).toBe('ready')
    await expect(page.locator('.hbar-session-launch-location')).toHaveCount(0)
    const project = page.getByRole('group', {
      name: sessionContextCopy('en-US').project(host.ready.workspaceName),
      exact: true,
    })
    await expect(project).toBeVisible()
    await expect(project.locator('.hbar-session-project-context-branch')).toBeVisible()
    if (target.resolution.status === 'ready' && target.resolution.branch) {
      await expect(project.locator('.hbar-session-project-context-branch bdi')).toHaveText(
        sessionContextCopy('en-US').branchCaption(target.resolution.branch),
      )
      await expect(project.locator('.hbar-session-project-context-branch')).toHaveAttribute(
        'title',
        sessionContextCopy('en-US').branch(target.resolution.branch),
      )
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: join(screenshotRoot, 'send-result.png') })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedFixture(root)
    await removeOwnedFixture(hostData)
  }
})

test('existing empty Session prepares an isolated selected base before its Goal Run without creating another Session', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), prefix))
  const hostData = await mkdtemp(join(tmpdir(), `${prefix}host-data-`))
  const branchName = 'feature/session-launch-isolated'
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      budgetAutoContinue: false,
      root,
      home: hostData,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 48979),
      goalAutoContinue: false,
    })
    const fixture = host
    const targets = createSessionLaunchTargetReader(host.client)
    const goals = createGoalPlanCommandClient(host.client)
    const originalBranch = git(root, 'branch', '--show-current')
    const originalHead = git(root, 'rev-parse', 'HEAD')
    git(root, 'branch', branchName)
    const { page, errors } = await preparePage(context, host, 'zh-CN')
    const { created, count } = await createSessionFromSidebar(page, host, 'zh-CN')
    const screenshotRoot = resolve('artifacts/session-launch-location/zh-CN')
    await mkdir(screenshotRoot, { recursive: true })
    await chooseBranch(page, host, branchName, 'zh-CN', true, screenshotRoot)
    expect(await count()).toBe(2)
    expect(git(root, 'branch', '--show-current')).toBe(originalBranch)
    expect(git(root, 'rev-parse', 'HEAD')).toBe(originalHead)
    expect((await targets.read(created.id)).selection).toEqual({ mode: 'shared-current' })

    await selectModel(page, host, 'zh-CN')
    const copy = getShellCopy('zh-CN')
    const objective = 'Use the selected isolated base on the first Goal Run.'
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await prompt.fill(`/goal ${objective}`)
    await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    await expect
      .poll(async () => {
        const snapshot = await fixture.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
        return snapshot.runs.some((run) => run.input.source === 'user' && run.input.text === objective)
      })
      .toBe(true)
    await expect.poll(count).toBe(2)
    await expect
      .poll(async () => (await goals.execute('goal.get', { sessionId: created.id })).goal?.objective)
      .toBe(objective)
    const target = await targets.read(created.id)
    expect(target.locked).toBe(true)
    expect(target.selection).toEqual({
      mode: 'isolated-worktree',
      branch: { kind: 'derived', baseRef: `refs/heads/${branchName}` },
    })
    expect(target.resolution.status).toBe('ready')
    if (target.resolution.status === 'ready') expect(target.resolution.branch).not.toBe(branchName)
    expect(git(root, 'branch', '--show-current')).toBe(originalBranch)
    expect(git(root, 'rev-parse', 'HEAD')).toBe(originalHead)
    await expect(page.locator('.hbar-session-launch-location')).toHaveCount(0)
    const project = page.getByRole('group', {
      name: sessionContextCopy('zh-CN').project(host.ready.workspaceName),
      exact: true,
    })
    await expect(project).toBeVisible()
    await expect(project.locator('.hbar-session-project-context-branch')).toBeVisible()
    if (target.resolution.status === 'ready' && target.resolution.branch) {
      await expect(project.locator('.hbar-session-project-context-branch bdi')).toHaveText(
        sessionContextCopy('zh-CN').branchCaption(target.resolution.branch),
      )
      await expect(project.locator('.hbar-session-project-context-branch')).toHaveAttribute(
        'title',
        sessionContextCopy('zh-CN').branch(target.resolution.branch),
      )
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: join(screenshotRoot, 'send-result.png') })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedFixture(root)
    await removeOwnedFixture(hostData)
  }
})
