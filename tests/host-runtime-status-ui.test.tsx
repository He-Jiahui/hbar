import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createHostRuntimeStatus,
  hostRuntimePhase,
  type HostRuntimeStatusPort,
  type HostRuntimeStatusState,
} from '../packages/app-runtime/src/host-runtime-status'
import {
  HbarRuntimeStatusDetails,
  RUNTIME_GENERATION_PREVIEW_LIMIT,
} from '../packages/app-react/src/host-runtime-status'
import { hostRuntimeStatusCopy } from '../apps/web/src/host-runtime-status-copy'
import type { RuntimeUnitSnapshot } from '@hbar/contracts/runtime'

function unit(index: number): RuntimeUnitSnapshot {
  return {
    descriptor: {
      id: `plugin:test-${index}`,
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 24,
    },
    queuedArtifactId: null,
    generations: [
      {
        unitId: `plugin:test-${index}`,
        generation: 1,
        incarnation: `owner-${index}`,
        artifactId: 'b'.repeat(64),
        role: 'default',
        phase: 'serving',
        pid: 100 + index,
        references: { runs: 0, resources: 0, requests: 0 },
        lastHeartbeatAt: 1,
        failures: 0,
        nextAttemptAt: null,
        reasonCode: null,
      },
    ],
  }
}
function status(count = 1): HostRuntimeStatusState {
  return {
    snapshot: {
      instanceId: 'ui-runtime-host',
      revision: 1,
      ready: true,
      units: Array.from({ length: count }, (_, index) => unit(index)),
      preparedArtifactSets: [],
    },
    operations: [],
    syncing: false,
    errorCode: null,
  }
}

test('visible readers share a Host subscription, last unsubscribe and disposal release it, and a late wrong-Host result cannot replace the confirmed state', async () => {
  let subscribeCount = 0,
    releaseCount = 0,
    refreshCount = 0
  let publish: (state: HostRuntimeStatusState) => void = () => {}
  const port: HostRuntimeStatusPort = {
    state: () => status(),
    subscribe(listener) {
      subscribeCount++
      publish = listener
      return () => {
        releaseCount++
      }
    },
    async refresh() {
      refreshCount++
    },
  }
  const errors: unknown[] = []
  const model = createHostRuntimeStatus('ui-runtime-host', port, (error) => errors.push(error))
  expect(subscribeCount).toBe(0)
  const first = model.reader.subscribe(() => {
    throw new Error('Local observer failure')
  })
  const second = model.reader.subscribe(() => {})
  expect(subscribeCount).toBe(1)
  publish(status(2))
  expect(errors).toHaveLength(1)
  expect(model.reader.getSnapshot().snapshot?.units).toHaveLength(2)
  expect(Object.isFrozen(model.reader.getSnapshot().snapshot?.units)).toBe(true)
  const foreign = status(3)
  expect(() => publish({ ...foreign, snapshot: { ...foreign.snapshot!, instanceId: 'other-host' } })).toThrow(
    'different Host',
  )
  expect(model.reader.getSnapshot().snapshot?.units).toHaveLength(2)
  first()
  first()
  expect(releaseCount).toBe(0)
  second()
  expect(releaseCount).toBe(1)
  const third = model.reader.subscribe(() => {})
  expect(subscribeCount).toBe(2)
  await model.refresh()
  expect(refreshCount).toBe(1)
  model.dispose()
  third()
  expect(releaseCount).toBe(2)
  publish(status(4))
  expect(model.reader.getSnapshot().snapshot?.units).toHaveLength(2)
})

test('an invalid initial projection and duplicate identities have a controlled unavailable state and preserve the last confirmed data', () => {
  let publish: (state: HostRuntimeStatusState) => void = () => {}
  const foreign = status()
  const model = createHostRuntimeStatus(
    'ui-runtime-host',
    {
      state: () => ({ ...foreign, snapshot: { ...foreign.snapshot!, instanceId: 'stale-host' } }),
      subscribe(listener) {
        publish = listener
        return () => {}
      },
      async refresh() {},
    },
    () => {},
  )
  expect(model.reader.getSnapshot()).toMatchObject({ snapshot: null, errorCode: 'RUNTIME_STATUS_UNAVAILABLE' })
  const off = model.reader.subscribe(() => {})
  publish(status())
  expect(() => publish({ ...status(), snapshot: { ...status().snapshot!, units: [unit(0), unit(0)] } })).toThrow(
    'duplicate identities',
  )
  expect(model.reader.getSnapshot().snapshot?.units).toHaveLength(1)
  off()
  model.dispose()
})

