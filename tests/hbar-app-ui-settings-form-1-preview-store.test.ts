import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'
import {
  LumenSettingsForm01,
  LumenSettingsFormProvider,
  type LumenSettingsForm1ViewModel,
} from '@lumen/app-ui'
import { createSettingsForm1ReferencePreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm1ReferenceFixtures'
import { createSettingsForm1PreviewStore } from '../apps/hbar-app-ui-preview/src/settingsForm1PreviewStore'

const fixture = createSettingsForm1ReferencePreviewFixture()

function renderIntegrated(sectionId = 'workspace', saveState: LumenSettingsForm1ViewModel['saveState'] = 'dirty') {
  const content = { ...fixture.content, selectedSectionId: sectionId }
  const viewModel: LumenSettingsForm1ViewModel = {
    content,
    saveState,
    onSelectSection() {},
    onFieldChange() {},
    onSave() {},
    onCancel() {},
  }
  return renderToStaticMarkup(
    createElement(LumenSettingsFormProvider, {
      content: { workspaceReference: viewModel },
      children: createElement(LumenSettingsForm01),
    }),
  )
}

function fieldsFor(sectionId: string) {
  const section = fixture.content.sections.find((item) => item.id === sectionId)
  return section?.groups.flatMap((group) => group.fields) ?? []
}

describe('Settings Form 1 preview fixture, route, and store', () => {
  test('provides all five source sections and the seven Workspace fields from host data', () => {
    expect(fixture.content.sections.map((section) => section.label)).toEqual([
      'Workspace',
      'Billing',
      'Notifications',
      'Security',
      'Advanced',
    ])
    expect(fixture.content.sections.every((section) => fieldsFor(section.id).length > 0)).toBe(true)
    expect(fieldsFor('workspace')).toHaveLength(7)
    expect(fixture.content.expectedMaximumFields).toBe(9)
    expect(fixture.content.sections.find((section) => section.id === 'workspace')?.description).toBe(
      'Details, defaults, and formats people use across the workspace.',
    )
    expect(fieldsFor('workspace').map((field) => field.kind)).toEqual([
      'text',
      'text-prefix',
      'select',
      'textarea',
      'select',
      'select',
      'select',
    ])
    expect(fieldsFor('workspace').find((field) => field.id === 'url')).toMatchObject({
      kind: 'text-prefix',
      prefix: 'northwind.app/',
      value: 'northwind',
    })
    expect(fieldsFor('workspace').find((field) => field.id === 'timezone')).toMatchObject({
      kind: 'select',
      value: 'new_york',
    })
    expect(fieldsFor('workspace').find((field) => field.id === 'date-format')).toMatchObject({
      kind: 'select',
      value: 'mdy',
    })
    expect(fieldsFor('billing')).toHaveLength(7)
    expect(fieldsFor('notifications').filter((field) => field.kind === 'checkbox')).toHaveLength(3)
    expect(fieldsFor('notifications').filter((field) => field.kind === 'switch')).toHaveLength(3)
    expect(fieldsFor('security')).toHaveLength(7)
    expect(fieldsFor('advanced')).toHaveLength(7)
    expect(fixture.storeSeed.initialSaveState).toBe('dirty')
    expect(fixture.storeSeed.initiallyChangedFieldIds).toEqual(['name'])
  })

  test('routes the host view model through Lumen SettingsForm 1 and renders distinct controls', () => {
    const workspaceMarkup = renderIntegrated()
    expect(workspaceMarkup).toContain('data-hbar-app-ui-component="hbar-app-ui-settings-form-1"')
    expect(workspaceMarkup).toContain('aria-current="page"')
    expect(workspaceMarkup).toContain('Unsaved changes in Workspace')
    expect(workspaceMarkup).toContain('Northwind Labs')
    expect(workspaceMarkup).toContain('Save changes')
    const savingMarkup = renderIntegrated('workspace', 'saving')
    expect(savingMarkup).toContain('<p>Saving</p>')
    expect(savingMarkup).not.toContain('Saving</button>')
    expect(savingMarkup).toContain('Save changes')

    const billingMarkup = renderIntegrated('billing')
    expect(billingMarkup).toContain('Changes apply on the next invoice.')
    expect(billingMarkup).toContain('accounts-payable@northwind.co')
    expect(billingMarkup).toContain('18 Wharf Road')
    expect(billingMarkup).toContain('type="checkbox" role="switch"')

    const notificationMarkup = renderIntegrated('notifications')
    expect(notificationMarkup).toContain('<h3>Email</h3>')
    expect(notificationMarkup).toContain('Choose which messages reach the inbox.')
    expect(notificationMarkup.match(/type="checkbox"/g)).toHaveLength(6)
    expect(notificationMarkup.match(/role="switch"/g)).toHaveLength(3)

    const securityMarkup = renderIntegrated('security')
    expect(securityMarkup).toContain('Two-factor authentication')
    expect(securityMarkup).toContain('Google Workspace')

    const advancedMarkup = renderIntegrated('advanced')
    expect(advancedMarkup).toContain('Webhook endpoint')
    expect(advancedMarkup).toContain('https://')
    expect(advancedMarkup).toContain('Parquet')
  })

  test('keeps the non-default locale host supplied across sections', () => {
    const localized = createSettingsForm1ReferencePreviewFixture('de')
    const workspace = localized.content.sections.find((section) => section.id === 'workspace')
    const advanced = localized.content.sections.find((section) => section.id === 'advanced')
    expect(localized.content.pageTitle).toBe('Einstellungen')
    expect(workspace?.description).toContain('Sehr lange lokalisierte Beschreibung')
    expect(workspace?.groups.flatMap((group) => group.fields).find((field) => field.id === 'name')?.label).toBe(
      'Name des Arbeitsbereichs',
    )
    expect(localized.content.sections.find((section) => section.id === 'notifications')?.label).toBe('Benachrichtigungen')
    expect(advanced?.groups.flatMap((group) => group.fields).find((field) => field.id === 'webhook-endpoint')?.label).toBe('Webhook-Endpunkt')
    expect(localized.content.saveLabel).toBe('Änderungen speichern')
    expect(localized.content.feedbackMessages['save-failed']).toContain('Bitte erneut versuchen')
  })

  test('selects only known sections and clears a stale active section without fallback', () => {
    const store = createSettingsForm1PreviewStore(fixture.storeSeed)
    expect(store.getState().selectedSectionId).toBe('workspace')
    expect(store.getState().selectSection('security')).toBe(true)
    expect(store.getState().selectedSectionId).toBe('security')
    expect(store.getState().selectSection('missing')).toBe(false)
    expect(store.getState().selectedSectionId).toBe('security')

    store.getState().reconcileSections(['workspace', 'billing'])
    expect(store.getState().selectedSectionId).toBeUndefined()
  })

  test('updates text, prefixed text, select, textarea, checkbox, and switch values by stable ID', () => {
    const store = createSettingsForm1PreviewStore(fixture.storeSeed)
    const state = store.getState()
    expect(state.changeField('name', 'Northwind Operations')).toBe(true)
    expect(state.changeField('url', 'northwind-ops')).toBe(true)
    expect(state.changeField('region', 'unknown-region')).toBe(false)
    expect(state.changeField('region', 'eu-central')).toBe(true)
    expect(state.changeField('description', 'A longer shared workspace description.')).toBe(true)
    expect(state.changeField('weekly-digest', false)).toBe(true)
    expect(state.changeField('desktop-alerts', false)).toBe(true)
    expect(state.changeField('desktop-alerts', 'false')).toBe(false)
    expect(state.changeField('stale-field', 'ignored')).toBe(false)

    const fields = Object.fromEntries(store.getState().fields.map((field) => [field.id, field]))
    expect(fields.name).toMatchObject({ value: 'Northwind Operations', changed: true })
    expect(fields.url).toMatchObject({ value: 'northwind-ops', changed: true })
    expect(fields.region).toMatchObject({ value: 'eu-central', changed: true })
    expect(fields.description).toMatchObject({ value: 'A longer shared workspace description.', changed: true })
    expect(fields['weekly-digest']).toMatchObject({ value: false, changed: true })
    expect(fields['desktop-alerts']).toMatchObject({ value: false, changed: true })
    expect(store.getState().saveState).toBe('dirty')
  })

  test('cancels edits back to saved values and exposes local cancellation feedback', () => {
    const store = createSettingsForm1PreviewStore(fixture.storeSeed)
    expect(store.getState().fields.find((field) => field.id === 'name')).toMatchObject({
      value: 'Northwind Labs',
      savedValue: 'Northwind',
      changed: true,
    })
    store.getState().changeField('name', 'Changed workspace')
    store.getState().changeField('url', 'changed-url')
    store.getState().changeField('weekly-digest', false)

    expect(store.getState().cancel()).toBe(true)
    const fields = Object.fromEntries(store.getState().fields.map((field) => [field.id, field]))
    expect(fields.name).toMatchObject({ value: 'Northwind', changed: false })
    expect(fields.url).toMatchObject({ value: 'northwind', changed: false })
    expect(fields['weekly-digest']).toMatchObject({ value: true, changed: false })
    expect(store.getState()).toMatchObject({ saveState: 'clean', feedback: 'cancelled' })
    expect(store.getState().cancel()).toBe(false)
  })

  test('keeps edits on save failure and recovers through a successful retry', () => {
    const store = createSettingsForm1PreviewStore(fixture.storeSeed)
    store.getState().changeField('description', 'Retry after the connection returns.')
    expect(store.getState().beginSave()).toBe(true)
    expect(store.getState().saveState).toBe('saving')
    expect(store.getState().changeField('description', 'Blocked during save')).toBe(false)

    expect(store.getState().rejectSave()).toBe(true)
    expect(store.getState()).toMatchObject({ saveState: 'error', feedback: 'save-failed' })
    expect(store.getState().fields.find((field) => field.id === 'description')?.value).toBe(
      'Retry after the connection returns.',
    )
    expect(store.getState().beginSave()).toBe(true)
    expect(store.getState().resolveSave()).toBe(true)
    expect(store.getState()).toMatchObject({ saveState: 'saved', feedback: 'saved' })
    expect(store.getState().fields.find((field) => field.id === 'description')).toMatchObject({
      value: 'Retry after the connection returns.',
      savedValue: 'Retry after the connection returns.',
      changed: false,
    })
    expect(store.getState().beginSave()).toBe(false)
  })
})
