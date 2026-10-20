import { currentThreadMemoryPriority } from '../memory-priority-native'
import { withReadMostlyMemoryPriority } from '../memory-priority'
const before = currentThreadMemoryPriority()
const inside = withReadMostlyMemoryPriority(() => currentThreadMemoryPriority())
const after = currentThreadMemoryPriority()
postMessage({ before, inside, after })
close()
