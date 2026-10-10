import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenSurface,
  LumenRecordRow,
  LumenMetricRow,
  LumenContentText,
  LumenAdaptiveToolbar,
  LumenButton,
} from '@lumen/app-ui'

test('surface hierarchy opts in without changing legacy material or host content', () => {
  const legacy = renderToStaticMarkup(<LumenSurface>保留原有内容</LumenSurface>)
  const reading = renderToStaticMarkup(
    <LumenSurface surfaceRole="reading" material="solid">
      阅读内容
    </LumenSurface>,
  )
  expect(legacy).not.toContain('data-surface-role')
  expect(legacy).toContain('data-material="glass"')
  expect(reading).toContain('data-surface-role="reading"')
  expect(reading).toContain('data-material="solid"')
  expect(reading).toContain('阅读内容')
})

test('record and metric composition retain long localized values and their reading order', () => {
  const title = '请求模型与完整的执行信息'.repeat(20)
  const html = renderToStaticMarkup(
    <>
      <LumenRecordRow title={title} description="等待连接恢复" trailing="152,953 tokens" />
      <dl>
        <LumenMetricRow label="运行次数" value="0" />
      </dl>
    </>,
  )
  expect(html).toContain(title)
  expect(html.indexOf(title)).toBeLessThan(html.indexOf('等待连接恢复'))
  expect(html).toContain('data-text-context="metric.label"')
  expect(html).toContain('data-text-context="metric.value"')
  expect(html).toContain('>0</dd>')
})

test('navigation clipping and prose wrapping are explicit semantic choices', () => {
  const html = renderToStaticMarkup(
    <>
      <LumenContentText context="navigation.item">工程名称</LumenContentText>
      <LumenContentText context="dialog.body">完整说明</LumenContentText>
    </>,
  )
  expect(html).toContain('data-text-flow="clipped"')
  expect(html).toContain('data-text-flow="reading"')
})

test('toolbar deduplicates stable identifiers and keeps required trailing action separate', () => {
  const html = renderToStaticMarkup(
    <LumenAdaptiveToolbar
      label="输入操作"
      moreLabel="更多操作"
      items={[
        { id: 'model', label: '模型', priority: 100, content: <LumenButton>模型</LumenButton> },
        { id: 'model', label: '模型', priority: 100, content: <LumenButton>模型</LumenButton> },
      ]}
      trailing={<LumenButton>发送</LumenButton>}
    />,
  )
  expect(html.match(/data-toolbar-item="model"/g)).toHaveLength(1)
  expect(html).toContain('发送')
  expect(html).toContain('aria-label="输入操作"')
})
