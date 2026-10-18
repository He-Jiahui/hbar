import { enterRuntimeProcessGroup, exitRuntimeProcessGroup } from '@hbar/runtime-native'

// Establish native ownership before importing the compiler or reading the parent EOF barrier.
enterRuntimeProcessGroup()
const { runRuntimeBuildProcess } = await import('@hbar/runtime/build-process')
exitRuntimeProcessGroup(await runRuntimeBuildProcess())
