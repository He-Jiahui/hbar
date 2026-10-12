import { describe, expect, test } from 'bun:test'
import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'
import { admitNodeProcess } from './node-admission-gate'

function target(
  overrides: Partial<Extract<NodeExecutionTarget, { kind: 'node' }>> = {},
): Extract<NodeExecutionTarget, { kind: 'node' }> {
  return {
    kind: 'node',
    nodeId: 'build-box',
    nodeName: 'Build Box',
    rootId: 'engine',
    nodePath: '/srv/engine',
    rootAccess: 'write',
    capabilitySummary: {
      backends: ['bwrap'],
      selectedBackend: 'bwrap',
      filesystem: 'enforced',
      network: 'enforced',
      floor: { process: true, network: true, terminal: false, osConfinement: 'required', backend: 'auto' },
      observedAt: 1,
    },
    ...overrides,
  }
}

const request = {
  snapshotNetworkEnabled: true,
  toolEffect: 'process' as const,
}

describe('remote node process admission', () => {
  test('intersects snapshot network access with the local floor', () => {
    const observed = target({
      capabilitySummary: {
        ...target().capabilitySummary,
        floor: { process: true, network: false, terminal: false, osConfinement: 'required' },
      },
    })
    expect(admitNodeProcess({ ...request, target: observed })).toEqual({ networkEnabled: false })
  })

  test('does not block a non-process tool held on the conversation node', () => {
    expect(admitNodeProcess({ ...request, target: { kind: 'local' }, toolEffect: 'other' })).toEqual({
      networkEnabled: false,
    })
  })

  test('allows remote reads when process execution is disabled', () => {
    const observed = target({
      capabilitySummary: {
        ...target().capabilitySummary,
        floor: { process: false, network: false, terminal: false, osConfinement: 'required' },
      },
    })
    expect(admitNodeProcess({ ...request, target: observed, toolEffect: 'read' })).toEqual({ networkEnabled: false })
  })

  test('rejects process-disabled nodes and workspace writes on read-only roots', () => {
    const base = target()
    if (base.kind !== 'node') throw new Error('expected node target')
    expect(() =>
      admitNodeProcess({
        ...request,
        target: {
          ...base,
          capabilitySummary: { ...base.capabilitySummary, floor: { ...base.capabilitySummary.floor, process: false } },
        },
      }),
    ).toThrow('disables process execution')
    expect(() =>
      admitNodeProcess({ ...request, target: { ...base, rootAccess: 'read' }, toolEffect: 'write' }),
    ).toThrow('read-only')
  })

  test('allows a read-only root shell when the node can confine filesystem and network access', () => {
    const base = target()
    expect(
      admitNodeProcess({ ...request, target: { ...base, rootAccess: 'read' }, snapshotNetworkEnabled: false }),
    ).toEqual({ networkEnabled: false })
  })

  test('fails closed when required filesystem or network confinement is unavailable', () => {
    const base = target()
    if (base.kind !== 'node') throw new Error('expected node target')
    const filesystemUnavailable: NodeExecutionTarget = {
      ...base,
      capabilitySummary: { ...base.capabilitySummary, filesystem: 'none' },
    }
    expect(() => admitNodeProcess({ ...request, target: filesystemUnavailable })).toThrow('filesystem confinement')
    const networkUnavailable: NodeExecutionTarget = {
      ...base,
      capabilitySummary: { ...base.capabilitySummary, network: 'env-only' },
    }
    expect(() => admitNodeProcess({ ...request, snapshotNetworkEnabled: false, target: networkUnavailable })).toThrow(
      'disabled network',
    )
  })

  test('rejects a configured backend that differs from the freshly observed active backend', () => {
    const base = target()
    const mismatched = target({
      capabilitySummary: {
        ...base.capabilitySummary,
        floor: { ...base.capabilitySummary.floor, backend: 'seatbelt' },
      },
    })
    expect(() => admitNodeProcess({ ...request, target: mismatched })).toThrow('differs from the workspace node floor')
  })

  test('requires process isolation for process-backed read and write tools', () => {
    const base = target()
    expect(admitNodeProcess({ ...request, target: base, toolEffect: 'read', requiresProcess: true })).toEqual({
      networkEnabled: false,
    })
    expect(() =>
      admitNodeProcess({
        ...request,
        target: {
          ...base,
          capabilitySummary: { ...base.capabilitySummary, floor: { ...base.capabilitySummary.floor, process: false } },
        },
        toolEffect: 'read',
        requiresProcess: true,
      }),
    ).toThrow('disables process execution')
  })
})
