import { expect, test } from 'bun:test'
import { z } from 'zod'
import { MAX_WORKFLOW_SCOPE_ENTRIES, workflowPathSchema, workflowScopeSchema } from '@hbar/contracts/workflow'
import {
  workflowUpdateActionSchema,
  workflowUpdateToolSchema,
  workflowCheckpointToolSchema,
} from '../plugins/workflow/src/update-tool-schema'
import { workflowExpandScopeToolSchema } from '../plugins/workflow/src'
import { workflowExpandScopeInputSchema } from '@hbar/contracts/commands/workflows'

test('model scope repair advertises one required pair and rejects legacy numeric identity without stripping', () => {
  const input = {
    itemId: 'proof',
    scope: {},
    reason: 'Authorized repair',
    expectedFocusRevision: 1,
    expectedPlanRevision: 1,
  }
  const schema = z.toJSONSchema(workflowExpandScopeToolSchema)
  expect(schema.properties).not.toHaveProperty('expectedRevision')
  expect(schema.required).toContain('expectedFocusRevision')
  expect(schema.required).toContain('expectedPlanRevision')
  expect(schema.additionalProperties).toBe(false)
  expect(schema.description).toContain('Do not supply expectedRevision')
  expect(workflowExpandScopeToolSchema.safeParse(input).success).toBe(true)
  for (const value of [
    { ...input, expectedRevision: 32 },
    { ...input, expectedFocusRevision: undefined },
    { ...input, expectedPlanRevision: undefined },
    { ...input, expectedFocusRevision: null },
    { itemId: input.itemId, scope: {}, reason: input.reason, expectedRevision: 32 },
  ])
    expect(workflowExpandScopeToolSchema.safeParse(value).success).toBe(false)
  expect(
    workflowExpandScopeInputSchema.safeParse({
      sessionId: 's',
      itemId: 'proof',
      scope: {},
      reason: input.reason,
      expectedRevision: 32,
    }).success,
  ).toBe(true)
})

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

test('deduplicated scope descriptions preserve canonical path validation, defaults and capacity', () => {
  const scopes = [
    {},
    { readPaths: [' proof.txt ', 'src/components'], writePaths: ['src\\components'], tools: ['read_file'] },
    { readPaths: Array.from({ length: MAX_WORKFLOW_SCOPE_ENTRIES }, (_, index) => `src/${index}`) },
    { writePaths: Array.from({ length: MAX_WORKFLOW_SCOPE_ENTRIES + 1 }, (_, index) => `src/${index}`) },
    { readPaths: ['C:/repo/proof.txt'] },
    { writePaths: ['/repo/proof.txt'] },
    { readPaths: ['src/../proof.txt'] },
    { writePaths: ['src/**'] },
    { readPaths: [''] },
    { readPaths: ['x'.repeat(4001)] },
    { tools: ['invalid tool'] },
    { extra: true },
  ]
  for (const scope of scopes) {
    const canonical = workflowScopeSchema.safeParse(scope)
    const compact = workflowExpandScopeToolSchema.safeParse({
      itemId: 'proof',
      scope,
      reason: 'Authorized task',
      expectedFocusRevision: 1,
      expectedPlanRevision: 1,
    })
    expect(compact.success).toBe(canonical.success)
    if (canonical.success && compact.success) expect(compact.data.scope).toEqual(canonical.data)
  }
  // Metadata compaction must not mutate the public contract's shared path schema.
  expect(z.toJSONSchema(workflowPathSchema).description).toContain('e.g. "proof.txt" or "src"')
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
