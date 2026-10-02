import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-command-reading-'))
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
    })
    const originalHost = host
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    // Actual approved local command: only emits bounded text, no files/network.
    const command =
      process.platform === 'win32'
        ? "1..25 | ForEach-Object { Write-Output ('command reading line ' + $_) }"
        : 'i=1; while [ $i -le 25 ]; do printf \'command reading line %s\\n\' "$i"; i=$((i+1)); done'
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
    await card.getByRole('button', { name: copy.session.messageBlocks.toolResultCopy.copy, exact: true }).click()
    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'))
      .toBe(result.text.replaceAll('\r\n', '\n'))
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
