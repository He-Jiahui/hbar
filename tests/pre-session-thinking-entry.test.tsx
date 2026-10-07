import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarPreSessionThinkingPicker } from '@hbar/app-react'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { providerSchema } from '@hbar/contracts'
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
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('type="range"')
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

test('an empty capability list exposes no invented range, and one remaining level needs explicit recovery', () => {
  const labels = getShellCopy('zh-CN').session.modelPicker
  const empty = renderToStaticMarkup(
    <HbarPreSessionThinkingPicker
      model={{ ...model, thinkingLevels: [] }}
      level="high"
      labels={labels}
      onChoose={async () => undefined}
    />,
  )
  expect(empty).toBe('')
  const recovery = renderToStaticMarkup(
    <HbarPreSessionThinkingPicker
      model={{ ...model, thinkingLevels: ['low'], defaultThinkingLevel: 'low' }}
      level="high"
      labels={labels}
      onChoose={async () => undefined}
    />,
  )
  expect(recovery).toContain(labels.thinkingTrigger(labels.thinkingLevel('high')))
  expect(recovery).toContain('aria-invalid="true"')
  expect(recovery).not.toContain('type="range"')
})

test('Host thinking capabilities remain bounded at one through seven actual levels', () => {
  const provider = {
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    baseUrl: 'http://127.0.0.1',
    model: 'fixture',
    imageInput: false,
    reasoning: true,
    defaultThinkingLevel: 'low',
  }
  const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  expect(providerSchema.safeParse({ ...provider, thinkingLevels: [] }).success).toBe(false)
  expect(providerSchema.safeParse({ ...provider, thinkingLevels: ['low'] }).success).toBe(true)
  expect(providerSchema.safeParse({ ...provider, thinkingLevels: levels }).success).toBe(true)
  expect(providerSchema.safeParse({ ...provider, thinkingLevels: [...levels, 'low'] }).success).toBe(false)
})
