import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { useLumenSettingsFormContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant, type HbarAppUiVariantSpec } from '../packages/hbar-app-ui/src/index'
import { SettingsPreviewHost } from '../apps/hbar-app-ui-preview/src/SettingsPreviewHost'
import { SettingsForm2PreviewHost } from '../apps/hbar-app-ui-preview/src/SettingsForm2PreviewHost'
import { SettingsForm3PreviewHost } from '../apps/hbar-app-ui-preview/src/SettingsForm3PreviewHost'
import { SettingsForm4PreviewHost } from '../apps/hbar-app-ui-preview/src/SettingsForm4PreviewHost'
import { SettingsForm5PreviewHost } from '../apps/hbar-app-ui-preview/src/SettingsForm5PreviewHost'
import { SettingsForm6PreviewHost } from '../apps/hbar-app-ui-preview/src/SettingsForm6PreviewHost'
import { createSettingsForm1ReferencePreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm1ReferenceFixtures'
import { createSettingsForm2PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm2PreviewFixtures'
import { createSettingsForm3PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm3PreviewFixtures'
import { createSettingsForm4PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm4PreviewFixtures'
import { createSettingsForm5PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm5PreviewFixtures'
import { createSettingsForm6PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm6PreviewFixtures'
import { HBAR_APP_UI_SETTINGS_FORM_FIXTURES as content } from './fixtures/hbar-app-ui-settings-form-fixtures'

function ReferenceKeys() {
  return (
    <span>
      {Object.keys(useLumenSettingsFormContent() ?? {})
        .filter((key) => key.endsWith('Reference'))
        .join(',')}
    </span>
  )
}
function fixtures() {
  return {
    one: createSettingsForm1ReferencePreviewFixture(),
    two: createSettingsForm2PreviewFixture(),
    three: createSettingsForm3PreviewFixture(),
    four: createSettingsForm4PreviewFixture(),
    five: createSettingsForm5PreviewFixture(),
    six: createSettingsForm6PreviewFixture(),
  }
}
function renderOwners(spec: HbarAppUiVariantSpec, input = fixtures()) {
  return renderToStaticMarkup(
    <SettingsPreviewHost spec={spec} content={content} referenceFixture={input.one}>
      <SettingsForm2PreviewHost spec={spec} content={content} referenceFixture={input.two}>
        <SettingsForm3PreviewHost spec={spec} content={content} referenceFixture={input.three}>
          <SettingsForm4PreviewHost spec={spec} content={content} referenceFixture={input.four}>
            <SettingsForm5PreviewHost spec={spec} content={content} referenceFixture={input.five}>
              <SettingsForm6PreviewHost spec={spec} content={content} referenceFixture={input.six}>
                <ReferenceKeys />
              </SettingsForm6PreviewHost>
            </SettingsForm5PreviewHost>
          </SettingsForm4PreviewHost>
        </SettingsForm3PreviewHost>
      </SettingsForm2PreviewHost>
    </SettingsPreviewHost>,
  )
}
describe('active Settings preview owners', () => {
  test('the nested gallery hosts provide only the selected reference contract', () => {
    const keys = [
      'workspaceReference',
      'profileReference',
      'preferencesReference',
      'membersReference',
      'apiKeysReference',
      'dangerReference',
    ]
    for (let variant = 1; variant <= 6; variant++) {
      expect(renderOwners(getHbarAppUiVariant('settings-form', variant).spec)).toBe(
        `<span>${keys[variant - 1]!}</span>`,
      )
    }
  })
  test('unrelated selections bypass every settings owner without initializing a store', () => {
    const input = fixtures()
    for (const fixture of Object.values(input)) {
      Object.defineProperty(fixture, 'storeSeed', {
        get() {
          throw new Error('Inactive settings seed was read')
        },
      })
    }
    expect(renderOwners(getHbarAppUiVariant('editor', 1).spec, input)).toBe('<span></span>')
  })
})
