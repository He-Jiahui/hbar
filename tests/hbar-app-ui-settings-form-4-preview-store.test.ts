import { describe, expect, test } from 'bun:test'
import { createSettingsForm4PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm4PreviewFixtures'
import {
  createSettingsForm4PreviewStore,
  type SettingsForm4PreviewHandlers,
} from '../apps/hbar-app-ui-preview/src/settingsForm4PreviewStore'

function previewHandlers(overrides: Partial<SettingsForm4PreviewHandlers> = {}): SettingsForm4PreviewHandlers {
  return {
    onRoleChange: () => undefined,
    onInvitePreviewRequested: () => undefined,
    onCopyEmailRequested: async () => undefined,
    onRemoveRequested: () => undefined,
    ...overrides,
  }
}

describe('Settings Form 4 preview store', () => {
  test('starts from the six captured members with a read-only owner and 6-of-10 seat summary', () => {
    const fixture = createSettingsForm4PreviewFixture()
    const store = createSettingsForm4PreviewStore(fixture.storeSeed, previewHandlers())
    const content = fixture.contentFor(store.getState())

    expect(content.members.map((member) => member.name)).toEqual([
      'Mara Whitfield',
      'Devan Rao',
      'Priyanka Balasubramanian',
      'Tom Ek',
      'Jules Moreau',
      'Sofia Castellano',
    ])
    expect(content.members.map((member) => member.roleId)).toEqual([
      'owner',
      'admin',
      'member',
      'viewer',
      'member',
      'billing',
    ])
    expect(content.members[0]).toMatchObject({
      owner: true,
      roleLabel: 'Owner',
      roleOptions: [],
      canRequestRemoval: false,
    })
    expect(content.members.slice(1).every((member) => member.roleOptions.length === 4)).toBe(true)
    expect(content.members.map((member) => member.roleAccessibleName)).toEqual([
      'Role for Mara Whitfield',
      'Role for Devan Rao',
      'Role for Priyanka Balasubramanian',
      'Role for Tom Ek',
      'Role for Jules Moreau',
      'Role for Sofia Castellano',
    ])
    expect(content.inviteRoleId).toBe('member')
    expect(content.seatSummary).toBe('6 of 10 seats used')
    expect(content.seatProgress).toBe(60)
    expect(content.listStrategy.kind).toBe('pane-scroll')
  })

  test('changes only the addressed member role and rejects owner or stale IDs', () => {
    const fixture = createSettingsForm4PreviewFixture()
    const roleEvents: { memberId: string; roleId: string }[] = []
    const store = createSettingsForm4PreviewStore(
      fixture.storeSeed,
      previewHandlers({
        onRoleChange: (memberId, roleId) => roleEvents.push({ memberId, roleId }),
      }),
    )

    expect(store.getState().changeMemberRole('devan', 'billing')).toBe(true)
    expect(store.getState().members.find((member) => member.id === 'devan')?.roleId).toBe('billing')
    expect(store.getState().members.find((member) => member.id === 'priyanka')?.roleId).toBe('member')
    expect(store.getState().changeMemberRole('mara', 'admin')).toBe(false)
    expect(store.getState().changeMemberRole('missing-member', 'admin')).toBe(false)
    expect(store.getState().changeMemberRole('devan', 'billing')).toBe(false)
    expect(roleEvents).toEqual([{ memberId: 'devan', roleId: 'billing' }])
    expect(fixture.contentFor(store.getState()).members[1]?.roleLabel).toBe('Billing')
  })

  test('gives owners copy-only menus and forwards a remove request without deleting a member', () => {
    const fixture = createSettingsForm4PreviewFixture()
    const removeEvents: string[] = []
    const store = createSettingsForm4PreviewStore(
      fixture.storeSeed,
      previewHandlers({ onRemoveRequested: (memberId) => removeEvents.push(memberId) }),
    )
    const originalIds = store.getState().members.map((member) => member.id)

    expect(store.getState().toggleMemberMenu('mara')).toBe(true)
    expect(fixture.contentFor(store.getState()).members[0]).toMatchObject({
      menuOpen: true,
      canRequestRemoval: false,
    })
    expect(store.getState().requestRemoveMember('mara')).toBe(false)

    expect(store.getState().toggleMemberMenu('devan')).toBe(true)
    expect(fixture.contentFor(store.getState()).members[1]).toMatchObject({
      menuOpen: true,
      canRequestRemoval: true,
    })
    expect(store.getState().requestRemoveMember('devan')).toBe(true)
    expect(removeEvents).toEqual(['devan'])
    expect(store.getState().members.map((member) => member.id)).toEqual(originalIds)
    expect(store.getState().openMenuMemberId).toBeNull()
  })

  test('copies only after host clipboard resolution and exposes localized feedback', async () => {
    const fixture = createSettingsForm4PreviewFixture()
    const clipboardEvents: { memberId: string; email: string }[] = []
    const store = createSettingsForm4PreviewStore(
      fixture.storeSeed,
      previewHandlers({
        onCopyEmailRequested: async (memberId, email) => {
          clipboardEvents.push({ memberId, email })
        },
      }),
    )
    store.getState().toggleMemberMenu('devan')

    expect(await store.getState().copyMemberEmail('devan')).toBe(true)
    expect(clipboardEvents).toEqual([{ memberId: 'devan', email: 'devan@northwind.co' }])
    expect(store.getState().openMenuMemberId).toBeNull()
    expect(store.getState().copyPendingMemberId).toBeNull()
    expect(fixture.contentFor(store.getState())).toMatchObject({
      footerMessage: 'Email address copied',
      seatSummary: undefined,
    })
  })

  test('reports clipboard failure without claiming a successful copy', async () => {
    const fixture = createSettingsForm4PreviewFixture()
    const store = createSettingsForm4PreviewStore(
      fixture.storeSeed,
      previewHandlers({
        onCopyEmailRequested: async () => {
          throw new Error('clipboard denied')
        },
      }),
    )

    expect(await store.getState().copyMemberEmail('devan')).toBe(false)
    expect(store.getState().notice).toEqual({ kind: 'copy-failed', memberId: 'devan' })
    expect(fixture.contentFor(store.getState()).footerMessage).toBe('Could not copy the email address.')
    expect(store.getState().copyPendingMemberId).toBeNull()
  })

  test('keeps invitation state host-owned and marks the result as a local preview only', () => {
    const fixture = createSettingsForm4PreviewFixture()
    const inviteEvents: { memberId: string; email: string; roleId: string }[] = []
    const store = createSettingsForm4PreviewStore(
      fixture.storeSeed,
      previewHandlers({
        onInvitePreviewRequested: (event) => inviteEvents.push(event),
      }),
    )

    expect(store.getState().submitInvitePreview()).toBe(false)
    expect(store.getState().setInviteEmail('f4-probe@example.invalid')).toBe(true)
    expect(store.getState().setInviteRole('viewer')).toBe(true)
    expect(store.getState().submitInvitePreview()).toBe(true)
    const state = store.getState()
    const invite = state.members.at(-1)

    expect(invite).toMatchObject({
      id: 'preview-invite-1',
      initials: 'FP',
      name: 'F4 Probe',
      email: 'f4-probe@example.invalid',
      emailPresentation: 'invitation-sent',
      status: 'invited',
      roleId: 'viewer',
    })
    expect(inviteEvents).toEqual([
      { memberId: 'preview-invite-1', email: 'f4-probe@example.invalid', roleId: 'viewer' },
    ])
    expect(state.inviteEmail).toBe('')
    expect(state.inviteRoleId).toBe('viewer')
    expect(state.seatsUsed).toBe(6)
    const content = fixture.contentFor(state)
    expect(content.footerMessage).toBe('Invitation sent')
    expect(content.seatSummary).toBeUndefined()
    expect(content.members).toHaveLength(7)
    expect(content.members.at(-1)).toMatchObject({
      name: 'F4 Probe',
      emailDetail: 'Invitation sent',
      roleLabel: 'Viewer',
    })
  })

  test('preserves empty and one-member inputs and keeps long localized copy in the host fixture', () => {
    const english = createSettingsForm4PreviewFixture('en')
    const german = createSettingsForm4PreviewFixture('de')
    const emptySeed = { ...english.storeSeed, members: [] }
    const oneMemberSeed = { ...english.storeSeed, members: english.storeSeed.members.slice(0, 1) }
    const emptyStore = createSettingsForm4PreviewStore(emptySeed, previewHandlers())
    const oneMemberStore = createSettingsForm4PreviewStore(oneMemberSeed, previewHandlers())

    expect(english.contentFor(createSettingsForm4PreviewStore(english.storeSeed, previewHandlers()).getState()).members)
      .toHaveLength(6)
    expect(english.contentFor(emptyStore.getState()).members).toHaveLength(0)
    expect(english.contentFor(emptyStore.getState()).labels.emptyMembers).toBe('No members yet.')
    expect(english.contentFor(oneMemberStore.getState()).members).toHaveLength(1)
    expect(german.labels.pageTitle).toBe('Mitglieder')
    expect(german.labels.panelDescription.length).toBeGreaterThan(english.labels.panelDescription.length)
    expect(german.labels.actionsFor('Devan Rao')).toBe('Aktionen für Devan Rao')
    expect(german.contentFor(createSettingsForm4PreviewStore(german.storeSeed, previewHandlers()).getState()).seatSummary)
      .toBe('6 von 10 Plätzen belegt')
  })

  test('deduplicates stale seed IDs and still addresses the original member after invitation appends', () => {
    const fixture = createSettingsForm4PreviewFixture()
    const duplicateMember = fixture.storeSeed.members.find((member) => member.id === 'devan')
    if (!duplicateMember) throw new Error('The source fixture should include Devan Rao.')
    const duplicateSeed = {
      ...fixture.storeSeed,
      members: [...fixture.storeSeed.members, duplicateMember],
    }
    const store = createSettingsForm4PreviewStore(duplicateSeed, previewHandlers())

    expect(store.getState().members.filter((member) => member.id === 'devan')).toHaveLength(1)
    store.getState().setInviteEmail('new.member@example.invalid')
    expect(store.getState().submitInvitePreview()).toBe(true)
    expect(store.getState().changeMemberRole('devan', 'billing')).toBe(true)
    expect(store.getState().members.find((member) => member.id === 'devan')?.roleId).toBe('billing')
    expect(store.getState().members.at(-1)?.name).toBe('New Member')
  })
})
