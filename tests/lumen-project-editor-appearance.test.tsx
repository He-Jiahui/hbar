import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenComboBox,
  LumenDialog,
  LumenFormField,
  LumenInput,
  LumenSelect,
  LumenSurface,
  LumenTextarea,
  type LumenDialogProps,
  type LumenFieldVariant,
} from '@lumen/app-ui'

const dialogProps: LumenDialogProps = {
  open: true,
  title: '编辑项目',
  closeLabel: '关闭',
  onClose: () => {},
  children: '真实路径不变',
  footer: '宿主操作',
}

test('default dialog preserves glass, horizontal lamps and both decorative separators', () => {
  const markup = renderToStaticMarkup(<LumenDialog {...dialogProps} />)
  expect(markup).toContain('data-appearance="glass"')
  expect(markup).toContain('data-material="glass"')
  expect(markup).toContain('data-boundary="horizontal"')
  expect(markup.match(/role="separator"/g)).toHaveLength(2)
  expect(markup).toContain('aria-label="编辑项目"')
})

test('panel appearance changes only chrome, retaining native dialog, title, body, close and footer', () => {
  const markup = renderToStaticMarkup(<LumenDialog {...dialogProps} appearance="panel" />)
  expect(markup).toContain('<dialog')
  expect(markup).toContain('data-appearance="panel"')
  expect(markup).toContain('data-material="solid"')
  expect(markup).toContain('data-boundary="none"')
  expect(markup).toContain('data-lens="none"')
  expect(markup).not.toContain('role="separator"')
  expect(markup).not.toContain('<filter')
  expect(markup).toContain('真实路径不变')
  expect(markup).toContain('<footer>宿主操作</footer>')
  expect(markup).toContain('aria-label="关闭"')
})

test('solid surfaces keep explicit boundaries independent from non-refractive material', () => {
  const markup = renderToStaticMarkup(
    <LumenSurface material="solid" boundary="vertical">
      内容
    </LumenSurface>,
  )
  expect(markup).toContain('data-material="solid"')
  expect(markup).toContain('data-lens="none"')
  expect(markup).toContain('data-edge="left"')
  expect(markup).toContain('data-edge="right"')
  expect(markup).not.toContain('backdrop-filter:')
})

test('legacy outlined remains boundary; plain and boxed never acquire decorative field lamps', () => {
  const variants: readonly LumenFieldVariant[] = ['boundary', 'outlined', 'plain', 'boxed']
  for (const variant of variants) {
    const markup = renderToStaticMarkup(<LumenInput variant={variant} defaultValue="Project" />)
    const boundary = variant === 'boundary' || variant === 'outlined'
    expect(markup).toContain(`data-lumen-variant="${boundary ? 'boundary' : variant}"`)
    expect(markup.includes('data-boundary="horizontal"')).toBe(boundary)
    expect(markup.includes('data-edge="top"')).toBe(boundary)
  }
  expect(renderToStaticMarkup(<LumenInput />)).toContain('data-lumen-variant="boundary"')
})

test('boxed field preserves required label, invalid state and localized explanation relationships', () => {
  const markup = renderToStaticMarkup(
    <LumenFormField controlId="alias-name" label="项目名称" description="最多 80 个字符" error="请输入名称" required>
      <LumenInput variant="boxed" defaultValue="" maxLength={4000} />
    </LumenFormField>,
  )
  expect(markup).toContain('for="alias-name"')
  expect(markup).toContain('id="alias-name"')
  expect(markup).toContain('aria-describedby="alias-name-description alias-name-error"')
  expect(markup).toContain('aria-invalid="true"')
  expect(markup).toContain('required=""')
  expect(markup).toContain('maxLength="4000"')
  expect(markup).toContain('data-lumen-variant="boxed"')
  expect(markup).not.toContain('data-edge=')
})

test('boxed native controls retain readonly, disabled, selection and multiline semantics', () => {
  const markup = renderToStaticMarkup(
    <>
      <LumenInput variant="boxed" readOnly defaultValue="D:/真实/路径" />
      <LumenTextarea variant="boxed" disabled defaultValue={'两行\n原文'} />
      <LumenSelect variant="boxed" defaultValue="a">
        <option value="a">当前名称</option>
      </LumenSelect>
    </>,
  )
  expect(markup.match(/data-lumen-variant="boxed"/g)).toHaveLength(3)
  expect(markup).toContain('readOnly=""')
  expect(markup).toContain('disabled=""')
  expect(markup).toContain('两行\n原文')
  expect(markup).toContain('<option value="a" selected="">当前名称</option>')
  expect(markup).not.toContain('data-edge=')
})

test('boxed compound field has one frame while retaining combobox relationships', () => {
  const markup = renderToStaticMarkup(
    <LumenComboBox
      id="alias-choices"
      variant="boxed"
      value={null}
      query=""
      open={false}
      options={[]}
      invalid
      describedBy="alias-error"
      labels={{ open: '展开', loading: '正在读取', empty: '无选项' }}
      onQueryChange={() => {}}
      onOpenChange={() => {}}
      onValueChange={() => {}}
    />,
  )
  expect(markup).toContain('data-variant="boxed"')
  expect(markup).toContain('data-invalid="true"')
  expect(markup).toContain('role="combobox"')
  expect(markup).toContain('aria-describedby="alias-error"')
  expect(markup).toContain('aria-invalid="true"')
  expect(markup).toContain('data-lumen-variant="plain"')
  expect(markup).not.toContain('data-boundary=')
})
