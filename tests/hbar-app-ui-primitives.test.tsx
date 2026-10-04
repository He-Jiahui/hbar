import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Settings } from 'lucide-react'
import {
  HbarAppUiButton,
  HbarAppUiIconButton,
  HbarAppUiLabel,
  HbarAppUiNavigationButton,
  HbarAppUiText,
  type HbarAppUiButtonSize,
  type HbarAppUiButtonTone,
} from '../packages/hbar-app-ui/src/primitives'
import { HbarAppUiIcon } from '../packages/hbar-app-ui/src/icon'

test('button primitives expose semantic tone, size, state, and host-owned labels', () => {
  const tone: HbarAppUiButtonTone = 'warning'
  const size: HbarAppUiButtonSize = 'l'
  const longLabel = '应用并重新加载当前工作区中的所有模型设置'
  const markup = renderToStaticMarkup(
    <section>
      <HbarAppUiButton tone={tone} size={size} variant="outline" aria-pressed="true">
        {longLabel}
      </HbarAppUiButton>
      <HbarAppUiButton disabled>暂不可用</HbarAppUiButton>
      <HbarAppUiIconButton label="打开设置">
        <HbarAppUiIcon icon={Settings} tier="md" />
      </HbarAppUiIconButton>
      <HbarAppUiNavigationButton selected>外观</HbarAppUiNavigationButton>
    </section>,
  )

  expect(markup).toContain('type="button"')
  expect(markup).toContain('data-size="l"')
  expect(markup).toContain('data-tone="warning"')
  expect(markup).toContain('data-variant="outline"')
  expect(markup).toContain('aria-pressed="true"')
  expect(markup).toContain(longLabel)
  expect(markup).toContain('disabled=""')
  expect(markup).toContain('hbar-app-ui-icon-button')
  expect(markup).toMatch(/class="[^"]*hbar-app-ui-button hbar-app-ui-icon-button[^"]*"/)
  expect(markup).toContain('aria-label="打开设置"')
  expect(markup).toContain('title="打开设置"')
  expect(markup).toMatch(/class="[^"]*hbar-app-ui-button hbar-app-ui-navigation-button[^"]*"/)
  expect(markup).toContain('data-size="s"')
  expect(markup).toContain('aria-current="page"')
  expect(markup).toContain('data-variant="ghost"')
  expect(markup).toContain('data-lumen-variant="text"')
})

test('button primitives preserve explicit native button behavior and accessible overrides', () => {
  const submit = renderToStaticMarkup(<HbarAppUiButton type="submit">保存</HbarAppUiButton>)
  const icon = renderToStaticMarkup(
    createElement(HbarAppUiIconButton, {
      label: '默认说明',
      'aria-label': '自定义辅助名称',
      title: '自定义提示',
      size: 'm',
      children: createElement(HbarAppUiIcon, { icon: Settings }),
    }),
  )

  expect(submit).toContain('type="submit"')
  expect(icon).toContain('data-size="m"')
  expect(icon).toContain('aria-label="自定义辅助名称"')
  expect(icon).toContain('title="自定义提示"')
})

test('button loading state is busy, disabled, and keeps host-owned content', () => {
  const markup = renderToStaticMarkup(
    <HbarAppUiButton loading tone="accent">
      正在保存
    </HbarAppUiButton>,
  )

  expect(markup).toContain('aria-busy="true"')
  expect(markup).toContain('disabled=""')
  expect(markup).toContain('正在保存')
})

test('text and label primitives expose bounded semantic presentation', () => {
  const markup = renderToStaticMarkup(
    <section>
      <HbarAppUiLabel htmlFor="provider" size="s" tone="muted">
        供应商
      </HbarAppUiLabel>
      <HbarAppUiText as="p" size="l" tone="danger" variant="supporting">
        无法保存设置
      </HbarAppUiText>
      <HbarAppUiText as="code" variant="code">
        provider.model
      </HbarAppUiText>
    </section>,
  )

  expect(markup).toContain('class="hbar-app-ui-label"')
  expect(markup).toContain('for="provider"')
  expect(markup).toContain('data-size="s"')
  expect(markup).toContain('data-tone="muted"')
  expect(markup).toContain('class="hbar-app-ui-text"')
  expect(markup).toContain('data-size="l"')
  expect(markup).toContain('data-tone="danger"')
  expect(markup).toContain('data-variant="supporting"')
  expect(markup).toContain('data-variant="code"')
})
