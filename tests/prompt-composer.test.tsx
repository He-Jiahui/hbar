import { expect, test } from 'bun:test'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { HbarPromptComposer } from '../packages/app-react/src/prompt-composer'
import { getShellCopy } from '../apps/web/src/shell-copy'

type LumenPromptComposerProps = Parameters<typeof HbarPromptComposer>[0]
type LumenComposerAttachment = LumenPromptComposerProps['attachments'][number]

async function mountDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const container = dom.window.document.createElement('div')
  dom.window.document.body.append(container)
  const root = createRoot(container)
  return {
    container,
    render: (element: ReactNode) => act(() => root.render(element)),
    click: (label: string) => {
      const button = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === label)
      if (!button) throw new Error(`Missing attachment removal action: ${label}`)
      act(() => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    },
    unmount: () => act(() => root.unmount()),
    restore: () => {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
      dom.window.close()
    },
  }
}

function props(locale: 'en-US' | 'zh-CN' = 'zh-CN'): LumenPromptComposerProps {
  return {
    value: 'Host-owned draft — 宿主草稿',
    labels: getShellCopy(locale).session.prompt,
    boundary: 'none',
    attachments: [],
    submitting: false,
    uploading: false,
    canSubmit: true,
    canStop: false,
    onChange: () => undefined,
    onRemoveAttachment: () => undefined,
    onSubmit: () => undefined,
    onStop: () => undefined,
  }
}

function action(html: string, label: string): string | undefined {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find((button) => button.includes(`aria-label="${label}"`))
}

test('validation errors stay inline inside managed feedback and clear without losing the host draft', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = props(locale)
    const feedbackLabels = getShellCopy(locale).preSession.composerFeedback
    const error = `${getShellCopy(locale).session.slash.error('AGENT_PROFILE_UNAVAILABLE')} ${'长期说明 '.repeat(30)}`
    const html = renderToStaticMarkup(
      <HbarPromptComposer {...base} feedbackLabels={feedbackLabels} error={error} errorPresentation="inline" />,
    )
    expect(html.match(/role="alert"/g)).toHaveLength(1)
    expect(html).toContain(error)
    expect(html).toContain(base.value)
    expect(action(html, base.labels.send)).toBeDefined()
    const recovered = renderToStaticMarkup(
      <HbarPromptComposer {...base} feedbackLabels={feedbackLabels} errorPresentation="inline" />,
    )
    expect(recovered).not.toContain('role="alert"')
    expect(recovered).toContain(base.value)
  }
})

test('primary actions preserve localized names, gate states and a lamp-free icon-only target', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const base = props(locale)
    for (const change of [
      {},
      { canSubmit: false },
      { disabled: true },
      { submitting: true },
      { uploading: true },
    ] satisfies Partial<LumenPromptComposerProps>[]) {
      const current = { ...base, ...change }
      const html = renderToStaticMarkup(<HbarPromptComposer {...current} />)
      const send = action(html, base.labels.send)
      expect(send).toBeDefined()
      expect(send).toContain('type="submit"')
      expect(send).toContain(`title="${base.labels.submitTitle}"`)
      expect(send).toContain('data-lumen-variant="contained"')
      expect(send).toContain('data-lumen-tone="primary"')
      expect(send).not.toContain('data-edge=')
      expect(send?.includes('disabled=""')).toBe(
        !current.canSubmit || Boolean(current.disabled || current.submitting || current.uploading),
      )
      expect(send).toContain(current.submitting ? 'aria-busy="true"' : '<svg')
      expect(action(html, base.labels.stop)).toBeUndefined()
      expect(html).toContain(base.value)
      expect(html).toContain('data-boundary="none"')
    }
  }
})

