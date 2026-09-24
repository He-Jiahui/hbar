import { expect, test, type Page } from '@playwright/test'
import { createFileCommandClient } from '@hbar/client'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlaywrightUiHarness } from './support/playwright-ui-harness.ts'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'

async function until<T>(read: () => Promise<T>, timeout = 15_000): Promise<T> {
  const started = Date.now()
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() - started >= timeout) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, 50))
    }
  }
}

async function submitPrompt(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Prompt' }).fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

async function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

test('executes deterministic session runs, attachments, cancellation, retry, and approval', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-production-session-'))
  const artifactDirectory = 'artifacts/production-ui/web/session'
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
    const prompt = page.getByRole('textbox', { name: 'Prompt' })

    await harness.exercise(
      'session.draft.edit',
      { role: 'textbox', name: 'Prompt', description: 'session prompt draft' },
      async () => {
        await prompt.fill('draft isolated to this session')
        return {
          ui: [
            {
              description: 'prompt exposes the edited session draft',
              passed: (await prompt.inputValue()) === 'draft isolated to this session',
            },
            {
              description: 'send action becomes enabled',
              passed: await page.getByRole('button', { name: 'Send' }).isEnabled(),
            },
          ],
        }
      },
    )

    const attachmentText = 'Uploaded through the production browser attachment controller.'
    const attachmentName = 'production-attachment.txt'
    const attachmentId = createHash('sha256').update(attachmentText).digest('hex')
    await harness.exercise(
      'session.attachment.add',
      { role: 'button', name: 'Add attachment', description: 'composer attachment action' },
      async () => {
        const chooser = page.waitForEvent('filechooser')
        const upload = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/artifacts')
        const addAttachment = page.getByRole('button', { name: 'Add attachment' })
        await expect(addAttachment).toBeVisible()
        await addAttachment.focus()
        await expect(addAttachment).toBeFocused()
        await page.keyboard.press('Enter')
        await (
          await chooser
        ).setFiles({ name: attachmentName, mimeType: 'text/plain', buffer: Buffer.from(attachmentText) })
        const uploadResponse = await upload
        if (!uploadResponse.ok())
          throw new Error(`Attachment upload returned ${uploadResponse.status()}: ${await uploadResponse.text()}`)
        await expect(page.getByText(attachmentName, { exact: true })).toBeVisible()
        const artifact = await createFileCommandClient(host!.client).execute('attachment.query', {
          artifactId: attachmentId,
        })
        return {
          ui: [
            {
              description: 'uploaded attachment chip is visible',
              passed: await page.getByText(attachmentName, { exact: true }).isVisible(),
            },
          ],
          host: [
            {
              description: 'Host artifact matches uploaded content metadata',
              passed:
                artifact.id === attachmentId &&
                artifact.name === attachmentName &&
                artifact.size === Buffer.byteLength(attachmentText),
            },
          ],
          hostFact: artifact,
        }
      },
    )

    await harness.exercise(
      'session.attachment.remove',
      { role: 'button', name: `Remove attachment ${attachmentName}`, description: 'attachment chip remove action' },
      async () => {
        await page.getByRole('button', { name: `Remove attachment ${attachmentName}` }).click()
        await expect(page.getByText(attachmentName, { exact: true })).toBeHidden()
        return {
          ui: [
            {
              description: 'attachment chip is removed from the draft',
              passed: !(await page.getByText(attachmentName, { exact: true }).isVisible()),
            },
          ],
        }
      },
    )

    const promptText = 'hello from production interaction coverage'
    await prompt.fill(promptText)
    await harness.exercise(
      'session.run.submit',
      { role: 'button', name: 'Send', description: 'submit prompt' },
      async () => {
        await page.getByRole('button', { name: 'Send' }).click()
        await expect(page.getByText(`Received: ${promptText}`)).toBeVisible()
        await expect(page.getByText('Completed').first()).toBeVisible()
        const snapshot = await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
        const persisted = snapshot.messages.some((message) =>
          message.content.some((block) => block.type === 'text' && block.text === promptText),
        )
        return {
          ui: [
            {
              description: 'user prompt is visible in the timeline',
              passed: await page.getByText(promptText, { exact: true }).isVisible(),
            },
            {
              description: 'deterministic model response is visible',
              passed: await page.getByText(`Received: ${promptText}`).isVisible(),
            },
          ],
          host: [
            {
              description: 'Host snapshot persists the submitted prompt and completed run',
              passed: persisted && snapshot.runs.some((run) => run.status === 'completed'),
            },
          ],
          hostFact: snapshot,
        }
      },
    )

    await prompt.fill('/slow')
    await harness.exercise(
      'session.run.stop',
      { role: 'button', name: 'Stop the current run', description: 'cancel active slow fixture run' },
      async () => {
        await page.getByRole('button', { name: 'Send' }).click()
        const stop = page.getByRole('button', { name: 'Stop the current run' })
        await expect(stop).toBeVisible()
        await stop.click()
        await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
        const snapshot = await until(async () => {
          const value = await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
          if (!value.runs.some((run) => run.status === 'cancelled')) throw new Error('Run is not cancelled yet')
          return value
        })
        return {
          ui: [
            {
              description: 'cancelled terminal state is visible',
              passed: await page.getByText('Cancelled', { exact: true }).isVisible(),
            },
          ],
          host: [
            {
              description: 'Host reports one cancelled run for the same session',
              passed: snapshot.runs.some((run) => run.status === 'cancelled'),
            },
          ],
          hostFact: snapshot.runs,
        }
      },
    )

    await submitPrompt(page, '/fail')
    const retry = page.getByRole('button', { name: 'Retry run' }).last()
    await expect(retry).toBeVisible()
    await harness.exercise(
      'session.run.retry',
      { role: 'button', name: 'Retry run', description: 'retry failed fixture run' },
      async () => {
        const failedBefore = (
          await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
        ).runs.filter((run) => run.status === 'failed').length
        await retry.click()
        await expect(page.getByRole('button', { name: 'Retry run' })).toHaveCount(failedBefore + 1)
        const snapshot = await until(async () => {
          const value = await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
          if (value.runs.filter((run) => run.status === 'failed').length <= failedBefore)
            throw new Error('Retried run has not failed deterministically yet')
          return value
        })
        return {
          ui: [
            {
              description: 'retry creates another failed run with a local retry action',
              passed: (await page.getByRole('button', { name: 'Retry run' }).count()) === failedBefore + 1,
            },
          ],
          host: [
            {
              description: 'Host persists a distinct retried run',
              passed: snapshot.runs.filter((run) => run.status === 'failed').length === failedBefore + 1,
            },
          ],
          hostFact: snapshot.runs,
        }
      },
    )

    await submitPrompt(page, '/tool write_file {"path":"approved.txt","text":"approved"}')
    const approval = page.getByRole('region', { name: 'Agent approval' }).last()
    await expect(approval).toBeVisible()
    await harness.exercise(
      'session.approval.details',
      { role: 'button', name: 'View parameters', description: 'pending approval parameter disclosure' },
      async () => {
        await approval.getByText('View parameters', { exact: true }).click()
        return {
          ui: [
            {
              description: 'tool path is visible in approval details',
              passed: await approval.getByText(/approved\.txt/).isVisible(),
            },
            {
              description: 'approval remains pending after inspecting details',
              passed: await approval.getByText('Decision required').isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'session.approval.allow',
      { role: 'button', name: 'Allow', description: 'allow pending write tool' },
      async () => {
        const pending = (
          await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
        ).approvals.at(-1)
        if (!pending) throw new Error('Host has no pending approval to allow')
        await approval.getByRole('button', { name: 'Allow' }).click()
        await expect(approval.getByText('Resolved')).toBeVisible()
        const snapshot = await until(async () => {
          const value = await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
          if (value.approvals.some((item) => item.id === pending.id) || !(await fileExists(join(root, 'approved.txt'))))
            throw new Error('Approval has not settled yet')
          return value
        })
        const written = await readFile(join(root, 'approved.txt'), 'utf8')
        return {
          ui: [
            { description: 'allowed approval resolves once', passed: await approval.getByText('Resolved').isVisible() },
          ],
          host: [
            {
              description: 'Host allows the approval and executes the exact file write',
              passed: !snapshot.approvals.some((item) => item.id === pending.id) && written === 'approved',
            },
          ],
          hostFact: {
            resolvedApproval: pending.id,
            pendingApprovals: snapshot.approvals,
            file: { path: 'approved.txt', text: written },
          },
        }
      },
    )

    await submitPrompt(page, '/tool write_file {"path":"denied.txt","text":"denied"}')
    const deniedApproval = page.getByRole('region', { name: 'Agent approval' }).last()
    await expect(deniedApproval).toBeVisible()
    await harness.exercise(
      'session.approval.deny',
      { role: 'button', name: 'Deny', description: 'deny pending write tool' },
      async () => {
        const pending = (
          await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
        ).approvals.at(-1)
        if (!pending) throw new Error('Host has no pending approval to deny')
        await deniedApproval.getByRole('button', { name: 'Deny' }).click()
        await expect(deniedApproval.getByText('Resolved')).toBeVisible()
        const snapshot = await until(async () => {
          const value = await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId })
          if (value.approvals.some((item) => item.id === pending.id)) throw new Error('Approval has not settled yet')
          return value
        })
        return {
          ui: [
            {
              description: 'denied approval resolves once',
              passed: await deniedApproval.getByText('Resolved').isVisible(),
            },
            {
              description: 'decision buttons cannot be submitted twice',
              passed: await deniedApproval.getByRole('button', { name: 'Deny' }).isDisabled(),
            },
          ],
          host: [
            {
              description: 'Host denies the approval and does not create the file',
              passed:
                !snapshot.approvals.some((item) => item.id === pending.id) &&
                !(await fileExists(join(root, 'denied.txt'))),
            },
          ],
          hostFact: { resolvedApproval: pending.id, pendingApprovals: snapshot.approvals, fileExists: false },
        }
      },
    )

    await harness.writeReport({ requireComplete: false })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
