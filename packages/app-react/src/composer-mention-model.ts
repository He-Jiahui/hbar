import type { ChangeDesc } from '@codemirror/state'
import type { PromptMention } from '@hbar/contracts/commands/draft'

/** CodeMirror offsets are UTF-16, the same coordinate system as JS string slices. */
export function mapMentionSpans(mentions: readonly PromptMention[], changes: ChangeDesc): PromptMention[] {
  const mapped: PromptMention[] = []
  for (const mention of mentions) {
    let touched = false
    changes.iterChangedRanges((from, to) => {
      if (from < mention.end && to > mention.start) touched = true
      // Insertion inside a pill also destroys its structure, but typing outside it does not.
      if (from === to && from > mention.start && from < mention.end) touched = true
    })
    if (!touched)
      mapped.push({ ...mention, start: changes.mapPos(mention.start, 1), end: changes.mapPos(mention.end, -1) })
  }
  return mapped
}