test('active empty shows only Stop; active draft shows text Queue and independent Stop with original locks', () => {
  const base = props()
  const copy = getShellCopy('zh-CN').session.runningActions
  for (const submit of ['hidden', 'queue'] as const) {
    for (const stopping of [false, true]) {
      const html = renderToStaticMarkup(
        <HbarPromptComposer {...base} canStop stopping={stopping} runningActions={{ ...copy, submit }} />,
      )
      expect(action(html, base.labels.send)).toBeUndefined()
      const stop = action(html, base.labels.stop)
      expect(stop).toContain('type="button"')
      expect(stop).toContain('data-tone="danger"')
      expect(stop).toContain('data-tone="danger"')
      expect(stop?.includes('disabled=""')).toBe(stopping)
      expect(stop).toContain('<svg')
      expect(stop).not.toContain('aria-busy=')
      expect(html.includes('lumen-composer-queue-action')).toBe(submit === 'queue')
      if (submit === 'queue') {
        expect(html).toContain(copy.queueLabel)
        expect(html).toContain(`title="${copy.queueTitle}"`)
        expect(html).toContain('data-lumen-variant="text"')
      }
    }
  }
  const disabled = renderToStaticMarkup(
    <HbarPromptComposer {...base} disabled canStop runningActions={{ ...copy, submit: 'queue' }} />,
  )
  expect(action(disabled, base.labels.stop)).toContain('disabled=""')
  // Preserve the public contract's legacy canStop-without-runningActions mode.
  const legacy = renderToStaticMarkup(<HbarPromptComposer {...base} disabled canStop />)
  expect(action(legacy, base.labels.stop)).not.toContain('disabled=""')
  expect(action(legacy, base.labels.send)).toContain('disabled=""')
})

test('custom editor receives host data unchanged and uses the same submit gate as form actions', () => {
  const base = props()
  let submitted = 0
  const onSubmit = () => submitted++
  const changes: string[] = []
  const onChange = (value: string) => changes.push(value)
  for (const change of [
    {},
    { disabled: true },
    { submitting: true },
    { uploading: true },
    { canSubmit: false },
    { canStop: true, runningActions: { submit: 'hidden', queueLabel: '排队', queueTitle: '任务完成后处理' } },
  ] satisfies Partial<LumenPromptComposerProps>[]) {
    const before = submitted
    renderToStaticMarkup(
      <HbarPromptComposer
        {...base}
        {...change}
        onSubmit={onSubmit}
        onChange={onChange}
        editor={(controls) => {
          expect(controls.value).toBe(base.value)
          expect(controls.inputLabel).toBe(base.labels.input)
          expect(controls.placeholder).toBe(base.labels.placeholder)
          expect(controls.disabled).toBe(Boolean(change.disabled))
          expect(controls.onChange).toBe(onChange)
          controls.onChange('Updated draft — 修改后的草稿')
          controls.onSubmit()
          return <textarea aria-label={controls.inputLabel} defaultValue={controls.value} />
        }}
      />,
    )
    expect(submitted - before).toBe(Object.keys(change).length === 0 ? 1 : 0)
  }
  expect(changes).toHaveLength(6)
})

