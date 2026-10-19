import {
  appendFileSync,
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
  truncateSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { sessionEventSchema } from '@hbar/contracts'
import type { SessionEvent } from '@hbar/contracts'

const LOG_READ_CHUNK_BYTES = 64 * 1024
/** Bounds one encoded canonical JSONL record; this cap is far above the approved seed's largest line. */
export const DEFAULT_MAX_SESSION_LOG_RECORD_BYTES = 64 * 1024 * 1024

export interface RecoveredLogEvent {
  event: SessionEvent
  relativePath: string
  offset: number
  length: number
  hash: string
}

export interface SessionLogFileSnapshot {
  readonly path: string
  readonly size: number
}

export interface TruncatedSessionLogTail {
  readonly path: string
  readonly relativePath: string
  readonly offset: number
  readonly originalSize: number
}

export interface SessionLogScan {
  events: RecoveredLogEvent[]
  truncated: { path: string; offset: number }[]
}

export interface SessionLogVisitResult {
  readonly files: readonly SessionLogFileSnapshot[]
  readonly truncated: readonly TruncatedSessionLogTail[]
}

export interface SessionLogVisitOptions {
  readonly maxRecordBytes?: number
  readonly onFile?: (file: SessionLogFileSnapshot) => void
}

export class SessionLogRecoveryError extends Error {
  readonly code: 'SESSION_LOG_CORRUPTED' | 'SESSION_LOG_CHANGED_DURING_RECOVERY' | 'SESSION_LOG_RECORD_TOO_LARGE'

  constructor(code: SessionLogRecoveryError['code'], message: string) {
    super(message)
    this.name = 'SessionLogRecoveryError'
    this.code = code
  }
}

function files(root: string, excluded: ReadonlySet<string>, current = root): string[] {
  try {
    return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const path = join(current, entry.name)
      if (entry.isSymbolicLink() || entry.name === '.maintenance') return []
      return entry.isDirectory()
        ? files(root, excluded, path)
        : entry.isFile() && entry.name.endsWith('.jsonl') && !excluded.has(entry.name.slice(0, -6))
          ? [path]
          : []
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function recordLimit(options: SessionLogVisitOptions): number {
  const limit = options.maxRecordBytes ?? DEFAULT_MAX_SESSION_LOG_RECORD_BYTES
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DEFAULT_MAX_SESSION_LOG_RECORD_BYTES)
    throw new RangeError(`maxRecordBytes must be an integer between 1 and ${DEFAULT_MAX_SESSION_LOG_RECORD_BYTES}`)
  return limit
}

function parseRecord(raw: Buffer, path: string, offset: number): SessionEvent {
  try {
    return sessionEventSchema.parse(JSON.parse(raw.toString('utf8')))
  } catch {
    throw new SessionLogRecoveryError(
      'SESSION_LOG_CORRUPTED',
      `SESSION_LOG_CORRUPTED complete JSONL record at ${path}:${offset}`,
    )
  }
}

/**
 * Visits validated records in canonical order while retaining at most one bounded record.
 * Incomplete final lines are reported but left untouched until the caller validates all logs.
 */
export function visitSessionLogs(
  root: string,
  excluded: ReadonlySet<string>,
  visit: (record: RecoveredLogEvent) => void,
  options: SessionLogVisitOptions = {},
): SessionLogVisitResult {
  const maxRecordBytes = recordLimit(options)
  const snapshots: SessionLogFileSnapshot[] = []
  const truncated: TruncatedSessionLogTail[] = []
  for (const path of files(root, excluded).sort()) {
    const relativePath = relative(root, path).replaceAll('\\', '/')
    const descriptor = openSync(path, 'r')
    try {
      const before = fstatSync(descriptor).size
      const snapshot = { path: relativePath, size: before }
      snapshots.push(snapshot)
      options.onFile?.(snapshot)

      const readBuffer = Buffer.allocUnsafe(LOG_READ_CHUNK_BYTES)
      const segments: Buffer[] = []
      let segmentBytes = 0
      let recordTooLarge = false
      let fileOffset = 0
      let recordOffset = 0
      let readPosition = 0

      const appendSegment = (start: number, end: number) => {
        if (end <= start) return
        segmentBytes += end - start
        if (segmentBytes > maxRecordBytes) {
          recordTooLarge = true
          segments.length = 0
          return
        }
        if (!recordTooLarge) segments.push(Buffer.from(readBuffer.subarray(start, end)))
      }

      const emitRecord = () => {
        if (recordTooLarge)
          throw new SessionLogRecoveryError(
            'SESSION_LOG_RECORD_TOO_LARGE',
            'SESSION_LOG_RECORD_TOO_LARGE canonical JSONL record exceeds the configured byte limit',
          )
        const line = segments.length === 1 ? segments[0]! : Buffer.concat(segments, segmentBytes)
        const raw = line.subarray(0, line.length - 1)
        if (raw.length) {
          const event = parseRecord(raw, path, recordOffset)
          if (!excluded.has(event.sessionId)) {
            visit({
              event,
              relativePath,
              offset: recordOffset,
              length: line.length,
              hash: createHash('sha256').update(raw).digest('hex'),
            })
          }
        }
        fileOffset += segmentBytes
        recordOffset = fileOffset
        segments.length = 0
        segmentBytes = 0
        recordTooLarge = false
      }

      while (readPosition < before) {
        const read = readSync(
          descriptor,
          readBuffer,
          0,
          Math.min(readBuffer.length, before - readPosition),
          readPosition,
        )
        if (read === 0)
          throw new SessionLogRecoveryError(
            'SESSION_LOG_CHANGED_DURING_RECOVERY',
            'SESSION_LOG_CHANGED_DURING_RECOVERY canonical log ended before its initial size',
          )
        let segmentStart = 0
        // Search only bytes read this time: the reusable buffer can retain an old newline after EOF.
        const chunk = readBuffer.subarray(0, read)
        for (let index = chunk.indexOf(10); index !== -1; index = chunk.indexOf(10, segmentStart)) {
          appendSegment(segmentStart, index + 1)
          emitRecord()
          segmentStart = index + 1
        }
        appendSegment(segmentStart, read)
        readPosition += read
      }

      if (segmentBytes > 0) {
        truncated.push({ path, relativePath, offset: recordOffset, originalSize: before })
      }
      const after = fstatSync(descriptor).size
      if (after !== before)
        throw new SessionLogRecoveryError(
          'SESSION_LOG_CHANGED_DURING_RECOVERY',
          'SESSION_LOG_CHANGED_DURING_RECOVERY canonical log changed during recovery scan',
        )
    } finally {
      closeSync(descriptor)
    }
  }
  return { files: snapshots, truncated }
}

export function truncateSessionLogTails(tails: readonly TruncatedSessionLogTail[]): void {
  for (const tail of tails)
    if (statSync(tail.path).size !== tail.originalSize)
      throw new SessionLogRecoveryError(
        'SESSION_LOG_CHANGED_DURING_RECOVERY',
        'SESSION_LOG_CHANGED_DURING_RECOVERY canonical log changed before tail repair',
      )
  for (const tail of tails) truncateSync(tail.path, tail.offset)
}

/** Compatibility snapshot helper for callers/tests that explicitly need all event values. */
export function scanSessionLogs(root: string, excluded: ReadonlySet<string> = new Set()): SessionLogScan {
  const events: RecoveredLogEvent[] = []
  const scan = visitSessionLogs(root, excluded, (event) => events.push(event))
  truncateSessionLogTails(scan.truncated)
  return {
    events,
    truncated: scan.truncated.map(({ path, offset }) => ({ path, offset })),
  }
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
