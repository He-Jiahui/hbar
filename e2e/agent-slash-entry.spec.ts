import { expect, test } from '@playwright/test'
import { createAgentCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-slash-'))
    throw new Error('Refusing cleanup outside the owned Agent slash fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Agent slash completes before dispatch and creates only a child Agent: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-agent-slash-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
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
      await expect
        .poll(async () =>
          (await agents.execute('agent.list', { parentSessionId: host!.ready.sessionId })).items.some(
            (item) => item.profileId === 'explore' && item.objective === objective,
          ),
        )
        .toBe(true)
      await expectComposerText(prompt, '')
      await expect(page.getByText(copy.session.slash.agentNotice.created, { exact: true })).toBeVisible()
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)

      await page.setViewportSize({ width: 320, height: 720 })
      await expect(
        page.getByRole('button', { name: copy.session.slash.agentNotice.open, exact: true }),
      ).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`agent-created-${locale}-320.png`) })
      await page.getByRole('button', { name: copy.session.slash.agentNotice.open, exact: true }).click()
      await expect(page.getByRole('heading', { name: copy.agents.detailTitle, exact: true })).toBeVisible()
      expect(pageErrors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}
