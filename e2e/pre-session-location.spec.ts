import { expect, test } from '@playwright/test'
import {
  createModelCommandClient,
  createSessionLaunchTargetReader,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-pre-session-location-'
async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error('Unowned Location test directory')
  await rm(target, { recursive: true, force: true })
}
for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Location keeps selection local and first send uses an isolated derived branch (${locale})`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const repositoryRoot = join(root, 'repository')
    await mkdir(repositoryRoot)
    const context = await browser.newContext({
      locale,
      colorScheme: 'dark',
      viewport: {
        width: locale === 'en-US' ? 1440 : 390,
        height: 900,
      },
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root: repositoryRoot,
        home: join(root, 'data'),
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      })
      const fixture = host
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const targets = createSessionLaunchTargetReader(host.client)
      const fixtureModel = (await createModelCommandClient(host.client).execute('model.list', {})).find(
        (model) => model.id === 'local-fixture',
      )
      if (!fixtureModel) throw new Error('Local fixture model is unavailable')
      const count = async () =>
        (await sessions.execute('session.list', { workspaceId: fixture.ready.workspaceId, limit: 100 })).items.length
      const originalBranch = execFileSync('git', ['branch', '--show-current'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
      }).trim()
      const originalHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
      }).trim()
      execFileSync('git', ['branch', 'feature/location'], { cwd: repositoryRoot, windowsHide: true })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base}/apps/web/`)
      const copy = getShellCopy(locale)
      const labels = preSessionCopy(locale)
      const location = preSessionLaunchCopy(locale).location
      const landing = page.locator('.hbar-pre-session-landing')
      await landing.getByRole('textbox', { name: copy.preSession.prompt.input }).fill('/demo')
      const trigger = landing.locator('.hbar-pre-session-location-picker > button')
      await trigger.click()
      let dialog = page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
      await dialog.getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
      dialog = page.getByRole('dialog', { name: location.title, exact: true })
      await expect(dialog.getByRole('radio', { name: new RegExp(location.isolated) })).toBeEnabled()
      const screenshotRoot = resolve('artifacts/pre-session-location', locale)
      await mkdir(screenshotRoot, { recursive: true })
      await page.screenshot({ path: join(screenshotRoot, 'location-root.png') })
      await dialog.getByRole('radio', { name: new RegExp(location.isolated) }).click()
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await trigger.click()
      await page
        .getByRole('dialog', { name: location.title, exact: true })
        .getByRole('button', { name: new RegExp(`^${location.branch}`) })
        .click()
      const branches = page.getByRole('dialog', { name: location.chooseBranch, exact: true })
      await branches.getByRole('searchbox', { name: location.searchBranches }).fill('feature/location')
      await expect(branches.getByRole('button', { name: new RegExp('feature/location') })).toBeEnabled()
      await page.screenshot({ path: join(screenshotRoot, 'branches.png') })
      await branches.getByRole('button', { name: new RegExp('feature/location') }).click()
      await expect(trigger).toHaveAccessibleName(location.trigger(host.ready.workspaceName, 'feature/location', true))
      expect(await count()).toBe(1)
      expect(
        execFileSync('git', ['branch', '--show-current'], {
          cwd: repositoryRoot,
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      ).toBe(originalBranch)
      await landing.getByRole('button', { name: labels.model.trigger(null), exact: true }).click()
      await page
        .getByRole('dialog', { name: labels.model.title })
        .getByRole('button', { name: new RegExp(fixtureModel.modelName) })
        .click()
      await page.screenshot({ path: join(screenshotRoot, 'selected-composer.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
      await expect.poll(count).toBe(2)
      const created = (
        await sessions.execute('session.list', { workspaceId: fixture.ready.workspaceId, limit: 100 })
      ).items.find((item) => item.id !== fixture.ready.sessionId)
      if (!created) throw new Error('First send did not create a Session')
      await expect.poll(async () => (await targets.read(created.id)).locked).toBe(true)
      const target = await targets.read(created.id)
      expect(target.selection).toEqual({
        mode: 'isolated-worktree',
        branch: { kind: 'derived', baseRef: 'refs/heads/feature/location' },
      })
      expect(target.resolution.status).toBe('ready')
      if (target.resolution.status === 'ready')
        expect(target.resolution.branch).toMatch(/^hbar\/session-launch\/[0-9a-f]{64}$/)
      await expect
        .poll(async () => {
          const snapshot = await fixture.client.call('session.snapshot', { sessionId: created.id, limit: 60 })
          return snapshot.runs.filter((run) => run.input.source === 'user' && run.input.text === '/demo').length
        })
        .toBe(1)
      expect(
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim(),
      ).toBe(originalHead)
      expect(
        execFileSync('git', ['branch', '--show-current'], {
          cwd: repositoryRoot,
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      ).toBe(originalBranch)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
