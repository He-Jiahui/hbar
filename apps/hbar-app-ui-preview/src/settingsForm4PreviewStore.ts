import { createStore } from 'zustand/vanilla'

export type SettingsForm4PreviewRoleId = 'owner' | 'admin' | 'member' | 'billing' | 'viewer'
export type SettingsForm4PreviewAssignableRoleId = Exclude<SettingsForm4PreviewRoleId, 'owner'>
export type SettingsForm4PreviewMemberStatus = 'active' | 'invited'
export type SettingsForm4PreviewEmailPresentation = 'email' | 'invitation-sent'

export interface SettingsForm4PreviewRoleOption {
  readonly id: SettingsForm4PreviewAssignableRoleId
  readonly label: string
}

export interface SettingsForm4PreviewMember {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly email: string
  readonly status: SettingsForm4PreviewMemberStatus
  readonly roleId: SettingsForm4PreviewRoleId
  readonly emailPresentation: SettingsForm4PreviewEmailPresentation
}

export interface SettingsForm4PreviewStoreSeed {
  readonly members: readonly SettingsForm4PreviewMember[]
  readonly roleOptions: readonly SettingsForm4PreviewRoleOption[]
  readonly initialInviteRoleId: SettingsForm4PreviewAssignableRoleId
  readonly seatsUsed: number
  readonly seatsTotal: number
}

export type SettingsForm4PreviewNotice =
  | { readonly kind: 'invitation-sent'; readonly memberId: string }
  | { readonly kind: 'email-copied'; readonly memberId: string }
  | { readonly kind: 'copy-failed'; readonly memberId: string }

export interface SettingsForm4PreviewHandlers {
  readonly onRoleChange: (memberId: string, roleId: SettingsForm4PreviewAssignableRoleId) => void
  readonly onInvitePreviewRequested: (event: {
    readonly memberId: string
    readonly email: string
    readonly roleId: SettingsForm4PreviewAssignableRoleId
  }) => void
  readonly onCopyEmailRequested: (memberId: string, email: string) => Promise<void>
  readonly onRemoveRequested: (memberId: string) => void
}

export interface SettingsForm4PreviewStoreState {
  readonly members: readonly SettingsForm4PreviewMember[]
  readonly roleOptions: readonly SettingsForm4PreviewRoleOption[]
  readonly seatsUsed: number
  readonly seatsTotal: number
  readonly inviteEmail: string
  readonly inviteRoleId: SettingsForm4PreviewAssignableRoleId
  readonly openMenuMemberId: string | null
  readonly copyPendingMemberId: string | null
  readonly notice: SettingsForm4PreviewNotice | null
  readonly setInviteEmail: (value: string) => boolean
  readonly setInviteRole: (roleId: SettingsForm4PreviewAssignableRoleId) => boolean
  readonly changeMemberRole: (memberId: string, roleId: SettingsForm4PreviewAssignableRoleId) => boolean
  readonly toggleMemberMenu: (memberId: string) => boolean
  readonly closeMemberMenu: () => boolean
  readonly submitInvitePreview: () => boolean
  readonly copyMemberEmail: (memberId: string) => Promise<boolean>
  readonly requestRemoveMember: (memberId: string) => boolean
  readonly clearNotice: () => boolean
}

function uniqueById<Item extends { readonly id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function displayNameFromEmail(email: string): string {
  const localPart = email.trim().split('@', 1)[0] ?? ''
  const words = localPart.split(/[.-]+/).filter(Boolean)
  return words
    .map((word) => `${word.slice(0, 1).toLocaleUpperCase('en-US')}${word.slice(1).toLocaleLowerCase('en-US')}`)
    .join(' ')
}

function initialsFromName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  const initials = words.length > 1 ? words.slice(0, 2).map((word) => word.slice(0, 1)).join('') : name.slice(0, 2)
  return initials.toLocaleUpperCase('en-US')
}

