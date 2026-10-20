import { workerData, parentPort } from 'node:worker_threads'
import { z } from 'zod'
import { visitSessionLogFile, SessionLogRecoveryError } from './session-log-recovery'
import { taskSchema, type MetadataRow } from './session-log-scan-protocol'
const input = z
  .object({
    root: z.string(),
    excluded: z.array(z.string()),
    shared: z.instanceof(SharedArrayBuffer),
    deadline: z.number(),
    maxRecordBytes: z.number().int().positive(),
  })
  .parse(workerData as unknown)
const port = parentPort
if (!port) throw new Error('Owned scan Worker requires a parent')
const shared = new Int32Array(input.shared)
const excluded = new Set(input.excluded)
let sequence = 0
function check() {
  if (Atomics.load(shared, 1) !== 0) throw new Error('SCAN_CANCELLED')
  if (Date.now() >= input.deadline) throw new Error('SCAN_DEADLINE')
}
port.on('message', (raw: unknown) => {
  const task = taskSchema.parse(raw)
  if (task.type === 'close') {
    port.close()
    return
  }
  try {
    check()
    let pending: MetadataRow[] = []
    const flush = () => {
      if (pending.length === 0) return
      const sent = ++sequence
      port.postMessage({ type: 'batch', path: task.path, sequence: sent, rows: pending })
      pending = []
      while (Atomics.load(shared, 0) < sent) {
        check()
        Atomics.wait(shared, 0, sent - 1, 20)
      }
      check()
    }
    const scan = visitSessionLogFile(
      input.root,
      excluded,
      task.path,
      (record) => {
        check()
        pending.push({
          eventId: record.event.eventId,
          sessionId: record.event.sessionId,
          seq: record.event.seq,
          relativePath: record.relativePath,
          offset: record.offset,
          length: record.length,
          hash: record.hash,
        })
        if (pending.length === 128) flush()
      },
      { maxRecordBytes: input.maxRecordBytes },
    )
    flush()
    check()
    port.postMessage({ type: 'done', path: task.path, files: scan.files, truncated: scan.truncated })
  } catch (error) {
    port.postMessage({
      type: 'error',
      code: error instanceof SessionLogRecoveryError ? error.code : 'SCAN_FAILED',
      message: error instanceof Error ? error.message.slice(0, 8000) : 'Owned scan failed',
    })
  }
})
