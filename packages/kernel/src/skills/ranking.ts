import type { RuntimeSkill } from './catalog'

/** Latin words plus Unicode character bigrams keep continuous Chinese text searchable. */
function terms(text: string): Set<string> {
  const normalized = text.toLocaleLowerCase('en-US')
  const values = normalized.match(/[\p{L}\p{N}_-]+/gu) ?? []
  const result = new Set(values)
  for (const value of values) {
    if (![...value].some((character) => character.charCodeAt(0) > 0x24f)) continue
    const characters = Array.from(value)
    for (let index = 0; index < characters.length - 1; index++) result.add(characters.slice(index, index + 2).join(''))
  }
  return result
}
export function explicitlyMentionsSkill(query: string, skill: Pick<RuntimeSkill, 'id' | 'name'>): boolean {
  const name = skill.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_-])${name}(?=$|[^\\p{L}\\p{N}_-])`, 'iu').test(query)
}
export function rankSkills(skills: readonly RuntimeSkill[], query: string): RuntimeSkill[] {
  const requested = terms(query.slice(0, 12_000))
  const score = (skill: RuntimeSkill) => {
    const names = terms(skill.name)
    const description = terms(skill.description)
    let value = explicitlyMentionsSkill(query, skill) ? 10_000 : 0
    for (const term of requested) value += names.has(term) ? 8 : description.has(term) ? 2 : 0
    return value
  }
  return skills
    .map((skill) => ({ skill, score: score(skill) }))
    .filter((item) => !query.trim() || item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name, 'en'))
    .map((item) => item.skill)
}
