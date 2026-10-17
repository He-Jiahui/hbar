import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { ProcessGitRunner, type GitProcessPort } from '../plugins/git/src/index'
function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Missing deferred')
  }
  const promise = new Promise<Value>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function fixture() {
  const exit = deferred<number>(),
    termination = deferred<void>()
  let out: ReadableStreamDefaultController<Uint8Array> | undefined,
    err: ReadableStreamDefaultController<Uint8Array> | undefined,
    spawns = 0,
    code: number | null = null,
    outClosed = false,
    errClosed = false
  const port: GitProcessPort = {
    spawnGit() {
      spawns++
      return {
        pid: 123,
        stdout: new ReadableStream({
          start(controller) {
            out = controller
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            err = controller
          },
        }),
        exited: exit.promise,
        get exitCode() {
          return code
        },
        kill() {},
      }
    },
    terminateTree: () => termination.promise,
  }
  return {
    runner: new ProcessGitRunner(port),
    get spawns() {
      return spawns
    },
    exit(value: number) {
      code = value
      exit.resolve(value)
    },
    closeOut() {
      if (!outClosed) {
        outClosed = true
        out?.close()
      }
    },
    closeErr() {
      if (!errClosed) {
        errClosed = true
        err?.close()
      }
    },
    errorOut() {
      outClosed = true
      out?.error(new Error('CONTROLLED_STREAM_FAILURE'))
    },
    termination,
  }
}
async function checked(action: () => Promise<void>, cleanup: readonly (() => void | Promise<unknown>)[]) {
  let failed = false,
    primary: unknown
  const errors: unknown[] = []
  try {
    await action()
  } catch (error) {
    failed = true
    primary = error
  } finally {
    for (const release of cleanup) {
      try {
        await release()
      } catch (error) {
        errors.push(error)
      }
    }
  }
  if (failed) {
    if (errors.length)
      throw new AggregateError([primary, ...errors], 'Operation and cleanup failed', { cause: primary })
    throw primary
  }
  if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed')
}
for (const code of [0, 1])
  test(`owned exit ${code} does not erase pending actual collectors`, async () => {
    const f = fixture(),
      pending = f.runner.run('D:/fixture', [], new AbortController().signal, { timeoutMs: 1000, maxOutputBytes: 100 })
    await checked(async () => {
      f.exit(code)
      await Promise.resolve()
      expect(f.runner.idleRequests()).toBeGreaterThan(0)
      f.closeOut()
      await Promise.resolve()
      expect(f.runner.idleRequests()).toBeGreaterThan(0)
      f.closeErr()
      expect((await pending).code).toBe(code)
      expect(f.runner.idleRequests()).toBe(0)
    }, [() => f.exit(code), () => f.termination.resolve(), () => f.closeOut(), () => f.closeErr(), () => pending])
  }, 20000)
test('pre-aborted call never spawns and is known zero', async () => {
  const f = fixture(),
    controller = new AbortController()
  controller.abort()
  let failed = false
  try {
    await f.runner.run('D:/fixture', [], controller.signal, { timeoutMs: 1000, maxOutputBytes: 100 })
  } catch {
    failed = true
  }
  expect(failed).toBe(true)
  expect(f.spawns).toBe(0)
  expect(f.runner.idleRequests()).toBe(0)
}, 20000)
test('early collector rejection never clears another retained stream or failed physical proof', async () => {
  const f = fixture(),
    pending = f.runner
      .run('D:/fixture', [], new AbortController().signal, { timeoutMs: 1000, maxOutputBytes: 100 })
      .then(
        () => false,
        () => true,
      )
  await checked(async () => {
    f.errorOut()
    expect(await pending).toBe(true)
    f.exit(0)
    await Promise.resolve()
    expect(f.runner.idleRequests()).toBeGreaterThan(0)
    f.closeErr()
    await Promise.resolve()
    expect(f.runner.idleRequests()).toBeGreaterThan(0)
  }, [() => f.exit(0), () => f.termination.resolve(), () => f.closeOut(), () => f.closeErr(), () => pending])
}, 20000)
test('finite real git exits and drains both output pipes in an exact owned temporary root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-git-idle-'))
  let failed = false,
    primary: unknown
  const cleanup: unknown[] = []
  let safeToRemove = false
  try {
    const runner = new ProcessGitRunner()
    const result = await runner.run(root, ['--version'], new AbortController().signal, {
      timeoutMs: 5000,
      maxOutputBytes: 4096,
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('git version')
    expect(runner.idleRequests()).toBe(0)
    safeToRemove = true
  } catch (error) {
    failed = true
    primary = error
  }
  {
    try {
      if (!safeToRemove) throw new Error('Retained unconfirmed Git temporary root: ' + root)
      const actual = await realpath(root),
        temporary = await realpath(tmpdir())
      if (dirname(actual).toLowerCase() !== temporary.toLowerCase() || !basename(actual).startsWith('hbar-git-idle-'))
        throw new Error('Unowned temporary root')
      await rm(actual, { recursive: true, force: true })
    } catch (error) {
      cleanup.push(error)
    }
  }
  if (failed) {
    if (cleanup.length)
      throw new AggregateError([primary, ...cleanup], 'Git fixture and cleanup failed', { cause: primary })
    throw primary
  }
  if (cleanup.length) throw new AggregateError(cleanup, 'Git fixture cleanup failed')
}, 20000)
test('Windows owned termination remains occupied until actual taskkill settlement', async () => {
  if (process.platform !== 'win32') return
  const f = fixture(),
    controller = new AbortController(),
    pending = f.runner.run('D:/fixture', [], controller.signal, { timeoutMs: 1000, maxOutputBytes: 100 }).then(
      () => false,
      () => true,
    )
  await checked(async () => {
    controller.abort()
    f.exit(0)
    f.closeOut()
    f.closeErr()
    await Promise.resolve()
    expect(f.runner.idleRequests()).toBeGreaterThan(0)
    f.termination.resolve()
    expect(await pending).toBe(true)
    expect(f.runner.idleRequests()).toBe(0)
  }, [() => f.exit(0), () => f.termination.resolve(), () => f.closeOut(), () => f.closeErr(), () => pending])
}, 20000)
