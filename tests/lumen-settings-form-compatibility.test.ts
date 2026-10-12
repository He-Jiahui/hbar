import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenSettingsForm01, LumenSettingsForm06 } from '@lumen/app-ui'
import { LumenPreferencesSettings, LumenSettingsFormProvider, selectLumenSettingsItem, uniqueLumenSettingsItems } from '@lumen/app-ui/catalog'
import { getLumenVariantComponent } from '@lumen/app-ui/catalog'
import {
  HbarAppUiSettingsFormProvider,
  selectHbarAppUiSettingsItem,
  uniqueHbarAppUiSettingsItems,
} from '../packages/hbar-app-ui/src/index'
import { HbarAppUiPreferencesSettings } from '../packages/hbar-app-ui/src/settings-form'
import { HBAR_APP_UI_SETTINGS_FORM_FIXTURES } from './fixtures/hbar-app-ui-settings-form-fixtures'

test('settings compatibility exports are canonical Lumen contracts', () => {
  expect(HbarAppUiSettingsFormProvider).toBe(LumenSettingsFormProvider)
  expect(HbarAppUiPreferencesSettings).toBe(LumenPreferencesSettings)
  expect(selectHbarAppUiSettingsItem).toBe(selectLumenSettingsItem)
  expect(uniqueHbarAppUiSettingsItems).toBe(uniqueLumenSettingsItems)
  expect(getLumenVariantComponent('hbar-app-ui-settings-form-6')).toBe(LumenSettingsForm06)
})

test('the canonical Lumen entry renders settings content and controls', () => {
  const markup = renderToStaticMarkup(
    createElement(LumenSettingsFormProvider, {
      content: HBAR_APP_UI_SETTINGS_FORM_FIXTURES,
      children: createElement(LumenSettingsForm01),
    }),
  )

  expect(markup).toContain('data-lumen-component="settings-form"')
  expect(markup).toContain('hbar-app-ui-settings-workspace')
  expect(markup).toContain('Details, defaults, and formats')
  expect(markup).toContain('data-lumen-variant=')
})

test('the legacy settings implementation and stylesheets are retired', async () => {
  const retired = [
    'ApiKeysSettings.tsx',
    'DangerSettings.tsx',
    'MembersSettings.tsx',
    'Preferences.css',
    'PreferencesSettings.tsx',
    'ProfileSettings.tsx',
    'SettingsField.tsx',
    'SettingsPrimitives.tsx',
    'SettingsSurface.css',
    'WorkspaceSettings.tsx',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/settings-form/${file}`).exists()).toBe(false)
  }
})
