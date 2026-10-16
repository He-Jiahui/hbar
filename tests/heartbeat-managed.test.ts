import { test, expect } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import { z } from 'zod'

for (const mode of ['child', 'parent', 'ack', 'normal'])
  test(`real managed heartbeat evidence: ${mode}`, async () => {
    const child = Bun.spawn(
      [process.execPath, fileURLToPath(new URL('./fixtures/heartbeat-managed-harness.ts', import.meta.url)), mode],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      },
    )
    const stdout = new Response(child.stdout).text(),
      stderr = new Response(child.stderr).text()
    const deadline = setTimeout(() => child.kill('SIGKILL'), 22000)
    try {
      expect(await child.exited).toBe(0)
      const summary = z
        .object({
          fixture: z.string(),
          faults: z.number(),
          reason: z.string().nullable(),
          cadence: z.literal(2000),
          threshold: z.literal(6000),
        })
        .parse(JSON.parse((await stdout).trim()))
      const text = await stderr
      const events = text
        .split('\n')
        .flatMap((line) => {
          try {
            const result = diagnosticEventSchema.safeParse(JSON.parse(line))
            return result.success ? [result.data] : []
          } catch {
            return []
          }
        })
        .filter((event) => event.event === 'host.runtime_heartbeat_evidence')
      if (mode === 'child' || mode === 'parent') {
        expect(summary.faults).toBe(1)
        expect(summary.reason).toBe('RUNTIME_HEARTBEAT_TIMEOUT')
        const timeouts = events.filter((event) => event.phase === 'parent_timeout')
        expect(timeouts).toHaveLength(1)
        expect(timeouts[0]?.durationMs).toBeGreaterThanOrEqual(6000)
        expect(timeouts[0]?.executionMs).toBeGreaterThanOrEqual(6000)
        if (mode === 'parent') expect(timeouts[0]?.queueWaitMs).toBeGreaterThanOrEqual(6000)
        else expect(timeouts[0]?.queueWaitMs ?? 0).toBeLessThan(2000)
      } else {
        expect(summary.faults).toBe(0)
        if (mode === 'normal') expect(events).toHaveLength(0)
        else {
          const slow = events.filter((event) => event.phase === 'child_ack_slow')
          expect(slow).toHaveLength(1)
          expect(slow[0]?.replyMs).toBeGreaterThanOrEqual(2000)
        }
      }
      expect(text).not.toContain('PRIVATE_HEARTBEAT_CANARY')
    } finally {
      clearTimeout(deadline)
      if (child.exitCode === null) {
        child.kill('SIGKILL')
        await child.exited
      }
      await Promise.all([stdout, stderr])
    }
  }, 25000)
