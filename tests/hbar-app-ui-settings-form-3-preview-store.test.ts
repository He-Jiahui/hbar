import { describe, expect, test } from 'bun:test'
import { createSettingsForm3PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm3PreviewFixtures'
import {
  createSettingsForm3PreviewStore,
  isSettingsForm3PreferenceChange,
} from '../apps/hbar-app-ui-preview/src/settingsForm3PreviewStore'

describe('Settings Form 3 preview fixture', () => {
  test('projects source copy, ordered finite options, and the initial saved/draft difference', () => {
    const fixture = createSettingsForm3PreviewFixture()
    const store = createSettingsForm3PreviewStore(fixture.storeSeed)
    const state = store.getState()

    expect(fixture.content.pageTitle).toBe('Preferences')
    expect(fixture.content.panelTitle).toBe('Workspace preferences')
    expect(fixture.content.fields.theme.options.map((option) => option.id)).toEqual(['system', 'light', 'dark'])
    expect(fixture.content.fields.density.options.map((option) => option.id)).toEqual([
      'comfortable',
      'cozy',
      'compact',
    ])
    expect(fixture.content.fields.language.options.map((option) => option.id)).toEqual(['en', 'de', 'fr', 'ja'])
    expect(state.draft).toEqual({
      theme: 'dark',
      density: 'cozy',
      language: 'en',
      weeklySummary: true,
      mentions: true,
      commentReplies: true,
      notificationSounds: false,
    })
    expect(state.saved).toEqual({
      theme: 'system',
      density: 'cozy',
      language: 'en',
      weeklySummary: true,
      mentions: true,
      commentReplies: false,
      notificationSounds: false,
    })
    expect(state.changedPreferenceIds).toEqual(['theme', 'commentReplies'])
    expect(fixture.content.fields.theme.changed).toBe(true)
    expect(fixture.content.fields.commentReplies.changed).toBe(true)
    expect(fixture.content.footer.status).toBe('Unsaved preferences')
    expect(fixture.content.footer.cancelDisabled).toBe(false)
    expect(fixture.content.footer.saveDisabled).toBe(false)
  })

  test('updates radio, select, switches, and checkbox while rejecting invalid option IDs', () => {
    const fixture = createSettingsForm3PreviewFixture()
    const store = createSettingsForm3PreviewStore(fixture.storeSeed)
    const { changePreference } = store.getState()

    expect(isSettingsForm3PreferenceChange({ fieldId: 'density', value: 'compact' })).toBe(true)
    expect(isSettingsForm3PreferenceChange({ fieldId: 'density', value: 'spacious' })).toBe(false)
    expect(isSettingsForm3PreferenceChange({ fieldId: 'unknown', value: true })).toBe(false)
    expect(changePreference({ fieldId: 'theme', value: 'system' })).toBe(true)
    expect(changePreference({ fieldId: 'density', value: 'compact' })).toBe(true)
    expect(changePreference({ fieldId: 'language', value: 'de' })).toBe(true)
    expect(changePreference({ fieldId: 'weeklySummary', value: false })).toBe(true)
    expect(changePreference({ fieldId: 'mentions', value: false })).toBe(true)
    expect(changePreference({ fieldId: 'notificationSounds', value: true })).toBe(true)

    const state = store.getState()
    expect(state.draft).toEqual({
      theme: 'system',
      density: 'compact',
      language: 'de',
      weeklySummary: false,
      mentions: false,
      commentReplies: true,
      notificationSounds: true,
    })
    expect(state.status).toBe('unsaved')
    expect(state.changedPreferenceIds).toEqual([
      'density',
      'language',
      'weeklySummary',
      'mentions',
      'commentReplies',
      'notificationSounds',
    ])
    expect(fixture.contentFor(state).fields.notificationSounds.changed).toBe(false)
  })

  test('Cancel restores the source saved baseline and clears the draft state', () => {
    const fixture = createSettingsForm3PreviewFixture()
    const store = createSettingsForm3PreviewStore(fixture.storeSeed)
    expect(store.getState().cancel()).toBe(true)

    const state = store.getState()
    const content = fixture.contentFor(state)
    expect(state.draft).toEqual(state.saved)
    expect(state.draft.theme).toBe('system')
    expect(state.draft.commentReplies).toBe(false)
    expect(state.changedPreferenceIds).toEqual([])
    expect(state.status).toBe('saved')
    expect(content.footer.status).toBe('Preferences saved')
    expect(content.fields.theme.changed).toBe(false)
    expect(content.fields.commentReplies.changed).toBe(false)
    expect(content.footer.cancelDisabled).toBe(true)
    expect(content.footer.saveDisabled).toBe(true)
    expect(state.cancel()).toBe(false)
  })

  test('Save disables draft actions until resolve, then promotes the draft to saved values', () => {
    const fixture = createSettingsForm3PreviewFixture()
    const store = createSettingsForm3PreviewStore(fixture.storeSeed)
    const state = store.getState()

    expect(state.changePreference({ fieldId: 'theme', value: 'light' })).toBe(true)
    expect(state.beginSave()).toBe(true)
    expect(store.getState().status).toBe('unsaved')
    expect(fixture.contentFor(store.getState()).footer.status).toBe('Unsaved preferences')
    expect(fixture.contentFor(store.getState()).footer.saveButtonLabel).toBe('Saving')
    expect(fixture.contentFor(store.getState()).footer.cancelDisabled).toBe(true)
    expect(fixture.contentFor(store.getState()).footer.saveDisabled).toBe(true)
    expect(store.getState().beginSave()).toBe(false)
    expect(store.getState().resolveSave()).toBe(true)

    const saved = store.getState()
    expect(saved.saved).toEqual(saved.draft)
    expect(saved.changedPreferenceIds).toEqual([])
    expect(saved.status).toBe('saved')
    expect(fixture.contentFor(saved).footer.status).toBe('Preferences saved')
    expect(saved.beginSave()).toBe(false)
    expect(saved.cancel()).toBe(false)
  })

  test('an edit during pending save returns to dirty and makes the stale completion a no-op', () => {
    const fixture = createSettingsForm3PreviewFixture()
    const store = createSettingsForm3PreviewStore(fixture.storeSeed)

    expect(store.getState().beginSave()).toBe(true)
    expect(store.getState().changePreference({ fieldId: 'mentions', value: false })).toBe(true)

    const edited = store.getState()
    const pendingContent = fixture.contentFor(edited)
    expect(edited.draft.mentions).toBe(false)
    expect(edited.saveState).toBe('dirty')
    expect(edited.status).toBe('unsaved')
    expect(pendingContent.footer.status).toBe('Unsaved preferences')
    expect(pendingContent.footer.saveButtonLabel).toBe('Save changes')
    expect(pendingContent.footer.cancelDisabled).toBe(false)
    expect(pendingContent.footer.saveDisabled).toBe(false)
    expect(edited.resolveSave()).toBe(false)

    const current = store.getState()
    expect(current.draft.mentions).toBe(false)
    expect(current.saved.mentions).toBe(true)
    expect(current.changedPreferenceIds).toEqual(['theme', 'mentions', 'commentReplies'])
  })

  test('localizes copy and keeps long translations in host-supplied data', () => {
    const english = createSettingsForm3PreviewFixture('en').content
    const german = createSettingsForm3PreviewFixture('de').content

    expect(english.pageTitle).toBe('Preferences')
    expect(german.pageTitle).toBe('Einstellungen')
    expect(german.fields.commentReplies.label).toBe('Antworten auf Kommentare')
    expect(german.fields.weeklySummary.description.length).toBeGreaterThan(
      english.fields.weeklySummary.description.length,
    )
    expect(german.footer.cancelLabel).toBe('Abbrechen')
  })
})
