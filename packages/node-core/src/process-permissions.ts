import { HbarError } from '@hbar/contracts'
import { sandboxPathKey, type ResolvedSandboxProfile, type SandboxPathAccess } from '@hbar/contracts/sandbox'

/** The small path surface needed to compile a process manifest, kept injectable for tests. */
export interface ProcessPermissionPathPort {
  canonical(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  resolve(...paths: string[]): string
  relative(from: string, to: string): string
  isAbsolute(path: string): boolean
  readonly separator: string
  readonly caseInsensitive: boolean
}

export interface ProcessPermissionManifest {
  readonly readableRoots: readonly string[]
  readonly writableRoots: readonly string[]
  readonly protectedPaths: readonly string[]
  readonly readOnlyPaths: readonly string[]
}

export interface ProcessPermissionInput {
  readonly root: string
  readonly cwd: string
  readonly registrationAccess: 'read' | 'write'
  readonly profile: ResolvedSandboxProfile | null
  readonly floorProtectedPaths: readonly string[]
  readonly floorReadOnlyPaths?: readonly string[]
  readonly paths: ProcessPermissionPathPort
}

const accessRank: Readonly<Record<SandboxPathAccess, number>> = { none: 0, read: 1, write: 2 }

function within(root: string, path: string, paths: ProcessPermissionPathPort): boolean {
  const from = paths.caseInsensitive ? root.toLowerCase() : root
  const to = paths.caseInsensitive ? path.toLowerCase() : path
  const rel = paths.relative(from, to)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${paths.separator}`) && !paths.isAbsolute(rel))
}

function unsupported(message: string): never {
  throw new HbarError('NODE_PERMISSION_UNSUPPORTED', message)
}

/**
 * Compile the filesystem part of a sandbox snapshot into the Unix backend's mount contract.
 * Exact grants are supported as ordered root mounts and read-only/protected overlays. Globs are
 * rejected because the OS backends cannot preserve evaluator matching for them.
 */
export async function createProcessPermissionManifest(
  input: ProcessPermissionInput,
): Promise<ProcessPermissionManifest> {
  const { paths } = input
  const root = await paths.canonical(input.root)
  const cwd = await paths.canonical(input.cwd)
  if (!within(root, cwd, paths)) throw new HbarError('NODE_DENIED', 'The process cwd leaves its registered root')
  const grants: Array<{ path: string; access: SandboxPathAccess; specificity: number }> = []
  const ancestors: Array<{ path: string; access: SandboxPathAccess; specificity: number }> = []
  for (const grant of input.profile?.filesystem.grants ?? []) {
    if (/[*?]/.test(grant.path)) unsupported('OS confinement cannot represent glob filesystem grants')
    const requested = paths.isAbsolute(grant.path) ? paths.resolve(grant.path) : paths.resolve(root, grant.path)
    const path = await paths.canonical(requested)
    if (path !== requested)
      unsupported('OS confinement cannot preserve a filesystem grant that resolves through a link')
    const key = sandboxPathKey(grant.path)
    const relativePath = within(root, path, paths) ? paths.relative(root, path) : null
    const specificity =
      (relativePath === null ? key.split('/').filter(Boolean) : relativePath.split(paths.separator).filter(Boolean))
        .length *
        2 +
      1
    if (within(path, root, paths)) {
      ancestors.push({
        path,
        access: input.registrationAccess === 'read' && grant.access === 'write' ? 'read' : grant.access,
        specificity,
      })
      continue
    }
    if (!within(root, path, paths)) continue
    if (!(await paths.exists(path))) unsupported('OS confinement cannot mount a filesystem grant that does not exist')
    const access = input.registrationAccess === 'read' && grant.access === 'write' ? 'read' : grant.access
    grants.push({ path, access, specificity })
  }

  const defaultAccess: SandboxPathAccess = !input.profile
    ? input.registrationAccess
    : input.registrationAccess === 'read' && input.profile.filesystem.default === 'write'
      ? 'read'
      : input.profile.filesystem.default
  const rootCandidates = [...ancestors, ...grants.filter((grant) => grant.path === root)]
  const bestGrant = (candidates: readonly { access: SandboxPathAccess; specificity: number }[]) =>
    candidates.reduce<{ access: SandboxPathAccess; specificity: number } | null>((best, candidate) => {
      if (!best) return candidate
      if (candidate.specificity > best.specificity) return candidate
      if (candidate.specificity === best.specificity && accessRank[candidate.access] < accessRank[best.access])
        return candidate
      return best
    }, null)
  const rootAccess = bestGrant(rootCandidates)?.access ?? defaultAccess
  const readableRoots: string[] = rootAccess === 'none' ? [] : [root]
  const writableRoots: string[] = rootAccess === 'write' ? [root] : []
  const protectedPaths = new Set<string>()
  const readOnlyPaths = new Set<string>()

  for (const grant of grants) {
    const inherited = bestGrant(
      [...ancestors, ...grants.filter((candidate) => candidate !== grant)].filter((candidate) =>
        within(candidate.path, grant.path, paths),
      ),
    )
    if (
      inherited &&
      grant.specificity > inherited.specificity &&
      accessRank[grant.access] > accessRank[inherited.access]
    )
      unsupported('OS confinement cannot represent a more permissive nested filesystem grant')
    const effectiveAccess = bestGrant([
      ...(inherited ? [inherited] : []),
      { access: grant.access, specificity: grant.specificity },
    ])?.access
    if (effectiveAccess === 'none') protectedPaths.add(grant.path)
    else if (effectiveAccess === 'read') {
      if (!readableRoots.some((candidate) => within(candidate, grant.path, paths))) readableRoots.push(grant.path)
      if (writableRoots.some((candidate) => within(candidate, grant.path, paths))) readOnlyPaths.add(grant.path)
    } else if (effectiveAccess === 'write') {
      if (!readableRoots.some((candidate) => within(candidate, grant.path, paths))) readableRoots.push(grant.path)
      if (!writableRoots.some((candidate) => within(candidate, grant.path, paths))) writableRoots.push(grant.path)
    }
  }

  if (!readableRoots.some((candidate) => within(candidate, cwd, paths)))
    unsupported('The process cwd has no effective read grant, so the process cannot start there')
  if ([...protectedPaths].some((path) => within(path, cwd, paths)))
    unsupported('The process cwd is denied by an effective filesystem grant')

  // Keep every node floor path in the OS policy. Paths outside this registered root are already
  // hidden by the private namespace, and explicit denies preserve that invariant if mounts change.
  for (const blocked of input.floorProtectedPaths) {
    const path = await paths.canonical(blocked)
    if (within(path, root, paths))
      throw new HbarError('NODE_DENIED', 'A protected node path contains the registered process root')
    protectedPaths.add(path)
  }
  for (const blocked of protectedPaths)
    if (writableRoots.some((candidate) => within(candidate, blocked, paths)) && !(await paths.exists(blocked)))
      unsupported('OS confinement cannot protect a missing path beneath a writable root')
  for (const readOnly of input.floorReadOnlyPaths ?? []) {
    const path = await paths.canonical(readOnly)
    if (within(path, root, paths)) writableRoots.length = 0
    if (within(root, path, paths) && writableRoots.some((candidate) => within(candidate, path, paths)))
      readOnlyPaths.add(path)
  }

  return {
    readableRoots: [...new Set(readableRoots)],
    writableRoots: [...new Set(writableRoots)],
    protectedPaths: [...protectedPaths],
    readOnlyPaths: [...readOnlyPaths],
  }
}
