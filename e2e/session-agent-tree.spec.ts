import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`Child agents are nested, foldable and response ordered in both sidebar modes: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-agent-tree-ui-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root })
      const agents = createAgentCommandClient(host.client)
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const copy = getShellCopy(locale)
      const first = await agents.execute(
        'agent.create',
        {
          parentSessionId: host.ready.sessionId,
          objective: 'Respond with the fixture result',
          title: locale === 'zh-CN' ? '较早回复的子 agent' : 'Earlier response child',
        },
        { idempotencyKey: 'tree-first' },
      )
      await expect
        .poll(
          async () =>
            (
              await agents.execute('agent.result.get', {
                parentSessionId: host!.ready.sessionId,
                agentId: first.agentId,
              })
            ).status,
        )
        .toBe('completed')
      const second = await agents.execute(
        'agent.create',
        {
          parentSessionId: host.ready.sessionId,
          objective: 'Respond with the fixture result',
          title: locale === 'zh-CN' ? '最新回复的子 agent' : 'Latest response child',
        },
        { idempotencyKey: 'tree-second' },
      )
      await expect
        .poll(
          async () =>
            (
              await agents.execute('agent.result.get', {
                parentSessionId: host!.ready.sessionId,
                agentId: second.agentId,
              })
            ).status,
        )
        .toBe('completed')
      const title =
        locale === 'zh-CN'
          ? '已重命名但仍按回复时间排序的子 agent：这是一个非常长的标题用来验证窄窗口省略和原始操作目标不会改变'
          : 'Renamed older child with a very long title that must not reorder responses or change its original action target'
      await sessions.execute('session.rename', { sessionId: first.sessionId, title })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const parent = page.locator(`[data-agent-parent="${host.ready.sessionId}"]`).first()
      const firstRow = () => parent.locator(`[data-agent-parent="${first.sessionId}"]`)
      await expect(
        parent.getByRole('button', { name: copy.shell.agentTree.expand(host.ready.sessionTitle, 2), exact: true }),
      ).toBeVisible()
      await expect(firstRow()).toHaveCount(0)
      const toggle = parent.getByRole('button', {
        name: copy.shell.agentTree.expand(host.ready.sessionTitle, 2),
        exact: true,
      })
      await toggle.focus()
      await page.keyboard.press('Enter')
      await expect(firstRow()).toBeVisible()
      const children = parent.locator(':scope > .hbar-app-react-agent-branch-children > [data-agent-parent]')
      await expect(children).toHaveCount(2)
      expect(
        await children.evaluateAll((items) => items.map((item) => item.getAttribute('data-agent-parent'))),
      ).toEqual([second.sessionId, first.sessionId])
      await createRunCommandClient(host.client).execute(
        'run.submit',
        {
          sessionId: first.sessionId,
          modelId: 'local-fixture',
          input: { text: 'Produce a newer response for sidebar ordering' },
        },
        { idempotencyKey: 'tree-new-response' },
      )
      await expect
        .poll(async () => children.evaluateAll((items) => items.map((item) => item.getAttribute('data-agent-parent'))))
        .toEqual([first.sessionId, second.sessionId])
      await parent
        .getByRole('button', { name: copy.shell.agentTree.collapse(host.ready.sessionTitle, 2), exact: true })
        .click()
      await expect(firstRow()).toHaveCount(0)
      await parent
        .getByRole('button', { name: copy.shell.agentTree.expand(host.ready.sessionTitle, 2), exact: true })
        .click()
      await firstRow()
        .getByRole('button', { name: copy.shell.openSession(title), exact: true })
        .click()
      await expect(
        firstRow().getByRole('button', { name: copy.shell.openSession(title), exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      await page.reload()
      await expect(firstRow()).toBeVisible()
      await expect(
        parent.getByRole('button', { name: copy.shell.agentTree.collapse(host.ready.sessionTitle, 2), exact: true }),
      ).toBeVisible()
      // Same canonical hierarchy in global time mode; children never become root peers.
      await page.getByRole('button', { name: copy.shell.sort.time.showTime, exact: true }).click()
      await expect(page.locator('nav[data-sidebar-organization="time"]')).toBeVisible()
      await expect(firstRow()).toBeVisible()
      await expect(page.locator(`[data-agent-parent="${first.sessionId}"]`)).toHaveCount(1)
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        if (width === 320) {
          const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          await expect(show).toBeVisible()
          await show.click()
        }
        await expect(firstRow()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`agent-tree-${locale}-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      await firstRow().locator('.lumen-action-menu summary').click()
      await firstRow().getByRole('menuitem', { name: copy.shell.renameSession, exact: true }).click()
      await expect(firstRow().getByRole('textbox', { name: copy.shell.renameEditor.title, exact: true })).toHaveValue(
        title,
      )
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
