import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

interface CommandResult {
  code: number
  stdout: string
  stderr: string
  hostArtifacts: boolean
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function cleanupCliFixture(root: string): Promise<void> {
  const actual = await realpath(root)
  const parent = await realpath(tmpdir())
  if (!actual.startsWith(`${parent}${sep}`) || !basename(actual).startsWith('hbar-cli-entrypoint-'))
    throw new Error('Refusing to clean an unowned CLI entrypoint fixture')
  await rm(actual, { recursive: true, force: true })
}

async function runCli(args: string[]): Promise<CommandResult> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-cli-entrypoint-'))
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        resolve('apps/cli/src/main.ts'),
        ...args,
        '--data-root',
        join(root, 'data'),
        '--cache-root',
        join(root, 'cache'),
      ],
      {
        cwd: resolve('.'),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
      },
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    try {
      const exit = Promise.race([
        child.exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true
            reject(new Error('CLI entrypoint timed out'))
          }, 10_000)
        }),
      ])
      const [code, stdout, stderr] = await Promise.all([
        exit,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      const hostArtifacts =
        (await pathExists(join(root, 'data'))) ||
        (await pathExists(join(root, 'cache'))) ||
        (await pathExists(join(root, 'data', 'settings', 'connection.json')))
      return { code, stdout, stderr, hostArtifacts }
    } finally {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        child.kill()
        await child.exited.catch(() => undefined)
      }
    }
  } finally {
    await cleanupCliFixture(root)
  }
}

test('standalone informational entrypoints do not start a Host', async () => {
  const help = await runCli(['--help'])
  expect(help.code).toBe(0)
  expect(help.stdout).toContain('hbar [message...]')
  expect(help.stderr).toBe('')
  expect(help.hostArtifacts).toBeFalse()

  const version = await runCli(['version'])
  expect(version.code).toBe(0)
  expect(version.stdout.trim()).toBe('hbar 0.1.0')
  expect(version.stderr).toBe('')
  expect(version.hostArtifacts).toBeFalse()

  for (const [shell, marker] of [
    ['powershell', 'Register-ArgumentCompleter'],
    ['bash', 'complete -W'],
    ['zsh', 'complete -W'],
  ] as const) {
    const completion = await runCli(['completion', shell])
    expect(completion.code).toBe(0)
    expect(completion.stdout).toContain(marker)
    for (const command of [
      'commands',
      'exec',
      'session',
      'model',
      'plugins',
      'skills',
      'config',
      'diagnose',
      'version',
    ])
      expect(completion.stdout).toContain(command)
    expect(completion.stderr).toBe('')
    expect(completion.hostArtifacts).toBeFalse()
  }
})

test('completion usage failures return usage exit code and no Host output', async () => {
  for (const args of [['completion'], ['completion', 'fish']]) {
    const result = await runCli(args)
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Usage: hbar completion')
    expect(result.stdout).toBe('')
    expect(result.hostArtifacts).toBeFalse()
  }
})
