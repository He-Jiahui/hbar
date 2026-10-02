import { expect, test } from 'bun:test'
import { RunSteeringRegistry, RUN_STEERING_MAX_PENDING } from '../packages/storage/src/run-steering'

test('a closed same-Run gate cannot reopen until the settled owner is retired', () => {
  const gates = new RunSteeringRegistry()
  expect(gates.open('session', 'run-one')).toBe('opened')
  expect(gates.open('session', 'run-one')).toBe('already-open')
  expect(gates.open('session', 'run-two')).toBe('conflict')
  expect(gates.close('session', 'foreign')).toBe('conflict')
  expect(gates.isOpen('session', 'run-one')).toBe(true)
  expect(gates.close('session', 'run-one')).toBe('closed')
  expect(gates.open('session', 'run-one')).toBe('closed')
  expect(gates.open('session', 'run-two')).toBe('conflict')
  gates.retire('session', 'foreign')
  expect(gates.open('session', 'run-one')).toBe('closed')
  gates.retire('session', 'run-one')
  expect(gates.open('session', 'run-two')).toBe('opened')
  expect(gates.isOpen('session', 'run-one')).toBe(false)
  expect(gates.isOpen('session', 'run-two')).toBe(true)
})

test('pending admission is bounded and acknowledged identities release capacity only for their Run', () => {
  const gates = new RunSteeringRegistry()
  gates.open('session', 'run')
  for (let index = 0; index < RUN_STEERING_MAX_PENDING; index++) {
    expect(gates.canAdmit('session', 'run')).toBe(true)
    gates.admit('session', 'run', `message-${index}`)
  }
  expect(gates.canAdmit('session', 'run')).toBe(false)
  gates.acknowledge('session', 'foreign', ['message-0'])
  gates.acknowledge('foreign-session', 'run', ['message-0'])
  expect(gates.canAdmit('session', 'run')).toBe(false)
  gates.acknowledge('session', 'run', ['message-0'])
  expect(gates.canAdmit('session', 'run')).toBe(true)
  gates.admit('session', 'run', 'message-1')
  expect(gates.canAdmit('session', 'run')).toBe(true)
  gates.admit('session', 'run', 'another')
  expect(gates.canAdmit('session', 'run')).toBe(false)
  gates.close('session', 'run')
  expect(gates.canAdmit('session', 'run')).toBe(false)
})

test('gate capacity is bounded without evicting a still-running closed owner', () => {
  const gates = new RunSteeringRegistry()
  for (let index = 0; index < 4_096; index++) expect(gates.open(`session-${index}`, `run-${index}`)).toBe('opened')
  gates.close('session-0', 'run-0')
  expect(gates.open('extra-session', 'extra-run')).toBe('capacity')
  expect(gates.open('session-0', 'run-0')).toBe('closed')
  gates.retire('session-0', 'run-0')
  expect(gates.open('extra-session', 'extra-run')).toBe('opened')
  expect(gates.isOpen('session-1', 'run-1')).toBe(true)
})
