import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const completedSchema = z.strictObject({
  unitId: z.literal('fixture'),
  generation: z.literal(3),
  incarnation: z.uuid(),
  childPid: z.number().int().positive(),
  parentPid: z.number().int().positive(),
  phase: z.literal('disposed'),
  pid: z.null(),
  elapsedMs: z.number().nonnegative(),
  childAlive: z.literal(false),
})
const diagnosticSchema = z.strictObject({
  event: z.literal('runtime.parent_terminate'),
  reason: z.enum(['DISPOSE_DEADLINE', 'DISPOSE_EXIT_WAIT']),
  phase: z.literal('disposing'),
  unitId: z.literal('fixture'),
  generation: z.literal(3),
  incarnation: z.uuid(),
  childPid: z.number().int().positive(),
  elapsedMs: z.number().int().nonnegative(),
  budgetMs: z.literal(500),
})

for (const mode of ['deadline', 'normal']) {
  test(`managed parent ${mode} shutdown retains precise termination evidence`, async () => {
    const harness = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL('./fixtures/runtime-parent-terminate.ts', import.meta.url)),
        mode,
        'TERMINATE_ARGV_CANARY',
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true },
    )
    const stdout = new Response(harness.stdout).text()
    const stderr = new Response(harness.stderr).text()
    let timer: ReturnType<typeof setTimeout> | undefined
    let failed = false
    let primary: unknown
    const cleanupErrors: unknown[] = []
    try {
      const exitCode = await Promise.race([
        harness.exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Managed termination fixture did not exit')), 8_000)
        }),
      ])
      expect(exitCode).toBe(0)
      const completed: unknown = JSON.parse((await stdout).trim())
      const result = completedSchema.parse(completed)
      expect(result.childPid).not.toBe(result.parentPid)
      expect(result.parentPid).toBe(harness.pid)
      expect(result.elapsedMs).toBeLessThan(2_500)
      const output = await stderr
      const prefix = '[hbar runtime terminate] '
      const lines = output.split(/\r?\n/).filter((line) => line.startsWith(prefix))
      expect(lines).toHaveLength(mode === 'deadline' ? 1 : 0)
      if (mode === 'deadline') {
        const line = lines[0]
        if (!line) throw new Error('Parent termination diagnostic is missing')
        const decoded: unknown = JSON.parse(line.slice(prefix.length))
        const diagnostic = diagnosticSchema.parse(decoded)
        expect(diagnostic).toMatchObject({
          unitId: result.unitId,
          generation: result.generation,
          incarnation: result.incarnation,
          childPid: result.childPid,
        })
        expect(diagnostic.elapsedMs).toBeGreaterThanOrEqual(450)
        expect(diagnostic.elapsedMs).toBeLessThan(2_500)
      }
      expect(output).not.toContain('TERMINATE_CONFIGURATION_CANARY')
      expect(output).not.toContain('TERMINATE_ARGV_CANARY')
      expect(output).not.toContain('[hbar runtime timeout] ')
    } catch (error) {
      failed = true
      primary = error
    }
    clearTimeout(timer)
    try {
      if (harness.exitCode === null) harness.kill('SIGKILL')
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await harness.exited
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await stdout
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await stderr
    } catch (error) {
      cleanupErrors.push(error)
    }
    if (failed) throw primary
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Managed termination fixture cleanup failed')
  }, 12_000)
}
