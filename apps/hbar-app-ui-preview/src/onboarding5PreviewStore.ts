import { createStore } from 'zustand/vanilla'

export const ONBOARDING5_ROLE_IDS = ['member', 'admin', 'viewer'] as const

export type Onboarding5RoleId = (typeof ONBOARDING5_ROLE_IDS)[number]

export interface Onboarding5InvitationRowSeed {
  readonly id: string
  readonly email: string
  readonly roleId: string
}

export interface Onboarding5InvitationRow {
  readonly id: string
  readonly email: string
  readonly roleId: Onboarding5RoleId
}

export interface Onboarding5PreviewStoreSeed {
  readonly invitationRows: readonly Onboarding5InvitationRowSeed[]
  readonly roleIds: readonly string[]
  readonly shareLink: string
}

export type Onboarding5HostRequest =
  | {
      readonly kind: 'copy-link-request'
      readonly shareLink: string
      readonly resultBehavior: 'clipboard-write-unverified'
    }
  | {
      readonly kind: 'add-invitation-request'
      readonly resultBehavior: 'row-addition-unverified'
    }
  | {
      readonly kind: 'remove-invitation-request'
      readonly invitationId: string
      readonly resultBehavior: 'row-removal-unverified'
    }
  | {
      readonly kind: 'skip-request'
      readonly resultBehavior: 'navigation-unverified'
    }
  | {
      readonly kind: 'send-invitations-request'
      readonly invitationRows: readonly Onboarding5InvitationRow[]
      readonly resultBehavior: 'remote-send-unverified'
    }

export interface Onboarding5PreviewStoreState {
  readonly invitationRows: readonly Onboarding5InvitationRow[]
  readonly roleIds: readonly Onboarding5RoleId[]
  readonly shareLink: string
  readonly setEmail: (invitationId: string, email: string) => boolean
  readonly selectRole: (invitationId: string, roleId: string) => boolean
  readonly requestCopyLink: () => Onboarding5HostRequest
  readonly requestAddInvitation: () => Onboarding5HostRequest
  readonly requestRemoveInvitation: (invitationId: string) => Onboarding5HostRequest | null
  readonly requestSkip: () => Onboarding5HostRequest
  readonly requestSendInvitations: () => Onboarding5HostRequest
}

function isRoleId(value: string): value is Onboarding5RoleId {
  return ONBOARDING5_ROLE_IDS.some((roleId) => roleId === value)
}

function normalizeRoleIds(requestedIds: readonly string[]): readonly Onboarding5RoleId[] {
  const seen = new Set<Onboarding5RoleId>()
  const roleIds: Onboarding5RoleId[] = []

  for (const requestedId of requestedIds) {
    if (!isRoleId(requestedId) || seen.has(requestedId)) continue
    seen.add(requestedId)
    roleIds.push(requestedId)
  }

  return roleIds
}

function normalizeInvitationRows(
  requestedRows: readonly Onboarding5InvitationRowSeed[],
  roleIds: readonly Onboarding5RoleId[],
): readonly Onboarding5InvitationRow[] {
  const seen = new Set<string>()
  const rows: Onboarding5InvitationRow[] = []

  for (const row of requestedRows) {
    if (!row.id.trim() || seen.has(row.id) || !isRoleId(row.roleId) || !roleIds.includes(row.roleId)) continue
    seen.add(row.id)
    rows.push({ id: row.id, email: row.email, roleId: row.roleId })
  }

  // The source shows an Add another control but no row limit. Preserve valid host rows without inventing a cap.
  return rows
}

export function createOnboarding5PreviewStore(seed: Onboarding5PreviewStoreSeed) {
  const roleIds = normalizeRoleIds(seed.roleIds)
  const invitationRows = normalizeInvitationRows(seed.invitationRows, roleIds)

  return createStore<Onboarding5PreviewStoreState>((set, get) => ({
    invitationRows,
    roleIds,
    shareLink: seed.shareLink,
    setEmail: (invitationId, email) => {
      const current = get().invitationRows
      let changed = false
      const nextRows = current.map((row) => {
        if (row.id !== invitationId || row.email === email) return row
        changed = true
        return { ...row, email }
      })

      if (!changed) return false
      set({ invitationRows: nextRows })
      return true
    },
    selectRole: (invitationId, roleId) => {
      if (!isRoleId(roleId) || !roleIds.includes(roleId)) return false

      const current = get().invitationRows
      let changed = false
      const nextRows = current.map((row) => {
        if (row.id !== invitationId || row.roleId === roleId) return row
        changed = true
        return { ...row, roleId }
      })

      if (!changed) return false
      set({ invitationRows: nextRows })
      return true
    },
    requestCopyLink: () => ({
      kind: 'copy-link-request',
      shareLink: get().shareLink,
      resultBehavior: 'clipboard-write-unverified',
    }),
    requestAddInvitation: () => ({
      kind: 'add-invitation-request',
      resultBehavior: 'row-addition-unverified',
    }),
    requestRemoveInvitation: (invitationId) => {
      if (!get().invitationRows.some((row) => row.id === invitationId)) return null
      return {
        kind: 'remove-invitation-request',
        invitationId,
        resultBehavior: 'row-removal-unverified',
      }
    },
    requestSkip: () => ({
      kind: 'skip-request',
      resultBehavior: 'navigation-unverified',
    }),
    requestSendInvitations: () => ({
      kind: 'send-invitations-request',
      invitationRows: get().invitationRows.map((row) => ({ ...row })),
      resultBehavior: 'remote-send-unverified',
    }),
  }))
}
