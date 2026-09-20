import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Settings } from 'lucide-react'
import {
  HbarAppUiButton,
  HbarAppUiIconButton,
  type HbarAppUiButtonSize,
  type HbarAppUiButtonTone,
} from '../packages/hbar-app-ui/src/primitives'
import { HbarAppUiIcon } from '../packages/hbar-app-ui/src/icon'

test('button primitives expose semantic tone, size, state, and host-owned labels', () => {
  const tone: HbarAppUiButtonTone = 'warning'
  const size: HbarAppUiButtonSize = 'focal'
  const longLabel = '应用并重新加载当前工作区中的所有模型设置'
  const markup = renderToStaticMarkup(
    <section>
      <HbarAppUiButton tone={tone} size={size} aria-pressed="true">
        {longLabel}
      </HbarAppUiButton>
      <HbarAppUiButton disabled>暂不可用</HbarAppUiButton>
      <HbarAppUiIconButton label="打开设置">
        <HbarAppUiIcon icon={Settings} tier="md" />
      </HbarAppUiIconButton>
    </section>,
  )

  expect(markup).toContain('type="button"')
  expect(markup).toContain('hbar-app-ui-button-warning hbar-app-ui-button-focal')
  expect(markup).toContain('aria-pressed="true"')
  expect(markup).toContain(longLabel)
  expect(markup).toContain('disabled=""')
  expect(markup).toContain('hbar-app-ui-icon-button')
  expect(markup).toContain('hbar-app-ui-button-compact')
  expect(markup).toContain('aria-label="打开设置"')
  expect(markup).toContain('title="打开设置"')
})

test('button primitives preserve explicit native button behavior and accessible overrides', () => {
  const submit = renderToStaticMarkup(<HbarAppUiButton type="submit">保存</HbarAppUiButton>)
  const icon = renderToStaticMarkup(
    createElement(HbarAppUiIconButton, {
      label: '默认说明',
      'aria-label': '自定义辅助名称',
      title: '自定义提示',
      size: 'default',
      children: createElement(HbarAppUiIcon, { icon: Settings }),
    }),
  )

  expect(submit).toContain('type="submit"')
  expect(icon).toContain('hbar-app-ui-button-default')
  expect(icon).toContain('aria-label="自定义辅助名称"')
  expect(icon).toContain('title="自定义提示"')
})
