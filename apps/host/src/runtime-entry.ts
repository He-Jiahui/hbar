import { runRuntimeProcess } from '@hbar/runtime/entry'
import { enterRuntimeProcessGroup, exitRuntimeProcessGroup } from '@hbar/runtime-native'

enterRuntimeProcessGroup()
await runRuntimeProcess({ exit: exitRuntimeProcessGroup })
