import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiPromptInputProvider,
  selectHbarAppUiPromptInputItem,
  uniqueHbarAppUiPromptInputItems,
  type HbarAppUiPromptInputContent,
} from '../packages/hbar-app-ui/src/index'
import { HbarAppUiPromptProvider } from '../packages/hbar-app-ui/src/catalog'
import { HbarAppUiPromptComposer } from '../packages/hbar-app-ui/src/production'
import {
  createHbarAppUiPromptInputLocalizedFixtures,
  HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
} from './fixtures/hbar-app-ui-prompt-input-fixtures'

const controlledComposer = {
  value: 'Keep this host draft',
  labels: HBAR_APP_UI_PROMPT_INPUT_FIXTURES.composerLabels,
  attachments: [{ id: 'brief', kind: 'file' as const, name: 'brief.md' }],
  submitting: false,
  uploading: false,
  canSubmit: true,
  canStop: false,
  onChange() {},
  onRemoveAttachment() {},
  onSubmit() {},
  onStop() {},
}

function render(variant: number, content: HbarAppUiPromptInputContent = HBAR_APP_UI_PROMPT_INPUT_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiPromptInputProvider, {
      content,
      children: createElement(HbarAppUiPromptProvider, {
        content: controlledComposer,
        children: createElement(getHbarAppUiVariant('prompt-input', variant).component, {}),
      }),
    }),
  )
}

describe('hbar-app-ui prompt input surfaces', () => {
  test('renders seven distinct Lumen workflows from host content', () => {
    const values = Array.from({ length: 7 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(7)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="prompt-input"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).toContain('data-boundary="horizontal"')
      expect(value).toContain(`data-hbar-app-ui-component="hbar-app-ui-prompt-input-${index + 1}"`)
      expect(value).not.toContain('hbar-app-ui-composer')
    })
  })

  test('delegates the production compatibility composer to Lumen', () => {
    const value = renderToStaticMarkup(createElement(HbarAppUiPromptComposer, controlledComposer))
    expect(value).toContain('lumen-prompt-composer')
    expect(value).toContain('<form')
    expect(value).toContain('data-boundary="horizontal"')
    expect(value).toContain('Keep this host draft')
    expect(value).toContain('brief.md')
    expect(value).toContain('lumen-composer-primary-action')
    expect(value).toContain(`aria-label="${controlledComposer.labels.send}"`)
    expect(value).toContain('type="submit"')
    expect(value).not.toContain('hbar-app-ui-prompt-composer')
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(3, createHbarAppUiPromptInputLocalizedFixtures())
    expect(value).toContain('从提示开始')
    expect(value).toContain('描述你的需求')
    expect(value).not.toContain('Turn a short request')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiPromptInputItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiPromptInputItem(items, 'missing')).toBe(items[0])
  })

  test('enforces tool capacity and empty upload boundaries', () => {
    const content: HbarAppUiPromptInputContent = {
      ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES,
      tools: {
        ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES.tools!,
        initialToolIds: ['search', 'browser'],
        maximumSelectedTools: 1,
      },
      upload: {
        ...HBAR_APP_UI_PROMPT_INPUT_FIXTURES.upload!,
        uploads: [],
      },
    }
    expect(render(2, content)).toContain('Tool limit reached')
    expect(render(5, content)).toContain('No files attached')
  })
})
