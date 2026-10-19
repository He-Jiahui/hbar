import { expect, test } from 'bun:test'
import { CommandError, createCommandExpectation } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { createHostPluginConfigurationCommands } from '../apps/host/src/extension-commands'
import { LocalCommandJobs } from '../apps/host/src/local-command-jobs'
import { isRecoveryControl, isRuntimeMetadataRead, isStableRpc } from '../apps/host/src/stable-rpc'

const invocation = (commandId: string) => ({
  protocol: 1,
  requestId: 'plugin-management-route',
  commandId,
  commandVersion: 1,
  input: { id: 'goal.codex', enabled: true, config: { retryDelayMs: 30_000 } },
})

test('typed plugin configuration remains in Host management without becoming metadata or recovery', () => {
  const input = invocation('plugin.set')
  expect(isStableRpc('command.execute', input)).toBe(true)
  expect(isRuntimeMetadataRead('command.execute', input)).toBe(false)
  expect(isRecoveryControl('command.execute', input)).toBe(false)
  expect(isStableRpc('plugin.set', input.input)).toBe(true)
  expect(isRecoveryControl('plugin.set', input.input)).toBe(false)
})

test('the Host registry exposes only plugin configuration and validates before effects', async () => {
  let calls = 0
  const commands = createHostPluginConfigurationCommands(async () => {
    calls++
    return []
  })
  try {
    expect(commands.list().items.map((item) => item.metadata.id)).toEqual(['plugin.set'])
    await expect(
      commands.dispatch({ ...invocation('plugin.set'), input: { id: 'goal.codex', enabled: 'invalid' } }, 'actor'),
    ).rejects.toBeInstanceOf(CommandError)
    expect(calls).toBe(0)
    await expect(commands.dispatch(invocation('plugin.install'), 'actor')).rejects.toBeInstanceOf(CommandError)
    expect(calls).toBe(0)
  } finally {
    commands.dispose()
  }
})

test('the Host configuration ticket retains physical settlement until the real handler finishes', async () => {
  let release: (() => void) | undefined
  let entered: (() => void) | undefined
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const commands = createHostPluginConfigurationCommands(async () => {
    entered?.()
    await held
    return []
  })
  const jobs = new LocalCommandJobs({ maxJobs: 1 })
  try {
    const prepared = commands.prepare(invocation('plugin.set'))
    const expected = createCommandExpectation({ invocation: prepared, descriptor: commands.describe('plugin.set') })
    const ticket = jobs.execute('actor', (signal) =>
      commands.dispatchPreparedTracked(prepared, 'actor', expected, { signal }),
    )
    let physicallySettled = false
    void ticket.settled.then(() => {
      physicallySettled = true
    })
    await started
    await Bun.sleep(5)
    expect(physicallySettled).toBe(false)
    expect(jobs.stats()).toMatchObject({ jobs: 1, active: 1 })
    release?.()
    expect(await ticket.result).toEqual([])
    expect(await ticket.settled).toEqual({ status: 'succeeded', executionStarted: true, result: [] })
    await ticket.acknowledge()
    expect(jobs.stats()).toMatchObject({ jobs: 0, active: 0 })
  } finally {
    release?.()
    jobs.dispose()
    commands.dispose()
  }
})

test('the Host registry preserves a known configuration refusal as a domain error', async () => {
  const commands = createHostPluginConfigurationCommands(async () => {
    throw new HbarError('RUNTIME_IDLE_BUSY', 'Actual owner demand is active')
  })
  try {
    await expect(commands.dispatch(invocation('plugin.set'), 'actor')).rejects.toMatchObject({
      code: 'RUNTIME_IDLE_BUSY',
      message: 'Actual owner demand is active',
    })
  } finally {
    commands.dispose()
  }
})

test('business reads and execution still require their Controller admission', () => {
  for (const commandId of ['goal.get', 'goal.create', 'provider.save', 'run.start', 'plugin.install'])
    expect(isStableRpc('command.execute', invocation(commandId))).toBe(false)
  expect(isStableRpc('goal.get', { sessionId: 'session' })).toBe(false)
})

test('malformed plugin management envelopes cannot bypass normal request validation', () => {
  expect(isStableRpc('command.execute', { ...invocation('plugin.set'), protocol: 2 })).toBe(false)
  expect(isStableRpc('command.execute', { commandId: 'plugin.set' })).toBe(false)
  expect(isStableRpc('command.execute', null)).toBe(false)
  expect(isStableRpc('unrecognized.method', invocation('plugin.set'))).toBe(false)
})
