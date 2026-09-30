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

const prefix = 'hbar-pre-session-branch-creation-'
const branchName = 'feature/location-form'
const draftText = 'Keep this draft while creating a branch.'

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error('Unowned branch-creation test directory')
  await rm(target, { recursive: true, force: true })
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Location creates and selects a branch without checkout or a new Session (${locale})`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const repositoryRoot = join(root, 'repository')
    await mkdir(repositoryRoot)
    const context = await browser.newContext({
      locale,
      colorScheme: 'dark',
      viewport: locale === 'en-US' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root: repositoryRoot,
        home: join(root, 'data'),
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 48849),
      })
      const fixture = host
      const sessions = createWorkspaceSessionCommandClient(fixture.client)
      const targets = createSessionLaunchTargetReader(fixture.client)
      const fixtureModel = (await createModelCommandClient(fixture.client).execute('model.list', {})).find(
        (model) => model.id === 'local-fixture',
      )
      if (!fixtureModel) throw new Error('Local fixture model is unavailable')
      const countSessions = async () =>
        (await sessions.execute('session.list', { workspaceId: fixture.ready.workspaceId, limit: 100 })).items.length
      const startingSessionCount = await countSessions()
      const originalBranch = git(repositoryRoot, ['branch', '--show-current'])
      const originalHead = git(repositoryRoot, ['rev-parse', 'HEAD'])
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 48848}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: fixture.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base}/apps/web/`)
      const shell = getShellCopy(locale)
      const location = preSessionLaunchCopy(locale).location
      const landing = page.locator('.hbar-pre-session-landing')
      const prompt = landing.getByRole('textbox', { name: shell.preSession.prompt.input })
      await prompt.fill(draftText)

      const screenshotRoot = resolve('artifacts/pre-session-branch-creation-ui', locale)
      await mkdir(screenshotRoot, { recursive: true })
      const trigger = landing.locator('.hbar-pre-session-location-picker > button')
      await trigger.click()
      let dialog = page.getByRole('dialog', { name: location.chooseDirectory, exact: true })
      await dialog.getByRole('button', { name: new RegExp(fixture.ready.workspaceName) }).click()
      dialog = page.getByRole('dialog', { name: location.title, exact: true })
      await dialog.getByRole('button', { name: new RegExp(`^${location.branch}`) }).click()
      const branchDialog = page.getByRole('dialog', { name: location.chooseBranch, exact: true })
      await branchDialog.getByRole('button', { name: new RegExp(`^${originalBranch} `) }).click()
      dialog = page.getByRole('dialog', { name: location.title, exact: true })
      const branchEntry = dialog.getByRole('button', { name: new RegExp(`^${location.branch}`) })
      await expect(dialog).toBeVisible()
      await expect(branchEntry).toBeFocused()
      expect(git(repositoryRoot, ['branch', '--show-current'])).toBe(originalBranch)
      await branchEntry.click()
      await branchDialog.getByRole('searchbox', { name: location.searchBranches }).fill(branchName)
      const createButton = branchDialog.getByRole('button', { name: location.newBranch, exact: true })
      await expect(createButton).toBeEnabled()
      await page.screenshot({ path: join(screenshotRoot, 'branch-list.png') })
      await createButton.click()

      dialog = page.getByRole('dialog', { name: location.newBranch, exact: true })
      const nameInput = dialog.getByRole('textbox', { name: location.branchName })
      await expect(nameInput).toHaveValue(branchName)
      await expect(dialog.getByText(location.startsFrom(originalBranch))).toBeVisible()
      const create = dialog.getByRole('button', { name: location.create, exact: true })
      await expect(create).toBeEnabled()
      await page.screenshot({ path: join(screenshotRoot, 'new-branch-form.png') })
      if (locale === 'en-US') await create.click()
      else await nameInput.press('Enter')

      await expect(dialog).toBeHidden()
      await expect(trigger).toHaveAccessibleName(location.trigger(fixture.ready.workspaceName, branchName, false))
      await expect(prompt).toHaveValue(draftText)
      expect(await countSessions()).toBe(startingSessionCount)
      expect(git(repositoryRoot, ['rev-parse', `refs/heads/${branchName}`])).toBe(originalHead)
      expect(git(repositoryRoot, ['branch', '--show-current'])).toBe(originalBranch)
      expect(git(repositoryRoot, ['rev-parse', 'HEAD'])).toBe(originalHead)
      await page.screenshot({ path: join(screenshotRoot, 'created-and-selected.png') })

      await trigger.click()
      dialog = page.getByRole('dialog', { name: location.title, exact: true })
      await dialog.getByRole('button', { name: new RegExp(`^${location.branch}`) }).click()
      const branches = page.getByRole('dialog', { name: location.chooseBranch, exact: true })
      await branches.getByRole('searchbox', { name: location.searchBranches }).fill(branchName)
      const createdBranch = branches.getByRole('button', { name: new RegExp(branchName) })
      await expect(createdBranch).toHaveAttribute('aria-current', 'true')
      await expect(createdBranch).toBeEnabled()
      await page.screenshot({ path: join(screenshotRoot, 'selected-branch-row.png') })
      await expect(prompt).toHaveValue(draftText)
      expect(await countSessions()).toBe(startingSessionCount)

      await branches.getByRole('button', { name: location.close, exact: true }).click()
      const composerCopy = preSessionCopy(locale)
      await landing.getByRole('button', { name: composerCopy.model.trigger(null), exact: true }).click()
      await page
        .getByRole('dialog', { name: composerCopy.model.title })
        .getByRole('button', { name: new RegExp(fixtureModel.modelName) })
        .click()
      await landing.getByRole('button', { name: shell.preSession.prompt.send, exact: true }).click()
      await expect.poll(countSessions).toBe(startingSessionCount + 1)
      const createdSession = (
        await sessions.execute('session.list', { workspaceId: fixture.ready.workspaceId, limit: 100 })
      ).items.find((item) => item.id !== fixture.ready.sessionId)
      if (!createdSession) throw new Error('Send did not create a Session')
      await expect.poll(async () => (await targets.read(createdSession.id)).locked).toBe(true)
      const target = await targets.read(createdSession.id)
      expect(target.selection).toEqual({
        mode: 'shared-branch',
        branch: { ref: `refs/heads/${branchName}`, tipOid: originalHead },
      })
      expect(target.resolution.status).toBe('ready')
      await expect.poll(() => git(repositoryRoot, ['branch', '--show-current'])).toBe(branchName)
      expect(git(repositoryRoot, ['rev-parse', 'HEAD'])).toBe(originalHead)
      await expect
        .poll(async () => {
          const snapshot = await fixture.client.call('session.snapshot', { sessionId: createdSession.id, limit: 60 })
          return snapshot.runs.some((run) => run.input.source === 'user' && run.input.text === draftText)
        })
        .toBe(true)
      await page.screenshot({ path: join(screenshotRoot, 'first-send-selected.png') })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
