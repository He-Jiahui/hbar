import { CommandError } from '@hbar/commands'
import { agentCreateInputSchema } from '@hbar/contracts/commands/agents'
import { z } from 'zod'
import type { ClientJsonObject, ClientPersistencePort, RuntimeOptions } from './types'

const MAX_PENDING_CREATE_BYTES = 16 * 1024
const idSchema = z.string().min(1).max(160)
const agentComposerOriginSchema = z.strictObject({
  kind: z.literal('composer'),
  workspaceId: idSchema,
  draftText: z.string().max(4_200),
  draftRevision: z.number().int().nonnegative(),
})
export const pendingAgentCreateSchema = z.strictObject({
  version: z.literal(1),
  hostId: z.string().min(1).max(160),
  parentSessionId: idSchema,
  operationKey: z.string().min(1).max(128),
  input: agentCreateInputSchema.refine((value) => !value.patchTask && !value.reviewTask),
  origin: agentComposerOriginSchema.optional(),
})
export type PendingAgentCreate = z.output<typeof pendingAgentCreateSchema>

function pendingCreateJson(pending: PendingAgentCreate): ClientJsonObject {
  return {
    version: pending.version,
    hostId: pending.hostId,
    parentSessionId: pending.parentSessionId,
    operationKey: pending.operationKey,
    input: {
      parentSessionId: pending.input.parentSessionId,
      objective: pending.input.objective,
      ...(pending.input.profileId ? { profileId: pending.input.profileId } : {}),
      ...(pending.input.modelId ? { modelId: pending.input.modelId } : {}),
      ...(pending.input.title ? { title: pending.input.title } : {}),
      ...(pending.input.tokenBudget === undefined ? {} : { tokenBudget: pending.input.tokenBudget }),
      ...(pending.input.thinkingLevel ? { thinkingLevel: pending.input.thinkingLevel } : {}),
      ...(pending.input.approval ? { approval: pending.input.approval } : {}),
      ...(pending.input.sandboxProfileId ? { sandboxProfileId: pending.input.sandboxProfileId } : {}),
      ...(pending.input.sandbox ? { sandbox: { ...pending.input.sandbox } } : {}),
    },
    ...(pending.origin
      ? {
          origin: {
            kind: pending.origin.kind,
            workspaceId: pending.origin.workspaceId,
            draftText: pending.origin.draftText,
            draftRevision: pending.origin.draftRevision,
          },
        }
      : {}),
  }
}

function serializedBytes(value: unknown): number {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation is not serializable')
  }
  if (serialized === undefined)
    throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation is not serializable')
  return new TextEncoder().encode(serialized).byteLength
}

export interface AgentCreateRecovery {
  read(parentSessionId: string): Promise<PendingAgentCreate | null>
  write(pending: PendingAgentCreate): Promise<void>
  remove(parentSessionId: string, operationKey: string): Promise<void>
}

export function createAgentCreateRecovery(
  options: Pick<RuntimeOptions, 'hostId' | 'persistence'>,
): AgentCreateRecovery {
  const persistenceUnavailable = () =>
    new CommandError('PERSISTENCE_UNAVAILABLE', 'Agent creation recovery storage is unavailable')
  const storageKey = (parentSessionId: string) =>
    `hbar:agent-workspace:pending-create:${encodeURIComponent(options.hostId)}:${encodeURIComponent(parentSessionId)}`
  const read = async (parentSessionId: string): Promise<PendingAgentCreate | null> => {
    const persistence: ClientPersistencePort | undefined = options.persistence
    if (!persistence) throw persistenceUnavailable()
    let value: unknown
    try {
      value = await persistence.read(storageKey(parentSessionId))
    } catch {
      throw persistenceUnavailable()
    }
    if (value === null || value === undefined) return null
    const parsed = pendingAgentCreateSchema.safeParse(value)
    if (
      !parsed.success ||
      parsed.data.hostId !== options.hostId ||
      parsed.data.parentSessionId !== parentSessionId ||
      parsed.data.input.parentSessionId !== parentSessionId
    )
      throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation does not match this Host session')
    if (serializedBytes(pendingCreateJson(parsed.data)) > MAX_PENDING_CREATE_BYTES)
      throw new CommandError('INVALID_PERSISTED_STATE', 'Pending agent creation exceeds its storage limit')
    return parsed.data
  }
  const write = async (pending: PendingAgentCreate) => {
    const persistence = options.persistence
    if (!persistence) throw persistenceUnavailable()
    const value = pendingCreateJson(pending)
    if (serializedBytes(value) > MAX_PENDING_CREATE_BYTES)
      throw new CommandError('PERSISTENCE_LIMIT', 'Pending agent creation exceeds its storage limit')
    try {
      await persistence.write(storageKey(pending.parentSessionId), value)
    } catch {
      throw persistenceUnavailable()
    }
  }
  const remove = async (parentSessionId: string, operationKey: string) => {
    const persistence = options.persistence
    if (!persistence) throw persistenceUnavailable()
    const pending = await read(parentSessionId)
    if (!pending) return
    if (pending.operationKey !== operationKey)
      throw new CommandError('IDEMPOTENCY_CONFLICT', 'Pending agent creation changed before it could be cleared')
    try {
      await persistence.remove(storageKey(parentSessionId))
    } catch {
      throw persistenceUnavailable()
    }
  }
  return { read, write, remove }
}
