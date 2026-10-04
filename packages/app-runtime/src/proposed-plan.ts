export const MAX_PROPOSED_PLAN_CHARACTERS = 180_000

export type ProposedPlanParseResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly reason: 'nested' | 'multiple' | 'unmatched' | 'empty' | 'too_large' }
  | { readonly kind: 'incomplete'; readonly before: string; readonly markdown: string }
  | { readonly kind: 'complete'; readonly before: string; readonly markdown: string; readonly after: string }

/** Only exact standalone tags outside fenced code identify an authored proposal. */
export function parseProposedPlan(source: string): ProposedPlanParseResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let start: number | null = null
  let end: number | null = null
  let fence: { character: string; length: number } | null = null
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (marker) {
      const token = marker[1] ?? ''
      if (fence) {
        if (token[0] === fence.character && token.length >= fence.length && !marker[2]?.trim()) fence = null
      } else fence = { character: token[0] ?? '', length: token.length }
      continue
    }
    if (fence) continue
    if (/^ {0,3}<proposed_plan>\s*$/.test(line)) {
      if (start !== null) return { kind: 'invalid', reason: end === null ? 'nested' : 'multiple' }
      start = index
    } else if (/^ {0,3}<\/proposed_plan>\s*$/.test(line)) {
      if (start === null || end !== null) return { kind: 'invalid', reason: 'unmatched' }
      end = index
    }
  }
  if (start === null) return { kind: 'none' }
  const before = lines.slice(0, start).join('\n')
  const markdown = lines
    .slice(start + 1, end ?? undefined)
    .join('\n')
    .trim()
  if (end === null) return { kind: 'incomplete', before, markdown }
  if (!markdown) return { kind: 'invalid', reason: 'empty' }
  if (markdown.length > MAX_PROPOSED_PLAN_CHARACTERS) return { kind: 'invalid', reason: 'too_large' }
  return { kind: 'complete', before, markdown, after: lines.slice(end + 1).join('\n') }
}

/** SHA-256 is only a stale-content token, never an authorization substitute. */
export async function proposedPlanFingerprint(source: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
