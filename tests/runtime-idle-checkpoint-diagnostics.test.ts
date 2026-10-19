import { expect, test } from 'bun:test'
import { HbarError, diagnosticEvent } from '@hbar/contracts'
import {
  IdleCheckpointDiagnostic,
  type IdleCheckpointStage,
} from '../apps/host/src/runtime-idle-checkpoint-diagnostics'

type Event = Parameters<typeof diagnosticEvent>[0]
const owner = { unitId: 'kernel', generation: 42, incarnation: 'checkpoint-exact-owner' }

test('real checkpoint rejection keeps result, last attempted phase and bounded elapsed without private error payload', async () => {
  const events: Event[] = []
  let time = 10
  const trace = new IdleCheckpointDiagnostic({
    domain: 'goal',
    owner,
    now: () => time,
    emit: (event) => {
      events.push(event)
    },
  })
  let ack = false
  const operation = async () => {
    trace.at('preview')
    await Promise.resolve()
    trace.at('offer')
    ack = true
    trace.at('quiesce')
    time = 29
    throw new HbarError('IPC_TIMEOUT', 'SECRET_CANARY_prompt_credentials_rpc_payload')
  }
  let result: ReturnType<IdleCheckpointDiagnostic['result']>
  try {
    await operation()
    result = trace.result('prepared')
  } catch (error) {
    result = trace.result(ack ? 'unknown' : 'busy', error)
  }
  expect(result).toEqual({ status: 'unknown', owner })
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    phase: 'quiesce.generation.42',
    durationMs: 19,
    level: 'error',
    contextId: owner.unitId,
    requestId: owner.incarnation,
    errorCode: 'IPC_TIMEOUT',
    outcome: 'unknown',
  })
  expect(JSON.stringify(events)).not.toContain('SECRET_CANARY')
  trace.result('unknown')
  expect(events).toHaveLength(1)
})

test('busy preview is debug and unknown native or nonallowlisted typed codes cannot leak', () => {
  for (const error of [new Error('SECRET_NATIVE'), new HbarError('SECRET_DYNAMIC_CODE', 'SECRET_TYPED')]) {
    const events: Event[] = []
    const trace = new IdleCheckpointDiagnostic({
      domain: 'maintenance',
      owner,
      emit: (event) => {
        events.push(event)
      },
    })
    trace.at('preview')
    expect(trace.result('busy', error)).toEqual({ status: 'busy', owner })
    expect(events[0]).toMatchObject({ level: 'debug', outcome: 'skipped', errorCode: 'IDLE_CHECKPOINT_ERROR' })
    expect(JSON.stringify(events)).not.toContain('SECRET')
  }
})

test('observer throw cannot replace checkpoint authority or original error outcome', () => {
  const trace = new IdleCheckpointDiagnostic({
    domain: 'goal',
    owner,
    emit() {
      throw new Error('Observer failure')
    },
  })
  trace.at('commit')
  expect(trace.result('unknown', new HbarError('IPC_DISCONNECTED', 'private'))).toEqual({ status: 'unknown', owner })
})

test('fixed attempted stages preserve successful noop/prepared and identity mismatch outcomes', () => {
  const stages: IdleCheckpointStage[] = [
    'admission',
    'catalog',
    'preview',
    'offer',
    'quiesce',
    'commit',
    'arm',
    'identity',
  ]
  for (const stage of stages) {
    const events: Event[] = []
    const trace = new IdleCheckpointDiagnostic({
      domain: 'maintenance',
      owner,
      now: () => 100,
      emit: (event) => {
        events.push(event)
      },
    })
    trace.at(stage)
    expect(trace.result('prepared')).toEqual({ status: 'prepared', owner })
    expect(events[0]).toMatchObject({
      phase: `${stage}.generation.42`,
      level: 'debug',
      durationMs: 0,
      outcome: 'success',
    })
  }
  const events: Event[] = []
  const trace = new IdleCheckpointDiagnostic({
    domain: 'goal',
    owner,
    emit: (event) => {
      events.push(event)
    },
  })
  trace.at('identity')
  trace.result('unknown')
  expect(events[0]).toHaveProperty('errorCode', 'IDLE_CHECKPOINT_IDENTITY_UNCONFIRMED')
})

test('all terminal outcomes survive public diagnostic validation and emit once', () => {
  for (const [status, outcome] of [
    ['busy', 'skipped'],
    ['noop', 'success'],
    ['prepared', 'success'],
    ['unknown', 'unknown'],
  ] as const) {
    const events: Event[] = []
    const trace = new IdleCheckpointDiagnostic({
      domain: 'goal',
      owner,
      emit: (input) => {
        events.push(diagnosticEvent(input))
      },
    })
    expect(trace.result(status)).toEqual({ status, owner })
    trace.at('identity')
    trace.result(status)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ schemaVersion: 1, event: 'host.runtime_idle_goal_checkpoint', outcome })
  }
})

test('clock anomalies cannot invalidate the public diagnostic record or checkpoint result', () => {
  for (const [end, expectedDuration] of [
    [-20, 0],
    [Number.NaN, 0],
    [Infinity, 0],
    [Number.MAX_VALUE, Number.MAX_SAFE_INTEGER],
  ] as const) {
    const events: Event[] = []
    let reads = 0
    const trace = new IdleCheckpointDiagnostic({
      domain: 'maintenance',
      owner,
      now: () => (reads++ === 0 ? 10 : end),
      emit: (input) => {
        events.push(diagnosticEvent(input))
      },
    })
    expect(trace.result('prepared')).toEqual({ status: 'prepared', owner })
    expect(events).toHaveLength(1)
    expect(events[0]?.durationMs).toBe(expectedDuration)
  }
})