test('attachment fallback is content-grown at 0/1/normal/12/13 and keeps original kind:id identity', async () => {
  const base = props()
  for (const count of [0, 1, 3, 12, 13]) {
    const attachments: LumenComposerAttachment[] = Array.from({ length: count }, (_, index) => ({
      id: `attachment:${index}`,
      kind: index % 2 ? 'image' : 'file',
      name: `宿主提供的很长附件名称-${index}-${'自然换行内容'.repeat(8)}.txt`,
    }))
    const html = renderToStaticMarkup(<HbarPromptComposer {...base} attachments={attachments} />)
    // LumenChip owns the class list and may add its semantic `lumen-chip`
    // class before the attachment class. Match the class token rather than
    // assuming a particular attribute ordering.
    expect(html.match(/class="[^"]*\blumen-attachment-chip\b[^"]*"/g)?.length ?? 0).toBe(count)
    expect(html.includes('lumen-attachment-strip')).toBe(count > 0)
    for (const attachment of attachments) expect(html).toContain(attachment.name)
  }
  const first: LumenComposerAttachment = { id: 'original:id', kind: 'file', name: '原文件' }
  const image: LumenComposerAttachment = {
    id: first.id,
    kind: 'image',
    name: '原图片',
    previewUrl: '/test-only-image.png',
  }
  const removed: { id: string; kind: 'image' | 'file' }[] = []
  const onRemoveAttachment = (id: string, kind: 'image' | 'file') => removed.push({ id, kind })
  const mounted = await mountDom()
  try {
    mounted.render(
      <HbarPromptComposer
        {...base}
        attachments={[first, { ...first, name: '重复文件' }, image]}
        onRemoveAttachment={onRemoveAttachment}
      />,
    )
    const html = mounted.container.innerHTML
    expect(html).toContain(first.name)
    expect(html).toContain(image.name)
    expect(html).not.toContain('重复文件')
    // The chip label carries the host-owned name; the preview image is
    // decorative so Lumen intentionally exposes an empty alt value.
    expect(html).toContain('alt=""')
    expect(html).toContain(`aria-label="${base.labels.removeAttachment(first)}"`)
    mounted.click(base.labels.removeAttachment(first))
    expect(removed).toEqual([{ id: first.id, kind: first.kind }])
    // Retarget the same source ID to a different kind and verify the rendered
    // control still reports its original kind:id pair to the host callback.
    mounted.render(<HbarPromptComposer {...base} attachments={[image]} onRemoveAttachment={onRemoveAttachment} />)
    mounted.click(base.labels.removeAttachment(image))
    expect(removed).toEqual([
      { id: first.id, kind: first.kind },
      { id: image.id, kind: image.kind },
    ])
  } finally {
    mounted.unmount()
    mounted.restore()
  }
  const hidden = renderToStaticMarkup(<HbarPromptComposer {...base} attachments={[first]} attachmentContent={null} />)
  expect(hidden).not.toContain('lumen-attachment-chip')
  const owned = renderToStaticMarkup(
    <HbarPromptComposer {...base} attachments={[first]} attachmentContent={<span>{image.name}</span>} />,
  )
  expect(owned).toContain(image.name)
  expect(owned).not.toContain(first.name)
})

test('host context, editor, error and toolbar stay in reading order with uploading status nearby', () => {
  const base = props()
  const html = renderToStaticMarkup(
    <HbarPromptComposer
      {...base}
      error="上传失败，请重试"
      uploading
      context={<span>已有上下文</span>}
      attachmentContent={<span>宿主附件</span>}
      controls={<span>权限与计划</span>}
      modelPicker={<span>模型和思考等级</span>}
    />,
  )
  const order = ['已有上下文', '宿主附件', '<textarea', '上传失败，请重试', '权限与计划', '模型和思考等级']
  for (let index = 1; index < order.length; index++)
    expect(html.indexOf(order[index - 1]!)).toBeLessThan(html.indexOf(order[index]!))
  expect(html).toContain('role="alert"')
  expect(html).toContain('role="status"')
  expect(html).toContain(`aria-label="${base.labels.uploading}"`)
  expect(html).toContain('aria-busy="true"')
})

test('long localized action names stay host-owned and unavailable attachment removal remains disabled', () => {
  const base = props()
  const attachment: LumenComposerAttachment = { id: 'owned-file', kind: 'file', name: '宿主文件.txt' }
  const sendLabel = '向当前项目发送这条完整的宿主草稿——名称不在组件中截断'
  const queueLabel = '将这条较长的后续消息加入队列，等待当前运行结束后处理'
  const idle = renderToStaticMarkup(<HbarPromptComposer {...base} labels={{ ...base.labels, send: sendLabel }} />)
  expect(action(idle, sendLabel)).toContain(`aria-label="${sendLabel}"`)
  const pending = renderToStaticMarkup(
    <HbarPromptComposer
      {...base}
      submitting
      canStop
      attachments={[attachment]}
      runningActions={{ submit: 'queue', queueLabel, queueTitle: queueLabel }}
    />,
  )
  expect(pending).toContain(queueLabel)
  expect(pending).toContain('aria-busy="true"')
  expect(action(pending, base.labels.removeAttachment(attachment))).toContain('disabled=""')
  expect(action(pending, base.labels.stop)).not.toContain('disabled=""')
})