test('actual recovery, candidate preparation, retained old work and restart requirements determine the visible phase', () => {
  const value = status()
  expect(hostRuntimePhase(value)).toBe('serving')
  for (const [phase, expected] of [
    ['recovering', 'recovering'],
    ['preparing', 'preparing'],
    ['draining', 'waiting'],
  ] as const) {
    const changed = unit(0)
    changed.generations[0] = {
      ...changed.generations[0]!,
      phase,
      role: phase === 'preparing' ? 'candidate' : phase === 'draining' ? 'draining' : 'default',
      references: { runs: phase === 'draining' ? 1 : 0, resources: 0, requests: 0 },
    }
    expect(hostRuntimePhase({ ...value, snapshot: { ...value.snapshot!, units: [changed] } })).toBe(expected)
  }
  expect(
    hostRuntimePhase({
      ...value,
      snapshot: {
        ...value.snapshot!,
        sourceReload: {
          revision: 1,
          phase: 'restart_required',
          unitIds: [],
          operationId: null,
          artifactSetId: null,
          reasonCode: 'NATIVE_CODE_CHANGED',
          updatedAt: 1,
        },
      },
    }),
  ).toBe('restart_required')
  expect(hostRuntimePhase({ snapshot: null, operations: [], syncing: true, errorCode: null })).toBe('initializing')
})

test('a newer prepared source update replaces the status of an older failed update', () => {
  const value = status()
  const failure: HostRuntimeStatusState = {
    ...value,
    operations: [
      {
        operationId: 'failed-update',
        artifactSetId: 'old-artifact-set',
        phase: 'failed',
        units: [
          {
            unitId: 'plugin:test-0',
            artifactId: 'b'.repeat(64),
            generation: null,
            phase: 'failed',
            reasonCode: 'PREPARE_FAILED',
          },
        ],
        createdAt: 1,
        updatedAt: 2,
        switchedAt: null,
        cancellable: false,
      },
    ],
  }
  expect(hostRuntimePhase(failure)).toBe('failed')
  expect(
    hostRuntimePhase({
      ...failure,
      snapshot: {
        ...value.snapshot!,
        sourceReload: {
          revision: 2,
          phase: 'prepared',
          unitIds: ['plugin:test-0'],
          operationId: null,
          artifactSetId: 'new-artifact-set',
          reasonCode: null,
          updatedAt: 3,
        },
      },
    }),
  ).toBe('prepared')
})

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const count of [0, 1, 14, RUNTIME_GENERATION_PREVIEW_LIMIT, RUNTIME_GENERATION_PREVIEW_LIMIT + 1])
    test(`Host-owned ${locale} content renders ${count} actual generations with a bounded preview`, () => {
      const labels = hostRuntimeStatusCopy(locale)
      const html = renderToStaticMarkup(<HbarRuntimeStatusDetails state={status(count)} labels={labels} />)
      expect(html).toContain(labels.title)
      expect((html.match(/class="hbar-runtime-status-generation"/g) ?? []).length).toBe(
        Math.min(count, RUNTIME_GENERATION_PREVIEW_LIMIT),
      )
      if (!count) expect(html).toContain(labels.empty)
      if (count > RUNTIME_GENERATION_PREVIEW_LIMIT) expect(html).toContain(labels.more(1))
      expect(html).not.toContain('style=')
      expect(html).not.toContain('<button')
    })

test('long translated content, a recovery deadline and real failure reason remain in normal flow', () => {
  const value = status()
  const changed = unit(0)
  changed.generations[0] = {
    ...changed.generations[0]!,
    phase: 'recovering',
    nextAttemptAt: 1_900_000_000_000,
    reasonCode: 'UNIT_HEARTBEAT_LOST',
  }
  const labels = { ...hostRuntimeStatusCopy('zh-CN'), title: '运行状态与恢复诊断🛰️'.repeat(30) }
  const html = renderToStaticMarkup(
    <HbarRuntimeStatusDetails
      state={{ ...value, snapshot: { ...value.snapshot!, units: [changed] } }}
      labels={labels}
    />,
  )
  expect(html).toContain(labels.title)
  expect(html).toContain(labels.phases.recovering)
  expect(html).toContain(labels.retry(1_900_000_000_000))
  expect(html).toContain(labels.reason('UNIT_HEARTBEAT_LOST'))
  expect(html).not.toContain('style=')
})
