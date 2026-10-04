import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider } from '@hbar/app-react'
import {
  createAppRuntime,
  type ComposerModelState,
  type SessionControlsState,
  type StateReader,
} from '@hbar/app-runtime'
import { HbarComposerModelPicker, type HbarComposerModelLabels } from '../packages/app-react/src/composer-model-picker'
import { getShellCopy } from '../apps/web/src/shell-copy'

const model: ComposerModelState['models'][number] = {
  id: 'alternative/model',
  providerId: 'alternative',
  providerName: 'Alternative provider — 另一个供应商',
  modelId: 'model',
  modelName: 'Alternative model — 可用替代模型',
  contextWindow: 10_000,
  maxOutput: 1000,
  imageInput: true,
  reasoning: true,
  thinkingLevels: ['low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: true,
}
function reader<T>(value: T): StateReader<T> {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}
function states(status: 'configured' | 'unavailable' | 'unset') {
  const controls: SessionControlsState = {
    sessionId: 'a',
    status: 'ready',
    model: {
      sessionId: 'a',
      status,
      modelId: status === 'unset' ? null : status === 'configured' ? model.id : 'removed/provider-model',
      model: status === 'configured' ? model : null,
      thinkingLevel: status === 'configured' ? 'low' : null,
      revisions: {},
      sources: { model: 'session', thinkingLevel: 'session' },
    },
    usage: null,
    budget: null,
    errors: { model: null, usage: null, budget: null },
  }
  const catalog: ComposerModelState = {
    sessionId: 'a',
    status: 'ready',
    models: [model],
    error: null,
    action: { status: 'idle', error: null },
  }
  return { controls, catalog }
}
async function render(input: {
  controls: SessionControlsState
  catalog: ComposerModelState
  labels: HbarComposerModelLabels
  connected?: boolean
  canSelect?: boolean
  disabled?: boolean
  menuPresentation?: 'native' | 'web'
}) {
  const runtime = createAppRuntime({
    instanceId: 'model-recovery-semantic-fixture',
    hostId: 'fixture-host',
    directory: {
      execute(name) {
        if (name === 'workspace.list' || name === 'session.list')
          return Promise.resolve({ items: [], nextCursor: null })
        return Promise.reject(new Error(`Unexpected read in the semantic fixture: ${name}`))
      },
    },
  })
  try {
    await runtime.ready
    return renderToStaticMarkup(
      <HbarRuntimeProvider
        view={{
          ...runtime.view,
          state: { ...runtime.view.state, controls: reader(input.controls), composerModel: reader(input.catalog) },
        }}
      >
        <HbarComposerModelPicker
          sessionId="a"
          connected={input.connected ?? true}
          disabled={input.disabled ?? false}
          canSelect={input.canSelect ?? true}
          labels={input.labels}
          menuPresentation={input.menuPresentation}
        />
      </HbarRuntimeProvider>,
    )
  } finally {
    runtime.dispose()
  }
}

test('model menu keeps an explicit desktop presentation independent of CSS viewport width', async () => {
  const input = states('configured')
  const labels = getShellCopy('zh-CN').session.modelPicker
  const native = await render({ ...input, labels, menuPresentation: 'native' })
  const web = await render({ ...input, labels, menuPresentation: 'web' })
  expect(native).toContain('data-kind="model" data-presentation="native"')
  expect(web).toContain('data-kind="model" data-presentation="web"')
  expect(native).toContain('data-kind="thinking"')
  expect(native).not.toContain('data-kind="thinking" data-presentation=')
})
async function markup(html: string) {
  const buttons: Array<{
    label: string
    text: string
    disabled: boolean
    className: string
    role: string | null
    popup: string | null
    describedBy: string | null
  }> = []
  await new HTMLRewriter()
    .on('button', {
      element(element) {
        buttons.push({
          label: element.getAttribute('aria-label') ?? '',
          text: '',
          disabled: element.hasAttribute('disabled'),
          className: element.getAttribute('class') ?? '',
          role: element.getAttribute('role'),
          popup: element.getAttribute('aria-haspopup'),
          describedBy: element.getAttribute('aria-describedby'),
        })
      },
      text(chunk) {
        const current = buttons.at(-1)
        if (current) current.text += chunk.text
      },
    })
    .transform(new Response(html))
    .text()
  return buttons
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`unavailable selection has a visible closed reason and nearby provider recovery despite an alternative: ${locale}`, async () => {
    const labels = getShellCopy(locale).session.modelPicker
    const input = states('unavailable')
    const html = await render({ ...input, labels })
    const buttons = await markup(html)
    expect(html).toContain('data-model-state="unavailable"')
    expect(html).toContain('hbar-composer-model-closed-recovery')
    expect(html).toContain(labels.unavailableHint)
    expect(html).toContain(labels.unavailable('removed/provider-model'))
    expect(buttons.find((button) => button.className.includes('hbar-composer-model-trigger'))).toMatchObject({
      label: labels.trigger(labels.unavailableTrigger),
      popup: 'dialog',
      disabled: false,
    })
    expect(buttons.find((button) => button.text === labels.providers)).toMatchObject({ disabled: false })
    expect(buttons.find((button) => button.role === 'option')).toMatchObject({ disabled: false })
    expect(buttons.some((button) => button.className.includes('hbar-composer-thinking-trigger'))).toBe(false)
    expect(html).not.toContain('aria-selected="true"')
  })

  test(`only confirmed empty state exposes a direct Configure action, not unread or failed catalogs: ${locale}`, async () => {
    const labels = getShellCopy(locale).session.modelPicker
    const input = states('unset')
    const empty = await markup(await render({ ...input, catalog: { ...input.catalog, models: [] }, labels }))
    expect(empty.find((button) => button.className.includes('hbar-composer-model-trigger'))).toMatchObject({
      label: labels.configure,
      popup: null,
    })
    for (const status of ['idle', 'loading', 'error'] as const) {
      const html = await render({
        ...input,
        catalog: { ...input.catalog, status, models: [], error: status === 'error' ? 'PRIVATE_FAILURE' : null },
        labels,
      })
      const buttons = await markup(html)
      expect(buttons.find((button) => button.className.includes('hbar-composer-model-trigger'))?.popup).toBe('dialog')
      expect(buttons.some((button) => button.text === labels.providers)).toBe(false)
      expect(html).not.toContain(labels.empty)
      expect(html).not.toContain('PRIVATE_FAILURE')
      if (status === 'error') {
        expect(html).toContain(labels.readFailed)
        expect(buttons.find((button) => button.text === labels.retry)).toMatchObject({ disabled: false })
      }
    }
  })

  test(`archived read access preserves unknown receipt recovery while all new model/thinking writes stay disabled: ${locale}`, async () => {
    const labels = getShellCopy(locale).session.modelPicker
    const input = states('configured')
    const html = await render({
      ...input,
      catalog: { ...input.catalog, action: { status: 'unknown', error: 'RESULT_UNKNOWN' } },
      labels,
      canSelect: false,
      disabled: true,
    })
    const buttons = await markup(html)
    expect(buttons.find((button) => button.className.includes('hbar-composer-model-trigger'))?.disabled).toBe(false)
    expect(buttons.find((button) => button.text === labels.reconcile)?.disabled).toBe(false)
    expect(buttons.filter((button) => button.role === 'option').every((button) => button.disabled)).toBe(true)
    expect(buttons.find((button) => button.className.includes('hbar-composer-thinking-trigger'))?.disabled).toBe(true)
    expect(html).toContain(labels.unknown)
  })
}

