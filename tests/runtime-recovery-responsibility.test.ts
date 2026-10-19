import { expect, test } from 'bun:test'
import { IpcPeer, RuntimeCoordinator, registerRuntimeCoordinatorPort } from '@hbar/runtime'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import type { ExecutionOwnership, RuntimeOwner } from '@hbar/contracts/runtime'
import {
  RuntimeRecoveryResponsibility,
  withRuntimeClaimAdmission,
  type RecoveryDispatchStart,
  type RecoveryNotificationFailure,
} from '../apps/host/src/runtime-recovery-responsibility'

const owner: RuntimeOwner = { unitId: 'kernel', generation: 2, incarnation: 'actual-port-owner' }
function draft(sessionId: string, runId = sessionId): ExecutionOwnership {
  const version = { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }
  return {
    leaseId: `lease-${runId}`,
    sessionId,
    runId,
    owner: { ...owner, generation: 1, incarnation: 'original-owner' },
    fence: 1,
    acquiredAt: 1,
    versions: { kernel: version, driver: { ...version, unitId: 'driver.pi' }, plugins: [], hooks: [] },
  }
}
function success(released: () => void): RecoveryDispatchStart {
  return (settled, captureOwner) => {
    captureOwner(owner)
    settled('reply')
    return { owner, result: Promise.resolve(), settled: Promise.resolve(), release: released, exited: () => false }
  }
}

test('full original responsibility slots do not require another recovery slot; known recover ACK survives replay failure', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 2)
  const first = draft('one'),
    second = draft('two')
  ledger.begin(first)
  ledger.begin(second)
  expect(() => ledger.begin(draft('third'))).toThrow('capacity')
  let recoverCalls = 0,
    releases = 0
  const recover: RecoveryDispatchStart = (settled, captureOwner) => {
    recoverCalls++
    return success(() => {
      releases++
    })(settled, captureOwner)
  }
  expect(await ledger.recover(first, true, recover)).toBe(true)
  const replayFailure = new Error('durable-delivery-failure')
  await expect(ledger.replay(first, () => Promise.reject(replayFailure))).rejects.toBe(replayFailure)
  expect(await ledger.recover(first, true, recover)).toBe(true)
  expect(recoverCalls).toBe(1)
  expect(releases).toBe(1)
  await ledger.replay(first, () => Promise.resolve())
  ledger.notify(first)
  await ledger.flush(
    () => false,
    () => success(() => {}),
  )
  expect(ledger.pending()).toBe(true)
  await ledger.flush(
    () => true,
    () => success(() => {}),
  )
  expect(ledger.pending()).toBe(true)
  ledger.acknowledgeIdle('one', owner)
  ledger.finish(second.runId)
  expect(ledger.pending()).toBe(false)
})

test('source non-dispatch permits retry but unknown recovery retains exact physical pin and does not resend', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
    first = draft('one')
  ledger.begin(first)
  const notSent = new Error('source-confirmed-not-sent')
  let releases = 0
  await expect(
    ledger.recover(first, true, (settled) => {
      settled('not-dispatched')
      return {
        owner,
        result: Promise.reject(notSent),
        settled: Promise.reject(notSent),
        release: () => {
          releases++
        },
        exited: () => false,
      }
    }),
  ).rejects.toBe(notSent)
  expect(releases).toBe(1)
  const late = Promise.withResolvers<void>()
  const timeout = new Error('caller-deadline-only')
  let markReply: (() => void) | undefined
  await expect(
    ledger.recover(first, true, (settled) => {
      markReply = () => settled('reply')
      return {
        owner,
        result: Promise.reject(timeout),
        settled: late.promise,
        release: () => {
          releases++
        },
        exited: () => false,
      }
    }),
  ).rejects.toBe(timeout)
  expect(ledger.hasPhysicalOwner(owner)).toBe(true)
  let resent = false
  expect(
    await ledger.recover(first, true, () => {
      resent = true
      throw new Error('must not resend')
    }),
  ).toBe(false)
  expect(resent).toBe(false)
  expect(releases).toBe(1)
  markReply?.()
  late.resolve()
  await late.promise
  expect(
    await ledger.recover(first, true, () => {
      throw new Error('known ACK must not resend')
    }),
  ).toBe(true)
  expect(ledger.hasPhysicalOwner(owner)).toBe(false)
  expect(releases).toBe(2)
})

