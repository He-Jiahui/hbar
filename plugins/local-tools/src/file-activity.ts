import { diff } from '@codemirror/merge'
import type { ToolActivity } from '@hbar/contracts/tool-activity'

export function textLineCount(text: string): number {
  return text ? text.split('\n').length - Number(text.endsWith('\n')) : 0
}

function touchedLines(text: string, ranges: readonly { from: number; to: number }[]): number {
  const starts = [0]
  for (let index = 0; index < text.length; index++) if (text[index] === '\n') starts.push(index + 1)
  const position = (offset: number) => {
    let low = 0,
      high = starts.length
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if ((starts[middle] ?? Infinity) <= offset) low = middle
      else high = middle
    }
    return low
  }
  const intervals = ranges
    .filter((range) => range.to > range.from)
    .map((range) => ({
      from: position(range.from),
      to: position(range.to - 1),
    }))
    .sort((a, b) => a.from - b.from)
  let through = -1,
    total = 0
  for (const range of intervals) {
    total += Math.max(0, range.to - Math.max(through + 1, range.from) + 1)
    through = Math.max(through, range.to)
  }
  return total
}

/** Counts changed line ranges, not the entire file or the net Git diff after later edits. */
export function fileWriteActivity(
  path: string,
  operation: 'write' | 'edit',
  before: string,
  after: string,
): ToolActivity {
  const changes = diff(before.replaceAll('\r\n', '\n'), after.replaceAll('\r\n', '\n'), {
    scanLimit: 5_000,
  })
  return {
    files: [
      {
        path,
        operation,
        linesRead: null,
        patches: changes.length,
        addedLines: touchedLines(
          after.replaceAll('\r\n', '\n'),
          changes.map((change) => ({ from: change.fromB, to: change.toB })),
        ),
        removedLines: touchedLines(
          before.replaceAll('\r\n', '\n'),
          changes.map((change) => ({ from: change.fromA, to: change.toA })),
        ),
      },
    ],
  }
}

export function fileReadActivity(path: string, text: string | null): ToolActivity {
  return {
    files: [
      {
        path,
        operation: 'read',
        linesRead: text === null ? null : textLineCount(text),
        patches: null,
        addedLines: null,
        removedLines: null,
      },
    ],
  }
}
