import { expect, test } from 'bun:test'
import { describeCommand } from '@hbar/commands'
import { SESSION_COMMAND_STATE_QUERY_IDS } from '@hbar/kernel/session-command-port'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { bindSessionStateQueryInput, sessionStateQueryCommand } from '../apps/host/src/session-command-state-query'

test('the reviewed state queries use their canonical public Host/session/read definitions', () => {
  const definitions = {
    ...goalPlanCommands,
    ...budgetCommands,
    ...configurationCommands,
  }
  expect(new Set(SESSION_COMMAND_STATE_QUERY_IDS).size).toBe(6)
  for (const id of SESSION_COMMAND_STATE_QUERY_IDS) {
    const rule = sessionStateQueryCommand(id)
    expect(rule?.metadata).toEqual(definitions[id].metadata)
    expect(rule?.descriptor).toEqual(describeCommand(definitions[id]))
    expect(rule?.metadata).toMatchObject({
      id,
      version: 1,
      execution: 'host',
      scope: 'session',
      kind: 'query',
      stateEffect: 'none',
    })
  }
})

test('nearby administrative mutations and unknown queries do not inherit read admission', () => {
  for (const id of [
    'goal.set',
    'goal.create',
    'goal.update',
    'goal.clear',
    'plan.update',
    'session.setBudget',
    'mode.set',
    'permission.get',
    'unknown.get',
  ])
    expect(sessionStateQueryCommand(id)).toBeUndefined()
})

test('omitted query targets bind to the source without changing explicit or malformed targets', () => {
  const original = { limit: 10 }
  expect(bindSessionStateQueryInput('source', original)).toEqual({ limit: 10, sessionId: 'source' })
  expect(original).toEqual({ limit: 10 })
  expect(bindSessionStateQueryInput('source', { sessionId: 'other', limit: 10 })).toEqual({
    sessionId: 'other',
    limit: 10,
  })
  for (const sessionId of [null, '', 1])
    expect(bindSessionStateQueryInput('source', { sessionId })).toEqual({ sessionId })
})

test('source query aliases match concrete existing tools and combined Goal/Plan reads require both', () => {
  expect(sessionStateQueryCommand('goal.get')?.aliases).toEqual(['get_goal'])
  expect(sessionStateQueryCommand('goal.snapshot')?.aliases).toEqual(['get_goal', 'get_plan'])
  expect(sessionStateQueryCommand('goal.history')?.aliases).toEqual(['get_goal'])
  expect(sessionStateQueryCommand('plan.get')?.aliases).toEqual(['get_plan'])
  expect(sessionStateQueryCommand('session.getBudget')?.aliases).toEqual(['get_budget'])
  expect(sessionStateQueryCommand('mode.get')?.aliases).toEqual([])
})
