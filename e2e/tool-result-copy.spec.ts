import { expect, test, type Locator, type Page } from '@playwright/test'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { authored, calls, otherRunText, otherSessionText } from '../tests/fixtures/tool-result-copy-fixtures'

const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const phase = process.env.HBAR_TOOL_COPY_PHASE === 'baseline' ? 'baseline' : 'final'
const evidence = `artifacts/tool-result-copy/evidence/${phase}`
const readySchema = z.object({
  token: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  sessionId: z.string().min(1),
  sessionTitle: z.string().min(1),
  otherSessionId: z.string().min(1),
  otherSessionTitle: z.string().min(1),
  aMessageId: z.string().min(1),
})
type CopyHost = Omit<WebSessionHost, 'ready'> & { readonly ready: z.output<typeof readySchema> }

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun is unavailable for the owned clipboard Host fixture')
  return executable
}

async function startCopyHost(root: string): Promise<CopyHost> {
  const child = spawn(bunExecutable(), ['e2e/support/tool-result-copy-host.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HBAR_COPY_FIXTURE_ROOT: root,
      HBAR_E2E_HOST_PORT: String(port),
      HBAR_COPY_FIXTURE_ORIGIN: base,
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (chunk: unknown) => {
    stderr += String(chunk)
  })
  if (!child.stdout) throw new Error('Owned fixture protocol stdout is missing')
  const output = createInterface({ input: child.stdout })
  try {
    const ready = await new Promise<z.output<typeof readySchema>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Owned clipboard Host startup timed out: ${stderr}`)), 20_000)
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Owned clipboard Host exited ${code}: ${stderr}`))
      })
      output.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            clearTimeout(timer)
            resolve(parsed.data)
          }
        } catch {
          /* Non-protocol startup diagnostics are not a ready signal. */
        }
      })
    })
    const url = `http://127.0.0.1:${port}`
    const client = new HbarClient(url, ready.token)
    await client.connect()
    return { child, ready, client, url }
  } catch (error) {
    child.kill()
    throw error
  } finally {
    output.close()
  }
}

async function cleanupRoot(root: string): Promise<void> {
  const resolved = await realpath(root)
  if (dirname(resolved) !== (await realpath(tmpdir())) || !basename(resolved).startsWith('hbar-tool-result-copy-'))
    throw new Error('Refusing cleanup outside the owned clipboard fixture')
  await rm(resolved, { recursive: true, force: true })
}

async function showSidebar(page: Page, locale: ShellLocale): Promise<void> {
  const show = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
}

async function hideSidebar(page: Page, locale: ShellLocale): Promise<void> {
  const hide = page.getByRole('button', { name: getShellCopy(locale).shell.hideSidebar, exact: true })
  if (await hide.isVisible()) await hide.click()
}

