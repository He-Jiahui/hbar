import { parentPort, workerData } from 'node:worker_threads'
import { basename } from 'node:path'
import { z } from 'zod'

const { path } = z.object({ path: z.string() }).parse(workerData)
const mode = basename(path)
const requestSchema = z.object({ id: z.number(), method: z.string() })

parentPort?.on('message', (value: unknown) => {
  const request = requestSchema.parse(value)
  if (mode === 'exit.sqlite') process.exit(17)
  if (mode === 'crash.sqlite') throw new Error('Owned Storage lifecycle fixture crash')
  if (mode === 'silent.sqlite' || (mode === 'silent-close.sqlite' && request.method === 'close')) return
  parentPort?.postMessage({ id: request.id, ok: true, result: undefined })
})