test('same-Session new claim inherits logical notification while unknown physical notification remains pinned', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
    first = draft('one', 'old')
  ledger.begin(first)
  await ledger.recover(first, false, () => {
    throw new Error('queued claim must not recover')
  })
  await ledger.replay(first, () => Promise.resolve())
  ledger.notify(first)
  const late = Promise.withResolvers<void>()
  let releases = 0,
    markReply: (() => void) | undefined
  await ledger.flush(
    () => true,
    () => (settled) => {
      markReply = () => settled('reply')
      return {
        owner,
        result: Promise.reject(new Error('notification caller deadline')),
        settled: late.promise,
        release: () => {
          releases++
        },
        exited: () => false,
      }
    },
  )
  const successor = draft('one', 'new')
  ledger.begin(successor) // Capacity one: actual claim must not self-lock on its wake reply.
  expect(() => ledger.begin(draft('other'))).toThrow('capacity')
  expect(ledger.hasPhysicalOwner(owner)).toBe(true)
  ledger.finish(successor.runId)
  expect(ledger.pending()).toBe(true) // Old physical uncertainty is not a Run authority transfer.
  expect(releases).toBe(0)
  markReply?.()
  late.resolve()
  await late.promise
  expect(ledger.pending()).toBe(false)
  expect(releases).toBe(1)
})

test('an empty inherited claim retains notification, and exact native exit releases only physical uncertainty', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
    first = draft('one', 'old')
  ledger.begin(first)
  await ledger.recover(first, false, () => {
    throw new Error('no recovery dispatch')
  })
  await ledger.replay(first, () => Promise.resolve())
  ledger.notify(first)
  const empty = draft('one', 'empty')
  ledger.begin(empty)
  ledger.claimEmpty(empty.runId)
  let exited = false,
    releases = 0
  const lost = new Error('transport-unknown')
  await ledger.flush(
    () => true,
    () => () => ({
      owner,
      result: Promise.reject(lost),
      settled: Promise.reject(lost),
      release: () => {
        releases++
      },
      exited: () => exited,
    }),
  )
  ledger.reconcilePhysical()
  expect(releases).toBe(0)
  expect(ledger.hasPhysicalOwner(owner)).toBe(true)
  exited = true
  ledger.reconcilePhysical()
  expect(releases).toBe(1)
  expect(ledger.pending()).toBe(true)
  await ledger.flush(
    () => true,
    () =>
      success(() => {
        releases++
      }),
  )
  expect(ledger.pending()).toBe(true)
  ledger.acknowledgeIdle('one', owner)
  expect(ledger.pending()).toBe(false)
  expect(releases).toBe(2)
})

test('every recovery phase rejects a different lease, owner or version for the same Run before dispatch', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
    original = draft('identity')
  ledger.begin(original)
  let dispatches = 0,
    replays = 0
  const start: RecoveryDispatchStart = (settled, captureOwner) => {
    dispatches++
    return success(() => {})(settled, captureOwner)
  }
  const variants: ExecutionOwnership[] = [
    { ...original, leaseId: 'another-lease' },
    { ...original, owner: { ...original.owner, incarnation: 'another-owner' } },
    {
      ...original,
      versions: { ...original.versions, kernel: { ...original.versions.kernel, artifactId: 'b'.repeat(64) } },
    },
  ]
  for (const other of variants) {
    expect(() => ledger.begin(other)).toThrow('changed identity')
    await expect(ledger.recover(other, true, start)).rejects.toThrow('changed identity')
    await expect(
      ledger.replay(other, async () => {
        replays++
      }),
    ).rejects.toThrow('changed identity')
    expect(() => ledger.notify(other)).toThrow('changed identity')
  }
  expect(dispatches).toBe(0)
  expect(replays).toBe(0)
  expect(await ledger.recover(original, true, start)).toBe(true)
  await ledger.replay(original, () => Promise.resolve())
  ledger.notify(original)
  await ledger.flush(
    () => true,
    () => success(() => {}),
  )
  expect(ledger.pending()).toBe(true)
  ledger.acknowledgeIdle('identity', owner)
  expect(ledger.pending()).toBe(false)
})

