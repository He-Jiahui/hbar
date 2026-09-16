import { expect, test } from 'bun:test'
import { rpcSchemas } from '@hbar/contracts'
import { BUILTIN_TERMINAL_COMMANDS } from '../packages/terminal/src/index'
import inventory from '../docs/multi-level/implementation-inventory.json'

test('migration inventory owns every current RPC and terminal entry exactly once', () => {
  const methods = inventory.domains.flatMap((domain) => domain.rpc)
  expect([...methods].sort()).toEqual(Object.keys(rpcSchemas).sort())
  expect(new Set(methods).size).toBe(methods.length)
  expect(Object.keys(inventory.terminalAliases).sort()).toEqual(
    BUILTIN_TERMINAL_COMMANDS.map((command) => command.id).sort(),
  )
  for (const domain of inventory.domains) {
    expect(domain.owner.length).toBeGreaterThan(0)
    expect(domain.stateOwner.length).toBeGreaterThan(0)
    expect(domain.category.length).toBeGreaterThan(0)
  }
})

test('migration evidence refers to tests that actually exist', async () => {
  for (const path of new Set(inventory.domains.flatMap((domain) => domain.tests)))
    expect(await Bun.file(path).exists(), path).toBe(true)
})
