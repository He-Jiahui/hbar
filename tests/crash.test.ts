import { test, expect } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'

test('process termination retains WAL commits and unknown effects are never automatically replayed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-crash-'))
  const child = Bun.spawn([process.execPath, 'scripts/crash-fixture.ts', root], {
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
  let kernel: Kernel | undefined
  const timeout = setTimeout(() => child.kill(), 10_000)
  try {
    let output = ''
    for await (const data of child.stdout) {
      output += new TextDecoder().decode(data)
      if (output.includes('SIDE_EFFECT_COMPLETE')) break
    }
    expect(output).toContain('SIDE_EFFECT_COMPLETE')
    child.kill()
    await child.exited
    kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      workspace: root,
      secrets: new MemorySecrets(),
    })
    await kernel.waitForIdle()
    const session = (await kernel.storage.call('sessions'))[0]!
    const snapshot = await kernel.snapshot(session.id)
    expect(kernel.recovered).toBe(1)
    expect(snapshot.runs[0]?.status).toBe('interrupted')
    expect((await kernel.storage.call('events', session.id, 0)).filter((e) => e.type === 'tool.unknown')).toHaveLength(
      1,
    )
    expect(
      snapshot.messages
        .flatMap((m) => m.content)
        .some((b) => b.type === 'tool_result' && b.text.includes('may already have happened')),
    ).toBeTrue()
    expect(await readFile(join(root, 'effect.txt'), 'utf8')).toBe('executed once')
  } finally {
    clearTimeout(timeout)
    if (child.exitCode === null) child.kill()
    await child.exited
    await kernel?.close()
    await rm(root, { recursive: true, force: true })
  }
})
