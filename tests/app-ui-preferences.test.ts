import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import {
  HbarAppUiPreferencesSettings,
  type HbarAppUiSettingsPreferencesContent,
} from '../packages/hbar-app-ui/src/settings-form'
import { HBAR_APP_UI_SETTINGS_FORM_FIXTURES } from './fixtures/hbar-app-ui-settings-form-fixtures'

const fixture = HBAR_APP_UI_SETTINGS_FORM_FIXTURES.preferences!
function render(patch: Partial<HbarAppUiSettingsPreferencesContent>) {
  return renderToStaticMarkup(createElement(HbarAppUiPreferencesSettings, { ...fixture, ...patch }))
}
describe('controlled preferences', () => {
  test('does not select a replacement for an unavailable choice or render duplicate IDs', async () => {
    const html = render({
      themeId: 'deleted',
      themeChoices: [
        { id: 'a', label: 'old' },
        { id: 'a', label: 'new' },
      ],
      densityId: 'removed',
      languageId: 'removed',
    })
    expect(html.match(/type="radio"/g)).toHaveLength(1)
    expect(html).toContain('new')
    expect(html).not.toContain('>old<')
    expect(html).not.toMatch(/type="radio"[^>]+checked/)
    const choices: { label: string | null; expanded: string | null; text: string }[] = []
    await new HTMLRewriter()
      .on('[role="combobox"]', {
        element(element) {
          choices.push({
            label: element.getAttribute('aria-label'),
            expanded: element.getAttribute('aria-expanded'),
            text: '',
          })
        },
        text(chunk) {
          const choice = choices.at(-1)
          if (choice) choice.text += chunk.text
        },
      })
      .transform(new Response(html))
      .text()
    expect(choices).toEqual([
      { label: fixture.labels.densityLabel, expanded: 'false', text: fixture.labels.unavailableChoice },
      { label: fixture.labels.languageLabel, expanded: 'false', text: fixture.labels.unavailableChoice },
    ])
  })
  test('immediate persistence has no fake save/cancel or unsupported controls', () => {
    const html = render({
      persistence: { mode: 'immediate' },
      densityChoices: [],
      languageChoices: [],
      toggles: [],
      checkbox: undefined,
    })
    expect(html).not.toContain('Save changes')
    expect(html).not.toContain('Cancel')
    expect(html).not.toContain('role="switch"')
    expect(html).not.toContain('<select')
  })
  test('large finite host preferences are not sliced and busy/error state comes from host', () => {
    const html = render({
      toggles: Array.from({ length: 120 }, (_, index) => ({
        id: `t${index}`,
        label: `Toggle ${index}`,
        description: '长说明内容',
        enabled: index % 2 === 0,
      })),
      error: '保存失败，保留草稿',
      persistence: { mode: 'explicit', busy: true, dirty: true, onSave() {}, onCancel() {} },
    })
    expect(html.match(/role="switch"/g)).toHaveLength(120)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('role="alert">保存失败，保留草稿')
    expect(html).toContain('Toggle 119')
  })
})
