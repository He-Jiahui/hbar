import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenFilePicker } from '@lumen/app-ui'

for (const disabled of [false, true]) {
  test(`file picker separates its visible named action from the native input (disabled=${disabled})`, () => {
    const markup = renderToStaticMarkup(
      <LumenFilePicker label="添加工作区附件" disabled={disabled} multiple accept="text/plain" onFiles={() => {}}>
        <span aria-hidden="true">+</span>
      </LumenFilePicker>,
    )
    expect(markup).toContain('<button')
    expect(markup).toContain('aria-label="添加工作区附件"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain('type="file" hidden=""')
    expect(markup).toContain('multiple=""')
    expect(markup).toContain('accept="text/plain"')
    expect(markup.match(/disabled=""/g) ?? []).toHaveLength(disabled ? 2 : 0)
  })
}
