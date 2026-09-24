import { expect, test } from 'bun:test'
import { z } from 'zod'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import { workflowCheckpointToolSchema, workflowExpandScopeToolSchema } from '../plugins/workflow/src/update-tool-schema'
import { sequenceControlCatalog } from '../plugins/workflow/src/sequence-catalog'

function tool(name: string, inputSchema: z.ZodType): ToolDefinition {
  return { name, inputSchema, description: '', effect: 'read', execute: async () => ({ text: '' }) }
}
test('compact control catalog derives parameters and bounds without changing execution schemas', () => {
  const tools = [
    tool('get_goal', z.object({})),
    tool('get_plan', z.object({})),
    tool('get_workflow', z.object({})),
    tool('workflow_checkpoint', workflowCheckpointToolSchema),
    tool('workflow_expand_scope', workflowExpandScopeToolSchema),
  ]
  const catalog = sequenceControlCatalog(tools)
  expect(catalog.names.size).toBe(5)
  expect(catalog.text).toContain('"expectedFocusRevision"?:integer')
  expect(catalog.text).toContain('Workspace-relative file or directory prefix')
  expect(catalog.text).toContain('Optional Host-issued evidence IDs, not acceptance-check IDs')
  expect(catalog.text).toContain('items<=128')
  expect(catalog.text).toContain('"progress"|"revise"|"complete"|"blocked"')
  expect(catalog.text.length).toBeLessThan(JSON.stringify(tools.map((tool) => z.toJSONSchema(tool.inputSchema))).length)
  expect(
    workflowCheckpointToolSchema.safeParse({ itemId: 'proof', outcome: 'complete', summary: 'Done' }).success,
  ).toBe(false)
})
test('unsupported or noncontrol schemas are kept as native tools', () => {
  const catalog = sequenceControlCatalog([
    tool('get_plan', z.object({ value: z.iso.date() })),
    tool('write_file', z.object({ path: z.string(), text: z.string() })),
  ])
  expect(catalog.names.size).toBe(0)
})
