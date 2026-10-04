import { SchemaError } from './schema'

export type SchemaPathSegment =
  { readonly kind: 'field'; readonly name: string } | { readonly kind: 'item'; readonly id: string }
export type SchemaPath = readonly SchemaPathSegment[]

function checkSegment(segment: SchemaPathSegment): void {
  const value = segment.kind === 'field' ? segment.name : segment.id
  if (!value || value.length > 256 || Array.from(value).some((character) => character.charCodeAt(0) < 32))
    throw new SchemaError('INVALID_PATH', 'Path segment must be a bounded, nonempty field or stable item ID')
}

export function encodePath(path: SchemaPath): string {
  if (!path.length || path.length > 32 || path[0]?.kind !== 'field')
    throw new SchemaError('INVALID_PATH', 'Path must start with a field and contain at most 32 segments')
  return path
    .map((segment) => {
      checkSegment(segment)
      return `${segment.kind === 'field' ? 'f' : 'i'}:${encodeURIComponent(segment.kind === 'field' ? segment.name : segment.id)}`
    })
    .join('/')
}

export function decodePath(encoded: string): SchemaPath {
  if (!encoded || encoded.length > 12_000) throw new SchemaError('INVALID_PATH', 'Path exceeds its size limit')
  const segments = encoded.split('/').map((part): SchemaPathSegment => {
    const kind = part.slice(0, 2)
    if (kind !== 'f:' && kind !== 'i:') throw new SchemaError('INVALID_PATH', 'Unknown path segment kind')
    let value: string
    try {
      value = decodeURIComponent(part.slice(2))
    } catch {
      throw new SchemaError('INVALID_PATH', 'Malformed path encoding')
    }
    const segment = kind === 'f:' ? { kind: 'field' as const, name: value } : { kind: 'item' as const, id: value }
    checkSegment(segment)
    return Object.freeze(segment)
  })
  if (encodePath(segments) !== encoded) throw new SchemaError('INVALID_PATH', 'Path must use canonical encoding')
  return Object.freeze(segments)
}
