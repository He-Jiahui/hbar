import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarPreSessionThinkingPicker } from '@hbar/app-react'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { getShellCopy } from '../apps/web/src/shell-copy'

const model: ModelDescriptor = {
  id: 'provider/model',
  providerId: 'provider',
  providerName: 'Provider',
  modelId: 'model',
  modelName: 'Model',
  contextWindow: 100_000,
  maxOutput: 8_000,
  imageInput: false,
  reasoning: true,
  thinkingLevels: ['off', 'low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: true,
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`no-tab effort control follows the selected model's real levels: ${locale}`, () => {
    const labels = getShellCopy(locale).session.modelPicker
    const html = renderToStaticMarkup(
      <HbarPreSessionThinkingPicker model={model} level="high" labels={labels} onChoose={async () => undefined} />,
    )
    expect(html).toContain(labels.thinkingTrigger(labels.thinkingLevel('high')))
    expect(html).toContain(`aria-label="${labels.thinking}"`)
    expect(html).toContain('type="range"')
    expect(html.match(/hbar-composer-thinking-stop/g)).toHaveLength(3)
    expect(html).toContain('max="2"')
  })

  test(`no-tab effort is absent for a single supported level: ${locale}`, () => {
    const html = renderToStaticMarkup(
      <HbarPreSessionThinkingPicker
        model={{ ...model, thinkingLevels: ['off'], defaultThinkingLevel: 'off' }}
        level={null}
        labels={getShellCopy(locale).session.modelPicker}
        onChoose={async () => undefined}
      />,
    )
    expect(html).toBe('')
  })
}

test('an inconsistent model default never creates a fictitious effort stop', () => {
  const labels = getShellCopy('en-US').session.modelPicker
  const html = renderToStaticMarkup(
    <HbarPreSessionThinkingPicker
      model={{ ...model, defaultThinkingLevel: 'max' }}
      level={null}
      labels={labels}
      onChoose={async () => undefined}
    />,
  )
  expect(html).toContain(labels.thinkingTrigger(labels.thinkingLevel('off')))
  expect(html).not.toContain(labels.thinkingLevel('max'))
})
