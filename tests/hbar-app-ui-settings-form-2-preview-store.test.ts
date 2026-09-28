import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenSettingsForm02, LumenSettingsFormProvider, type LumenSettingsForm2ViewModel } from '@lumen/app-ui'
import { SettingsForm2PreviewHost } from '../apps/hbar-app-ui-preview/src/SettingsForm2PreviewHost'
import {
  createSettingsForm2PreviewFixture,
  type SettingsForm2PreviewLocale,
} from '../apps/hbar-app-ui-preview/src/settingsForm2PreviewFixtures'
import {
  createSettingsForm2PreviewStore,
  type SettingsForm2PreviewHandlers,
  type SettingsForm2PreviewValues,
} from '../apps/hbar-app-ui-preview/src/settingsForm2PreviewStore'
import { HBAR_APP_UI_SETTINGS_FORM_FIXTURES } from './fixtures/hbar-app-ui-settings-form-fixtures'

function createHarness(locale: SettingsForm2PreviewLocale = 'en') {
  const fixture = createSettingsForm2PreviewFixture(locale)
  const saveRequests: SettingsForm2PreviewValues[] = []
  const photoFiles: File[] = []
  let cancelCount = 0
  const handlers: SettingsForm2PreviewHandlers = {
    onSaveRequested: (values) => saveRequests.push(values),
    onPhotoSelected: (file) => photoFiles.push(file),
    onCancel: () => {
      cancelCount += 1
    },
  }
  const store = createSettingsForm2PreviewStore(fixture.storeSeed, handlers)
  return {
    fixture,
    store,
    saveRequests,
    photoFiles,
    cancelCount: () => cancelCount,
  }
}

