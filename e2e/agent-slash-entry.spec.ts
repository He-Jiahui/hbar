import { expect, test } from '@playwright/test'
import { HbarClient, createAgentCommandClient } from '@hbar/client'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import {
  waitForWebSessionHostReady,
  stopOwnedWebSessionHostChild,
  stopWebSessionHost,
  type WebSessionHost,
} from './support/web-session-host'

async function startParentHost(root: string): Promise<WebSessionHost> {
  const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
  const executable =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((path) => [join(path, 'bun.exe'), join(path, 'node_modules/bun/bin/bun.exe')])
          .find(existsSync)
      : 'bun'
  if (!executable) throw new Error('Bun executable is unavailable for the owned Agent fixture')
  const child = spawn(executable, ['e2e/support/agent-parent-host.ts'], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HBAR_E2E_DATA_ROOT: root,
      HBAR_E2E_WEB_ORIGIN: `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`,
    },
  })
  const ready = await waitForWebSessionHostReady(child)
  const url = `http://127.0.0.1:${port}`
  const client = new HbarClient(url, ready.token)
  try {
    await client.connect()
  } catch (error) {
    client.disconnect()
    await stopOwnedWebSessionHostChild(child)
    throw error
  }
  return { child, client, ready, url }
}

async function cleanupFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-slash-'))
    throw new Error('Refusing cleanup outside the owned Agent slash fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Agent completion defers execution to the parent Run and creates a tool-owned child: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-agent-slash-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startParentHost(root)
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const agents = createAgentCommandClient(host.client)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const send = page.getByRole('button', { name: copy.session.prompt.send, exact: true })

      await prompt.fill('/agent debugger Inspect the panes')
      await send.click()
      await expect(
        page.getByText(copy.session.slash.agentProfileUnavailable('debugger'), { exact: true }),
      ).toBeVisible()
      await expectComposerText(prompt, '/agent debugger Inspect the panes')
      expect((await agents.execute('agent.list', { parentSessionId: host.ready.sessionId })).items).toHaveLength(0)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)

      await prompt.fill('/agent explore')
      await send.click()
      await expect(page.getByText(copy.session.slash.agentRequired, { exact: true })).toBeVisible()
      await expectComposerText(prompt, '/agent explore')

      await prompt.fill('/ag')
      await expect(page.getByText(copy.session.slash.agentRequired, { exact: true })).toHaveCount(0)
      const option = page.getByRole('option', {
        name: copy.session.slash.select(copy.session.slash.agentProfile('explore').label),
        exact: true,
      })
      await expect(option).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`agent-menu-${locale}-1440.png`) })
      await option.click()
      await expectComposerText(prompt, '/agent explore ')
      expect((await agents.execute('agent.list', { parentSessionId: host.ready.sessionId })).items).toHaveLength(0)

      const objective = 'Inspect the current navigation and report the relevant files'
      await prompt.fill(`/agent explore ${objective}`)
      await send.click()
      const approval = page.getByRole('region', { name: copy.session.decisions.approval, exact: true })
      await expect(approval).toBeVisible()
      expect((await agents.execute('agent.list', { parentSessionId: host.ready.sessionId })).items).toHaveLength(0)
      await approval.getByRole('button', { name: copy.session.decisions.allow, exact: true }).click()
      await expect
        .poll(async () =>
          (await agents.execute('agent.list', { parentSessionId: host!.ready.sessionId })).items.some(
            (item) => item.profileId === 'explore' && item.objective === objective,
          ),
        )
        .toBe(true)
      await expectComposerText(prompt, '')
      await expect
        .poll(
          async () =>
            (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })).runs[0]?.status,
        )
        .toBe('completed')
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
      expect(snapshot.runs).toHaveLength(1)
      expect(snapshot.runs[0]?.input.text).toBe(`/agent explore ${objective}`)
      expect(
        snapshot.messages.some((message) =>
          message.content.some((part) => part.type === 'tool_result' && part.name === 'agent' && !part.isError),
        ),
      ).toBe(true)
      const created = (await agents.execute('agent.list', { parentSessionId: host.ready.sessionId })).items[0]
      if (!created) throw new Error('The parent Agent tool did not create a child')
      const draft = 'Keep this parent draft while checking the Agent result — 保留原草稿。'
      await prompt.fill(draft)
      const openFromTool = page.getByRole('button', {
        name: copy.session.agentToolOpen.openNamed(objective),
        exact: true,
      })
      await expect(openFromTool).toBeVisible()
      const toolHeading = page.locator('.hbar-session-tool[data-tool-name="agent"] .hbar-session-disclosure-heading')
      await expect(toolHeading.getByRole('button', { expanded: false }).first()).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`agent-tool-open-${locale}-1440.png`) })
      await page.setViewportSize({ width: 390, height: 800 })
      await expect(openFromTool).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`agent-tool-open-${locale}-390.png`) })
      await openFromTool.click()
      await expect(
        page.getByRole('button', { name: copy.agents.returnToParent(host.ready.sessionTitle), exact: true }),
      ).toBeVisible()
      await page.getByRole('button', { name: copy.agents.returnToParent(host.ready.sessionTitle), exact: true }).click()
      await expectComposerText(prompt, draft)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(1)
      expect((await agents.execute('agent.list', { parentSessionId: host.ready.sessionId })).items).toHaveLength(1)
      await page.getByRole('button', { name: copy.session.tools.activity, exact: true }).click()
      const activity = page.locator('.hbar-session-activity-workspace')
      const row = activity.locator(`[data-activity-agent-id="${created.agentId}"]`)
      await expect(row).toBeVisible()

      await page.setViewportSize({ width: 320, height: 720 })
      await expect(
        row.getByRole('button', { name: copy.activity.agents.open(objective), exact: true }),
      ).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`agent-created-${locale}-320.png`) })
      await row.getByRole('button', { name: copy.activity.agents.open(objective), exact: true }).click()
      await page.getByRole('button', { name: copy.agents.returnToParent(host.ready.sessionTitle), exact: true }).click()
      await expect(activity).toBeVisible()
      await activity.getByRole('button', { name: copy.activity.close, exact: true }).click()
      await expectComposerText(prompt, draft)
      expect(pageErrors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}