export function createSettingsForm4PreviewStore(
  seed: SettingsForm4PreviewStoreSeed,
  handlers: SettingsForm4PreviewHandlers,
) {
  const roleOptions = uniqueById(seed.roleOptions).map((option) => ({ ...option }))
  const roleIds = new Set(roleOptions.map((option) => option.id))
  if (!roleIds.has(seed.initialInviteRoleId)) {
    throw new RangeError('The initial invitation role must exist in the role options.')
  }
  if (!Number.isInteger(seed.seatsUsed) || seed.seatsUsed < 0) {
    throw new RangeError('Used seats must be a non-negative integer.')
  }
  if (!Number.isInteger(seed.seatsTotal) || seed.seatsTotal < 1 || seed.seatsUsed > seed.seatsTotal) {
    throw new RangeError('Total seats must be positive and at least the number of used seats.')
  }

  const members = uniqueById(seed.members).map((member) => ({ ...member }))
  let inviteSequence = 0
  let copySequence = 0

  return createStore<SettingsForm4PreviewStoreState>((set, get) => ({
    members,
    roleOptions,
    seatsUsed: seed.seatsUsed,
    seatsTotal: seed.seatsTotal,
    inviteEmail: '',
    inviteRoleId: seed.initialInviteRoleId,
    openMenuMemberId: null,
    copyPendingMemberId: null,
    notice: null,
    setInviteEmail: (value) => {
      let changed = false
      set((state) => {
        if (state.inviteEmail === value) return state
        changed = true
        return { inviteEmail: value, notice: null }
      })
      return changed
    },
    setInviteRole: (roleId) => {
      if (!roleIds.has(roleId)) return false
      let changed = false
      set((state) => {
        if (state.inviteRoleId === roleId) return state
        changed = true
        return { inviteRoleId: roleId, notice: null }
      })
      return changed
    },
    changeMemberRole: (memberId, roleId) => {
      if (!roleIds.has(roleId)) return false
      let changed = false
      set((state) => {
        const member = state.members.find((candidate) => candidate.id === memberId)
        if (!member || member.roleId === 'owner' || member.roleId === roleId) return state
        changed = true
        return {
          members: state.members.map((candidate) =>
            candidate.id === memberId ? { ...candidate, roleId } : candidate,
          ),
        }
      })
      if (changed) handlers.onRoleChange(memberId, roleId)
      return changed
    },
    toggleMemberMenu: (memberId) => {
      let changed = false
      set((state) => {
        if (!state.members.some((member) => member.id === memberId)) return state
        changed = true
        return { openMenuMemberId: state.openMenuMemberId === memberId ? null : memberId, notice: null }
      })
      return changed
    },
    closeMemberMenu: () => {
      let changed = false
      set((state) => {
        if (state.openMenuMemberId === null) return state
        changed = true
        return { openMenuMemberId: null }
      })
      return changed
    },
    submitInvitePreview: () => {
      const current = get()
      const email = current.inviteEmail.trim()
      if (!email || !roleIds.has(current.inviteRoleId)) return false
      const name = displayNameFromEmail(email)
      if (!name) return false
      const memberId = `preview-invite-${++inviteSequence}`
      const invitee: SettingsForm4PreviewMember = {
        id: memberId,
        initials: initialsFromName(name),
        name,
        email,
        status: 'invited',
        roleId: current.inviteRoleId,
        emailPresentation: 'invitation-sent',
      }
      set((state) => ({
        members: [...state.members, invitee],
        inviteEmail: '',
        openMenuMemberId: null,
        notice: { kind: 'invitation-sent', memberId },
      }))
      handlers.onInvitePreviewRequested({ memberId, email, roleId: current.inviteRoleId })
      return true
    },
    copyMemberEmail: async (memberId) => {
      const member = get().members.find((candidate) => candidate.id === memberId)
      if (!member || get().copyPendingMemberId !== null) return false
      const requestId = ++copySequence
      set({ openMenuMemberId: null, notice: null, copyPendingMemberId: memberId })
      try {
        await handlers.onCopyEmailRequested(memberId, member.email)
        set((state) =>
          copySequence === requestId
            ? {
                copyPendingMemberId: null,
                notice: { kind: 'email-copied', memberId },
              }
            : state,
        )
        return true
      } catch {
        set((state) =>
          copySequence === requestId
            ? {
                copyPendingMemberId: null,
                notice: { kind: 'copy-failed', memberId },
              }
            : state,
        )
        return false
      }
    },
    requestRemoveMember: (memberId) => {
      const member = get().members.find((candidate) => candidate.id === memberId)
      if (!member || member.roleId === 'owner') return false
      set({ openMenuMemberId: null, notice: null })
      handlers.onRemoveRequested(memberId)
      return true
    },
    clearNotice: () => {
      let changed = false
      set((state) => {
        if (state.notice === null) return state
        changed = true
        return { notice: null }
      })
      return changed
    },
  }))
}
