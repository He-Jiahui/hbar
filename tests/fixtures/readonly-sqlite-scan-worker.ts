import { parentPort, workerData } from 'node:worker_threads'
import { openReadonlySqliteScan, readonlySqliteExtensionPath } from '@hbar/runtime-native/readonly-sqlite'
import { z } from 'zod'

const input = z.object({ database: z.string(), nativeDirectory: z.string() }).parse(workerData as unknown)
const scan = openReadonlySqliteScan(input.database, input.nativeDirectory)
let result
try {
  const bytes = scan.readSequentially()
  if (!scan.quickCheck()) throw new Error('Parallel readonly full check failed')
  result = { bytes, nativePath: readonlySqliteExtensionPath(input.nativeDirectory) }
} finally {
  scan.close()
}
if (!parentPort) throw new Error('Readonly scan Worker requires its parent port')
parentPort.postMessage(result)
parentPort.close()
