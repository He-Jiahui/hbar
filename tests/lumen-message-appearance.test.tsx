import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenButton, LumenMessage } from '@lumen/app-ui'
import { HbarLumenDisclosure } from '../packages/app-react/src/lumen-disclosure'

test('reading messages do not acquire decorative surface lamps', () => {
  for (const role of ['user', 'assistant', 'system', 'tool'] as const) {
    const markup = renderToStaticMarkup(
      <LumenMessage id={role} role={role} author="助手" avatar="AI" copyLabel="复制" streaming>
        <p>内容依靠间距与对齐组织。</p>
      </LumenMessage>,
    )
    expect(markup).toContain('data-boundary="none"')
    expect(markup).not.toContain('data-edge=')
    expect(markup).toContain('内容依靠间距与对齐组织。')
  }
})

test('disclosure arrows replace redundant lamps without changing expansion semantics', () => {
  for (const open of [false, true]) {
    const markup = renderToStaticMarkup(
      <HbarLumenDisclosure label="工具结果：update_plan" open={open}>
        <pre>Plan updated</pre>
      </HbarLumenDisclosure>,
    )
    expect(markup).toContain(`aria-expanded="${String(open)}"`)
    expect(markup).toContain('aria-controls=')
    expect(markup).toContain('data-lumen-indicator="none"')
    expect(markup).not.toContain('data-edge=')
    expect(markup).toContain('Plan updated')
  }
})

test('ordinary buttons retain their default action lamp', () => {
  const markup = renderToStaticMarkup(<LumenButton>发送</LumenButton>)
  expect(markup).toContain('data-lumen-indicator="lamp"')
  expect(markup).toContain('data-edge="bottom"')
})
