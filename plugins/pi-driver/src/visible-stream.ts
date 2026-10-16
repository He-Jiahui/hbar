import type { AssistantMessage } from '@earendil-works/pi-ai'

export interface VisibleStreamSnapshot {
  readonly text: string
  readonly thinking: string
}

/** Compare visible block values before joining; provider tool events may also correct visible content. */
export class VisibleStreamProjection {
  private text: readonly string[] = []
  private thinking: readonly string[] = []
  private published = false
  private snapshot: VisibleStreamSnapshot = { text: '', thinking: '' }

  reset(): void {
    this.text = []
    this.thinking = []
    this.published = false
    this.snapshot = { text: '', thinking: '' }
  }

  update(content: AssistantMessage['content']): VisibleStreamSnapshot | undefined {
    let textCount = 0
    let thinkingCount = 0
    let changed = !this.published
    for (const block of content) {
      if (block.type === 'text') changed = this.text[textCount++] !== block.text || changed
      else if (block.type === 'thinking') changed = this.thinking[thinkingCount++] !== block.thinking || changed
    }
    changed ||= textCount !== this.text.length || thinkingCount !== this.thinking.length
    if (!changed) return undefined
    const text: string[] = []
    const thinking: string[] = []
    for (const block of content) {
      if (block.type === 'text') text.push(block.text)
      else if (block.type === 'thinking') thinking.push(block.thinking)
    }
    const snapshot = { text: text.join(''), thinking: thinking.join('') }
    this.text = text
    this.thinking = thinking
    if (this.published && snapshot.text === this.snapshot.text && snapshot.thinking === this.snapshot.thinking)
      return undefined
    this.published = true
    this.snapshot = snapshot
    return snapshot
  }
}
