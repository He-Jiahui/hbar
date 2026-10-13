import { expect, test } from 'bun:test'
import { RUNTIME_KERNEL_CONTROL_METHODS, RUNTIME_KERNEL_HOST_METHODS } from '@hbar/kernel/runtime-port'
import { isStableRpc } from '../apps/host/src/stable-rpc'

test('node receipt reconciliation is a private Kernel-to-Host IPC callback', () => {
  const method = 'kernel.nodeIntentRecovery.reconcileRun'
  expect(RUNTIME_KERNEL_HOST_METHODS).toContain(method)
  expect(RUNTIME_KERNEL_CONTROL_METHODS).not.toContain(method)
  expect(isStableRpc(method, { runId: 'run-1' })).toBe(false)
})
