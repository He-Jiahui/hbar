import { describe, expect, test } from 'bun:test'
import {
  createOnboarding5PreviewFixture,
  ONBOARDING5_SOURCE_EVIDENCE,
} from '../apps/hbar-app-ui-preview/src/onboarding5PreviewFixtures'
import { createOnboarding5PreviewStore } from '../apps/hbar-app-ui-preview/src/onboarding5PreviewStore'

describe('Onboarding 5 preview store', () => {
  test('projects the source-shaped two stable rows, three roles, and source boundary', () => {
    const fixture = createOnboarding5PreviewFixture()
    const store = createOnboarding5PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.labels.title).toBe('Invite your team')
    expect(content.labels.detail).toBe('Invitations stay open for 14 days. Anyone you add can be removed later.')
    expect(content.invitationRows).toEqual([
      { id: 'invite-priya', email: 'priya@northwind.co', roleId: 'admin' },
      { id: 'invite-empty', email: '', roleId: 'member' },
    ])
    expect(content.roleOptions).toEqual([
      { id: 'member', label: 'Member' },
      { id: 'admin', label: 'Admin' },
      { id: 'viewer', label: 'Viewer' },
    ])
    expect(content.shareLink).toBe('northwind.app/join/9f2c-41ab')
    expect(content.collectionContract).toEqual({
      initialRowCount: 2,
      sourceMaximumRowCount: 'not-observed',
      rowStrategy: 'host-seeded-without-arbitrary-local-cap',
      emptyRowsEvidence: 'host-fallback-not-source-captured',
      sourceStressHorizontalOverflow: false,
      sourceStressTextTruncationCount: 4,
      sourceScrollOwner: 'not-captured',
    })
  })

  test('keeps email edits local and preserves empty or long input without inventing a limit', () => {
    const fixture = createOnboarding5PreviewFixture()
    const store = createOnboarding5PreviewStore(fixture.seed)
    const longText = 'audit-sample-'.repeat(256)

    expect(store.getState().setEmail('invite-priya', 'audit sample')).toBe(true)
    expect(store.getState().setEmail('invite-empty', longText)).toBe(true)
    expect(store.getState().invitationRows).toEqual([
      { id: 'invite-priya', email: 'audit sample', roleId: 'admin' },
      { id: 'invite-empty', email: longText, roleId: 'member' },
    ])
    expect(store.getState().setEmail('invite-empty', '')).toBe(true)
    expect(store.getState().invitationRows[1]?.email).toBe('')
    expect(store.getState().setEmail('stale-row', 'ignored@example.test')).toBe(false)
  })

  test('changes the selected role on only the requested stable row', () => {
    const fixture = createOnboarding5PreviewFixture()
    const store = createOnboarding5PreviewStore(fixture.seed)

    expect(store.getState().selectRole('invite-priya', 'member')).toBe(true)
    expect(store.getState().selectRole('invite-empty', 'viewer')).toBe(true)
    expect(store.getState().invitationRows.map((row) => row.roleId)).toEqual(['member', 'viewer'])
    expect(store.getState().selectRole('invite-priya', 'member')).toBe(false)
    expect(store.getState().selectRole('invite-priya', 'owner')).toBe(false)
    expect(store.getState().selectRole('stale-row', 'admin')).toBe(false)
  })

  test('records the cached comparator discrepancy without suppressing the observed snapshot changes', () => {
    const evidence = ONBOARDING5_SOURCE_EVIDENCE.sameHashInteractionCache.verifiedSnapshots

    expect(evidence.emailFill).toEqual({
      before: 'priya@northwind.co',
      after: 'audit sample',
      axValueChanged: true,
      comparatorSourceChanged: false,
      comparatorStatus: 'lumen-different',
    })
    expect(evidence.firstRoleSelection).toEqual({
      before: 'admin',
      after: 'member',
      axSelectedOptionChanged: true,
      comparatorSourceChanged: false,
      comparatorStatus: 'lumen-different',
    })
    expect(evidence.copyVisibleLabel).toMatchObject({
      before: 'Copy',
      afterClick: 'Copy',
      afterEnter: 'Copy',
      afterSpace: 'Copy',
      visibleChange: false,
    })
  })

  test('keeps Copy visible and all unverified actions as typed requests without local success', () => {
    const fixture = createOnboarding5PreviewFixture()
    const store = createOnboarding5PreviewStore(fixture.seed)
    const originalRows = store.getState().invitationRows

    expect(fixture.contentFor(store.getState()).labels.copyLink).toBe('Copy')
    expect(store.getState().requestCopyLink()).toEqual({
      kind: 'copy-link-request',
      shareLink: 'northwind.app/join/9f2c-41ab',
      resultBehavior: 'clipboard-write-unverified',
    })
    expect(store.getState().requestAddInvitation()).toEqual({
      kind: 'add-invitation-request',
      resultBehavior: 'row-addition-unverified',
    })
    expect(store.getState().requestRemoveInvitation('invite-priya')).toEqual({
      kind: 'remove-invitation-request',
      invitationId: 'invite-priya',
      resultBehavior: 'row-removal-unverified',
    })
    expect(store.getState().requestRemoveInvitation('stale-row')).toBeNull()
    expect(store.getState().requestSkip()).toEqual({
      kind: 'skip-request',
      resultBehavior: 'navigation-unverified',
    })
    expect(store.getState().requestSendInvitations()).toEqual({
      kind: 'send-invitations-request',
      invitationRows: [
        { id: 'invite-priya', email: 'priya@northwind.co', roleId: 'admin' },
        { id: 'invite-empty', email: '', roleId: 'member' },
      ],
      resultBehavior: 'remote-send-unverified',
    })
    expect(store.getState().invitationRows).toEqual(originalRows)
    expect(fixture.contentFor(store.getState()).labels.copyLink).toBe('Copy')
  })

  test('drops blank and duplicate row identifiers without imposing a row-count cap', () => {
    const fixture = createOnboarding5PreviewFixture()
    const store = createOnboarding5PreviewStore({
      ...fixture.seed,
      invitationRows: [
        ...fixture.seed.invitationRows,
        { id: '', email: 'blank-id@example.test', roleId: 'member' },
        { id: 'invite-priya', email: 'duplicate@example.test', roleId: 'viewer' },
      ],
    })

    expect(store.getState().invitationRows).toEqual([
      { id: 'invite-priya', email: 'priya@northwind.co', roleId: 'admin' },
      { id: 'invite-empty', email: '', roleId: 'member' },
    ])
    expect(ONBOARDING5_SOURCE_EVIDENCE.staticCache.maximumRowCount).toBe('not-observed')
  })

  test('keeps the empty-list copy explicit and provides localized host labels', () => {
    const fixture = createOnboarding5PreviewFixture('de')
    const emptyStore = createOnboarding5PreviewStore({ ...fixture.seed, invitationRows: [] })
    const germanContent = fixture.contentFor(emptyStore.getState())

    expect(germanContent.locale).toBe('de')
    expect(germanContent.invitationRows).toEqual([])
    expect(germanContent.labels.emptyRows).toBe('Keine Einladungszeilen verfügbar.')
    expect(germanContent.labels.title).toBe('Team einladen')
    expect(germanContent.roleOptions[0]?.label).toBe('Mitglied')

    const longFixture = createOnboarding5PreviewFixture('de-long')
    const longContent = longFixture.contentFor(createOnboarding5PreviewStore(longFixture.seed).getState())
    expect(longContent.labels.title.length).toBeGreaterThan(70)
    expect(longContent.labels.addAnother.length).toBeGreaterThan(40)
    expect(longContent.roleOptions[0]?.label.length).toBeGreaterThan(20)
  })
})
