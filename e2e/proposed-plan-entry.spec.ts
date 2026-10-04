import { expect, test, type Page } from '@playwright/test'
import { createConfigurationCommandClient, createFileCommandClient, createRunCommandClient } from '@hbar/client'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function holdProposalAcceptance(page: Page) {
  const envelope = z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      method: z.string().optional(),
      params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
    })
    .passthrough()
  const ids = new Set<string | number>()
  let release: (() => void) | null = null
  await page.routeWebSocket('**/rpc', (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = envelope.safeParse(JSON.parse(message))
        if (
          parsed.success &&
          parsed.data.method === 'command.execute' &&
          parsed.data.params?.commandId === 'run.submit' &&
          parsed.data.id !== undefined
        )
          ids.add(parsed.data.id)
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = envelope.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined && ids.delete(parsed.data.id)) {
          release = () => socket.send(message)
          return
        }
      }
      socket.send(message)
    })
  })
  return {
    held: () => release !== null,
    release() {
      if (!release) throw new Error('The actual proposal acceptance reply is not held')
      const current = release
      release = null
      current()
    },
  }
}

async function seedProposal(host: WebSessionHost, name: string) {
  const sessionId = host.ready.sessionId
  const before = `Context before the plan — ${name}`
  const after = `Context after the plan — ${name}`
  const markdown = `# ${name}\n\n## Implementation\n\n1. Preserve the current composer draft.\n2. Keep the uploaded attachment.\n\n## Verification\n\n- Check keyboard actions and narrow screens.`
  const runs = createRunCommandClient(host.client)
  const accepted = await runs.execute(
    'run.submit',
    {
      sessionId,
      modelId: 'local-fixture',
      input: {
        text: `${before}\n\n<proposed_plan>\n${markdown}\n</proposed_plan>\n\n${after}`,
        images: [],
        mode: 'plan',
      },
    },
    { idempotencyKey: crypto.randomUUID() },
  )
  await expect
    .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
    .toBe('completed')
  const snapshot = await host.client.call('session.snapshot', { sessionId })
  const message = snapshot.messages.find((item) => item.runId === accepted.operationId && item.role === 'assistant')
  if (!message) throw new Error('The real fixture Run did not produce an assistant proposal')
  expect(snapshot.runs.find((run) => run.id === message.runId)?.input.mode).toBe('plan')
  expect(message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')).toContain(
    `<proposed_plan>\n${markdown}\n</proposed_plan>`,
  )
  return { message, before, after, markdown }
}

async function unchangedHostFacts(host: WebSessionHost) {
  const sessionId = host.ready.sessionId
  return {
    permission: await host.client.call('permission.get', {}),
    mode: await host.client.call('mode.get', { sessionId }),
    goal: await host.client.call('goal.get', { sessionId }),
    progress: await host.client.call('plan.get', { sessionId }),
    approvals: (await host.client.call('session.snapshot', { sessionId })).approvals,
  }
}

