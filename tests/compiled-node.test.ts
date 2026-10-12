import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildStandaloneCli } from '../scripts/build-cli'
import { nodeConsoleConnectionSchema } from '@hbar/contracts/node-console'

test('standalone CLI embeds the workspace node worker and execution artifact without source paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-compiled-node-'))
  const home = join(root, 'node'),
    workspace = join(root, 'workspace')
  const executable = join(root, process.platform === 'win32' ? 'hbar.exe' : 'hbar')
  let child: Bun.Subprocess | undefined
  try {
    await mkdir(workspace)
    await buildStandaloneCli(resolve('.'), executable)
    const share = Bun.spawn(
      [executable, 'node', 'share', workspace, '--id', 'engine', '--access', 'write', '--home', home],
      {
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      },
    )
    const [code, error] = await Promise.all([share.exited, new Response(share.stderr).text()])
    expect(code, error).toBe(0)
    const nodeProcess = Bun.spawn([executable, 'serve', '--role', 'workspace', '--home', home], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
    })
    child = nodeProcess
    const deadline = Date.now() + 15_000
    let ready = false
    while (Date.now() < deadline) {
      if (nodeProcess.exitCode !== null) throw new Error(await new Response(nodeProcess.stderr).text())
      try {
        const connection = nodeConsoleConnectionSchema.parse(
          JSON.parse(await readFile(join(home, 'control.json'), 'utf8')),
        )
        const response = await fetch(connection.url, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + connection.token },
          body: JSON.stringify({ method: 'node.status', input: {} }),
        })
        expect(response.ok).toBe(true)
        expect(await response.json()).toMatchObject({ result: { capabilities: { roots: [{ rootId: 'engine' }] } } })
        ready = true
        break
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
      }
      await Bun.sleep(25)
    }
    expect(ready).toBe(true)
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL')
    await child?.exited
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
}, 180_000)
