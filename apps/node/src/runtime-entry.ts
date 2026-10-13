import { enterRuntimeProcessGroup, exitRuntimeProcessGroup } from '@hbar/runtime-native'
import { runRuntimeProcess } from '@hbar/runtime/entry'
enterRuntimeProcessGroup()
await runRuntimeProcess({ exit: exitRuntimeProcessGroup })
