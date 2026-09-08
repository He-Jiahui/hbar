import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { BrowserUseService, ComputerUseService, GitService } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const resources: Array<{ root: string; kernel: Kernel; close?: () => Promise<void> }> = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.close?.()
    await resource.kernel.close()
    await rm(resource.root, { recursive: true, force: true })
  }
})

async function git(cwd: string, args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', windowsHide: true })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (code !== 0) throw new Error(stderr || stdout)
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-capabilities-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}

test('default host mounts git, browser-use, and computer-use plugin capabilities', async () => {
  const { root, kernel, session } = await fixture()
  await git(root, ['init', '-q'])
  await git(root, ['config', 'user.name', 'hbar'])
  await git(root, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(root, 'README.md'), 'capabilities\n')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-q', '-m', 'initial'])
  const status = await kernel.plugins.get<GitService>('git').status(root)
  expect(status.head).toMatch(/^[0-9a-f]{40}$/)
  expect((await kernel.plugins.get<BrowserUseService>('browser').status(session.id)).available).toBeTrue()
  expect((await kernel.plugins.get<ComputerUseService>('computer').status(session.id)).platform).toBe(process.platform)
  const names = kernel.tools.list().map((tool) => tool.name)
  expect(names).toContain('git_status')
  expect(names).toContain('browser_navigate')
  expect(names).toContain('computer_screenshot')
})

test('host RPC exposes Git and browser snapshots with authentication and bounded origin policy', async () => {
  const { root, kernel, session } = await fixture()
  const page = Bun.serve({
    port: 0,
    fetch: () => new Response('<html><head><title>hbar</title></head><body>hello capability</body></html>', { headers: { 'Content-Type': 'text/html' } }),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resources[0]!.close = async () => { client.disconnect(); await host.close(); await page.stop() }
  await client.pair(host.pairing.code, 'capability test')
  await mkdir(join(root, 'repo'))
  await git(join(root, 'repo'), ['init', '-q'])
  const status = await client.call('git.status', { cwd: join(root, 'repo') })
  expect(status.root).toBeTruthy()
  const browser = await client.call('browser.navigate', { sessionId: session.id, url: `http://127.0.0.1:${page.port}/` })
  expect(browser.title).toBe('hbar')
  const snapshot = await client.call('browser.snapshot', { sessionId: session.id, contextId: browser.contextId, pageId: browser.pageId })
  expect(snapshot.text).toContain('hello capability')
  expect((await client.call('computer.status', { sessionId: session.id })).available).toBeTrue()
})
