import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve, sep } from 'node:path'
import { z } from 'zod'
import { findFreePort } from '../scripts/dev-ports'

const connectionSchema = z.object({ pid: z.number().int().positive(), supervisorPid: z.number().int().positive() })

async function fixture() {
  const home = await mkdtemp(resolve(tmpdir(), 'hbar-desktop-dev-'))
  const webPort = await findFreePort()
  let hostPort = await findFreePort()
  while (hostPort === webPort) hostPort = await findFreePort()
  return {
    home,
    webPort,
    hostPort,
    async run() {
      // --help exits the real Tauri CLI without compiling or opening a native window.
      const child = Bun.spawn([process.execPath, 'scripts/desktop.ts', 'dev', '--help'], {
        env: {
          ...process.env,
          HBAR_HOME: home,
          HBAR_WEB_PORT: String(webPort),
          HBAR_HOST_PORT: String(hostPort),
          HBAR_WEB_DEV_URL: `http://127.0.0.1:${webPort}`,
          HBAR_DEMO: '1',
        },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
        timeout: 25_000,
      })
      const [code, output, error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { code, output, error }
    },
    async expectReleasedHost() {
      const value: unknown = JSON.parse(await readFile(resolve(home, 'settings/connection.json'), 'utf8'))
      const connection = connectionSchema.parse(value)
      for (const pid of [connection.pid, connection.supervisorPid]) expect(() => process.kill(pid, 0)).toThrow()
      await expect(
        fetch(`http://127.0.0.1:${hostPort}/healthz`, { signal: AbortSignal.timeout(1_000) }),
      ).rejects.toThrow()
    },
    async dispose() {
      if (!home.startsWith(resolve(tmpdir()) + sep) || !basename(home).startsWith('hbar-desktop-dev-'))
        throw new Error('Development fixture cleanup is outside its owned temporary directory')
      await rm(home, { recursive: true, force: true })
    },
  }
}

test('desktop development releases source Host and Vite after its owned Tauri process exits', async () => {
  const f = await fixture()
  try {
    const result = await f.run()
    expect(result.code).toBe(0)
    expect(result.output).toContain('Desktop development:')
    await f.expectReleasedHost()
    await expect(fetch(`http://127.0.0.1:${f.webPort}`, { signal: AbortSignal.timeout(1_000) })).rejects.toThrow()
  } finally {
    await f.dispose()
  }
}, 30_000)

test('an unrelated HTTP listener cannot satisfy desktop Vite readiness or be terminated on failure', async () => {
  const f = await fixture()
  const occupied = Bun.serve({ hostname: '127.0.0.1', port: f.webPort, fetch: () => new Response('existing listener') })
  try {
    const result = await f.run()
    expect(result.code).not.toBe(0)
    expect(result.error).toContain('Vite: Development process exited before readiness')
    expect(result.error).toContain('Development process exited before readiness')
    await f.expectReleasedHost()
    expect(await (await fetch(`http://127.0.0.1:${f.webPort}`)).text()).toBe('existing listener')
  } finally {
    await occupied.stop(true)
    await f.dispose()
  }
}, 30_000)

test('source Host startup failure reports its log and leaves an unrelated listener running', async () => {
  const f = await fixture()
  const occupied = Bun.serve({
    hostname: '127.0.0.1',
    port: f.hostPort,
    fetch: () => new Response('existing Host listener'),
  })
  try {
    const result = await f.run()
    expect(result.code).not.toBe(0)
    expect(result.error).toContain('Source Host: Development process exited before readiness')
    expect(result.error).toContain(resolve(f.home, 'diagnostics/host-dev.log'))
    expect(result.output).not.toContain('Desktop development:')
    expect(await Bun.file(resolve(f.home, 'settings/host.lock')).exists()).toBe(false)
    expect(await (await fetch(`http://127.0.0.1:${f.hostPort}`)).text()).toBe('existing Host listener')
  } finally {
    await occupied.stop(true)
    await f.dispose()
  }
}, 30_000)

test('a development profile with a live owner is refused before any service starts', async () => {
  const f = await fixture()
  try {
    await mkdir(resolve(f.home, 'settings'))
    await writeFile(resolve(f.home, 'settings/host.lock'), JSON.stringify({ pid: process.pid }))
    const result = await f.run()
    expect(result.code).not.toBe(0)
    expect(result.error).toContain('A Host already owns')
    expect(result.output).not.toContain('Desktop development:')
    expect(process.kill(process.pid, 0)).toBe(true)
  } finally {
    await f.dispose()
  }
}, 30_000)
