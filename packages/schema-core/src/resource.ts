export type ResourceKind = 'file' | 'directory'
export type ResourceLocation = 'client-local' | 'host' | 'workspace'

export interface ResourceFieldDescription {
  readonly kind: ResourceKind
  readonly location: ResourceLocation
}

export type ResourceReference =
  | {
      readonly kind: 'artifact'
      readonly resourceKind: ResourceKind
      readonly artifactId: string
      readonly name?: string
    }
  | {
      readonly kind: 'client-path'
      readonly resourceKind: ResourceKind
      readonly clientId: string
      readonly path: string
    }
  | { readonly kind: 'host-path'; readonly resourceKind: ResourceKind; readonly hostId: string; readonly path: string }
  | {
      readonly kind: 'workspace-path'
      readonly resourceKind: ResourceKind
      readonly workspaceId: string
      readonly path: string
    }

export interface ResourcePickerRequest {
  readonly resource: ResourceFieldDescription
  readonly current: ResourceReference | null
  readonly clientId: string
  readonly hostId: string
  readonly workspaceId?: string
}

export interface ResourcePickerSelection {
  readonly reference: ResourceReference
  readonly label: string
}

export interface ResourcePickerPort {
  select(request: ResourcePickerRequest, signal: AbortSignal): Promise<ResourcePickerSelection | null>
}

const artifactPattern = /^[a-f0-9]{64}$/
const idPattern = /^.{1,256}$/u

function validPath(path: string): boolean {
  return path.length > 0 && path.length <= 4_000 && !path.includes('\0')
}

function validWorkspacePath(path: string): boolean {
  if (!validPath(path) || path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return false
  return !path.replaceAll('\\', '/').split('/').includes('..')
}

export function validResourceReference(reference: ResourceReference): boolean {
  if (reference.kind === 'artifact')
    return (
      artifactPattern.test(reference.artifactId) &&
      (reference.name === undefined || (reference.name.length > 0 && reference.name.length <= 240))
    )
  if (reference.kind === 'workspace-path')
    return idPattern.test(reference.workspaceId) && validWorkspacePath(reference.path)
  if (reference.kind === 'host-path') return idPattern.test(reference.hostId) && validPath(reference.path)
  return idPattern.test(reference.clientId) && validPath(reference.path)
}

export function resourceReferenceMatches(reference: ResourceReference, description: ResourceFieldDescription): boolean {
  if (!validResourceReference(reference) || reference.resourceKind !== description.kind) return false
  if (description.location === 'workspace') return reference.kind === 'workspace-path'
  if (description.location === 'host') return reference.kind === 'host-path'
  return reference.kind === 'artifact' || reference.kind === 'client-path'
}

function encoded(value: string): string {
  return encodeURIComponent(value)
}

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function encodeResourceReference(reference: ResourceReference): string {
  if (!validResourceReference(reference)) throw new Error('Invalid resource reference')
  if (reference.kind === 'artifact')
    return `hbar-artifact:${reference.resourceKind}:${reference.artifactId}${
      reference.name === undefined ? '' : `:${encoded(reference.name)}`
    }`
  if (reference.kind === 'workspace-path')
    return `hbar-workspace:${reference.resourceKind}:${encoded(reference.workspaceId)}:${encoded(reference.path)}`
  if (reference.kind === 'host-path')
    return `hbar-host:${reference.resourceKind}:${encoded(reference.hostId)}:${encoded(reference.path)}`
  return `hbar-client:${reference.resourceKind}:${encoded(reference.clientId)}:${encoded(reference.path)}`
}

export function decodeResourceReference(value: string): ResourceReference | null {
  if (value.length > 8_192) return null
  const parts = value.split(':')
  const rawKind = parts[1]
  if (rawKind !== 'file' && rawKind !== 'directory') return null
  const resourceKind: ResourceKind = rawKind
  if (parts[0] === 'hbar-artifact' && (parts.length === 3 || parts.length === 4)) {
    const name = parts[3] === undefined ? undefined : decoded(parts[3])
    if (name === null) return null
    const reference: ResourceReference = {
      kind: 'artifact',
      resourceKind,
      artifactId: parts[2]!,
      ...(name === undefined ? {} : { name }),
    }
    return validResourceReference(reference) ? reference : null
  }
  if (parts.length !== 4) return null
  const id = decoded(parts[2]!)
  const path = decoded(parts[3]!)
  if (!id || path === null) return null
  const reference: ResourceReference | null =
    parts[0] === 'hbar-workspace'
      ? { kind: 'workspace-path', resourceKind, workspaceId: id, path }
      : parts[0] === 'hbar-host'
        ? { kind: 'host-path', resourceKind, hostId: id, path }
        : parts[0] === 'hbar-client'
          ? { kind: 'client-path', resourceKind, clientId: id, path }
          : null
  return reference && validResourceReference(reference) ? reference : null
}

export function resourceReferenceLabel(reference: ResourceReference): string {
  return reference.kind === 'artifact' ? (reference.name ?? reference.artifactId) : reference.path
}