async function clipboardText(page: Page): Promise<string> {
  return (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')
}

async function copyOutput(page: Page, output: Locator, text: string, locale: ShellLocale): Promise<void> {
  const labels = getShellCopy(locale).session.messageBlocks.toolResultCopy
  const action = output.locator('[data-copy-status]')
  await expect(action).toHaveAttribute('data-copy-status', 'idle')
  const button = output.getByRole('button', { name: labels.copy, exact: true })
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(action).toHaveAttribute('data-copy-status', 'copied')
  await expect.poll(() => clipboardText(page)).toBe(text)
}

async function assertFlow(page: Page, output: Locator): Promise<void> {
  const heading = output.locator('.hbar-session-tool-result-heading')
  await expect(heading.getByRole('button')).toHaveCount(1)
  expect(await heading.evaluate((element) => getComputedStyle(element).display)).toBe('flex')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`tool output Copy belongs to the original loaded result and uses the real clipboard: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-tool-result-copy-'))
    const context = await browser.newContext({
      locale,
      viewport: { width: 1440, height: 960 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    let host: CopyHost | undefined
    try {
      host = await startCopyHost(root)
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const copy = getShellCopy(locale)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const message = page.locator(`[data-message-id="${host.ready.aMessageId}"]`)
      await expect(message).toContainText(authored)
      await message.locator('.hbar-session-activity-summary').click()
      const row = message.locator('.hbar-session-tool').filter({
        has: page.getByRole('button', {
          name: `${calls[0].name} ${copy.session.messageBlocks.resultAvailable}`,
          exact: true,
        }),
      })
      await row.locator('.hbar-session-disclosure-trigger').focus()
      await page.keyboard.press('Enter')
      const output = row.locator('.hbar-session-tool-section').last()
      await expect(output.locator('pre')).toHaveText(calls[0].text)
      await row.screenshot({ path: `${evidence}/output-local-${locale}-1440.png` })
      // Accurate baseline: the old production output renders this section with no Copy action.
      await expect(output.getByRole('button')).toHaveCount(1)
      await copyOutput(page, output, calls[0].text, locale)
      const observations: unknown[] = []
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await hideSidebar(page, locale)
        for (const call of calls) {
          const toolRow = message.locator('.hbar-session-tool').filter({
            has: page.getByRole('button', {
              name: `${call.name} ${call.isError ? copy.session.messageBlocks.failed : copy.session.messageBlocks.resultAvailable}`,
              exact: true,
            }),
          })
          const section = toolRow.locator(`[data-tool-call-id="${call.callId}"][data-tool-name="${call.name}"]`)
          const disclosure = toolRow.locator('.hbar-session-disclosure-trigger')
          if (!(await section.isVisible())) {
            await disclosure.focus()
            await page.keyboard.press('Space')
          }
          const input = toolRow.locator('.hbar-session-tool-section').first()
          await expect(input.locator('pre')).toHaveText(JSON.stringify(call.args, null, 2))
          if (!call.text) {
            await expect(section).toContainText(copy.session.messageBlocks.emptyOutput)
            await expect(section.locator('.hbar-session-tool-result-copy')).toHaveCount(0)
            continue
          }
          if (call.text.length > 12_000) {
            await expect(section.locator('pre')).not.toHaveText(call.text)
            await expect(
              section.getByRole('button', { name: copy.session.messageBlocks.showFullContent, exact: true }),
            ).toBeVisible()
          } else await expect(section.locator('pre')).toHaveText(call.text)
          await copyOutput(page, section, call.text, locale)
          await assertFlow(page, section)
          if (call.name === 'read_file' || call.name === 'execute_command') {
            await toolRow.screenshot({ path: `${evidence}/output-${call.name}-${locale}-${width}.png` })
          }
          observations.push({
            width,
            callId: call.callId,
            name: call.name,
            textLength: call.text.length,
            copiedComplete: true,
          })
        }
        const bodyCopy = message.locator('.hbar-session-message-copy')
        await expect(bodyCopy).toHaveAttribute(
          'aria-label',
          new RegExp(`^(${copy.session.messageActions.copy}|${copy.session.messageActions.copied})$`),
        )
        await bodyCopy.click()
        await expect.poll(() => clipboardText(page)).toBe(authored)
        const otherRun = page.locator('[data-message-id="copy-fixture-message-other-run"]')
        const otherRunOutput = otherRun.locator('[data-tool-call-id="shared-call-id"][data-tool-name="read_file"]')
        if (!(await otherRunOutput.isVisible())) await otherRun.locator('.hbar-session-disclosure-trigger').click()
        await copyOutput(page, otherRunOutput, otherRunText, locale)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await showSidebar(page, locale)
      await page
        .getByRole('button', { name: copy.shell.openSession(host.ready.otherSessionTitle), exact: true })
        .click()
      const b = page.locator('[data-message-id="copy-fixture-message-b"]')
      await b.locator('.hbar-session-disclosure-trigger').click()
      await copyOutput(
        page,
        b.locator('[data-tool-call-id="shared-call-id"][data-tool-name="read_file"]'),
        otherSessionText,
        locale,
      )
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      // External archive is a real Host mutation. The retained observer can still
      // copy historical output; clipboard access is not new execution preparation.
      const commands = createWorkspaceSessionCommandClient(host.client)
      const archived = await commands.execute('session.archive', { sessionId: host.ready.sessionId, archived: true })
      expect(archived.archived).toBe(true)
      await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).click()
      await page
        .getByRole('menuitem', { name: copy.shell.roster.refreshWorkspace(host.ready.workspaceName), exact: true })
        .click()
      await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
      await hideSidebar(page, locale)
      if (!(await output.isVisible())) {
        const activity = message.locator('.hbar-session-activity-summary')
        if ((await activity.getAttribute('aria-expanded')) !== 'true') await activity.click()
        if (!(await output.isVisible())) await row.locator('.hbar-session-disclosure-trigger').click()
      }
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await copyOutput(page, output, calls[0].text, locale)
        await assertFlow(page, output)
        await row.screenshot({ path: `${evidence}/archived-output-${locale}-${width}.png` })
        await page.screenshot({ path: `${evidence}/archived-page-${locale}-${width}.png` })
      }
      await writeFile(
        `${evidence}/observation-${locale}.json`,
        JSON.stringify(
          {
            sessionId: host.ready.sessionId,
            actualHost: true,
            historicalSeedOnly: true,
            noDisplayedToolExecuted: true,
            observations,
            assistantCopyExcludesToolAndThinking: true,
            otherRunAndSessionMatched: true,
            archivedHistoryStillCopyable: true,
            errors,
          },
          null,
          2,
        ),
      )
      expect(errors).toEqual([])
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.otherSessionId })).runs).toHaveLength(
        0,
      )
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupRoot(root)
    }
  })
}
