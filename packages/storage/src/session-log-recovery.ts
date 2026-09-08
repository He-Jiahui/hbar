import { appendFileSync, mkdirSync, readFileSync, readdirSync, truncateSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { sessionEventSchema } from '@hbar/contracts'
import type { SessionEvent } from '@hbar/contracts'

export interface RecoveredLogEvent {
  event: SessionEvent
  relativePath: string
  offset: number
  length: number
  hash: string
}

export interface SessionLogScan {
  events: RecoveredLogEvent[]
  truncated: { path: string; offset: number }[]
}

function files(root: string, current = root): string[] {
  try {
    return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const path = join(current, entry.name)
      return entry.isDirectory() ? files(root, path) : entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : []
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export function scanSessionLogs(root: string): SessionLogScan {
  const events: RecoveredLogEvent[] = []
  const truncated: { path: string; offset: number }[] = []
  for (const path of files(root).sort()) {
    const bytes = readFileSync(path)
    let offset = 0
    while (offset < bytes.length) {
      const newline = bytes.indexOf(10, offset)
      if (newline < 0) {
        truncateSync(path, offset)
        truncated.push({ path, offset })
        break
      }
      const length = newline + 1 - offset
      const raw = bytes.subarray(offset, newline)
      if (!raw.length) {
        offset = newline + 1
        continue
      }
      try {
        const event = sessionEventSchema.parse(JSON.parse(raw.toString('utf8')))
        events.push({
          event,
          relativePath: relative(root, path).replaceAll('\\', '/'),
          offset,
          length,
          hash: createHash('sha256').update(raw).digest('hex'),
        })
      } catch (error) {
        // Only an incomplete final record is repaired automatically. A malformed
        // complete record is evidence of corruption and must stop startup.
        throw new Error(
          `SESSION_LOG_CORRUPTED ${path}:${offset}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        )
      }
      offset = newline + 1
    }
  }
  return { events, truncated }
}

export function recordRecoveryDiagnostic(root: string, data: unknown) {
  const date = new Date()
  const path = join(
    root,
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    `host-${date.toISOString().replaceAll(':', '-')}.jsonl`,
  )
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify({ time: Date.now(), type: 'session-log.repaired', data })}\n`, 'utf8')
}
