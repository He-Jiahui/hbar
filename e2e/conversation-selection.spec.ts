import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const messageWrapper = (role: 'user' | 'assistant') => `[data-hbar-conversation-selection-message="${role}"]`
const selectionMenu = '[data-hbar-conversation-selection-menu]'
const chatSelectionCards = '.hbar-composer-workspace-context-card[data-kind="chat-selection"]'

async function removeOwnedTemporaryDirectory(path: string): Promise<void> {
  const target = resolve(path)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-conversation-selection-'))
    throw new Error(`Refusing to remove unexpected temporary directory: ${target}`)
  await rm(target, { recursive: true, force: true })
}

function messageText(message: {
  readonly content: readonly { readonly type: string; readonly text?: string | undefined }[]
}): string {
  return message.content.flatMap((block) => (block.type === 'text' && block.text ? [block.text] : [])).join('\n')
}

async function selectPassage(
  message: Locator,
  startMarker: string,
  endMarker: string,
  literal = false,
): Promise<string> {
  await message.scrollIntoViewIfNeeded()
  // As in a real selection gesture, pointerdown cancels the viewport's bounded
  // follow-latest correction before we position the selected authored passage.
  await message.dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0, buttons: 1 })
  const quote = await message.evaluate(
    async (element, markers) => {
      const textNodes: Text[] = []
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (node instanceof Text && node.data.length > 0) textNodes.push(node)
      }

      const startNode = textNodes.find((node) => node.data.includes(markers.start))
      const endNode = textNodes.findLast((node) => node.data.includes(markers.end))
      if (!startNode || !endNode) throw new Error('Rendered authored message is missing the selection markers')

      const range = document.createRange()
      range.setStart(startNode, startNode.data.indexOf(markers.start))
      range.setEnd(endNode, endNode.data.indexOf(markers.end) + markers.end.length)
      const pane = element.closest<HTMLElement>('.lumen-conversation-messages')
      if (!pane) throw new Error('Selected message has no owning transcript viewport')
      const initialBounds = range.getBoundingClientRect()
      pane.scrollTop += initialBounds.top - pane.getBoundingClientRect().top - 4
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const paneBounds = pane.getBoundingClientRect()
      const visibleRects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
      if (
        visibleRects.length === 0 ||
        visibleRects.some((rect) => rect.top < paneBounds.top - 1 || rect.bottom > paneBounds.bottom + 1)
      )
        throw new Error('The selected passage is not fully visible in the transcript viewport')
      const selection = document.getSelection()
      if (!selection) throw new Error('Browser text selection is unavailable')
      selection.removeAllRanges()
      selection.addRange(range)
      return selection.toString().trim()
    },
    { start: startMarker, end: endMarker },
  )
  expect(quote).toContain(startMarker)
  expect(quote).toContain(endMarker)
  if (literal) {
    expect(quote).toContain('**')
    expect(quote).toContain('`')
  } else {
    expect(quote).not.toContain('**')
    expect(quote).not.toContain('`')
  }

  // Finish the same pointer lifecycle after creating the native browser Range.
  await message.dispatchEvent('pointerup', { pointerType: 'mouse', button: 0, buttons: 0 })
  return quote
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name)
  await mkdir(dirname(path), { recursive: true })
  await page.screenshot({ path })
}

async function setSidebar(page: Page, copy: ReturnType<typeof getShellCopy>, open: boolean): Promise<void> {
  const shell = page.locator('[data-lumen-shell="app"]')
  if ((await shell.getAttribute('data-sidebar-open')) !== String(open)) {
    await page
      .getByRole('button', { name: open ? copy.shell.showSidebar : copy.shell.hideSidebar, exact: true })
      .click()
  }
  await expect(shell).toHaveAttribute('data-sidebar-open', String(open))
}

