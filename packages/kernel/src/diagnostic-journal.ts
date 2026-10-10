import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { diagnosticEventSchema, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'

export interface DiagnosticJournalOptions {
  readonly root: string
  readonly fileName?: string
  readonly maxBytes?: number
  readonly retention?: number
  readonly ringEntries?: number
  readonly queueEntries?: number
  readonly enabled?: boolean
  readonly fullCoverage?: boolean
}

export interface DiagnosticJournalSnapshot {
  readonly enabled: boolean
  readonly fullCoverage: boolean
  readonly queued: number
  readonly ringEntries: number
  readonly dropped: number
  readonly invalid: number
  readonly writeFailures: number
  readonly bytes: number
  readonly closed: boolean
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_RETENTION = 8
const DEFAULT_RING_ENTRIES = 4096
const DEFAULT_QUEUE_ENTRIES = 1024
const ALWAYS_EVENTS = new Set([
  'diagnostics.writer_error',
  'health.degraded',
  'health.recovered',
  'storage.timeout',
  'storage.worker_error',
  'storage.worker_exit',
  'storage.close',
])

function boundedInteger(value: number | undefined, fallback: number, max: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > max) throw new RangeError(`${name} is out of range`)
  return resolved
}

function envFlag(name: string): boolean {
  return process.env[name] === '1' || process.env[name]?.toLowerCase() === 'true'
}

/**
 * A bounded diagnostic sink. `emit` only validates, updates the ring and queues a
 * serialized line; disk I/O is drained asynchronously and never reaches callers.
 */
export class DiagnosticJournal implements DiagnosticSink {
  readonly filePath: string
  private readonly maxBytes: number
  private readonly retention: number
  private readonly ringLimit: number
  private readonly queueLimit: number
  private readonly fullCoverage: boolean
  private readonly enabled: boolean
  private readonly ring: DiagnosticEvent[] = []
  private readonly queue: string[] = []
  private draining: Promise<void> | null = null
  private initialized: Promise<void> | null = null
  private bytes = 0
  private dropped = 0
  private invalid = 0
  private writeFailures = 0
  private closed = false
  private drainCancelled = false

  constructor(options: DiagnosticJournalOptions) {
    const fileName = options.fileName ?? 'hbar-diagnostics.jsonl'
    if (basename(fileName) !== fileName || isAbsolute(fileName) || fileName.includes('..'))
      throw new RangeError('Diagnostic fileName must be a plain file name')
    this.filePath = join(options.root, fileName)
    this.maxBytes = boundedInteger(options.maxBytes, DEFAULT_MAX_BYTES, 512 * 1024 * 1024, 'maxBytes')
    this.retention = boundedInteger(options.retention, DEFAULT_RETENTION, 64, 'retention')
    this.ringLimit = boundedInteger(options.ringEntries, DEFAULT_RING_ENTRIES, 100_000, 'ringEntries')
    this.queueLimit = boundedInteger(options.queueEntries, DEFAULT_QUEUE_ENTRIES, 100_000, 'queueEntries')
    this.enabled = options.enabled ?? (envFlag('HBAR_DIAGNOSTICS') || envFlag('HBAR_DESKTOP_DEV'))
    this.fullCoverage = options.fullCoverage ?? envFlag('HBAR_DIAGNOSTICS_FULL')
  }

  emit(event: DiagnosticEvent): void {
    if (this.closed) {
      this.dropped++
      return
    }
    let value: DiagnosticEvent
    let line: string
    try {
      const parsed = diagnosticEventSchema.safeParse(event)
      if (!parsed.success) {
        this.invalid++
        this.dropped++
        return
      }
      value = parsed.data
      line = `${JSON.stringify(value)}\n`
    } catch {
      this.invalid++
      this.dropped++
      return
    }
    const keep =
      this.fullCoverage ||
      this.enabled ||
      value.level === 'error' ||
      value.level === 'fatal' ||
      ALWAYS_EVENTS.has(value.event)
    if (!keep) return
    this.ring.push(value)
    if (this.ring.length > this.ringLimit) this.ring.splice(0, this.ring.length - this.ringLimit)
    if (this.queue.length >= this.queueLimit) {
      this.dropped++
      return
    }
    this.queue.push(line)
    this.scheduleDrain()
  }

  snapshot(): DiagnosticJournalSnapshot {
    return {
      enabled: this.enabled,
      fullCoverage: this.fullCoverage,
      queued: this.queue.length,
      ringEntries: this.ring.length,
      dropped: this.dropped,
      invalid: this.invalid,
      writeFailures: this.writeFailures,
      bytes: this.bytes,
      closed: this.closed,
    }
  }

  recent(limit = this.ringLimit): readonly DiagnosticEvent[] {
    const count = boundedInteger(limit, this.ringLimit, this.ringLimit, 'limit')
    return this.ring.slice(Math.max(0, this.ring.length - count))
  }

  async close(timeoutMs = 2_000): Promise<DiagnosticJournalSnapshot> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
      throw new RangeError('timeoutMs is out of range')
    this.closed = true
    const drain = this.draining
    if (drain) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let timedOut = false
      await Promise.race([
        drain,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true
            resolve()
          }, timeoutMs)
        }),
      ])
      if (timer !== undefined) clearTimeout(timer)
      if (timedOut) {
        this.drainCancelled = true
        this.dropped += this.queue.length
        this.queue.length = 0
      }
    }
    return this.snapshot()
  }

  private scheduleDrain(): void {
    if (this.draining) return
    this.draining = this.drain().finally(() => {
      this.draining = null
      if (this.queue.length && !this.closed) this.scheduleDrain()
    })
  }

  private async drain(): Promise<void> {
    let inFlight = false
    try {
      await this.ensureFile()
      while (this.queue.length) {
        if (this.drainCancelled) break
        const line = this.queue.shift()
        if (line === undefined) break
        inFlight = true
        const bytes = Buffer.byteLength(line)
        if (bytes > this.maxBytes) {
          this.dropped++
          inFlight = false
          continue
        }
        if (this.bytes + bytes > this.maxBytes) await this.rotate()
        await appendFile(this.filePath, line, { encoding: 'utf8', mode: 0o600 })
        this.bytes += bytes
        inFlight = false
      }
    } catch {
      this.writeFailures++
      this.dropped += this.queue.length + (inFlight ? 1 : 0)
      this.queue.length = 0
    }
  }

  private async ensureFile(): Promise<void> {
    this.initialized ??= (async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      this.bytes = await stat(this.filePath)
        .then((item) => item.size)
        .catch((reason: unknown) => {
          if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') return 0
          throw reason
        })
    })()
    await this.initialized
  }

  private async rotate(): Promise<void> {
    for (let index = this.retention - 1; index >= 1; index--) {
      const source = `${this.filePath}.${index}`
      const destination = `${this.filePath}.${index + 1}`
      await unlink(destination).catch((reason: unknown) => {
        if (!(reason instanceof Error && 'code' in reason && reason.code === 'ENOENT')) throw reason
      })
      await rename(source, destination).catch((reason: unknown) => {
        if (!(reason instanceof Error && 'code' in reason && reason.code === 'ENOENT')) throw reason
      })
    }
    await unlink(`${this.filePath}.1`).catch((reason: unknown) => {
      if (!(reason instanceof Error && 'code' in reason && reason.code === 'ENOENT')) throw reason
    })
    await rename(this.filePath, `${this.filePath}.1`).catch((reason: unknown) => {
      if (!(reason instanceof Error && 'code' in reason && reason.code === 'ENOENT')) throw reason
    })
    this.bytes = 0
  }
}

export function createDiagnosticJournal(options: DiagnosticJournalOptions): DiagnosticJournal {
  return new DiagnosticJournal(options)
}
