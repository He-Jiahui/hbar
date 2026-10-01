import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarAppUiCheckBox,
  HbarAppUiCheckBoxControl,
  HbarAppUiComboBox,
  HbarAppUiField,
  HbarAppUiInput,
  HbarAppUiMultiSelect,
  HbarAppUiSelect,
  HbarAppUiTextarea,
  HbarAppUiToggle,
  HbarAppUiToggleControl,
  type HbarAppUiControlOption,
} from '../packages/hbar-app-ui/src/production'

test('controlled form primitives connect host-owned field copy and validation metadata', () => {
  const markup = renderToStaticMarkup(
    <section>
      <HbarAppUiField
        controlId="provider-name"
        label="供应商显示名称"
        description="此名称来自宿主的当前语言包。"
        error="名称不能为空。"
        required
        requiredIndicator="*"
        size="l"
      >
        <HbarAppUiInput id="provider-name" value="" readOnly />
      </HbarAppUiField>
      <HbarAppUiField controlId="notes" label="说明" hint="最多 500 个字符。">
        <HbarAppUiTextarea id="notes" value="由宿主控制的长文本" variant="plain" readOnly />
      </HbarAppUiField>
      <HbarAppUiField controlId="protocol" label="协议">
        <HbarAppUiSelect id="protocol" value="responses" size="s" disabled>
          <option value="responses">Responses</option>
        </HbarAppUiSelect>
      </HbarAppUiField>
      <HbarAppUiCheckBox checked readOnly label="在模型选择器中显示" description="隐藏后已有会话仍可继续运行。" />
      <label htmlFor="schema-enabled">启用 Schema</label>
      <HbarAppUiCheckBoxControl id="schema-enabled" size="l" checked readOnly />
    </section>,
  )

  expect(markup).toContain('供应商显示名称')
  expect(markup).toContain('aria-describedby="provider-name-description provider-name-error"')
  expect(markup).toContain('aria-invalid="true"')
  expect(markup).toContain('class="hbar-app-ui-label"')
  expect(markup).toContain('data-size="l"')
  expect(markup).toContain('data-variant="outline"')
  expect(markup).toContain('data-variant="plain"')
  expect(markup).toContain('data-size="s"')
  expect(markup).toContain('aria-describedby="notes-hint"')
  expect(markup).toContain('type="checkbox"')
  expect(markup).toContain('class="lumen-checkbox-control hbar-app-ui-checkbox-control" data-size="l"')
  expect(markup).toContain('class="lumen-checkbox-input"')
  expect(markup).toContain('在模型选择器中显示')
  expect(markup).not.toContain('Write a message')
})

test('controlled combo box renders every bounded host option and publishes accessible list state', () => {
  const options: readonly HbarAppUiControlOption[] = Array.from({ length: 120 }, (_, index) => ({
    id: `model-${index}`,
    label: `模型 ${index}`,
    detail: `${128 + index}K 上下文`,
  }))
  const markup = renderToStaticMarkup(
    <HbarAppUiComboBox
      id="model-picker"
      value="model-119"
      query="模型"
      open
      options={options}
      labels={{ open: '打开模型列表', empty: '没有匹配模型', loading: '正在加载模型' }}
      size="l"
      variant="plain"
      onQueryChange={() => {}}
      onOpenChange={() => {}}
      onValueChange={() => {}}
    />,
  )

  expect(markup.match(/role="option"/g)).toHaveLength(120)
  expect(markup).toContain('aria-expanded="true"')
  expect(markup).toContain('aria-selected="true"')
  expect(markup).toContain('data-size="l"')
  expect(markup).toContain('data-variant="plain"')
  expect(markup).not.toContain('data-length="action"')
  expect(markup.match(/data-lumen-variant="text"/g)).toHaveLength(121)
  expect(markup).toContain('模型 119')
  expect(markup).toContain('247K 上下文')
})

test('controlled combo box uses explicit host loading and empty copy', () => {
  const labels = { open: 'Open catalog', empty: 'No matching models', loading: 'Loading catalog' }
  const loading = renderToStaticMarkup(
    createElement(HbarAppUiComboBox, {
      id: 'loading-models',
      value: null,
      query: '',
      open: true,
      loading: true,
      options: [],
      labels,
      onQueryChange() {},
      onOpenChange() {},
      onValueChange() {},
    }),
  )
  const empty = renderToStaticMarkup(
    createElement(HbarAppUiComboBox, {
      id: 'empty-models',
      value: null,
      query: '',
      open: true,
      options: [],
      labels,
      onQueryChange() {},
      onOpenChange() {},
      onValueChange() {},
    }),
  )
  expect(loading).toContain('Loading catalog')
  expect(empty).toContain('No matching models')
})

test('multi-select preserves stale host values, de-duplicates selections, and exposes paging', () => {
  const markup = renderToStaticMarkup(
    <HbarAppUiMultiSelect
      id="thinking-levels"
      values={['low', 'stale-level', 'low']}
      query=""
      open
      size="s"
      options={[
        { id: 'off', label: '关闭' },
        { id: 'low', label: '低' },
        { id: 'high', label: '高' },
        { id: 'high', label: '重复的高' },
      ]}
      labels={{
        open: '打开思考等级列表',
        empty: '没有可添加的等级',
        loading: '正在加载等级',
        remove: (label) => `移除 ${label}`,
      }}
      loadMoreLabel="加载更多等级"
      onLoadMore={() => {}}
      onQueryChange={() => {}}
      onOpenChange={() => {}}
      onValuesChange={() => {}}
    />,
  )
  expect(markup.match(/aria-label="移除 低"/g)).toHaveLength(1)
  expect(markup).toContain('class="lumen-multi-select" data-size="s"')
  expect(markup).toContain('stale-level')
  expect(markup).toContain('aria-label="移除 stale-level"')
  expect(markup.match(/role="option"/g)).toHaveLength(2)
  expect(markup).toContain('加载更多等级')
})

test('toggle compatibility exports delegate switch semantics to Lumen', () => {
  const markup = renderToStaticMarkup(
    <section>
      <HbarAppUiToggle label="启用同步" description="保持当前工作区同步。" checked readOnly size="l" />
      <HbarAppUiToggleControl aria-label="启用当前规则" defaultChecked />
    </section>,
  )

  expect(markup.match(/role="switch"/g)).toHaveLength(2)
  expect(markup).toContain('class="lumen-toggle-control"')
  expect(markup).toContain('class="lumen-toggle-control hbar-app-ui-toggle-control"')
  expect(markup).toContain('启用同步')
  expect(markup).toContain('保持当前工作区同步。')
})
