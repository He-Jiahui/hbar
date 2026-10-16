import { describeCommand } from '@hbar/commands'
import { gitCommands } from '@hbar/contracts/commands/git'
import { sessionLaunchBranchesCommands } from '@hbar/contracts/commands/session-launch-branches'
import { describe, expect, test } from 'bun:test'
import { createRuntimeControllerServices } from '../apps/host/src/runtime-controller-services'

describe('runtime controller command visibility', () => {
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
