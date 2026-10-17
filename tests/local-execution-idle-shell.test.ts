import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { LocalExecution } from '@hbar/local-tools'
import { runtimePluginIdleCheckpointSchema } from '@hbar/plugin-sdk'

test('real bounded LocalExecution shell settles direct output but cannot self-certify descendant retirement', async () => {
  if (process.platform !== 'win32') throw new Error('This owned NativeJob case requires the declared Windows runner')
  const prefix = 'hbar-local-idle-reader-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const canonicalRoot = await realpath(root)
  const canonicalTemp = await realpath(tmpdir())
  const execution = new LocalExecution()
  const failures: unknown[] = []
  try {
    expect(runtimePluginIdleCheckpointSchema.parse(execution.idleCheckpoint())).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    // Root's owned NativeJob supervises this one direct shell. No detached process or PID probe/kill is created here.
    const result = await execution.exec(root, "Write-Output 'local-idle-reader-output'", new AbortController().signal, {
      timeoutMs: 2000,
    })
    expect(result.isError).toBe(false)
    expect(result.text).toContain('local-idle-reader-output')
    expect(result.details).toMatchObject({ code: 0, drainCutoff: false })
    expect(runtimePluginIdleCheckpointSchema.parse(execution.idleCheckpoint())).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 1,
    })
    // Repeat observation supplies no native authority and cannot clear the conservative descendant latch.
    expect(execution.idleCheckpoint().unconfirmed).toBe(1)
  } catch (error) {
    failures.push(error)
  }
  try {
    execution.dispose()
  } catch (error) {
    failures.push(error)
  }
  try {
    if ((await realpath(dirname(canonicalRoot))) !== canonicalTemp || !basename(canonicalRoot).startsWith(prefix))
      throw new Error('Refusing cleanup outside exact owned TMP parent/prefix')
    if (failures.length === 0) await rm(canonicalRoot, { recursive: true, force: false })
  } catch (error) {
    failures.push(error)
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `LocalExecution fixture failed; retained owned diagnostic directory: ${canonicalRoot}`,
    )
}, 20000)
