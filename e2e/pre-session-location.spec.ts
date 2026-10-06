import { expect, test, type Locator, type Page } from '@playwright/test'
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
import { sessionLaunchBranchesCommands } from '@hbar/contracts/commands/session-launch-branches'
import { z } from 'zod'

const prefix = 'hbar-pre-session-location-'
const selectedBranch = `feature/location-保留原文-${'long-'.repeat(18)}complete`
const branchWire = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).optional(),
  result: z.unknown().optional(),
})
function observeFilteredBranchRead(page: Page, workspaceId: string) {
  const pending = new Set<string | number>()
  const results: string[] = []
  const errors: string[] = []
  const command = sessionLaunchBranchesCommands['sessionLaunchBranches.list']
  const parse = (payload: string | Buffer) => {
    try {
      const value: unknown = JSON.parse(payload.toString())
      const frame = branchWire.safeParse(value)
      return frame.success ? frame.data : null
    } catch {
      return null
    }
  }
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname !== '/rpc') return
    socket.on('framesent', ({ payload }) => {
      const frame = parse(payload)
      if (frame?.method !== 'command.execute' || frame.params?.commandId !== command.metadata.id) return
      const input = command.input.safeParse(frame.params.input)
      if (
        input.success &&
        input.data.workspaceId === workspaceId &&
        input.data.search === selectedBranch &&
        frame.id !== undefined
      ) {
        if (pending.size >= 16) errors.push('Filtered branch observation exceeded its in-flight capacity')
        else pending.add(frame.id)
      }
    })
    socket.on('framereceived', ({ payload }) => {
      const frame = parse(payload)
      if (frame?.id === undefined || !pending.delete(frame.id)) return
      const output = command.output.safeParse(frame.result)
      if (output.success && output.data.workspaceId === workspaceId && results.length < 16)
        results.push(output.data.workspaceId)
      else errors.push('Filtered branch query did not return its real page')
    })
  })
  return { results, errors }
}
async function assertLocationSurface(surface: Locator): Promise<void> {
  await expect(surface).toBeInViewport()
  const presentation = await surface.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const rows = Array.from(element.querySelectorAll('.hbar-pre-session-location-row')).map((row) => {
      const title = row.querySelector('[data-text-context="choice.title"]')
      const description = row.querySelector('[data-text-context="choice.description"]')
      return {
        align: getComputedStyle(row).textAlign,
        sameStart:
          !title ||
          !description ||
          Math.abs(title.getBoundingClientRect().left - description.getBoundingClientRect().left) < 1,
      }
    })
    return {
      portal: element.parentElement === document.body,
      layer: Number(style.zIndex),
      blur: style.backdropFilter,
      background: style.backgroundColor,
      within: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      rows,
    }
  })
  expect(presentation.portal).toBe(true)
  expect(presentation.layer).toBeGreaterThanOrEqual(10_000)
  expect(presentation.blur).toMatch(/blur\(/)
  expect(presentation.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(presentation.within).toBe(true)
  expect(presentation.overflow).toBe(false)
  for (const row of presentation.rows) {
    expect(['start', 'left']).toContain(row.align)
    expect(row.sameStart).toBe(true)
  }
}
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
        budgetAutoContinue: false,
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
      execFileSync('git', ['branch', selectedBranch], { cwd: repositoryRoot, windowsHide: true })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const filteredRead = observeFilteredBranchRead(page, host.ready.workspaceId)
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
      for (const width of [1440, 1100, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await assertLocationSurface(dialog)
        await page.screenshot({ path: join(screenshotRoot, `location-root-${width}.png`) })
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      await trigger.press('Enter')
      await expect(dialog).toBeVisible()
      // The viewport corner is outside the shared surface's verified bounds.
      await page.locator('body').click({ position: { x: 2, y: 2 } })
      await expect(dialog).toBeHidden()
      await trigger.click()
      await expect(dialog).toBeVisible()
      await trigger.click()
      await expect(dialog).toBeHidden()
      await trigger.click()
      await expect(dialog).toBeVisible()
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
      await assertLocationSurface(branches)
      await branches.getByRole('searchbox', { name: location.searchBranches }).fill(selectedBranch)
      await expect(branches.getByRole('button', { name: new RegExp(selectedBranch) })).toBeEnabled()
      await page.screenshot({ path: join(screenshotRoot, 'branches.png') })
      await branches.getByRole('button', { name: new RegExp(selectedBranch) }).click()
      dialog = page.getByRole('dialog', { name: location.title, exact: true })
      await expect(dialog).toBeVisible()
      const branchEntry = dialog.getByRole('button', { name: new RegExp(`^${location.branch}`) })
      await expect(branchEntry).toBeFocused()
      await expect.poll(() => filteredRead.results.length).toBeGreaterThan(0)
      expect(filteredRead.errors).toEqual([])
      await expect(dialog).not.toContainText(location.loading)
      await expect(branchEntry).toBeFocused()
      await expect(trigger).toHaveAccessibleName(location.trigger(host.ready.workspaceName, selectedBranch, true))
      await expect(trigger.locator('[data-text-context="inline.isolated"]')).toHaveText(selectedBranch)
      await assertLocationSurface(dialog)
      await expect(
        dialog.locator('[data-text-context="choice.description"]').filter({ hasText: selectedBranch }),
      ).toHaveText(selectedBranch)
      const reading = dialog.getByRole('region', { name: location.title, exact: true })
      if (await reading.evaluate((element) => element.scrollHeight > element.clientHeight)) {
        await reading.focus()
        await page.keyboard.press('End')
        await expect.poll(() => reading.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      }
      const selectedMode = dialog.getByRole('radio', { name: new RegExp(location.isolated) })
      await expect(selectedMode).toBeInViewport()
      expect(
        await selectedMode.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          return hit !== null && element.contains(hit)
        }),
      ).toBe(true)
      await page.screenshot({ path: join(screenshotRoot, 'long-selected-branch-320.png') })
      expect(await count()).toBe(1)
      expect(
        execFileSync('git', ['branch', '--show-current'], {
          cwd: repositoryRoot,
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      ).toBe(originalBranch)
      await dialog.getByRole('button', { name: location.close, exact: true }).click()
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
        branch: { kind: 'derived', baseRef: `refs/heads/${selectedBranch}` },
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
