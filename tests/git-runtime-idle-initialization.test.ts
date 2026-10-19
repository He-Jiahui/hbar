import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { GitRuntime, ProcessGitRunner, gitConfigSchema } from '../plugins/git/src/index'
async function until(check: () => boolean) {
  const end = Date.now() + 5000
  while (!check()) {
    if (Date.now() >= end) throw new Error('Git initialization did not settle')
    await Bun.sleep(1)
  }
}
async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-git-init-'))
  let failed = false,
    primary: unknown
  const errors: unknown[] = []
  try {
    await action(root)
  } catch (error) {
    failed = true
    primary = error
  }
  {
    try {
      const actual = await realpath(root),
        temporary = await realpath(tmpdir())
      if (dirname(actual).toLowerCase() !== temporary.toLowerCase() || !basename(actual).startsWith('hbar-git-init-'))
        throw new Error('Unowned root')
      await rm(actual, { recursive: true, force: true })
    } catch (error) {
      errors.push(error)
    }
  }
  if (failed) {
    if (errors.length)
      throw new AggregateError([primary, ...errors], 'Git initialization fixture and cleanup failed', {
        cause: primary,
      })
    throw primary
  }
  if (errors.length) throw new AggregateError(errors, 'Git initialization cleanup failed')
}
test(
  'actual GitRuntime filesystem initialization settles both roots without spawning Git; custom runner remains unsupported',
  () =>
    fixture(async (root) => {
      let calls = 0
      const controlled = {
        run: () => {
          calls++
          return Promise.resolve({ stdout: '', stderr: '', code: 0, truncated: false, timedOut: false })
        },
      }
      const runtime = new GitRuntime(root, gitConfigSchema.parse({}), controlled)
      expect(runtime.idleCheckpoint().background).toBeGreaterThan(0)
      await until(() => runtime.idleCheckpoint().background === 0)
      expect(runtime.idleCheckpoint()).toMatchObject({ supported: false, requests: 0, background: 0, unconfirmed: 0 })
      expect(calls).toBe(0)
      const processRuntime = new GitRuntime(root, gitConfigSchema.parse({}), new ProcessGitRunner())
      await until(() => processRuntime.idleCheckpoint().background === 0)
      expect(processRuntime.idleCheckpoint()).toMatchObject({
        supported: true,
        requests: 0,
        background: 0,
        unconfirmed: 0,
      })
    }),
  20000,
)
test(
  'actual failed root initialization settles both promises but retains unconfirmed state',
  () =>
    fixture(async (root) => {
      const runtime = new GitRuntime(join(root, 'absent'), gitConfigSchema.parse({}), new ProcessGitRunner())
      await until(() => runtime.idleCheckpoint().background === 0)
      expect(runtime.idleCheckpoint()).toMatchObject({ supported: true, requests: 0, background: 0, unconfirmed: 1 })
      expect(runtime.idleCheckpoint().unconfirmed).toBe(1)
    }),
  20000,
)
