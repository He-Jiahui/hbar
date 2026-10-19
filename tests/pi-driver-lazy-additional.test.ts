import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

for (const mode of ['anthropic', 'responses', 'load-failure', 'load-abort'] as const) {
  test(`actual PiDriver fresh provider boundary: ${mode}`, async () => {
    const temporaryParent = await realpath(tmpdir())
    const root = await mkdtemp(join(temporaryParent, 'hbar-pi-lazy-additional-'))
    const owned = await realpath(root)
    try {
      const fixture = fileURLToPath(new URL('./fixtures/pi-driver-lazy-additional.ts', import.meta.url))
      const child = Bun.spawn([process.execPath, '--smol', fixture, mode], {
        cwd: process.cwd(),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, TEMP: owned, TMP: owned, TMPDIR: owned },
        windowsHide: true,
        signal: AbortSignal.timeout(12_000),
      })
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      expect(stderr).toBe('')
      expect(exit).toBe(0)
      const lines = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as unknown)
      const successful = mode === 'anthropic' || mode === 'responses'
      const expected = {
        type: 'pi-lazy-additional-complete',
        mode,
        requests: successful ? 1 : 0,
        loads: successful ? 0 : 1,
        terminal: successful ? 'settled' : mode === 'load-abort' ? 'cancelled' : 'failed',
      }
      const expectedLines: unknown[][] =
        mode === 'load-abort' ? [[expected], [{ ...expected, loads: 2 }]] : [[expected]]
      expect(expectedLines).toContainEqual(lines)
    } catch (error) {
      console.error(`PI_LAZY_ADDITIONAL_FAILURE_ROOT=${owned}`)
      throw error
    }
    // Only successful fixtures are removed, after the original owned path is verified.
    const current = await realpath(root)
    if (
      current !== owned ||
      resolve(root) !== owned ||
      dirname(current) !== temporaryParent ||
      !basename(current).startsWith('hbar-pi-lazy-additional-')
    )
      throw new Error('Owned cleanup identity mismatch')
    await rm(current, { recursive: true, force: true })
  }, 20_000)
}
