/** Compare already-resolved owner paths without guessing the filesystem's case mode. */
export function isPathWithin(
  root: string,
  path: string,
  options: { readonly separator: '/' | '\\'; readonly caseInsensitive: boolean },
): boolean {
  const normalize = (value: string) => {
    const normalized = options.separator === '\\' ? value.replaceAll('\\', '/') : value
    return options.caseInsensitive ? normalized.toLowerCase() : normalized
  }
  const parent = normalize(root),
    candidate = normalize(path)
  if (!parent) return false
  return candidate === parent || candidate.startsWith(parent.endsWith('/') ? parent : parent + '/')
}
