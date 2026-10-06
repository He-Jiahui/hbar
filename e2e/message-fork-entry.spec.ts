import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`message Fork keeps the chosen user or final reply prefix and opens its own tab: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-message-fork-entry-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sourceId = host.ready.sessionId
      const workspaceId = host.ready.workspaceId
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const promptText = 'Fork the exact message boundary — 精确分支'
      await page.getByRole('textbox', { name: copy.session.prompt.input, exact: true }).fill(promptText)
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect(page.getByText(`Received: ${promptText}`)).toBeVisible()
      const transcript = page.locator('.lumen-message-transcript')
      const user = transcript.filter({ has: page.getByText(promptText, { exact: true }) })
      const reply = transcript.filter({ has: page.getByText(`Received: ${promptText}`) })
      await expect(user.getByRole('button', { name: copy.session.messageFork.ready })).toBeVisible()
      await expect(reply.getByRole('button', { name: copy.session.messageFork.ready })).toBeVisible()
      await expect(user.getByRole('button', { name: copy.session.messageActions.copyMessage! })).toBeVisible()
      await page.screenshot({ path: `artifacts/reference-fork/actions-${locale}-1440.png` })
      const source = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })
      const userId = source.messages.find(
        (message) =>
          message.role === 'user' &&
          message.content.some((block) => block.type === 'text' && block.text === promptText),
      )?.id
      const assistantId = source.messages.findLast((message) => message.role === 'assistant')?.id
      expect(userId).toBeDefined()
      expect(assistantId).toBeDefined()

      await user.getByRole('button', { name: copy.session.messageFork.ready }).click()
      const sessions = createWorkspaceSessionCommandClient(host.client)
      await expect
        .poll(
          async () =>
            (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.filter(
              (item) => item.parentId === sourceId,
            ).length,
        )
        .toBe(1)
      const firstChild = (await sessions.execute('session.list', { workspaceId, limit: 100 })).items.find(
        (item) => item.parentId === sourceId,
      )!
      const firstSnapshot = await host.client.call('session.snapshot', { sessionId: firstChild.id, limit: 60 })
      expect(
        firstSnapshot.messages.map((message) =>
          message.content.filter((block) => block.type === 'text').map((block) => block.text),
        ),
      ).toEqual([[promptText]])
      expect(firstSnapshot.runs).toHaveLength(0)
      await expect(page.getByRole('tab', { name: firstChild.title, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await page.getByRole('tab').first().click()
      await expect(user.getByText(copy.session.messageFork.created)).toBeVisible()
      await expect(reply.getByRole('button', { name: copy.session.messageFork.ready })).toBeVisible()
      await page.setViewportSize({ width: 320, height: 760 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-fork/actions-${locale}-320.png` })

      await reply.getByRole('button', { name: copy.session.messageFork.ready }).click()
      await expect
        .poll(
          async () =>
            (await sessions.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.filter(
              (item) => item.parentId === sourceId,
            ).length,
        )
        .toBe(2)
      const children = (await sessions.execute('session.list', { workspaceId, limit: 100 })).items.filter(
        (item) => item.parentId === sourceId,
      )
      const second = children.find((item) => item.id !== firstChild.id)!
      const secondSnapshot = await host.client.call('session.snapshot', { sessionId: second.id, limit: 60 })
      expect(secondSnapshot.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
      expect(
        secondSnapshot.messages.map((message) =>
          message.content.filter((block) => block.type === 'text').map((block) => block.text),
        ),
      ).toEqual([[promptText], [`Received: ${promptText}\n\nThis response was produced by the local fixture model.`]])
      expect(
        (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })).messages.map(
          (message) => message.id,
        ),
      ).toContain(userId)
      expect(
        (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })).messages.map(
          (message) => message.id,
        ),
      ).toContain(assistantId)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