describe('Settings Form 2 preview host state', () => {
  test('routes the host-owned view model through the registered Lumen variant without an extra form role', () => {
    const fixture = createSettingsForm2PreviewFixture()
    const markup = renderToStaticMarkup(
      createElement(SettingsForm2PreviewHost, {
        content: HBAR_APP_UI_SETTINGS_FORM_FIXTURES,
        spec: { id: 'hbar-app-ui-settings-form-2' },
        referenceFixture: fixture,
        children: createElement(LumenSettingsForm02),
      }),
    )

    expect(markup).toContain('data-hbar-app-ui-component="hbar-app-ui-settings-form-2"')
    expect(markup).toContain('>Username</label>')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain('mara is taken. Try another handle.')
    expect(markup).toContain('80 of 160 characters')
    expect(markup).toContain('accept="image/png,image/jpeg,image/gif"')
    expect(markup).toContain('Save profile')
    expect(markup).not.toContain('<form')
    expect(markup).not.toContain('role="form"')
  })

  test('starts from the captured profile with taken username and disabled save', () => {
    const { fixture, store } = createHarness()
    const content = fixture.contentFor(store.getState())

    expect(fixture.locale).toBe('en')
    expect(content.pageTitle).toBe('Public profile')
    expect(content.accountTitle).toBe('Account')
    expect(content.fields.username).toMatchObject({
      value: 'mara',
      prefix: 'northwind.co/',
      error: 'mara is taken. Try another handle.',
      changed: true,
    })
    expect(content.fields.bio.value.length).toBe(80)
    expect(content.fields.bio.maximumCharacters).toBe(160)
    expect(content.countCharacters(content.fields.bio.value.length, 160)).toBe('80 of 160 characters')
    expect(content.saveDisabled).toBe(true)
    expect(store.getState().validation).toEqual({ username: 'taken', bioCharactersOverLimit: 0 })
  })

  test('replaces the Bio count with the source alert in the over-limit state', () => {
    const fixture = createSettingsForm2PreviewFixture()
    const store = createSettingsForm2PreviewStore(fixture.storeSeed, {
      onSaveRequested() {},
      onPhotoSelected() {},
      onCancel() {},
    })
    store.getState().changeField('bio', 'b'.repeat(161))
    const viewModel: LumenSettingsForm2ViewModel = {
      content: fixture.contentFor(store.getState()),
      onFieldChange() {},
      onPhotoSelected() {},
      onCancel() {},
      onSave() {},
    }
    const markup = renderToStaticMarkup(
      createElement(LumenSettingsFormProvider, {
        content: { profileReference: viewModel },
        children: createElement(LumenSettingsForm02),
      }),
    )

    expect(markup).toContain('Remove 1 characters to fit the limit.')
    expect(markup).toContain(
      'aria-describedby="hbar-app-ui-settings-form-2-bio-error hbar-app-ui-settings-form-2-bio-hint"',
    )
    expect(markup).not.toContain('161 of 160 characters')
    expect(markup).not.toContain('hbar-app-ui-settings-form-2-bio-count')
  })

  test('keeps the 160 character Bio boundary and reports overage without truncating', () => {
    const { fixture, store } = createHarness()
    const atLimit = 'b'.repeat(160)
    const overLimit = 'b'.repeat(161)

    expect(store.getState().changeField('username', 'mara-preview')).toBe(true)
    expect(store.getState().changeField('bio', atLimit)).toBe(true)
    let content = fixture.contentFor(store.getState())
    expect(content.fields.bio.value).toHaveLength(160)
    expect(content.fields.bio.error).toBeUndefined()
    expect(content.countCharacters(160, 160)).toBe('160 of 160 characters')
    expect(content.saveDisabled).toBe(false)

    expect(store.getState().changeField('bio', overLimit)).toBe(true)
    content = fixture.contentFor(store.getState())
    expect(content.fields.bio.value).toHaveLength(161)
    expect(content.fields.bio.error).toBe('Remove 1 characters to fit the limit.')
    expect(content.fields.bio.changed).toBe(true)
    expect(content.countCharacters(161, 160)).toBe('161 of 160 characters')
    expect(store.getState().validation.bioCharactersOverLimit).toBe(1)
    expect(store.getState().values.username).toBe('mara-preview')
    expect(content.saveDisabled).toBe(true)
  })

  test('valid username enables callback-only save without claiming remote success', () => {
    const { store, saveRequests } = createHarness()

    expect(store.getState().requestSave()).toBe(false)
    expect(saveRequests).toHaveLength(0)
    expect(store.getState().changeField('username', 'mara-preview')).toBe(true)
    expect(store.getState().validation.username).toBe('available')
    expect(store.getState().saveDisabled).toBe(false)
    expect(store.getState().requestSave()).toBe(true)
    expect(saveRequests).toHaveLength(1)
    expect(saveRequests[0]?.username).toBe('mara-preview')
    expect(store.getState().saveDisabled).toBe(false)
  })

  test('Cancel restores the initial draft and its source validation state', () => {
    const { fixture, store, cancelCount } = createHarness()
    const initialValues = store.getState().initialValues

    store.getState().changeField('fullName', 'Changed locally')
    store.getState().changeField('username', 'mara-preview')
    store.getState().changeField('bio', 'Draft text')
    expect(store.getState().validation.username).toBe('available')

    expect(store.getState().cancel()).toBe(true)
    expect(cancelCount()).toBe(1)
    expect(store.getState().values).toEqual(initialValues)
    expect(store.getState().validation).toEqual({ username: 'taken', bioCharactersOverLimit: 0 })
    expect(fixture.contentFor(store.getState()).fields.username.error).toBe('mara is taken. Try another handle.')
    expect(fixture.contentFor(store.getState()).fields.bio.changed).toBeUndefined()
    expect(store.getState().saveDisabled).toBe(true)
  })

  test('forwards selected photos to the host without simulating an upload result', () => {
    const { store, photoFiles } = createHarness()
    const file = new File(['profile-image'], 'profile.png', { type: 'image/png' })

    store.getState().selectPhoto(file)

    expect(photoFiles).toEqual([file])
    expect(store.getState().values).toEqual(store.getState().initialValues)
    expect('photoUrl' in store.getState()).toBe(false)
  })

  test('projects all profile copy through the non-default locale', () => {
    const { fixture, store } = createHarness('de')
    const content = fixture.contentFor(store.getState())

    expect(content.pageTitle).toBe('Öffentliches Profil')
    expect(content.accountTitle).toBe('Konto')
    expect(content.fields.fullName.label).toBe('Vollständiger Name')
    expect(content.fields.email.label).toBe('E-Mail')
    expect(content.cancelLabel).toBe('Abbrechen')
    expect(content.saveLabel).toBe('Profil speichern')
    expect(content.countCharacters(80, 160)).toBe('80 von 160 Zeichen')
  })
})
