import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenFormField, LumenFrame, LumenInput } from '@lumen/app-ui'

test('compound fields bind labels and error state to the explicit descendant input, not its frame', () => {
  const markup = renderToStaticMarkup(
    <LumenFormField controlId="custom-model" label="自定义模型" description="模型标识" error="请输入标识" required>
      <LumenFrame>
        <LumenInput id="custom-model" required={undefined} aria-invalid={undefined} />
        <button type="button">添加模型</button>
      </LumenFrame>
    </LumenFormField>,
  )
  expect(markup.match(/id="custom-model"/g)).toHaveLength(1)
  expect(markup).toContain('for="custom-model"')
  expect(markup).toMatch(/<input[^>]*aria-describedby="custom-model-description custom-model-error"/)
  expect(markup).toMatch(/<input[^>]*aria-invalid="true"/)
  expect(markup).toMatch(/<input[^>]*required=""/)
  expect(markup).not.toMatch(/<div[^>]*id="custom-model"/)
})

test('direct controls still receive generated identity and explicit accessibility overrides', () => {
  const markup = renderToStaticMarkup(
    <LumenFormField controlId="model-name" label="模型名称" description="默认说明">
      <LumenInput aria-describedby="host-description" />
    </LumenFormField>,
  )
  expect(markup).toMatch(/<input[^>]*id="model-name"/)
  expect(markup).toContain('aria-describedby="host-description"')
})
