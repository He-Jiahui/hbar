import { expect, test } from 'bun:test'
import { openSync, closeSync } from 'node:fs'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { HbarClient } from '@hbar/client'
import { createSettingsCommandClient } from '@hbar/client'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import { hasLiveHostOwner } from '../apps/cli/src/host-owner'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const prefix = 'hbar-cli-backend-service-'
const connectionSchema = z.object({
  url: z.url(),
  token: z.string(),
  instanceId: z.string(),
  pid: z.number().int().positive(),
  supervisorPid: z.number().int().positive(),
})

function cliCommand(): string[] {
  return process.env.HBAR_TEST_CLI_EXECUTABLE
    ? [resolve(process.env.HBAR_TEST_CLI_EXECUTABLE)]
    : [process.execPath, resolve('apps/cli/src/main.ts')]
}

async function until<Value>(read: () => Promise<Value>, timeoutMs = 60_000): Promise<Value> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(100)
    }
  }
}

async function stopOwned(child: ReturnType<typeof Bun.spawn>): Promise<void> {
  if (child.exitCode === null) {
    if (process.platform === 'win32') {
      await Bun.spawn(['taskkill.exe', '/PID', String(child.pid), '/T', '/F'], {
        stdout: 'ignore',
        stderr: 'ignore',
        windowsHide: true,
      }).exited
    } else child.kill('SIGTERM')
  }
  await child.exited
}

