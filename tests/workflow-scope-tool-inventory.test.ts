import { expect, test } from 'bun:test'
import { z } from 'zod'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import { scopeToolInventory } from '../plugins/workflow/src/scope-tool-inventory'

const tool = (name: string, description = 'Full capability description.'): ToolDefinition => ({
  name,
  description,
  effect: 'read',
  inputSchema: z.object({ path: z.string().max(100) }),
  execute: async () => ({ text: '' }),
})

test('deferred capabilities preserve full semantics but not premature call signatures', () => {
  const inventory = scopeToolInventory(
    [tool('read_file'), tool('browser_fixture'), tool('in_scope')],
    new Set(['read_file', 'browser_fixture', 'not_selected']),
  )
  expect([...inventory.names]).toEqual(['browser_fixture'])
  expect(inventory.text).toContain('"browser_fixture" read: "Full capability description."')
  expect(inventory.text).toContain('NOT call signatures')
  expect(inventory.text).toContain('full native schema returns next request')
  expect(inventory.text).not.toContain('"path"')
})

test('inventory is bounded and never truncates a long capability description', () => {
  const inventory = scopeToolInventory(
    [
      tool('huge', 'x'.repeat(5000)),
      ...Array.from({ length: 80 }, (_, i) => tool(`capability_${i}`, 'Important restriction. '.repeat(5))),
    ],
    new Set(['huge', ...Array.from({ length: 80 }, (_, i) => `capability_${i}`)]),
  )
  expect(inventory.text.length).toBeLessThanOrEqual(4000)
  expect(inventory.names.has('huge')).toBe(false)
  expect(inventory.names.size).toBeGreaterThan(0)
  expect(inventory.names.size).toBeLessThan(80)
  for (const name of inventory.names)
    expect(inventory.text).toContain(`"${name}" read: ${JSON.stringify('Important restriction. '.repeat(5))}`)
  expect(scopeToolInventory([tool('browser_fixture')], new Set()).text).toBe('')
})
