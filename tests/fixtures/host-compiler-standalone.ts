import { enterRuntimeProcessGroup, exitRuntimeProcessGroup } from '@hbar/runtime-native'
import { HbarError } from '@hbar/contracts/errors'

enterRuntimeProcessGroup()
if (Bun.argv[2] === 'default-command') {
  const { hostRuntimeBuildProcessCommand } = await import('../../apps/host/src/runtime-package')
  try {
    hostRuntimeBuildProcessCommand()
    throw new Error('Standalone command incorrectly received Bun flags')
  } catch (error) {
    if (!(error instanceof HbarError) || error.code !== 'RUNTIME_RESTART_REQUIRED') throw error
    await Bun.write(Bun.stdout, JSON.stringify({ explicitCommandRequired: true }))
  }
} else if (Bun.argv[2] === 'compile') {
  const { runRuntimeBuildProcess } = await import('@hbar/runtime/build-process')
  exitRuntimeProcessGroup(await runRuntimeBuildProcess())
} else throw new Error('Owned standalone compiler mode is required')
