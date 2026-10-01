import { expect, test } from 'bun:test'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarPromptComposer } from '../packages/app-react/src/prompt-composer'
import { HbarActionIconButton } from '../packages/app-react/src/action-icon-button'
import { getShellCopy } from '../apps/web/src/shell-copy'

type LumenPromptComposerProps = Parameters<typeof HbarPromptComposer>[0]
type LumenComposerAttachment = LumenPromptComposerProps['attachments'][number]

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

interface InspectedProps {
  children?: ReactNode
  label?: string
  onClick?: () => void
}

function elements(node: ReactNode): ReactElement<InspectedProps>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<InspectedProps>(child)) return []
    return [child, ...elements(child.props.children)]
  })
}

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
      expect(send).toContain('data-lumen-variant="solid"')
      expect(send).toContain('data-lumen-indicator="none"')
      expect(send).not.toContain('data-edge=')
      expect(send?.includes('disabled=""')).toBe(
        !current.canSubmit || Boolean(current.disabled || current.submitting || current.uploading),
      )
      expect(send).toContain(current.submitting ? 'lucide-loader-circle' : 'lucide-arrow-up')
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
      expect(stop).toContain('data-lumen-indicator="none"')
      expect(stop?.includes('disabled=""')).toBe(stopping)
      expect(stop).toContain('lucide-square')
      expect(stop).not.toContain('aria-busy=')
      expect(html.includes('hbar-prompt-queue-action')).toBe(submit === 'queue')
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

test('attachment fallback is content-grown at 0/1/normal/12/13 and keeps original kind:id identity', () => {
  const base = props()
  for (const count of [0, 1, 3, 12, 13]) {
    const attachments: LumenComposerAttachment[] = Array.from({ length: count }, (_, index) => ({
      id: `attachment:${index}`,
      kind: index % 2 ? 'image' : 'file',
      name: `宿主提供的很长附件名称-${index}-${'自然换行内容'.repeat(8)}.txt`,
    }))
    const html = renderToStaticMarkup(<HbarPromptComposer {...base} attachments={attachments} />)
    expect(html.match(/class="hbar-prompt-attachment lumen-attachment-chip"/g)?.length ?? 0).toBe(count)
    expect(html.includes('hbar-prompt-attachments lumen-attachment-strip')).toBe(count > 0)
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
  const firstView = HbarPromptComposer({
    ...base,
    attachments: [first, { ...first, name: '重复文件' }, image],
    onRemoveAttachment,
  })
  const html = renderToStaticMarkup(firstView)
  expect(html).toContain(first.name)
  expect(html).toContain(image.name)
  expect(html).not.toContain('重复文件')
  expect(html).toContain(`alt="${image.name}"`)
  const remove = elements(firstView).find(
    (element) => element.type === HbarActionIconButton && element.props.label === base.labels.removeAttachment(first),
  )
  expect(remove).toBeDefined()
  // A callback from the previous view must not retarget to the new first item.
  renderToStaticMarkup(<HbarPromptComposer {...base} attachments={[image]} onRemoveAttachment={onRemoveAttachment} />)
  remove?.props.onClick?.()
  expect(removed).toEqual([{ id: first.id, kind: first.kind }])
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
  expect(pending).toContain('hbar-action-icon-busy')
  expect(action(pending, base.labels.removeAttachment(attachment))).toContain('disabled=""')
  expect(action(pending, base.labels.stop)).not.toContain('disabled=""')
})
