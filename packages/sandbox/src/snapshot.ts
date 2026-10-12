import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import {
  resolvedSandboxProfileSchema,
  type ResolvedSandboxProfile,
  type SandboxSnapshotRef,
} from '@hbar/contracts/sandbox'

/** Key-sorted JSON; array order is part of the snapshot identity. */
export function canonicalSandboxJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSandboxJSON).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalSandboxJSON(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function sandboxSnapshotContent(profile: ResolvedSandboxProfile): { data: string; digest: string } {
  const data = canonicalSandboxJSON(profile)
  return { data, digest: createHash('sha256').update(data).digest('hex') }
}

/** Validate before caching or using any remote policy. A digest mismatch never falls back. */
export function verifySandboxSnapshot(ref: SandboxSnapshotRef, value: unknown): ResolvedSandboxProfile {
  const profile = resolvedSandboxProfileSchema.parse(value)
  if (profile.profileId !== ref.profileId || sandboxSnapshotContent(profile).digest !== ref.digest)
    throw new HbarError('SANDBOX_SNAPSHOT_MISMATCH', 'The sandbox snapshot does not match its content address')
  return profile
}
