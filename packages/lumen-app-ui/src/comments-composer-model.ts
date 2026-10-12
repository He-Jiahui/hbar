export interface LumenCommentsComposerMention {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly handle: string
  readonly detail: string
}

function mentionQuery(draft: string): string | undefined {
  return /@([^\s@]*)$/u.exec(draft)?.[1]
}

/** Pure projections for a Host-owned draft and member directory. */
export function filterLumenCommentsComposerMentions(
  draft: string,
  people: readonly LumenCommentsComposerMention[],
): readonly LumenCommentsComposerMention[] {
  const query = mentionQuery(draft)?.toLocaleLowerCase()
  if (query === undefined) {
    return []
  }
  const seen = new Set<string>()
  return people.filter((person) => {
    if (seen.has(person.id)) {
      return false
    }
    seen.add(person.id)
    return person.name.toLocaleLowerCase().includes(query)
  })
}

export function insertLumenCommentsComposerMention(draft: string, handle: string): string {
  return draft.replace(/@([^\s@]*)$/u, () => `@${handle} `)
}