async function openSessionFromSidebar(
  page: Page,
  copy: ReturnType<typeof getShellCopy>,
  title: string,
  width: number,
): Promise<void> {
  const openSession = page.getByRole('button', { name: copy.shell.openSession(title), exact: true })
  if (!(await openSession.isVisible())) await setSidebar(page, copy, true)
  await openSession.click()
  await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
  // Narrow navigation closes the drawer itself after its async Session selection.
  // Do not race that transition by clicking a close button that has disappeared.
  if (width === 320) {
    await expect(page.locator('[data-lumen-shell="app"]')).toHaveAttribute('data-sidebar-open', 'false')
    await expect(page.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeVisible()
  }
}

async function expectViewportFits(page: Page, width: number): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const menu = page.locator(selectionMenu)
  if (await menu.isVisible()) {
    const bounds = await menu.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(-1)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
    const paneBounds = await page.locator('.lumen-conversation-messages').boundingBox()
    expect(paneBounds).not.toBeNull()
    expect(bounds!.y).toBeGreaterThanOrEqual(paneBounds!.y - 1)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(paneBounds!.y + paneBounds!.height + 1)
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`authored user and assistant selections stay with their draft and accepted Run: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const width = locale === 'en-US' ? 1440 : 320
    const height = locale === 'en-US' ? 900 : 844
    const root = await mkdtemp(join(tmpdir(), 'hbar-conversation-selection-'))
    const context = await browser.newContext({ locale, viewport: { width, height } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined

    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        sessionCount: 2,
      })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )

      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await openSessionFromSidebar(page, copy, host.ready.sessionTitle, width)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })

      const sourcePrompt =
        'Please keep this message available as a source.\n\nFirst **bold selection begins**; keep this thought.\n\nSecond paragraph ends in `inline-code selection ends`.'
      const startMarker = 'bold selection begins'
      const endMarker = 'inline-code selection ends'
      await prompt.fill(sourcePrompt)
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()

      await expect
        .poll(async () => {
          const snapshot = await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 60 })
          return (
            snapshot.messages.some(
              (message) => message.role === 'assistant' && messageText(message).includes(startMarker),
            ) && snapshot.runs.some((run) => run.status === 'completed')
          )
        })
        .toBe(true)

      const sourceSnapshot = await host.client.call('session.snapshot', {
        sessionId: host.ready.sessionId,
        limit: 60,
      })
      const userMessage = sourceSnapshot.messages.find(
        (message) => message.role === 'user' && messageText(message) === sourcePrompt,
      )
      const assistantMessage = sourceSnapshot.messages.find(
        (message) => message.role === 'assistant' && messageText(message).includes(startMarker),
      )
      expect(userMessage).toBeDefined()
      expect(assistantMessage).toBeDefined()
      const userTranscript = page.locator(`.lumen-message-transcript[data-message-id="${userMessage!.id}"]`)
      const assistantTranscript = page.locator(`.lumen-message-transcript[data-message-id="${assistantMessage!.id}"]`)
      await expect(userTranscript.locator(messageWrapper('user'))).toBeVisible()
      await expect(assistantTranscript.locator(messageWrapper('assistant'))).toBeVisible()

      // Give Session B an independent local draft before adding references to Session A.
      await openSessionFromSidebar(page, copy, 'Session 001', width)
      const otherPrompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const otherDraft = 'Keep this text only in Session B.'
      await otherPrompt.fill(otherDraft)
      await page.getByRole('tab', { name: host.ready.sessionTitle, exact: true }).click()
      await expectComposerText(prompt, '')

      const sessionSnapshot = () =>
        host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 60 })
      expect((await sessionSnapshot()).runs.filter((run) => run.input.source === 'user')).toHaveLength(1)

      const menu = page.locator(selectionMenu)
      const addToChat = () =>
        menu.getByRole('button', { name: copy.session.conversationSelection.addToChat, exact: true })
      const cards = page.locator(chatSelectionCards)

      const userQuote = await selectPassage(
        userTranscript.locator(messageWrapper('user')),
        startMarker,
        endMarker,
        true,
      )
      await expect(menu).toBeVisible()
      await expect(addToChat()).toBeEnabled()
      await expect(addToChat()).toHaveAttribute('data-hbar-conversation-selection-add')
      await expectViewportFits(page, width)
      await capture(page, testInfo, `user-selection-menu-${locale}-${width}.png`)
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await expect(cards).toHaveCount(0)

      // Add the same user quote twice. The second action must be idempotent.
      await selectPassage(userTranscript.locator(messageWrapper('user')), startMarker, endMarker, true)
      await expect(menu).toBeVisible()
      await addToChat().click()
      await expect(menu).toHaveCount(0)
      await expect(cards).toHaveCount(1)
      await expect(cards.first().locator('.hbar-composer-workspace-context-note')).toHaveText(userQuote)

      await selectPassage(userTranscript.locator(messageWrapper('user')), startMarker, endMarker, true)
      await expect(menu).toBeVisible()
      await addToChat().click()
      await expect(cards).toHaveCount(1)
      const userCard = page.locator(
        `${chatSelectionCards}:has(.hbar-composer-workspace-context-address[title*="${userMessage!.id}"])`,
      )
      await expect(userCard).toHaveCount(1)
      const userLocation = userCard.locator('.hbar-composer-workspace-context-address')
      const userLocationTitle = await userLocation.getAttribute('title')
      expect(userLocationTitle).toContain(host.ready.sessionId)
      expect(userLocationTitle).toContain(userMessage!.id)

      const finalDraft = 'Continue with the two selected references.'
      await prompt.fill(finalDraft)
      const assistantQuote = await selectPassage(
        assistantTranscript.locator(messageWrapper('assistant')),
        startMarker,
        endMarker,
      )
      await expect(menu).toBeVisible()
      await expectViewportFits(page, width)
      await capture(page, testInfo, `assistant-selection-menu-${locale}-${width}.png`)
      await addToChat().click()
      await expect(cards).toHaveCount(2)
      await expect(cards.nth(1).locator('.hbar-composer-workspace-context-note')).toHaveText(assistantQuote)

      // Removing one reference must not edit the user's own prompt; then add it back for the final Run.
      await userCard.locator('.hbar-composer-workspace-context-remove').click()
      await expect(cards).toHaveCount(1)
      await expectComposerText(prompt, finalDraft)
      await selectPassage(userTranscript.locator(messageWrapper('user')), startMarker, endMarker, true)
      await expect(menu).toBeVisible()
      await addToChat().click()
      await expect(cards).toHaveCount(2)

      const assistantCard = page.locator(
        `${chatSelectionCards}:has(.hbar-composer-workspace-context-address[title*="${assistantMessage!.id}"])`,
      )
      await expect(assistantCard).toHaveCount(1)
      const assistantLocationTitle = await assistantCard
        .locator('.hbar-composer-workspace-context-address')
        .getAttribute('title')
      expect(assistantLocationTitle).toContain(host.ready.sessionId)
      expect(assistantLocationTitle).toContain(assistantMessage!.id)
      await expectViewportFits(page, width)
      await capture(page, testInfo, `ready-context-cards-${locale}-${width}.png`)

      // A reference and its quote stay in A; B keeps only its own text.
      await openSessionFromSidebar(page, copy, 'Session 001', width)
      await expect(page.locator(chatSelectionCards)).toHaveCount(0)
      await expectComposerText(otherPrompt, otherDraft)
      await page.getByRole('tab', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(cards).toHaveCount(2)
      await expectComposerText(prompt, finalDraft)

      expect((await sessionSnapshot()).runs.filter((run) => run.input.source === 'user')).toHaveLength(1)
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(async () => (await sessionSnapshot()).runs.filter((run) => run.input.source === 'user').length)
        .toBe(2)

      const submitted = await sessionSnapshot()
      const acceptedRun = submitted.runs.find(
        (run) => run.input.source === 'user' && run.input.text.startsWith(finalDraft),
      )
      expect(acceptedRun).toBeDefined()
      expect(acceptedRun!.input.text).toContain('Referenced chat context:')
      const userAddress = `chat://${encodeURIComponent(host.ready.sessionId)}/user/${encodeURIComponent(userMessage!.id)}`
      const assistantAddress = `chat://${encodeURIComponent(host.ready.sessionId)}/assistant/${encodeURIComponent(assistantMessage!.id)}`
      expect(acceptedRun!.input.text).toContain(userAddress)
      expect(acceptedRun!.input.text).toContain(assistantAddress)
      expect(acceptedRun!.input.text).toContain(userQuote)
      expect(acceptedRun!.input.text).toContain(assistantQuote)
      await expectComposerText(prompt, '')
      await expect(cards).toHaveCount(0)
      await expectViewportFits(page, width)
      await capture(page, testInfo, `accepted-run-cleared-${locale}-${width}.png`)

      await page.getByRole('tab', { name: 'Session 001', exact: true }).click()
      await expect(page.locator(chatSelectionCards)).toHaveCount(0)
      await expectComposerText(otherPrompt, otherDraft)
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await removeOwnedTemporaryDirectory(root)
        }
      }
    }
  })
}
