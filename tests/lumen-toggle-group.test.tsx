import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenToggleGroup } from '../hbar-ui/packages/lumen-app-ui/src/toggle-group'

const options = [
  { id: 'off', label: '关闭' },
  { id: 'low', label: '低' },
  { id: 'high', label: '非常长的中文思考等级标签，用于窄面板换行验证' },
] as const

test('single groups render stable values and radio semantics without a deselect path', () => {
  const changes: string[] = []
  const markup = renderToStaticMarkup(
    <LumenToggleGroup
      id="thinking-level"
      name="thinkingLevel"
      type="single"
      value="low"
      options={options}
      onValueChange={(value) => changes.push(value)}
      aria-label="思考等级"
      required
    />,
  )

  expect(markup).toContain('role="radiogroup"')
  expect(markup).toContain('data-value="low"')
  expect(markup).toContain('data-value="high"')
  expect(markup).toContain('role="radio"')
  expect(markup).toContain('aria-checked="true"')
  expect(markup).toContain('name="thinkingLevel"')
  expect(markup).not.toContain('readonly')
  expect(changes).toHaveLength(0)
})

test('multiple groups expose pressed buttons and preserve unknown values for host reconciliation', () => {
  const markup = renderToStaticMarkup(
    <LumenToggleGroup
      id="levels"
      type="multiple"
      values={['low', 'legacy']}
      options={options}
      onValuesChange={() => undefined}
      aria-label="可用等级"
    />,
  )

  expect(markup).toContain('role="group"')
  expect(markup).toContain('aria-pressed="true"')
  expect(markup).toContain('data-value="low"')
  expect(markup).toContain('data-stale="true"')
  expect(markup).toContain('aria-invalid="true"')
})

test('empty and duplicate options produce no duplicate option controls', () => {
  const markup = renderToStaticMarkup(
    <LumenToggleGroup
      id="empty"
      type="single"
      value={null}
      options={[options[0], options[0]]}
      onValueChange={() => undefined}
      aria-label="空组"
    />,
  )

  expect(markup.match(/data-value="off"/g)).toHaveLength(1)
  expect(markup).toContain('data-value=""')
})

test('an empty-string option is a valid selected value and does not become stale', () => {
  const markup = renderToStaticMarkup(
    <LumenToggleGroup
      id="inheritance"
      type="single"
      value=""
      options={[{ id: '', label: '继承' }, { id: 'custom', label: '自定义' }]}
      onValueChange={() => undefined}
      aria-label="应用范围"
    />,
  )

  expect(markup).toContain('data-value=""')
  expect(markup).toContain('aria-checked="true"')
  expect(markup).not.toContain('data-stale="true"')
  expect(markup).not.toContain('aria-invalid="true"')
})

test('required groups expose a mutable validation proxy while no value is selected', () => {
  const markup = renderToStaticMarkup(
    <LumenToggleGroup
      id="required-level"
      type="single"
      value={null}
      options={options}
      onValueChange={() => undefined}
      name="level"
      required
    />,
  )

  expect(markup).toMatch(/<input[^>]*(?:name="level"|required="")[^>]*(?:name="level"|required="")[^>]*>/)
  expect(markup).not.toContain('readonly')
})
