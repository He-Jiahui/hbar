import type { CompiledField, FieldValue } from './schema'

/** Missing/invalid controllers never match a stale previously parsed draft. */
export function isFieldVisible(
  field: CompiledField,
  draft: Readonly<Record<string, FieldValue>>,
  raw: Readonly<Record<string, string>> = {},
): boolean {
  return (
    field.visibleWhen?.all.every((comparison) => {
      if (Object.hasOwn(raw, comparison.field) || !Object.hasOwn(draft, comparison.field)) return false
      const actual = draft[comparison.field]
      const expected = comparison.equals
      return Array.isArray(actual) && Array.isArray(expected)
        ? actual.length === expected.length && actual.every((value, index) => value === expected[index])
        : actual === expected
    }) ?? true
  )
}
