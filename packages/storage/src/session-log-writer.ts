import { closeSync, existsSync, fsyncSync, fstatSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import type { SessionEvent } from '@hbar/contracts'

export interface SessionLogLocation {
  path: string
  relativePath: string
  offset: number
  length: number
  hash: string
}

const durableEvent = /^(message\.committed|run\.|tool\.started|tool\.unknown|approval\.|context\.compacted|session\.|goal\.|plan\.|mode\.|budget\.)/

function dayParts(time: number) {
  const date = new Date(time)
  return [String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')]
}

export class SessionLogWriter {
  constructor(readonly root: string) {}

  file(projectId: string, sessionId: string, time: number) {
    return join(this.root, projectId, ...dayParts(time), `${sessionId}.jsonl`)
  }

  append(projectId: string, event: SessionEvent): SessionLogLocation {
    const path = this.file(projectId, event.sessionId, event.time)
    mkdirSync(dirname(path), { recursive: true })
    const line = Buffer.from(`${JSON.stringify(event)}\n`, 'utf8')
    const descriptor = openSync(path, existsSync(path) ? 'a' : 'ax', 0o600)
    try {
      const offset = fstatSync(descriptor).size
      let written = 0
      while (written < line.length) written += writeSync(descriptor, line, written, line.length - written)
      if (durableEvent.test(event.type)) fsyncSync(descriptor)
      return {
        path,
        relativePath: relative(this.root, path).replaceAll('\\', '/'),
        offset,
        length: line.length,
        hash: createHash('sha256').update(line.subarray(0, -1)).digest('hex'),
      }
    } finally {
      closeSync(descriptor)
    }
  }
}
