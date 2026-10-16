import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import type { DiagnosticEvent } from '@hbar/contracts/diagnostics'
import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import { stopKernelWithFatalDiagnostic } from '../apps/host/src/runtime-kernel-process'

const owner = { unitId: 'kernel', generation: 1, incarnation: 'fixture-incarnation' }
test('Kernel fatal IPC_BUSY emits safe code and exits76 without waiting for an observer', () => {
  const events: DiagnosticEvent[] = []
  const sentinel = new Error('exit-sentinel')
  let exitCode: number | undefined
  const written: string[] = []
  expect(() =>
    stopKernelWithFatalDiagnostic({
      owner,
      error: new HbarError('IPC_BUSY', 'private prompt credential path'),
      write: (line) => {
        written.push(line)
      },
      notify: (event) => {
        events.push(event)
        return new Promise<void>(() => {})
      },
      exit: (code) => {
        exitCode = code
        throw sentinel
      },
    }),
  ).toThrow(sentinel)
  expect(exitCode).toBe(76)
  expect(written).toHaveLength(1)
  expect(written[0]?.endsWith('\n')).toBe(true)
  expect(JSON.stringify(written)).not.toContain('private')
  expect(events).toHaveLength(1)
  expect(diagnosticEventSchema.safeParse(events[0]).success).toBe(true)
  expect(events[0]?.errorCode).toBe('IPC_BUSY')
  expect(events[0]?.event).toBe('host.runtime_kernel_fatal')
  expect(JSON.stringify(events)).not.toContain('private')
})

test('unknown or malicious fatal errors and observer failures cannot replace exit76 or expose messages', async () => {
  const sentinel = new Error('exit-sentinel')
  for (const error of [
    new Error('private'),
    {
      get code(): string {
        throw new Error('private getter')
      },
    },
  ]) {
    expect(() =>
      stopKernelWithFatalDiagnostic({
        owner,
        error,
        write: () => {
          throw new Error('private write failure')
        },
        notify: () => {
          throw new Error('private observer')
        },
        exit: () => {
          throw sentinel
        },
      }),
    ).toThrow(sentinel)
  }
  const events: DiagnosticEvent[] = []
  expect(() =>
    stopKernelWithFatalDiagnostic({
      owner,
      error: new Error('private'),
      notify: (event) => {
        events.push(event)
        return Promise.reject(new Error('private rejected observer'))
      },
      exit: () => {
        throw sentinel
      },
    }),
  ).toThrow(sentinel)
  await Promise.resolve()
  expect(events[0]?.errorCode).toBe('KERNEL_FATAL_UNCLASSIFIED')
  expect(JSON.stringify(events)).not.toContain('private')
})