test('notification failure is observed once and observer failure cannot lose retry responsibility', async () => {
  const observations: RecoveryNotificationFailure[] = []
  const ledger = new RuntimeRecoveryResponsibility(
    () => {},
    1,
    (failure) => {
      observations.push(failure)
      throw new Error('observer failed')
    },
  )
  const original = draft('observed')
  ledger.begin(original)
  await ledger.recover(
    original,
    false,
    success(() => {}),
  )
  await ledger.replay(original, () => Promise.resolve())
  ledger.notify(original)
  const failed: RecoveryDispatchStart = () => {
    throw new Error('not submitted')
  }
  await ledger.flush(
    () => true,
    () => failed,
  )
  await ledger.flush(
    () => true,
    () => failed,
  )
  expect(observations).toEqual([
    {
      sessionId: 'observed',
      runId: 'observed',
      errorCode: 'RECOVERY_NOTIFICATION_FAILED',
      physicalPending: false,
      owner: null,
    },
  ])
  expect(ledger.pending()).toBe(true)
  await ledger.flush(
    () => true,
    () => success(() => {}),
  )
  expect(ledger.pending()).toBe(true)
  ledger.acknowledgeIdle('observed', owner)
  expect(ledger.pending()).toBe(false)

  const pendingObservations: RecoveryNotificationFailure[] = []
  const pendingLedger = new RuntimeRecoveryResponsibility(
    () => {},
    1,
    (failure) => {
      pendingObservations.push(failure)
      throw new Error('observer failed with a physical owner')
    },
  )
  const pending = draft('observed-physical')
  pendingLedger.begin(pending)
  await pendingLedger.recover(
    pending,
    false,
    success(() => {}),
  )
  await pendingLedger.replay(pending, () => Promise.resolve())
  pendingLedger.notify(pending)
  const late = Promise.withResolvers<void>()
  let releases = 0,
    markReply: (() => void) | undefined
  await pendingLedger.flush(
    () => true,
    () => (settled, captureOwner) => {
      captureOwner(owner)
      markReply = () => settled('reply')
      return {
        owner,
        result: Promise.reject(new Error('notification caller deadline')),
        settled: late.promise,
        release: () => {
          releases++
        },
        exited: () => false,
      }
    },
  )
  expect(pendingObservations).toEqual([
    {
      sessionId: pending.sessionId,
      runId: pending.runId,
      errorCode: 'RECOVERY_NOTIFICATION_FAILED',
      physicalPending: true,
      owner,
    },
  ])
  expect(pendingLedger.hasPhysicalOwner(owner)).toBe(true)
  expect(releases).toBe(0)
  await pendingLedger.flush(
    () => true,
    () => {
      throw new Error('unknown physical notification must not resend')
    },
  )
  expect(pendingObservations).toHaveLength(1)
  markReply?.()
  late.resolve()
  await late.promise
  expect(pendingLedger.hasPhysicalOwner(owner)).toBe(false)
  expect(releases).toBe(1)
  expect(pendingLedger.pending()).toBe(true)
  pendingLedger.acknowledgeIdle(pending.sessionId, owner)
  expect(pendingLedger.pending()).toBe(false)
})
test('only a matching durable claim ACK may advance the canonical fence used for recovery', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
    original = draft('canonical')
  ledger.begin(original)
  expect(() => ledger.acknowledgeClaim(original, { ...original, fence: 0 })).toThrow('changed identity')
  expect(() => ledger.acknowledgeClaim(original, { ...original, leaseId: 'wrong', fence: 8 })).toThrow(
    'changed identity',
  )
  const canonical = { ...original, fence: 8 }
  ledger.acknowledgeClaim(original, canonical)
  await expect(
    ledger.recover(
      original,
      true,
      success(() => {}),
    ),
  ).rejects.toThrow('changed identity')
  expect(
    await ledger.recover(
      canonical,
      true,
      success(() => {}),
    ),
  ).toBe(true)
  await ledger.replay(canonical, () => Promise.resolve())
  ledger.notify(canonical)
  await ledger.flush(
    () => true,
    () => success(() => {}),
  )
  expect(ledger.pending()).toBe(true)
  ledger.acknowledgeIdle('canonical', owner)
  expect(ledger.pending()).toBe(false)
})
test('capacity waiting precedes actual Coordinator persistence and the same Session remains claimable after capacity returns', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1)
  const occupied = draft('occupied')
  ledger.begin(occupied)
  let writes = 0
  const coordinator: RuntimeCoordinator = new RuntimeCoordinator({
    async claim(value) {
      writes++
      ledger.begin(value)
      const canonical = { ...value, fence: value.fence + 7 }
      ledger.acknowledgeClaim(value, canonical)
      return canonical
    },
    async release() {},
    async revoke() {},
  })
  const kernel: RuntimeOwner = { ...owner, generation: 1 }
  const driver: RuntimeOwner = { unitId: 'driver.pi', generation: 1, incarnation: 'real-driver' }
  const version = (value: RuntimeOwner) => ({
    unitId: value.unitId,
    generation: value.generation,
    artifactId: 'a'.repeat(64),
  })
  for (const value of [kernel, driver]) {
    coordinator.register(value, version(value), {
      id: value.unitId,
      kind: value.unitId === 'kernel' ? 'kernel' : 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 23,
    })
    coordinator.activate(value)
  }
  const bindings = { kernel: version(kernel), driver: version(driver), plugins: [], hooks: [] }
  const signal = new AbortController().signal
  const claim = ledger.withClaimReservation('waiting-session', signal, () =>
    coordinator.claim(kernel, 'waiting-session', 'waiting-run', bindings),
  )
  await Promise.resolve()
  expect(writes).toBe(0)
  expect(coordinator.executionForSession('waiting-session')).toBeNull()
  ledger.finish(occupied.runId)
  const actual = await claim
  expect(actual).not.toBeNull()
  expect(writes).toBe(1)
  // The actual Coordinator must accept the same Session/Run again; no blocked
  // UNKNOWN was installed while capacity was unavailable.
  if (!actual) throw new Error('Actual Coordinator claim missing')
  expect(await coordinator.claim(kernel, 'waiting-session', 'waiting-run', bindings)).toEqual(actual)
  expect(await coordinator.claim(kernel, 'waiting-session', 'different-run', bindings)).toBeNull()
  expect(writes).toBe(1)
  if (!actual) throw new Error('Actual Coordinator claim missing')
  await coordinator.releaseExecution(actual)
  ledger.finish(actual.runId)
  expect(ledger.pending()).toBe(false)
})

