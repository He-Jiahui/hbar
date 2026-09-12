import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { HbarClient } from '../packages/client/src/index'

const runFile = promisify(execFile)

async function git(cwd: string, ...args: string[]) {
  await runFile('git', args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    windowsHide: true,
  })
}

async function login(context: BrowserContext, page: Page) {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string; root: string }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  const response = await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  expect(response.ok()).toBeTruthy()
  await page.goto(fixture.url)
  await expect(page.locator('.app-shell')).toBeVisible()
  await mkdir('artifacts', { recursive: true })
  return { ...fixture, api }
}

test('Git composer context moves a session to an external worktree and keeps card context', async ({ page, context }) => {
  const fixture = await login(context, page)
  const suffix = Date.now().toString(36)
  const repo = join(fixture.root, `git-context-${suffix}`)
  const external = join(fixture.root, `git-context-worktree-${suffix}`)
  const sessionTitle = `Git context ${suffix}`
  try {
    await mkdir(repo, { recursive: true })
    await git(repo, 'init', '-q')
    await git(repo, 'config', 'user.name', 'hbar e2e')
    await git(repo, 'config', 'user.email', 'hbar@example.invalid')
    await writeFile(join(repo, 'README.md'), 'context\n')
    await git(repo, 'add', 'README.md')
    await git(repo, 'commit', '-q', '-m', 'initial')
    const baseBranch = (await runFile('git', ['branch', '--show-current'], { cwd: repo, windowsHide: true })).stdout.trim()
    await git(repo, 'branch', 'feature/context')
    await git(repo, 'worktree', 'add', external, 'feature/context')

    const workspace = await fixture.api.call('workspace.create', { path: repo })
    const session = await fixture.api.call('session.create', { workspaceId: workspace.id, title: sessionTitle })
    await page.getByRole('combobox', { name: '选择工作区', exact: true }).selectOption(workspace.id)
    await page.locator('.session-select').filter({ hasText: sessionTitle, visible: true }).click()

    const trigger = page.locator('.git-context-trigger').filter({ visible: true })
    await expect(trigger).toContainText(baseBranch)
    await trigger.click()
    const menu = page.getByRole('menu', { name: '切换分支 / Worktree', exact: true })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'feature/context', exact: true })).toBeVisible()

    const worktreeSection = menu.locator('section').filter({ hasText: '切换 Worktree' })
    await worktreeSection.getByRole('menuitem', { name: /feature\/context C:/ }).click()
    await expect
      .poll(async () => {
        const bootstrap = await fixture.api.call('system.bootstrap', {})
        return bootstrap.workspaces.some((item) => item.path.replaceAll('\\', '/').toLowerCase() === external.replaceAll('\\', '/').toLowerCase())
      })
      .toBe(true)
    const targetWorkspace = (await fixture.api.call('system.bootstrap', {})).workspaces.find(
      (item) => item.path.replaceAll('\\', '/').toLowerCase() === external.replaceAll('\\', '/').toLowerCase(),
    )!
    await expect
      .poll(async () => (await fixture.api.call('system.bootstrap', {})).sessions.find((item) => item.id === session.id)?.workspaceId)
      .toBe(targetWorkspace.id)
    await expect(page.getByRole('combobox', { name: '选择工作区', exact: true })).toHaveValue(targetWorkspace.id)
    await expect(trigger).toContainText('feature/context')

    const normalCard = page.locator('.session-item').filter({ hasText: sessionTitle, visible: true }).first()
    await expect(normalCard).toContainText('feature/context')
    await normalCard.getByRole('button', { name: `置顶 ${sessionTitle}`, exact: true }).click()
    const pinnedCard = page.locator('.session-item-pinned').filter({ hasText: sessionTitle, visible: true })
    await expect(pinnedCard).toContainText('feature/context')
    await expect(pinnedCard.getByLabel('无状态')).toBeVisible()

    await page.getByRole('button', { name: '新建工作区', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '添加工作区', exact: true })).toBeVisible()
    await expect(page.getByText('请选择一个或多个文件夹。', { exact: true })).toBeVisible()
  } finally {
    fixture.api.disconnect()
  }
})

test('Git composer context disables dirty branch switches and creates a selected external worktree', async ({ page, context }) => {
  const fixture = await login(context, page)
  const suffix = Date.now().toString(36)
  const repo = join(fixture.root, `git-dirty-${suffix}`)
  const external = join(fixture.root, `git-created-worktree-${suffix}`)
  try {
    await mkdir(repo, { recursive: true })
    await git(repo, 'init', '-q')
    await git(repo, 'config', 'user.name', 'hbar e2e')
    await git(repo, 'config', 'user.email', 'hbar@example.invalid')
    await writeFile(join(repo, 'README.md'), 'dirty context\n')
    await git(repo, 'add', 'README.md')
    await git(repo, 'commit', '-q', '-m', 'initial')
    await git(repo, 'branch', 'feature/create')
    await writeFile(join(repo, 'untracked.txt'), 'untracked\n')
    const workspace = await fixture.api.call('workspace.create', { path: repo })
    const session = await fixture.api.call('session.create', { workspaceId: workspace.id, title: `Dirty Git ${suffix}` })
    await page.getByRole('combobox', { name: '选择工作区', exact: true }).selectOption(workspace.id)
    await page.locator('.session-select').filter({ hasText: session.title, visible: true }).click()
    const trigger = page.locator('.git-context-trigger').filter({ visible: true })
    await trigger.click()
    const menu = page.getByRole('menu', { name: '切换分支 / Worktree', exact: true })
    const branch = menu.getByRole('menuitem', { name: 'feature/create', exact: true })
    await branch.click()
    const decision = menu.getByRole('region', { name: '切换到分支 feature/create' })
    await expect(page.getByRole('button', { name: '在当前目录切换', exact: true })).toBeDisabled()
    await expect(menu).toContainText('当前目录有未提交改动')
    await page.getByRole('button', { name: '新建 Worktree 并切换', exact: true }).click()
    const pathInput = menu.getByRole('textbox', { name: '创建 Worktree feature/create', exact: true })
    await pathInput.fill(external)
    await menu.getByRole('button', { name: '创建并切换', exact: true }).click()
    await expect
      .poll(async () => {
        const bootstrap = await fixture.api.call('system.bootstrap', {})
        return bootstrap.workspaces.some((item) => item.path.replaceAll('\\', '/').toLowerCase() === external.replaceAll('\\', '/').toLowerCase())
      })
      .toBe(true)
    const target = (await fixture.api.call('system.bootstrap', {})).workspaces.find(
      (item) => item.path.replaceAll('\\', '/').toLowerCase() === external.replaceAll('\\', '/').toLowerCase(),
    )!
    await expect
      .poll(async () => (await fixture.api.call('system.bootstrap', {})).sessions.find((item) => item.id === session.id)?.workspaceId)
      .toBe(target.id)
    await expect(page.getByRole('combobox', { name: '选择工作区', exact: true })).toHaveValue(target.id)
    await expect(trigger).toContainText('feature/create')
  } finally {
    fixture.api.disconnect()
  }
})
