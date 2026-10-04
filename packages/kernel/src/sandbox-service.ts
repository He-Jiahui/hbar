import { HbarError } from '@hbar/contracts'
import {
  BUILTIN_SANDBOX_PROFILE_IDS,
  sandboxProfileSaveInputSchema,
  sandboxProfileSchema,
  type ResolvedSandboxProfile,
  type SandboxProfile,
  type SandboxProfileDeleteInput,
  type SandboxProfileId,
  type SandboxProfileSaveInput,
} from '@hbar/contracts/sandbox'
import type { SandboxProfileDetail, SandboxProfileSummary } from '@hbar/contracts/commands/sandbox'
import { BUILTIN_SANDBOX_PROFILES, isBuiltinSandboxProfileId, resolveSandboxProfile } from './sandbox-policy'

export interface SandboxWriteIdentity {
  readonly actorId: string
  readonly idempotencyKey: string
}

export type SandboxProfileCommandId = 'sandbox.save' | 'sandbox.delete'

/** Stored (user) profiles only; built-ins live in the kernel. */
export interface SandboxProfileStoragePort {
  list(): Promise<SandboxProfile[]>
  get(id: string): Promise<SandboxProfile | null>
  save(input: SandboxProfileSaveInput, identity: SandboxWriteIdentity): Promise<SandboxProfile>
  delete(input: SandboxProfileDeleteInput, identity: SandboxWriteIdentity): Promise<{ deleted: boolean }>
  receipt(
    commandId: SandboxProfileCommandId,
    input: SandboxProfileSaveInput | SandboxProfileDeleteInput,
    identity: SandboxWriteIdentity,
  ): Promise<unknown>
}

function summary(profile: SandboxProfile): SandboxProfileSummary {
  return {
    id: profile.id,
    builtin: profile.builtin,
    name: profile.name,
    description: profile.description,
    extends: profile.extends,
    revision: profile.revision,
    updatedAt: profile.updatedAt,
  }
}

export class SandboxProfileService {
  constructor(
    private readonly port: SandboxProfileStoragePort,
    /** Best-effort invalidation hint after a committed change. */
    private readonly onChanged?: () => void,
  ) {}

  private readonly lookup = (id: SandboxProfileId) => this.port.get(id)

  async list(): Promise<SandboxProfileSummary[]> {
    const stored = await this.port.list()
    return [...BUILTIN_SANDBOX_PROFILE_IDS.map((id) => BUILTIN_SANDBOX_PROFILES[id]), ...stored].map(summary)
  }

  resolve(id: SandboxProfileId): Promise<ResolvedSandboxProfile> {
    return resolveSandboxProfile(id, this.lookup)
  }

  async get(id: SandboxProfileId): Promise<SandboxProfileDetail | null> {
    const profile = isBuiltinSandboxProfileId(id) ? BUILTIN_SANDBOX_PROFILES[id] : await this.port.get(id)
    if (!profile) return null
    try {
      return { profile, resolved: await this.resolve(id), resolveError: null }
    } catch (error) {
      if (!(error instanceof HbarError)) throw error
      return { profile, resolved: null, resolveError: { code: error.code, message: error.message.slice(0, 2_000) } }
    }
  }

  async save(raw: SandboxProfileSaveInput, identity: SandboxWriteIdentity): Promise<SandboxProfile> {
    const input = sandboxProfileSaveInputSchema.parse(raw)
    // A replay returns the committed result even if later edits would now reject the same input.
    const prior = await this.port.receipt('sandbox.save', input, identity)
    if (prior !== null) return sandboxProfileSchema.parse(prior)
    const { expectedRevision, ...fields } = input
    const candidate: SandboxProfile = {
      ...fields,
      builtin: false,
      revision: (expectedRevision ?? 0) + 1,
      createdAt: 0,
      updatedAt: 0,
    }
    // Reject chains that could never be selected: missing parents, cycles, excessive depth or size.
    await resolveSandboxProfile(input.id, (id) => (id === input.id ? Promise.resolve(candidate) : this.port.get(id)))
    const saved = await this.port.save(input, identity)
    this.notify()
    return saved
  }

  async delete(input: SandboxProfileDeleteInput, identity: SandboxWriteIdentity): Promise<{ deleted: boolean }> {
    const result = await this.port.delete(input, identity)
    if (result.deleted) this.notify()
    return result
  }

  receipt(
    commandId: SandboxProfileCommandId,
    input: SandboxProfileSaveInput | SandboxProfileDeleteInput,
    identity: SandboxWriteIdentity,
  ): Promise<unknown> {
    return this.port.receipt(commandId, input, identity)
  }

  private notify() {
    try {
      this.onChanged?.()
    } catch (error) {
      console.error('Sandbox profile change notification failed:', error)
    }
  }
}
