import { expect, test } from '@playwright/test'
import { HbarClient } from '@hbar/client'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { stopOwnedWebSessionHostChild } from './support/web-session-host'

const readySchema = z.object({
  url: z.string().url(),
  token: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  controlUrl: z.string().url(),
  controlToken: z.string(),
})
const payloadSchema = z.array(z.object({ messages: z.array(z.object({ role: z.string(), content: z.unknown() })) }))

async function removeOwnedGuideFixture(root: string) {
  const owned = await realpath(root)
  if (
    dirname(owned).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(owned).startsWith('hbar-queued-guide-ui-')
  )
    throw new Error('Refusing non-owned guidance cleanup')
  await rm(owned, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

test('Guide consumes one queue row into the current Run while draft and remaining queue survive', async ({
  browser,
}, testInfo) => {
  test.setTimeout(60_000)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-queued-guide-ui-')))
  const child = spawn('bun', ['e2e/support/queued-run-guide-host.ts'], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HBAR_GUIDE_FIXTURE_ROOT: root,
      HBAR_GUIDE_FIXTURE_DIST: resolve(process.env.HBAR_E2E_PREVIEW_DIST ?? 'dist/web'),
    },
  })
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let client: HbarClient | undefined
  try {
    const output = createInterface({ input: child.stdout })
    const ready = await new Promise<z.output<typeof readySchema>>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned guidance Host startup timed out')), 15_000)
      let diagnostics = ''
      child.stderr.on('data', (chunk: unknown) => {
        diagnostics = `${diagnostics}${String(chunk)}`.slice(-8192)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Fixture exit ${code}: ${diagnostics}`))
      })
      output.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            clearTimeout(timer)
            done(parsed.data)
          }
        } catch {
          /* Non-protocol diagnostic. */
        }
      })
    }).finally(() => output.close())
    client = new HbarClient(ready.url, ready.token)
    await client.connect()
    const observer = client
    const controlHeaders = { Authorization: `Bearer ${ready.controlToken}` }
    const requests = async () =>
      payloadSchema.parse(
        await (await context.request.get(`${ready.controlUrl}/requests`, { headers: controlHeaders })).json(),
      )
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    await page.goto(ready.url)
    await page.getByRole('treeitem', { name: ready.sessionTitle, exact: true }).click()
    const composer = page.locator('.lumen-prompt-composer')
    const prompt = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await prompt.fill('开始检查当前任务')
    await composer.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
    await expect.poll(async () => (await requests()).length).toBe(1)
    const initial = (await observer.call('session.snapshot', { sessionId: ready.sessionId })).runs.find(
      (run) => run.status === 'running',
    )
    if (!initial) throw new Error('Initial Run missing')
    const selected = '请先检查当前更改与已有测试，然后在同一个任务中继续。'.repeat(12)
    const remaining = '整理测试结果后再提出下一步建议。'
    const queueButton = composer.getByRole('button', { name: copy.session.runningActions.queueLabel, exact: true })
    await prompt.fill(selected)
    await queueButton.click()
    await prompt.fill(remaining)
    await queueButton.click()
    await prompt.fill('保留这份尚未发送的草稿')
    const rows = page.locator('.hbar-queued-user-run')
    await expect(rows).toHaveCount(2)
    const snapshot = await observer.call('session.snapshot', { sessionId: ready.sessionId })
    const selectedRun = snapshot.runs.find((run) => run.input.text === selected)
    const remainingRun = snapshot.runs.find((run) => run.input.text === remaining)
    if (!selectedRun || !remainingRun) throw new Error('Queued operations missing')
    await page.screenshot({ path: testInfo.outputPath('zh-guide-wide-before.png') })
    await rows.first().locator('.hbar-queued-user-run-guide').click()
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(remaining)
    await expectComposerText(prompt, '保留这份尚未发送的草稿')
    const guided = await observer.call('session.snapshot', { sessionId: ready.sessionId })
    expect(guided.runs.find((run) => run.id === selectedRun.id)).toMatchObject({ status: 'guided', startedAt: null })
    expect(guided.runs.find((run) => run.id === initial.id)?.status).toBe('running')
    expect(guided.runs.find((run) => run.id === remainingRun.id)?.status).toBe('queued')
    expect(
      guided.messages.filter((message) =>
        message.content.some((block) => block.type === 'text' && block.text === selected),
      ),
    ).toHaveLength(1)
    await page.setViewportSize({ width: 320, height: 900 })
    await expect(rows.first().locator('.hbar-queued-user-run-guide')).toBeVisible()
    const guidedMessage = guided.messages.find((message) =>
      message.content.some((block) => block.type === 'text' && block.text === selected),
    )
    if (!guidedMessage) throw new Error('Canonical guided message missing')
    const guidedArticle = page.locator(`article[data-message-id="${guidedMessage.id}"]`)
    await guidedArticle.scrollIntoViewIfNeeded()
    const flow = await guidedArticle.evaluate((article) => {
      const body = article.querySelector('.lumen-message-transcript-body')
      const prose = article.querySelector('.hbar-session-message-prose')
      const paragraphs = [...article.querySelectorAll('p')]
      const parents: HTMLElement[] = []
      for (let parent = article.parentElement; parent; parent = parent.parentElement) parents.push(parent)
      return [article, body, prose, ...paragraphs, ...parents].flatMap((element) => {
        if (!(element instanceof HTMLElement)) return []
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return [
          {
            className: element.className,
            tagName: element.tagName,
            width: rect.width,
            height: rect.height,
            lineHeight: Number.parseFloat(style.lineHeight),
            right: rect.right,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            display: style.display,
            whiteSpace: style.whiteSpace,
            overflowWrap: style.overflowWrap,
            maxWidth: style.maxWidth,
            minWidth: style.minWidth,
          },
        ]
      })
    })
    await testInfo.attach('guided-message-flow.json', {
      body: JSON.stringify(flow, null, 2),
      contentType: 'application/json',
    })
    expect(flow.filter((item) => item.scrollWidth > item.clientWidth + 1 || item.right > 321)).toEqual([])
    expect(flow.find((item) => item.tagName === 'P')).toMatchObject({
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    })
    expect(flow.some((item) => item.tagName === 'P' && item.height > item.lineHeight * 2)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('zh-guide-narrow-after.png') })
    expect((await context.request.post(`${ready.controlUrl}/release?index=0`, { headers: controlHeaders })).ok()).toBe(
      true,
    )
    await expect.poll(async () => (await requests()).length).toBe(2)
    expect((await requests())[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'text', text: selected }],
    })
    expect(
      (await observer.call('session.snapshot', { sessionId: ready.sessionId })).runs.find(
        (run) => run.id === initial.id,
      )?.status,
    ).toBe('running')
    await context.request.post(`${ready.controlUrl}/release?index=1`, { headers: controlHeaders })
    await expect
      .poll(
        async () =>
          (await observer.call('session.snapshot', { sessionId: ready.sessionId })).runs.find(
            (run) => run.id === remainingRun.id,
          )?.status,
      )
      .toBe('completed')
    await expect(rows).toHaveCount(0)
    await expectComposerText(prompt, '保留这份尚未发送的草稿')
    expect((await requests()).length).toBe(3)
    expect((await observer.call('session.snapshot', { sessionId: ready.sessionId })).runs).toHaveLength(3)
    expect(errors).toEqual([])
  } finally {
    client?.disconnect()
    await context.close()
    if (child.exitCode === null && child.signalCode === null) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let onExit: (() => void) | undefined
      const graceful = new Promise<void>((done) => {
        onExit = done
        child.once('exit', onExit)
        timer = setTimeout(done, 5_000)
      })
      child.stdin.write('stop\n')
      await graceful
      if (timer) clearTimeout(timer)
      if (onExit) child.off('exit', onExit)
    }
    await stopOwnedWebSessionHostChild(child)
    await removeOwnedGuideFixture(root)
  }
})
