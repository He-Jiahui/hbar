export interface LumenCommentsInboxReferenceItem {
  readonly id: string
  readonly documentId: string
  readonly initials: string
  readonly author: string
  readonly time: string
  readonly context: string
  readonly body: string
  readonly mentioned: boolean
  readonly resolved: boolean
}
export interface LumenCommentsInboxFilter {
  readonly id: string
  readonly label: string
  readonly kind: 'all' | 'unresolved' | 'mentions'
}
export function uniqueLumenCommentsInboxItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
/** Filter the view without changing the Host's collection or global summary. */
export function projectLumenCommentsInbox(
  items: readonly LumenCommentsInboxReferenceItem[],
  kind: LumenCommentsInboxFilter['kind'],
): {
  readonly items: readonly LumenCommentsInboxReferenceItem[]
  readonly unresolved: number
  readonly documents: number
} {
  const unique = uniqueLumenCommentsInboxItems(items)
  return {
    items: unique.filter((item) => {
      switch (kind) {
        case 'all':
          return true
        case 'unresolved':
          return !item.resolved
        case 'mentions':
          return item.mentioned
        default: {
          const unsupported: never = kind
          throw new Error(`Unsupported comment filter: ${String(unsupported)}`)
        }
      }
    }),
    unresolved: unique.filter((item) => !item.resolved).length,
    documents: new Set(unique.map((item) => item.documentId)).size,
  }
}
