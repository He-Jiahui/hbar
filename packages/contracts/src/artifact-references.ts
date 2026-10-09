import type { ArtifactRef } from './index'

const artifactId = /^[a-f0-9]{64}$/
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Bounded schema-shaped references, shared by device inventories and legacy settings indexing. */
export function collectArtifactReferences(value: unknown): {
  ids: string[]
  artifacts: ArtifactRef[]
  complete: boolean
} {
  const ids = new Set<string>()
  const artifacts = new Map<string, ArtifactRef>()
  const result = (complete: boolean) => ({ ids: [...ids].sort(), artifacts: [...artifacts.values()], complete })
  const pending: { value: unknown; depth: number; key: string }[] = [{ value, depth: 0, key: '' }]
  let visited = 0
  while (pending.length) {
    const item = pending.pop()!
    if (++visited > 100_000 || item.depth > 64 || ids.size > 4096) return result(false)
    if (typeof item.value === 'string') {
      if ((item.key === 'backgroundAsset' || item.key.endsWith('.backgroundAsset')) && artifactId.test(item.value))
        ids.add(item.value)
    } else if (Array.isArray(item.value)) {
      for (const child of item.value) {
        if (pending.length + visited >= 100_000) return result(false)
        pending.push({ value: child, depth: item.depth + 1, key: item.key })
      }
    } else if (record(item.value)) {
      const object = item.value
      if (
        typeof object.id === 'string' &&
        artifactId.test(object.id) &&
        typeof object.mime === 'string' &&
        typeof object.name === 'string' &&
        typeof object.size === 'number' &&
        Number.isFinite(object.size) &&
        object.size >= 0
      ) {
        ids.add(object.id)
        if (object.name.length <= 240 && object.mime.length <= 120 && Number.isSafeInteger(object.size))
          artifacts.set(object.id, { id: object.id, name: object.name, mime: object.mime, size: object.size })
      }
      for (const key in object) {
        if (!Object.hasOwn(object, key)) continue
        if (pending.length + visited >= 100_000) return result(false)
        pending.push({ value: object[key], depth: item.depth + 1, key })
      }
    }
  }
  return result(true)
}

export function collectArtifactReferenceIds(value: unknown): { ids: string[]; complete: boolean } {
  const { ids, complete } = collectArtifactReferences(value)
  return { ids, complete }
}
