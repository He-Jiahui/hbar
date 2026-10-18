import { describeCommand } from '@hbar/commands'
import { gitCommands } from '@hbar/contracts/commands/git'
import { sessionLaunchBranchesCommands } from '@hbar/contracts/commands/session-launch-branches'
import { describe, expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { createRuntimeControllerServices } from '../apps/host/src/runtime-controller-services'

describe('runtime controller command visibility', () => {
  test('binds the stable adapter before publication and resolves the real catalog after recovery', () => {
    const internal = describeCommand(sessionLaunchBranchesCommands['sessionLaunchBranches.list'])
    const publicCommand = describeCommand(gitCommands['git.status'])
    const unavailable = new HbarError('RUNTIME_RECOVERING', 'The first Controller has not published its catalog')
    let published = false
    let calls = 0
    const services = createRuntimeControllerServices({
      catalog: () => {
        if (!published) throw unavailable
        return { revision: 1, items: [internal, publicCommand] }
      },
      call: async () => {
        calls++
        throw new Error('Metadata must not dispatch or wake a runtime method')
      },
      start: async () => {},
      stop: async () => {},
    })
    expect(services.commandDispatchers.size).toBe(0)
    expect(services.commandDescribers.size).toBe(0)
    expect(() => services.commandServices[0]?.service.list()).toThrow(unavailable)
    expect(() => services.resolveCommand?.('git.status')).toThrow(unavailable)
    published = true
    expect(services.commandServices[0]?.service.list().items.map(({ metadata }) => metadata.id)).toEqual(['git.status'])
    expect(services.resolveCommand?.('sessionLaunchBranches.list')?.describe('sessionLaunchBranches.list')).toEqual(
      internal,
    )
    expect(services.resolveCommand?.('git.status')?.describe('git.status')).toEqual(publicCommand)
    expect(services.resolveCommand?.('missing.command')).toBeNull()
    expect(calls).toBe(0)
  })

  test('does not hide catalog failures other than an owner still recovering', () => {
    const failure = new HbarError('INVALID_OUTPUT', 'Invalid Controller catalog')
    expect(() =>
      createRuntimeControllerServices({
        catalog: () => {
          throw failure
        },
        call: async () => {
          throw new Error('Metadata cannot call a runtime method')
        },
        start: async () => {},
        stop: async () => {},
      }),
    ).toThrow(failure)
  })

  test('keeps internal commands routable for authorization while hiding them from public catalogs', async () => {
    const internal = describeCommand(sessionLaunchBranchesCommands['sessionLaunchBranches.list'])
    const publicCommand = describeCommand(gitCommands['git.status'])
    const services = createRuntimeControllerServices({
      catalog: () => ({ revision: 1, items: [internal, publicCommand] }),
      call: async () => {
        throw new Error('Catalog discovery must not execute a runtime method')
      },
      start: async () => {},
      stop: async () => {},
    })

    expect(services.commandServices[0]?.service.list().items.map(({ metadata }) => metadata.id)).toEqual(['git.status'])
    expect(
      services.commandServices[0]?.service.list({ includeInternal: true }).items.map(({ metadata }) => metadata.id),
    ).toEqual(['sessionLaunchBranches.list', 'git.status'])
    expect(services.commandDispatchers.has('sessionLaunchBranches.list')).toBe(true)
    expect(services.commandDescribers.get('sessionLaunchBranches.list')?.().metadata.visibility).toBe('internal')
    expect(services.resolveCommand?.('sessionLaunchBranches.list')).toBeTruthy()
    await services.dispose()
  })
})
