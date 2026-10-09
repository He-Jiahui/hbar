import { parseResourceReference, type ResourceReference } from '@hbar/contracts/resources'
import { splitMessageFileReferences } from './message-file-reference-model'
import { messageLiteralSegments } from './message-literal-text-model'
export type ResourceSegment =
  { kind: 'text'; value: string } | { kind: 'resource'; value: string; reference: ResourceReference }
/** Preserve authored bytes and CJK punctuation; quoted/inline code can carry spaces. */
export function splitResourceReferences(text: string): ResourceSegment[] {
  const result: ResourceSegment[] = []
  const expression = /`([^`\r\n]+)`|[^\s<>`，。；！？、（）“”「」]+/gu
  let offset = 0
  for (const match of text.matchAll(expression)) {
    if (match.index > offset) appendPlain(text.slice(offset, match.index))
    const value = match[0]
    const target = match[1] ?? value.replace(/[.,;!?]+$/, '')
    const reference = parseResourceReference(target, Boolean(match[1]))
    if (reference) {
      if (match[1]) {
        result.push({ kind: 'text', value: '`' })
        result.push({ kind: 'resource', value: target, reference })
        result.push({ kind: 'text', value: '`' })
      } else {
        result.push({ kind: 'resource', value: target, reference })
        if (value.length > target.length) result.push({ kind: 'text', value: value.slice(target.length) })
      }
    } else appendPlain(value)
    offset = match.index + value.length
  }
  appendPlain(text.slice(offset))
  return result
  function appendPlain(value: string) {
    for (const literal of messageLiteralSegments(value)) {
      const reference = literal.kind === 'url' ? parseResourceReference(literal.value) : null
      if (reference) result.push({ kind: 'resource', value: literal.value, reference })
      else
        for (const part of splitMessageFileReferences(literal.value))
          result.push(
            part.kind === 'file'
              ? { kind: 'resource', value: part.value, reference: { kind: 'file', ...part.reference } }
              : part,
          )
    }
  }
}