test('service entry reuses its real managed Host, advertises pairing and preserves identity, listener and sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const home = join(root, 'data')
  const logPath = join(root, 'service.log')
  const log = openSync(logPath, 'a')
  const owner = Bun.spawn(
    [...cliCommand(), 'serve', '--unattended', '--home', home, '--port', '0', '--demo', '--project', root],
    {
      stdin: 'ignore',
      stdout: log,
      stderr: log,
      windowsHide: true,
      env: { ...process.env, HBAR_RUNTIME_WATCH: '0' },
    },
  )
  let client: HbarClient | undefined
  const attachments: ReturnType<typeof Bun.spawn>[] = []
  try {
    const path = join(home, 'settings', 'connection.json')
    const initial = await until(async () => {
      if (owner.exitCode !== null) throw new Error(`Service exited: ${await readFile(logPath, 'utf8')}`)
      const value = connectionSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      expect((await fetch(`${value.url}/healthz`)).status).toBe(200)
      return value
    })
    expect(initial.supervisorPid).not.toBe(owner.pid)
    client = new HbarClient(initial.url, initial.token)
    await client.connect()
    const before = await client.call('system.bootstrap', {})
    const settings = createSettingsCommandClient(client)
    const enabled = await settings.execute('settings.get', { scope: { kind: 'global' } })
    expect(enabled.resolution.reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue).toBe(true)
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: enabled.schemaVersion,
        scope: enabled.scope,
        baselineRevisions: enabled.revisions,
        changes: [{ op: 'set', path: [{ kind: 'field', name: 'backend.unattended' }], value: false }],
      },
      { idempotencyKey: 'pause-background-retries' },
    )
    const runAttachment = (extra: string[] = []) => {
      const child = Bun.spawn([...cliCommand(), '--home', home, 'serve', '--port', '1', ...extra], {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      })
      attachments.push(child)
      return child
    }
    // An invalid option is refused even when a healthy Host already exists.
    const invalid = runAttachment(['--port=-1'])
    const [invalidCode, invalidError] = await Promise.all([invalid.exited, new Response(invalid.stderr).text()])
    expect(invalidCode).not.toBe(0)
    expect(invalidError).toContain('Invalid --port')
    expect(
      (await createSettingsCommandClient(client).execute('settings.get', { scope: { kind: 'global' } })).resolution
        .reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue,
    ).toBe(false)
    const attached = runAttachment(['--unattended'])
    const [code, output, errors] = await Promise.all([
      attached.exited,
      new Response(attached.stdout).text(),
      new Response(attached.stderr).text(),
    ])
    expect(code, errors).toBe(0)
    expect(
      (await createSettingsCommandClient(client).execute('settings.get', { scope: { kind: 'global' } })).resolution
        .reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue,
    ).toBe(true)
    expect(output).toContain('existing Host')
    expect(output).toContain(initial.url)
    expect(output).not.toContain(initial.token)
    const pairing = /Pairing code: (\d{8})/.exec(output)?.[1]
    expect(pairing).toBeDefined()
    const paired = await fetch(`${initial.url}/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: pairing, name: 'service browser fixture' }),
    })
    expect(paired.status).toBe(200)
    expect(paired.headers.get('set-cookie')).toContain('HttpOnly')
    expect(connectionSchema.parse(JSON.parse(await readFile(path, 'utf8')))).toEqual(initial)
    expect((await client.call('system.bootstrap', {})).sessions).toEqual(before.sessions)
    expect(owner.exitCode).toBeNull()
    expect(await readFile(logPath, 'utf8')).toMatch(/Pairing code: \d{8}/)
    // Never start a replacement when the saved identity fails verification.
    await writeFile(path, JSON.stringify({ ...initial, instanceId: 'stale-other-instance' }))
    const rejected = runAttachment()
    const [rejectedCode, rejectedErrors] = await Promise.all([rejected.exited, new Response(rejected.stderr).text()])
    expect(rejectedCode).not.toBe(0)
    expect(rejectedErrors).toContain('instance identity does not match')
    expect(owner.exitCode).toBeNull()
    expect((await fetch(`${initial.url}/healthz`)).status).toBe(200)
    await writeFile(path, JSON.stringify(initial))
  } finally {
    client?.disconnect()
    for (const child of attachments) await stopOwned(child)
    await stopOwned(owner)
    closeSync(log)
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)

test('service owner discovery covers recovering supervisors and direct Hosts without replacing either', async () => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const lock = join(root, 'settings', 'host.lock')
  try {
    expect(await hasLiveHostOwner(lock)).toBe(false)
    await mkdir(join(root, 'settings'))
    await writeFile(`${lock}.supervisor`, JSON.stringify({ pid: process.pid }))
    expect(await hasLiveHostOwner(lock)).toBe(true)
    await writeFile(`${lock}.supervisor`, '{}')
    await writeFile(lock, JSON.stringify({ pid: process.pid }))
    expect(await hasLiveHostOwner(lock)).toBe(true)
  } finally {
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('a terminal shutdown signal stops only the newly owned Supervisor tree', async () => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const home = join(root, 'data')
  const logPath = join(root, 'shutdown.log')
  const log = openSync(logPath, 'a')
  const owner = Bun.spawn(
    [
      process.execPath,
      resolve('tests/fixtures/cli-service-shutdown.ts'),
      'serve',
      '--home',
      home,
      '--port',
      '0',
      '--demo',
      '--project',
      root,
    ],
    {
      stdin: 'ignore',
      stdout: log,
      stderr: log,
      windowsHide: true,
      ipc() {},
      env: { ...process.env, HBAR_RUNTIME_WATCH: '0' },
    },
  )
  try {
    const connection = await until(async () => {
      if (owner.exitCode !== null) throw new Error(await readFile(logPath, 'utf8'))
      const value = connectionSchema.parse(
        JSON.parse(await readFile(join(home, 'settings', 'connection.json'), 'utf8')),
      )
      expect((await fetch(`${value.url}/healthz`)).status).toBe(200)
      return value
    })
    owner.send('stop-owned-service')
    await until(async () => {
      if (owner.exitCode === null) throw new Error('Service shutdown is still pending')
    }, 15_000)
    for (const pid of [connection.pid, connection.supervisorPid]) {
      await until(async () => {
        let alive = true
        try {
          process.kill(pid, 0)
        } catch {
          alive = false
        }
        expect(alive).toBe(false)
      }, 10_000)
    }
  } finally {
    await stopOwned(owner)
    closeSync(log)
    await removeOwnedTestDirectory(root, prefix)
  }
}, 90_000)