test('cancelled waiting, empty operation and throwing operation return claim reservations', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
    occupied = draft('occupied')
  ledger.begin(occupied)
  const controller = new AbortController(),
    failure = new Error('cancelled source')
  let called = false
  const waiting = ledger.withClaimReservation('cancelled', controller.signal, async () => {
    called = true
  })
  controller.abort(failure)
  await expect(waiting).rejects.toBe(failure)
  expect(called).toBe(false)
  ledger.finish(occupied.runId)
  const signal = new AbortController().signal
  expect(await ledger.withClaimReservation('empty', signal, () => Promise.resolve(null))).toBeNull()
  const thrown = new Error('before actual claim')
  await expect(ledger.withClaimReservation('throws', signal, () => Promise.reject(thrown))).rejects.toBe(thrown)
  const accepted = draft('after-empty-and-throw')
  await ledger.withClaimReservation(accepted.sessionId, signal, async () => {
    ledger.begin(accepted)
  })
  ledger.finish(accepted.runId)
  expect(ledger.pending()).toBe(false)
})
test('canonical claim ACK remains reconcilable when actual Coordinator detects owner revocation after the write', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1)
  const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'revoked-during-write' }
  const version = { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }
  let pending: ExecutionOwnership | undefined
  const coordinator: RuntimeCoordinator = new RuntimeCoordinator({
    async claim(value) {
      ledger.begin(value)
      const canonical = { ...value, fence: value.fence + 7 }
      ledger.acknowledgeClaim(value, canonical)
      pending = canonical // Same ACK transition used by Host pendingClaims.
      await coordinator.revoke(kernel)
      return canonical
    },
    async release() {},
    async revoke() {},
  })
  coordinator.register(kernel, version, {
    id: 'kernel',
    kind: 'kernel',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: 23,
  })
  coordinator.activate(kernel)
  const bindings = { kernel: version, driver: version, plugins: [], hooks: [] }
  await expect(
    ledger.withClaimReservation('revoked-session', new AbortController().signal, () =>
      coordinator.claim(kernel, 'revoked-session', 'revoked-run', bindings),
    ),
  ).rejects.toMatchObject({ code: 'EXECUTION_DEPENDENCY_REVOKED' })
  if (!pending) throw new Error('Canonical pending claim missing')
  expect(pending.fence).toBeGreaterThan(7)
  expect(
    await ledger.recover(
      pending,
      true,
      success(() => {}),
    ),
  ).toBe(true)
  await ledger.replay(pending, () => Promise.resolve())
  ledger.notify(pending)
  await ledger.flush(
    () => true,
    () => success(() => {}),
  )
  expect(ledger.pending()).toBe(true)
  ledger.acknowledgeIdle('revoked-session', owner)
  expect(ledger.pending()).toBe(false)
})
test('recovery kick waits outside dependency preparation until real admission cleanup and same-Session notification can transfer', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
    old = draft('same-session', 'old')
  ledger.begin(old)
  await ledger.recover(
    old,
    false,
    success(() => {}),
  )
  await ledger.replay(old, () => Promise.resolve())
  ledger.notify(old)
  let ready = false,
    prepared = 0
  const next = draft(old.sessionId, 'next')
  const claim = ledger.withClaimReservation(
    next.sessionId,
    new AbortController().signal,
    async () => {
      prepared++
      ledger.begin(next)
    },
    () => ready,
  )
  ledger.refreshAdmissions()
  await Promise.resolve()
  expect(prepared).toBe(0)
  expect(ledger.hasSession(old.sessionId)).toBe(true)
  ready = true
  ledger.refreshAdmissions()
  await claim
  expect(prepared).toBe(1)
  // At maximum one, this is a transfer of the original notification obligation,
  // not admission through a second responsibility slot.
  expect(() => ledger.begin(draft('unrelated'))).toThrow('capacity')
  ledger.finish(next.runId)
  expect(ledger.pending()).toBe(false)
})
test('actual coordination port preserves full-slot idempotent claims and immediate draining null through Host admission composition', async () => {
  const ledger = new RuntimeRecoveryResponsibility(() => {}, 1)
  let writes = 0,
    preparations = 0,
    ready = true
  const coordinator = new RuntimeCoordinator({
    async claim(value) {
      writes++
      ledger.begin(value)
      return value
    },
    async release() {},
    async revoke() {},
  })
  const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'port-kernel' }
  const driver: RuntimeOwner = { unitId: 'driver.pi', generation: 1, incarnation: 'port-driver' }
  const parent: RuntimeOwner = { unitId: 'host', generation: 1, incarnation: 'port-parent' }
  const version = (value: RuntimeOwner) => ({
    unitId: value.unitId,
    generation: value.generation,
    artifactId: 'a'.repeat(64),
  })
  for (const value of [kernel, driver]) {
    coordinator.register(value, version(value), {
      id: value.unitId,
      kind: value.unitId === 'kernel' ? 'kernel' : 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 23,
    })
    coordinator.activate(value)
  }
  let client: IpcPeer | undefined
  const server = new IpcPeer({ owner: parent, remote: kernel, transport: { send: (frame) => client?.receive(frame) } })
  client = new IpcPeer({ owner: kernel, remote: parent, transport: { send: (frame) => server.receive(frame) } })
  const dispose = registerRuntimeCoordinatorPort(server, coordinator, {
    owner: kernel,
    bindings: () => ({ kernel: version(kernel), driver: version(driver), plugins: [], hooks: [] }),
    withClaimDependencies: (sessionId, signal, operation) =>
      withRuntimeClaimAdmission({
        coordinator,
        responsibility: ledger,
        owner: kernel,
        sessionId,
        signal,
        operation,
        pending: () => false,
        ready: () => ready,
        prepare: () => {
          preparations++
          return operation()
        },
      }),
  })
  try {
    const input = { sessionId: 'port-session', runId: 'port-run' }
    const actual = await client.call('execution.claim', input, executionOwnershipSchema.nullable())
    expect(actual).not.toBeNull()
    ready = false // Both real admission and capacity now deny any fresh preparation.
    expect(await client.call('execution.claim', input, executionOwnershipSchema.nullable())).toEqual(actual)
    expect(
      await client.call('execution.claim', { ...input, runId: 'different-run' }, executionOwnershipSchema.nullable()),
    ).toBeNull()
    const successor: RuntimeOwner = { ...kernel, generation: 2, incarnation: 'port-kernel-successor' }
    coordinator.register(successor, version(successor), {
      id: 'kernel',
      kind: 'kernel',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 23,
    })
    coordinator.activate(successor)
    expect(coordinator.role(kernel)).toBe('draining')
    expect(
      await client.call(
        'execution.claim',
        { sessionId: 'new-session', runId: 'new-run' },
        executionOwnershipSchema.nullable(),
      ),
    ).toBeNull()
    expect(writes).toBe(1)
    expect(preparations).toBe(1)
    ledger.finish(input.runId)
    expect(ledger.pending()).toBe(false)
  } finally {
    dispose()
    server.close()
    client.close()
  }
})
test('denial before or after a wake ACK retains a retry without replaying durable recovery', async () => {
  for (const beforeAck of [true, false]) {
    const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
      original = draft(`denial-${beforeAck}`)
    ledger.begin(original)
    await ledger.recover(
      original,
      false,
      success(() => {}),
    )
    await ledger.replay(original, () => Promise.resolve())
    ledger.notify(original)
    const reply = Promise.withResolvers<void>(),
      started = Promise.withResolvers<void>()
    let releases = 0,
      calls = 0
    const flushing = ledger.flush(
      () => true,
      () => (_settled, captureOwner) => {
        calls++
        captureOwner(owner)
        started.resolve()
        return {
          owner,
          result: reply.promise,
          settled: reply.promise,
          release: () => {
            releases++
          },
          exited: () => false,
        }
      },
    )
    await started.promise
    if (beforeAck) expect(ledger.retryNotification(original.sessionId)).toBe(true)
    reply.resolve()
    await flushing
    if (!beforeAck) expect(ledger.retryNotification(original.sessionId)).toBe(true)
    expect(ledger.pending()).toBe(true)
    await ledger.flush(
      () => true,
      () => (settled, captureOwner) => {
        calls++
        return success(() => {
          releases++
        })(settled, captureOwner)
      },
    )
    expect(calls).toBe(2)
    expect(releases).toBe(2)
    ledger.acknowledgeIdle(original.sessionId, owner)
    expect(ledger.pending()).toBe(false)
  }
})

