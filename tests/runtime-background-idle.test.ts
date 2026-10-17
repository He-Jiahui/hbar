import { describe, expect, it } from 'bun:test'
import { chatDatabaseInspectionCheckpointSchema } from '@hbar/kernel/maintenance'
import {
  RuntimePhysicalActivity,
  runtimeControllerIdleCheckpointSchema,
  runtimeMaintenanceIdleCheckpointSchema,
} from '../apps/host/src/runtime-background-idle'

describe('runtime physical activity and checkpoint metadata', () => {
  it('retains the slot across local abort, then releases once on actual settlement', () => {
    const activity = new RuntimePhysicalActivity()
    const physicalReply = activity.begin()
    const local = new AbortController()
    local.abort()
    expect(activity.snapshot()).toBe(1)
    physicalReply()
    physicalReply()
    expect(activity.snapshot()).toBe(0)
  })

  it('keeps independent unknown calls while a different call proves non-dispatch', () => {
    const activity = new RuntimePhysicalActivity()
    const unknownReply = activity.begin()
    const notDispatched = activity.begin()
    notDispatched()
    expect(activity.snapshot()).toBe(1)
    unknownReply()
    expect(activity.snapshot()).toBe(0)
  })

  it('does not accept a complete alarm-coverage claim through the incomplete checkpoint DTO', () => {
    expect(
      runtimeControllerIdleCheckpointSchema.safeParse({
        schemaVersion: 1,
        unitId: 'controller',
        coverage: 'complete',
        alarmsTransferRequired: false,
        requiredDomains: [],
        nextDueAt: null,
        state: { search: null, schedule: null },
      }).success,
    ).toBe(false)
  })

  it('transports the full public inspection cursor boundary without admitting an oversized cursor', () => {
    const checkpoint = chatDatabaseInspectionCheckpointSchema.parse({
      version: 1,
      cursor: 'c'.repeat(4_096),
      nextCheckAt: 120_000,
    })
    const value = {
      schemaVersion: 1,
      unitId: 'maintenance',
      coverage: 'incomplete',
      alarmsTransferRequired: true,
      requiredDomains: ['maintenance.inspection'],
      nextDueAt: checkpoint.nextCheckAt,
      state: {
        scheduler: {
          closed: false,
          paused: true,
          cursor: checkpoint.cursor,
          current: false,
          timer: false,
          nextDueAt: checkpoint.nextCheckAt,
        },
        operation: {
          closed: false,
          recovered: true,
          currentOperationId: null,
          recoveryPending: false,
          queuedHandoffs: 0,
        },
        statistics: { disposed: false, backfill: false, scans: 0 },
        artifacts: { closed: false, recovering: false },
        database: { activeOperationId: null, closed: false },
      },
    } satisfies ReturnType<typeof runtimeMaintenanceIdleCheckpointSchema.parse>
    expect(checkpoint.cursor?.length).toBe(4_096)
    expect(runtimeMaintenanceIdleCheckpointSchema.safeParse(value).success).toBe(true)
    expect(runtimeMaintenanceIdleCheckpointSchema.parse(value)).toEqual(value)
    const oversized = 'c'.repeat(4_097)
    expect(chatDatabaseInspectionCheckpointSchema.safeParse({ ...checkpoint, cursor: oversized }).success).toBe(false)
    expect(
      runtimeMaintenanceIdleCheckpointSchema.safeParse({
        ...value,
        state: { ...value.state, scheduler: { ...value.state.scheduler, cursor: oversized } },
      }).success,
    ).toBe(false)
  })
})
