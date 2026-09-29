import { describe, expect, test } from 'bun:test'
import { createForms2PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms2PreviewFixtures'
import { createForms2PreviewStore } from '../apps/hbar-app-ui-preview/src/forms2PreviewStore'

function optionAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing test option at index ${index}.`)
  return item
}

describe('Forms 2 preview store', () => {
  test('projects the captured three-section session form and 0 of 4 readiness state', () => {
    const fixture = createForms2PreviewFixture()
    const store = createForms2PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Submit a session')
    expect(content.copy.pageDescription).toContain('close on 28 February')
    expect(content.sessionTitle.value).toBe('')
    expect(content.sessionTitle.placeholder).toBe('Calibrating low-cost sensors in the field')
    expect(content.abstract.remainingLabel).toBe('600 left')
    expect(content.format.selectedId).toBe('conference-talk')
    expect(content.track.selectedId).toBe('instrumentation')
    expect(content.audienceLevel.selectedId).toBe('intermediate')
    expect(content.roomRequirements.choices.map((choice) => choice.checked)).toEqual([true, false, false, false])
    expect(content.readiness.ready).toBe(0)
    expect(content.readiness.label).toBe('0 of 4 ready')
    expect(content.readiness.items.map((item) => item.label)).toEqual([
      'Session title',
      'Abstract',
      'Contact address',
      'Recording consent',
    ])
    expect(content.readiness.durationNote).toBe('Conference talk runs 30 minutes')
    expect(content.recordingConsent.checked).toBe(false)
    expect(content.attentionSummary).toBeNull()
    expect(content.requestStatus).toEqual({ kind: 'idle' })
    expect(content.listStrategy.kind).toBe('content-grown')
  })

  test('derives four readiness items from fields rather than room choices', () => {
    const fixture = createForms2PreviewFixture()
    const store = createForms2PreviewStore(fixture.storeSeed)

    expect(store.getState().setTextField('sessionTitle', 'Field sensors')).toBe(true)
    expect(store.getState().setTextField('abstract', 'A'.repeat(120))).toBe(true)
    expect(store.getState().setTextField('contactAddress', 'marta@example.org')).toBe(true)
    expect(fixture.contentFor(store.getState()).readiness).toMatchObject({ ready: 3, label: '3 of 4 ready' })
    expect(store.getState().setRoomRequirement('audio-playback', true)).toBe(true)
    expect(fixture.contentFor(store.getState()).readiness.ready).toBe(3)
    expect(store.getState().setRecordingConsent(true)).toBe(true)
    expect(fixture.contentFor(store.getState()).readiness).toMatchObject({ ready: 4, label: '4 of 4 ready' })
  })

  test('shows only source-observed validation after submit and clears corrected field errors', () => {
    const fixture = createForms2PreviewFixture()
    const store = createForms2PreviewStore(fixture.storeSeed)

    const attempt = store.getState().attemptSubmit()
    expect(attempt.kind).toBe('invalid')
    expect(fixture.contentFor(store.getState())).toMatchObject({
      sessionTitle: { error: 'Give the session a title of at least 8 characters.' },
      abstract: { error: 'Abstracts need at least 120 characters. You have 0.' },
      contactAddress: { error: 'Enter an address the programme committee can reply to.' },
      recordingConsent: { error: 'Recording consent is required to submit.' },
      attentionSummary: '4 items still need attention.',
    })

    store.getState().setTextField('sessionTitle', 'Calibrating field sensors')
    expect(fixture.contentFor(store.getState())).toMatchObject({
      sessionTitle: { error: null },
      readiness: { ready: 1, label: '1 of 4 ready' },
      attentionSummary: '3 items still need attention.',
    })
  })

  test('updates remaining characters and format duration in response to host drafts', () => {
    const fixture = createForms2PreviewFixture()
    const store = createForms2PreviewStore(fixture.storeSeed)

    store.getState().setTextField('abstract', 'A'.repeat(12))
    expect(fixture.contentFor(store.getState()).abstract.remainingLabel).toBe('588 left')
    expect(store.getState().selectFormat('hands-on-workshop')).toBe(true)
    expect(fixture.contentFor(store.getState()).readiness.durationNote).toBe('Hands-on workshop runs 90 minutes')
    expect(store.getState().selectFormat('lightning-slot')).toBe(true)
    expect(fixture.contentFor(store.getState()).readiness.durationNote).toBe('Lightning slot runs 10 minutes')
    expect(store.getState().selectTrack('field-robotics')).toBe(true)
    expect(store.getState().selectAudienceLevel('advanced')).toBe(true)
    expect(store.getState().selectTrack('stale-track')).toBe(false)
    expect(store.getState().selectAudienceLevel('stale-level')).toBe(false)
  })

  test('returns a typed request without inventing remote completion or success state', () => {
    const fixture = createForms2PreviewFixture()
    const store = createForms2PreviewStore(fixture.storeSeed)
    store.getState().setTextField('sessionTitle', 'Calibrating field sensors')
    store.getState().setTextField('abstract', 'A'.repeat(120))
    store.getState().setTextField('contactAddress', 'marta@example.org')
    store.getState().setRecordingConsent(true)

    const result = store.getState().attemptSubmit()
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') throw new Error('Expected an eligible preview callback request.')
    expect(result.draft).toEqual(store.getState().draft)
    expect(store.getState().requestStatus).toEqual({ kind: 'idle' })
    expect(fixture.contentFor(store.getState()).requestStatus).toEqual({ kind: 'idle' })
  })

  test('supports localized copy, bounded choice lists, and empty, one, baseline, and extended room lists', () => {
    const german = createForms2PreviewFixture('de')
    const longGermanTrack = optionAt(german.storeSeed.tracks, 2)
    expect(german.copy.pageTitle).toBe('Sitzung einreichen')
    expect(longGermanTrack.label).toBe('Signalverarbeitung')
    expect(german.copy.recordingConsentLabel.length).toBeGreaterThan(60)

    const emptySeed = {
      ...german.storeSeed,
      initialDraft: { ...german.storeSeed.initialDraft, roomRequirementIds: [] },
      roomRequirements: [],
    }
    const emptyContent = german.contentFor(createForms2PreviewStore(emptySeed).getState())
    expect(emptyContent.roomRequirements.choices).toEqual([])
    expect(emptyContent.listStrategy.kind).toBe('content-grown')

    const oneItem = optionAt(german.storeSeed.roomRequirements, 0)
    const oneSeed = {
      ...german.storeSeed,
      initialDraft: { ...german.storeSeed.initialDraft, roomRequirementIds: [oneItem.id] },
      roomRequirements: [oneItem],
    }
    expect(german.contentFor(createForms2PreviewStore(oneSeed).getState()).roomRequirements.choices).toHaveLength(1)
    expect(
      german.contentFor(createForms2PreviewStore(german.storeSeed).getState()).roomRequirements.choices,
    ).toHaveLength(4)

    const extraRequirement = {
      id: 'test-only-access-ramp',
      label: 'Test-only stage access ramp',
      initiallyChecked: false,
    }
    const extendedSeed = {
      ...german.storeSeed,
      roomRequirements: [...german.storeSeed.roomRequirements, extraRequirement],
    }
    expect(german.contentFor(createForms2PreviewStore(extendedSeed).getState()).roomRequirements.choices).toHaveLength(
      5,
    )
  })

  test('rejects duplicate, stale, and unchanged option or requirement actions', () => {
    const fixture = createForms2PreviewFixture()
    const store = createForms2PreviewStore(fixture.storeSeed)

    expect(store.getState().selectFormat('conference-talk')).toBe(false)
    expect(store.getState().setRoomRequirement('audio-playback', false)).toBe(false)
    expect(store.getState().setRoomRequirement('missing', true)).toBe(false)
    expect(store.getState().setRecordingConsent(false)).toBe(false)
    expect(() =>
      createForms2PreviewStore({
        ...fixture.storeSeed,
        tracks: [optionAt(fixture.storeSeed.tracks, 0), optionAt(fixture.storeSeed.tracks, 0)],
      }),
    ).toThrow('Track IDs must be unique.')
    expect(() =>
      createForms2PreviewStore({
        ...fixture.storeSeed,
        initialDraft: { ...fixture.storeSeed.initialDraft, roomRequirementIds: ['unknown'] },
      }),
    ).toThrow('Initial room requirements must reference available choices.')
  })
})