async function selectSession(page: Page, host: WebSessionHost, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const session = await host.client.call('session.get', { sessionId: host.ready.sessionId })
  if (!session) throw new Error('The proposal session disappeared before navigation')
  const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await showSidebar.isVisible()) await showSidebar.click()
  await page.getByRole('button', { name: copy.shell.openSession(session.title), exact: true }).click()
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`completed Plan proposals act from the original message without consuming the composer: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-proposed-plan-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    const labels = copy.session.proposedPlan
    const draft = 'Unsent draft stays here — 未发送的草稿保持原位'
    const attachmentName = 'proposal-composer-draft.txt'
    const attachmentText = 'This file belongs to the unsent composer draft, never the detached proposal request.'
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const selectedHost = host
      const sessionId = host.ready.sessionId
      // Persisted Plan mode makes an accidental inherited-mode implementation request detectable.
      await createConfigurationCommandClient(host.client).execute('mode.set', { sessionId, mode: 'plan' })
      const initial = await seedProposal(host, `Original proposal — ${locale}`)
      const baseline = await unchangedHostFacts(host)
      expect(baseline).toMatchObject({ mode: { mode: 'plan' }, goal: { goal: null }, progress: null, approvals: [] })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const acceptance = await holdProposalAcceptance(page)
      await page.addInitScript(() => {
        const events: Array<{ type: string; key: string; target: string; active: string }> = []
        Object.defineProperty(window, '__proposalFocusAudit', { value: events })
        for (const type of ['focusin', 'keydown'])
          document.addEventListener(
            type,
            (event) => {
              const describe = (node: EventTarget | null) =>
                node instanceof Element
                  ? `${node.tagName}.${node.className}:${node.getAttribute('data-proposal-message') ?? ''}:${node.textContent?.slice(0, 60) ?? ''}`
                  : ''
              events.push({
                type,
                key: event instanceof KeyboardEvent ? event.key : '',
                target: describe(event.target),
                active: describe(document.activeElement),
              })
              if (events.length > 80) events.shift()
            },
            true,
          )
      })
      await page.goto(base)
      await selectSession(page, host, locale)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(prompt).toBeEditable()
      await prompt.fill(draft)
      const chooser = page.waitForEvent('filechooser')
      const upload = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/artifacts')
      await page.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      await page
        .getByRole('group', { name: copy.session.addMenu.menu })
        .getByRole('button', { name: copy.session.addMenu.files, exact: true })
        .click()
      await (
        await chooser
      ).setFiles({ name: attachmentName, mimeType: 'text/plain', buffer: Buffer.from(attachmentText) })
      expect((await upload).ok()).toBe(true)
      const attachment = page.getByText(attachmentName, { exact: true })
      await expect(attachment).toBeVisible()
      const artifact = await createFileCommandClient(host.client).execute('attachment.query', {
        artifactId: createHash('sha256').update(attachmentText).digest('hex'),
      })
      expect(artifact).toMatchObject({ name: attachmentName, size: Buffer.byteLength(attachmentText) })

      const message = page.locator(`[data-message-id="${initial.message.id}"]`)
      const proposal = message.locator(`.hbar-proposed-plan[data-proposal-message="${initial.message.id}"]`)
      await expect(message).toHaveAttribute('data-role', 'assistant')
      await expect(proposal).toHaveCount(1)
      await expect(page.locator('[data-message-id][data-role="user"] .hbar-proposed-plan')).toHaveCount(0)
      await expect(message).toContainText(initial.before)
      await expect(message).toContainText(initial.after)
      await expect(message).not.toContainText('<proposed_plan>')
      await expect(message).not.toContainText('</proposed_plan>')
      await expect(proposal.getByRole('region', { name: labels.document, exact: true })).toContainText(
        'Preserve the current composer draft.',
      )
      const order = await message.evaluate(
        (element, markers) => {
          const card = element.querySelector('.hbar-proposed-plan')
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          let before: Node | null = null
          let after: Node | null = null
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.textContent?.includes(markers.before)) before = node
            if (node.textContent?.includes(markers.after)) after = node
          }
          return Boolean(
            card &&
            before &&
            after &&
            before.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING &&
            card.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
          )
        },
        { before: initial.before, after: initial.after },
      )
      expect(order).toBe(true)

      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await proposal.scrollIntoViewIfNeeded()
        await expect(proposal.getByRole('button', { name: labels.implement, exact: true })).toBeEnabled()
        await expect(proposal.getByRole('button', { name: labels.continuePlanning, exact: true })).toBeEnabled()
        await expect(proposal.locator('.hbar-proposed-plan-scope')).toHaveText(labels.scope)
        await expect(proposal.getByRole('button', { name: labels.implement, exact: true })).toHaveAccessibleDescription(
          labels.scope,
        )
        await expect(
          proposal.getByRole('button', { name: labels.continuePlanning, exact: true }),
        ).toHaveAccessibleDescription(labels.scope)
        await expectComposerText(prompt, draft)
        await expect(attachment).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        const bounds = await proposal.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`proposal-ready-${locale}-${width}.png`) })
      }

      const previousRunIds = new Set(
        (await host.client.call('session.snapshot', { sessionId })).runs.map((run) => run.id),
      )
      const implement = proposal.getByRole('button', { name: labels.implement, exact: true })
      await implement.focus()
      await page.keyboard.press('Enter')
      await expect.poll(acceptance.held).toBe(true)
      await expect(implement).toBeDisabled()
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
      await page.keyboard.press('Enter')
      acceptance.release()
      await expect(proposal.getByRole('status')).toHaveText(labels.accepted)
      await expect(proposal.getByRole('button')).toHaveCount(0)
      await expect(proposal.getByRole('textbox')).toHaveCount(0)
      await writeFile(
        testInfo.outputPath('implementation-focus-events.json'),
        JSON.stringify(await page.evaluate(() => Reflect.get(window, '__proposalFocusAudit') as unknown), null, 2),
      )
      await expect(proposal).toBeFocused()
      await expect
        .poll(async () => {
          const snapshot = await selectedHost.client.call('session.snapshot', { sessionId })
          return snapshot.runs.filter((run) => !previousRunIds.has(run.id)).map((run) => run.status)
        })
        .toEqual(['completed'])
      const afterImplementation = await host.client.call('session.snapshot', { sessionId })
      const implementationRuns = afterImplementation.runs.filter((run) => !previousRunIds.has(run.id))
      expect(implementationRuns).toHaveLength(1)
      expect(implementationRuns[0]?.input).toMatchObject({ mode: 'default', source: 'user', images: [], files: [] })
      expect(implementationRuns[0]?.input.approval).toBe(baseline.permission.mode)
      expect(implementationRuns[0]?.input.text).toContain(initial.markdown)
      await expectComposerText(prompt, draft)
      await expect(attachment).toBeVisible()
      const afterImplementationFacts = await unchangedHostFacts(host)
      expect(afterImplementationFacts).toEqual({ ...baseline, mode: { mode: 'default' } })
      await page.screenshot({ path: testInfo.outputPath(`proposal-implemented-${locale}-320.png`) })

      // A second, genuinely completed assistant Plan provides an independent refinement target.
      const revision = await seedProposal(host, `Refinement proposal — ${locale}`)
      const revisedMessage = page.locator(`[data-message-id="${revision.message.id}"]`)
      const revised = revisedMessage.locator(`.hbar-proposed-plan[data-proposal-message="${revision.message.id}"]`)
      await expect(revised).toBeVisible()
      await expect(message.getByRole('region', { name: copy.session.proposedPlanReadOnly, exact: true })).toBeVisible()
      await expect(message.getByRole('button', { name: labels.implement, exact: true })).toHaveCount(0)
      await expect(message.getByRole('button', { name: labels.continuePlanning, exact: true })).toHaveCount(0)
      await expect(message).toContainText(initial.before)
      await expect(message).toContainText(initial.after)
      await expect(message).not.toContainText('<proposed_plan>')
      const feedback = 'Add rollback verification — 增加回滚验证。'
      await revised.getByRole('textbox', { name: labels.feedback, exact: true }).fill(feedback)
      await page.screenshot({ path: testInfo.outputPath(`proposal-feedback-${locale}-320.png`) })
      const beforeRefinementIds = new Set(
        (await host.client.call('session.snapshot', { sessionId })).runs.map((run) => run.id),
      )
      await revised.getByRole('button', { name: labels.continuePlanning, exact: true }).focus()
      await page.keyboard.press('Space')
      await expect.poll(acceptance.held).toBe(true)
      await expect(revised.getByRole('button', { name: labels.continuePlanning, exact: true })).toBeDisabled()
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
      await page.keyboard.press('Space')
      acceptance.release()
      await expect(revised.getByRole('status')).toHaveText(labels.accepted)
      await expect(revised.getByRole('button')).toHaveCount(0)
      await expect(revised.getByRole('textbox')).toHaveCount(0)
      await writeFile(
        testInfo.outputPath('refinement-focus-events.json'),
        JSON.stringify(await page.evaluate(() => Reflect.get(window, '__proposalFocusAudit') as unknown), null, 2),
      )
      await expect(revised)
        .toBeFocused()
        .catch(async (error: unknown) => {
          await testInfo.attach('proposal-focus-events', {
            body: JSON.stringify(
              await page.evaluate(() => Reflect.get(window, '__proposalFocusAudit') as unknown),
              null,
              2,
            ),
            contentType: 'application/json',
          })
          throw error
        })
      await expect
        .poll(async () => {
          const snapshot = await selectedHost.client.call('session.snapshot', { sessionId })
          return snapshot.runs.filter((run) => !beforeRefinementIds.has(run.id)).map((run) => run.status)
        })
        .toEqual(['completed'])
      const afterRefinement = await host.client.call('session.snapshot', { sessionId })
      const refinementRuns = afterRefinement.runs.filter((run) => !beforeRefinementIds.has(run.id))
      expect(refinementRuns).toHaveLength(1)
      expect(refinementRuns[0]?.input).toMatchObject({ mode: 'plan', source: 'user', images: [], files: [] })
      expect(refinementRuns[0]?.input.approval).toBe(baseline.permission.mode)
      expect(refinementRuns[0]?.input.text).toContain(revision.markdown)
      expect(refinementRuns[0]?.input.text).toContain(feedback)
      await expectComposerText(prompt, draft)
      await expect(attachment).toBeVisible()
      expect(await unchangedHostFacts(host)).toEqual(afterImplementationFacts)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
