import { expect, test } from '@playwright/test'
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupOwnedFixture(root: string): Promise<void> {
  const stat = await lstat(root)
  const target = await realpath(root)
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    target !== resolve(root) ||
    dirname(target) !== (await realpath(tmpdir())) ||
    !basename(target).startsWith('hbar-command-reading-')
  )
    throw new Error('Invalid owned command fixture cleanup')
  await rm(target, { recursive: true, force: true })
}

test('real command approval, result reading and full Copy return to the original draft', async ({ browser }, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-command-reading-'))
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const copy = getShellCopy('zh-CN')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const originalHost = host
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    // Actual approved local command: only emits bounded text, no files/network.
    const command =
      process.platform === 'win32'
        ? "1..25 | ForEach-Object { if ($_ -eq 1) { Write-Output (([string][char]27) + '[32mold progress' + ([string][char]13) + 'command reading line ' + $_ + ([string][char]27) + '[0m') } else { Write-Output ('command reading line ' + $_) } }"
        : "printf '\\033[32mold progress\\rcommand reading line 1\\033[0m\\n'; i=2; while [ $i -le 25 ]; do printf 'command reading line %s\\n' \"$i\"; i=$((i+1)); done"
    await prompt.fill(`/tool shell ${JSON.stringify({ command })}`)
    await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    await expect
      .poll(
        async () =>
          (
            await originalHost.client.call('session.snapshot', { sessionId: originalHost.ready.sessionId })
          ).approvals.find((item) => item.tool === 'shell' && item.status === 'pending')?.id ?? null,
      )
      .not.toBeNull()
    const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
    const approval = snapshot.approvals.find((item) => item.tool === 'shell' && item.status === 'pending')
    if (!approval) throw new Error('Missing owned command approval')
    const draft = '继续保留这份未发送草稿；查看输出不应变成新一轮。'
    await prompt.fill(draft)
    await page
      .locator(`[data-decision-id="${approval.id}"]`)
      .getByRole('button', { name: copy.session.decisions.allow, exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await originalHost.client.call('session.snapshot', { sessionId: originalHost.ready.sessionId })).runs.find(
            (run) => run.id === approval.runId,
          )?.status,
      )
      .toBe('completed')
    const settled = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
    const call = settled.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_call' && block.callId === approval.callId)
    const result = settled.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.callId === approval.callId)
    if (call?.type !== 'tool_call' || result?.type !== 'tool_result') throw new Error('Missing actual command facts')
    expect(call.presentation).toMatchObject({ kind: 'command', commandField: 'command' })
    expect(result.outcome?.kind).toBe('succeeded')
    expect(result.text).toContain('command reading line 25')
    const tool = page.locator(`.hbar-session-tool[data-tool-call-id="${approval.callId}"]`)
    const disclosure = tool.locator(':scope > .hbar-session-disclosure-trigger')
    await disclosure.focus()
    await disclosure.press('Enter')
    const card = tool.locator('.hbar-session-command')
    await expect(card.locator('.hbar-session-command-input pre')).toHaveText(command)
    await expect(card.locator('[data-command-output-tail]')).toBeHidden()
    await expect(card.locator('[data-command-output]')).toHaveAttribute('data-command-output-view', 'reading')
    expect(await card.locator('[data-command-output]').textContent()).not.toContain('old progress')
    await card.getByRole('button', { name: copy.session.messageBlocks.toolResultCopy.copy, exact: true }).click()
    await expect
      // Windows clipboard transport normalizes both CRLF and lone CR to EOL.
      // Controlled Copy-port coverage separately asserts the exact raw bytes.
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n?/gu, '\n'))
      .toBe(result.text.replace(/\r\n?/gu, '\n'))
    const rawToggle = card.locator('.hbar-session-command-view-toggle')
    await rawToggle.click()
    expect(await card.locator('[data-command-output]').textContent()).toBe(result.text)
    await rawToggle.click()
    await card.getByRole('button', { name: copy.session.messageBlocks.showMoreOutput(13), exact: true }).click()
    await expect(card.locator('[data-command-output-tail]')).toBeVisible()
    await card.getByRole('button', { name: copy.session.messageBlocks.originalInput, exact: true }).click()
    await expect(card.locator('.hbar-session-command-original pre')).toHaveText(JSON.stringify(call.args, null, 2))
    await page.setViewportSize({ width: 320, height: 900 })
    await page.screenshot({ path: info.outputPath('command-reading-host-zh-CN-320.png') })
    await disclosure.focus()
    await disclosure.press('Space')
    await expect(card).toHaveCount(0)
    await prompt.focus()
    await expectComposerText(prompt, draft)
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(
      settled.runs.length,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupOwnedFixture(root)
  }
})
