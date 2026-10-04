import { expect, test } from '@playwright/test'
import { createFileCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlaywrightUiHarness } from './support/playwright-ui-harness.ts'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'

test('executes the real file and session monitoring tool flows', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-production-tools-'))
  const artifactDirectory = 'artifacts/production-ui/web/file-monitoring'
  await rm(artifactDirectory, { recursive: true, force: true })
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  try {
    host = await startWebSessionHost({ root })
    const authentication = await context.request.post(
      `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/auth/token`,
      { data: { token: host.ready.token } },
    )
    expect(authentication.ok()).toBe(true)
    const page = await context.newPage()
    const harness = new PlaywrightUiHarness({
      page,
      platform: 'web',
      artifactDirectory,
      locale: 'en-US',
      theme: 'system',
    })
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await expect(page.locator('footer')).toContainText('Connected')
    await page.getByRole('button', { name: `Open session ${host.ready.sessionTitle}` }).click()

    await harness.exercise(
      'session.tool.files.toggle',
      { role: 'button', name: 'Files', description: 'session file tool action' },
      async () => {
        await page.getByRole('button', { name: 'Files', exact: true }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'File manager' })
        await expect(heading).toBeVisible()
        return {
          ui: [
            { description: 'file tool opens beside the selected session', passed: await heading.isVisible() },
            {
              description: 'session heading remains visible',
              passed: await page.getByRole('heading', { level: 1, name: host!.ready.sessionTitle }).isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'files.refresh',
      { role: 'button', name: 'Refresh files', description: 'file browser refresh' },
      async () => {
        await page.getByRole('button', { name: 'Refresh files' }).click()
        const entry = page.getByRole('button', { name: 'browser-e2e.md' })
        await expect(entry).toBeVisible()
        return {
          ui: [{ description: 'workspace root file remains visible after refresh', passed: await entry.isVisible() }],
        }
      },
    )

    await harness.exercise(
      'files.document.open',
      { role: 'button', name: 'browser-e2e.md', description: 'open workspace text document' },
      async () => {
        await page.getByRole('button', { name: 'browser-e2e.md' }).click()
        const editor = page.getByRole('textbox', { name: 'browser-e2e.md' })
        await expect(editor).toHaveValue('# Browser file\n')
        return {
          ui: [
            {
              description: 'text editor shows authoritative content',
              passed: (await editor.inputValue()) === '# Browser file\n',
            },
          ],
        }
      },
    )

    const edited = '# Browser file\n\nEdited by production interaction coverage.\n'
    await harness.exercise(
      'files.document.edit',
      { role: 'textbox', name: 'browser-e2e.md', description: 'file document editor' },
      async () => {
        const editor = page.getByRole('textbox', { name: 'browser-e2e.md' })
        await editor.fill(edited)
        await expect(page.getByText('Unsaved changes')).toBeVisible()
        return {
          ui: [
            { description: 'document draft contains the edit', passed: (await editor.inputValue()) === edited },
            {
              description: 'dirty feedback is shown locally',
              passed: await page.getByText('Unsaved changes').isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'files.document.save',
      { role: 'button', name: 'Save file', description: 'save text document' },
      async () => {
        await page.getByRole('button', { name: 'Save file' }).click()
        await expect(page.getByText('File saved.')).toBeVisible()
        const file = await createFileCommandClient(host!.client).execute('file.read', {
          workspaceId: host!.ready.workspaceId,
          path: 'browser-e2e.md',
        })
        return {
          ui: [
            {
              description: 'saved feedback replaces dirty state',
              passed: await page.getByText('File saved.').isVisible(),
            },
          ],
          host: [{ description: 'Host file content equals the submitted draft', passed: file.text === edited }],
          hostFact: file,
        }
      },
    )

    await harness.exercise(
      'files.document.back',
      { role: 'button', name: 'Back to files', description: 'return from document detail' },
      async () => {
        await page.getByRole('button', { name: 'Back to files' }).click()
        const entry = page.getByRole('button', { name: 'browser-e2e.md' })
        await expect(entry).toBeVisible()
        return { ui: [{ description: 'originating file row is restored', passed: await entry.isVisible() }] }
      },
    )

    await harness.exercise(
      'files.close',
      { role: 'button', name: 'Close file manager', description: 'close file tool' },
      async () => {
        await page.getByRole('button', { name: 'Close file manager' }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'File manager' })
        await expect(heading).toBeHidden()
        return { ui: [{ description: 'file tool is closed', passed: !(await heading.isVisible()) }] }
      },
    )

    await page.getByRole('textbox', { name: 'Prompt' }).fill('usage for monitoring')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Completed').first()).toBeVisible()
    await harness.exercise(
      'session.tool.monitoring.toggle',
      { role: 'button', name: 'Monitoring', description: 'session monitoring tool action' },
      async () => {
        await page.getByRole('button', { name: 'Monitoring', exact: true }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'Session monitoring' })
        await expect(heading).toBeVisible()
        return {
          ui: [{ description: 'monitoring opens beside the selected session', passed: await heading.isVisible() }],
        }
      },
    )

    await harness.exercise(
      'monitoring.latency.toggle',
      { role: 'button', name: 'Latency p95', description: 'latency details disclosure' },
      async () => {
        await page.getByRole('button', { name: 'Latency p95', exact: true }).click()
        await expect(page.getByText('First text token')).toBeVisible()
        return {
          ui: [
            {
              description: 'latency metrics are expanded',
              passed: await page.getByText('First text token').isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'monitoring.executions.toggle',
      { role: 'button', name: 'Execution statistics', description: 'execution details disclosure' },
      async () => {
        await page.getByRole('button', { name: 'Execution statistics', exact: true }).click()
        await expect(page.getByText('Peak request concurrency')).toBeVisible()
        return {
          ui: [
            {
              description: 'execution metrics are expanded',
              passed: await page.getByText('Peak request concurrency').isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'monitoring.models.toggle',
      { role: 'button', name: 'Model usage', description: 'model usage disclosure' },
      async () => {
        await page.getByRole('button', { name: 'Model usage', exact: true }).click()
        await expect(page.getByText('fixture / fixture')).toBeVisible()
        return {
          ui: [
            {
              description: 'fixture model usage is expanded',
              passed: await page.getByText('fixture / fixture').isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'monitoring.close',
      { role: 'button', name: 'Close session monitoring', description: 'close monitoring tool' },
      async () => {
        await page.getByRole('button', { name: 'Close session monitoring' }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'Session monitoring' })
        await expect(heading).toBeHidden()
        return { ui: [{ description: 'monitoring tool is closed', passed: !(await heading.isVisible()) }] }
      },
    )

    await harness.writeReport({ requireComplete: false })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
