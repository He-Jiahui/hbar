import { createInterface } from 'node:readline'
import { runNode } from '@hbar/node'

const node = await runNode(process.argv.slice(2), { registerSignals: false })
process.stdout.write(`HBAR_NODE_READY ${node.node.id}\n`)

const input = createInterface({ input: process.stdin })
let onInputError: ((error: Error) => void) | undefined
try {
  await new Promise<void>((resolve, reject) => {
    onInputError = reject
    input.on('line', (line) => {
      if (line === 'close') resolve()
    })
    input.on('close', resolve)
    process.stdin.once('error', reject)
  })
} finally {
  if (onInputError) process.stdin.removeListener('error', onInputError)
  input.close()
  await node.close()
}
