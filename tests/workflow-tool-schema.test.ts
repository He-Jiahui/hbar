import { expect, test } from 'bun:test'
import { z } from 'zod'
import { workflowPathSchema } from '@hbar/contracts/workflow'
import {
  workflowUpdateActionSchema,
  workflowUpdateToolSchema,
  workflowCheckpointToolSchema,
  workflowExpandScopeToolSchema,
} from '../plugins/workflow/src/update-tool-schema'

test('scope path restrictions are advertised to the model without weakening Host validation', () => {
  const schema = JSON.stringify(z.toJSONSchema(workflowExpandScopeToolSchema))
  expect(schema).toContain('Workspace-relative file or directory prefix')
  expect(schema).toContain('No absolute paths')
  for (const path of ['proof.txt', 'src', 'src/components'])
    expect(workflowPathSchema.safeParse(path).success).toBe(true)
  for (const path of ['C:/repo/proof.txt', '/repo/proof.txt', '../proof.txt', 'src/**'])
    expect(workflowPathSchema.safeParse(path).success).toBe(false)
})

test('focused tools expose smaller object schemas without weakening version preconditions', () => {
  const checkpoint = {
    itemId: 'proof',
    outcome: 'complete',
    summary: 'Verified',
    expectedFocusRevision: 1,
    expectedPlanRevision: 2,
  }
  expect(workflowCheckpointToolSchema.safeParse(checkpoint).success).toBe(true)
  expect(workflowCheckpointToolSchema.safeParse({ ...checkpoint, expectedFocusRevision: undefined }).success).toBe(
    false,
  )
  expect(workflowCheckpointToolSchema.safeParse({ ...checkpoint, expectedPlanRevision: 0 }).success).toBe(false)
  expect(workflowCheckpointToolSchema.safeParse({ ...checkpoint, scope: {} }).success).toBe(false)
  const schemas = [workflowCheckpointToolSchema, workflowExpandScopeToolSchema].map((schema) => z.toJSONSchema(schema))
  expect(schemas.every((schema) => schema.type === 'object' && !schema.anyOf && !schema.oneOf)).toBe(true)
  expect(schemas.reduce((size, schema) => size + JSON.stringify(schema).length, 0)).toBeLessThan(
    JSON.stringify(z.toJSONSchema(workflowUpdateToolSchema)).length,
  )
})

test('workflow update advertises object parameters while retaining per-action Host validation', () => {
  const schema = z.toJSONSchema(workflowUpdateToolSchema)
  expect(schema.type).toBe('object')
  expect(schema.oneOf).toBeUndefined()
  expect(schema.anyOf).toBeUndefined()
  expect(schema.properties).toHaveProperty('action')
  expect(schema.properties).toHaveProperty('scope')
  expect(schema.required).toEqual(['action', 'expectedRevision'])
  const valid = [
    { action: 'complete', expectedRevision: 2 },
    { action: 'checkpoint', itemId: 'proof', outcome: 'complete', summary: 'Verified', expectedRevision: 2 },
    {
      action: 'expand_scope',
      itemId: 'proof',
      scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
      reason: 'Authorized proof task',
      expectedRevision: 2,
    },
  ]
  for (const input of valid) {
    expect(workflowUpdateToolSchema.safeParse(input).success).toBe(true)
    expect(workflowUpdateActionSchema.parse(workflowUpdateToolSchema.parse(input))).toEqual(
      workflowUpdateActionSchema.parse(input),
    )
  }
  const invalid = [
    {},
    { action: 'expand_scope', expectedRevision: 2 },
    { action: 'checkpoint', expectedRevision: 2, itemId: 'proof', summary: 'No outcome' },
    { action: 'complete', expectedRevision: 0 },
    { action: 'complete', expectedRevision: 2, extra: true },
  ]
  for (const input of invalid) expect(workflowUpdateToolSchema.safeParse(input).success).toBe(false)
})

test('provider-filled fields from other actions cannot change the selected mutation', () => {
  const filled = {
    action: 'expand_scope',
    itemId: 'proof',
    expectedRevision: 2,
    scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
    reason: 'Authorized scope',
    outcome: 'progress',
    summary: 'Unused checkpoint fields',
    evidenceIds: [],
    nextItemId: null,
  }
  const parsed = workflowUpdateActionSchema.parse(workflowUpdateToolSchema.parse(filled))
  expect(parsed).toEqual({
    action: 'expand_scope',
    itemId: 'proof',
    expectedRevision: 2,
    scope: filled.scope,
    reason: filled.reason,
  })
  const complete = workflowUpdateActionSchema.parse(workflowUpdateToolSchema.parse({ ...filled, action: 'complete' }))
  expect(complete).toEqual({ action: 'complete', expectedRevision: 2 })
  expect(workflowUpdateToolSchema.safeParse({ ...filled, unsafeExtra: true }).success).toBe(false)
  expect(workflowUpdateToolSchema.safeParse({ ...filled, scope: undefined }).success).toBe(false)
})