test('configured hidden model remains the trigger and thinking selection without a permanent provider footer', async () => {
  const labels = getShellCopy('en-US').session.modelPicker
  const input = states('configured')
  const buttons = await markup(await render({ ...input, catalog: { ...input.catalog, models: [] }, labels }))
  expect(buttons.find((button) => button.className.includes('hbar-composer-model-trigger'))?.label).toBe(
    labels.trigger(model.modelName),
  )
  expect(buttons.some((button) => button.text === labels.providers)).toBe(false)
  expect(buttons.find((button) => button.className.includes('hbar-composer-thinking-trigger'))?.disabled).toBe(false)
})

test('stale/read-error/offline copy is safe and long localized recovery content remains a normal named paragraph', async () => {
  const labels = getShellCopy('zh-CN').session.modelPicker
  const input = states('configured')
  const stale = await render({
    ...input,
    controls: { ...input.controls, model: null, status: 'loading' },
    catalog: { ...input.catalog, status: 'loading', models: [] },
    labels,
  })
  expect(stale).toContain('data-model-state="loading"')
  expect(stale).toContain(labels.stale)
  const failure = await render({
    ...input,
    controls: {
      ...input.controls,
      model: null,
      status: 'partial',
      errors: { ...input.controls.errors, model: 'PRIVATE_TRANSPORT_CODE' },
    },
    labels: { ...labels, readFailed: '无法读取当前模型，原草稿与附件保留。'.repeat(12) },
  })
  expect(failure).toContain('data-model-state="error"')
  expect(failure).toContain('hbar-composer-model-closed-recovery')
  expect(failure).not.toContain('PRIVATE_TRANSPORT_CODE')
  const offline = await render({ ...input, connected: false, labels })
  expect(offline).toContain('data-model-state="offline"')
  expect(offline).toContain(labels.offline)
  expect(
    (await markup(offline)).find((button) => button.className.includes('hbar-composer-model-trigger'))?.disabled,
  ).toBe(true)
})