test('exact actual Session idle before or after wake ACK consumes logical notification without releasing unknown physical work', async () => {
  for (const beforeAck of [true, false]) {
    const ledger = new RuntimeRecoveryResponsibility(() => {}, 1),
      original = draft(`idle-${beforeAck}`)
    ledger.begin(original)
    await ledger.recover(
      original,
      false,
      success(() => {}),
    )
    await ledger.replay(original, () => Promise.resolve())
    ledger.notify(original)
    const reply = Promise.withResolvers<void>(),
      started = Promise.withResolvers<void>()
    let releases = 0
    const flushing = ledger.flush(
      () => true,
      () => (_settled, captureOwner) => {
        captureOwner(owner)
        started.resolve()
        return {
          owner,
          result: reply.promise,
          settled: reply.promise,
          release: () => {
            releases++
          },
          exited: () => false,
        }
      },
    )
    await started.promise
    ledger.acknowledgeIdle(original.sessionId, { ...owner, incarnation: 'wrong-owner' })
    expect(ledger.pending()).toBe(true)
    if (beforeAck) {
      ledger.acknowledgeIdle(original.sessionId, owner)
      expect(releases).toBe(0)
      expect(ledger.pending()).toBe(true)
    }
    reply.resolve()
    await flushing
    if (!beforeAck) {
      expect(ledger.pending()).toBe(true)
      ledger.acknowledgeIdle(original.sessionId, owner)
    }
    expect(releases).toBe(1)
    expect(ledger.pending()).toBe(false)
  }
})
